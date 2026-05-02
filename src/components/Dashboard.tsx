import { useState, useEffect } from 'react'
import { Search, Loader2, ArrowUpDown, CheckCircle2, TrendingDown, Pill, RefreshCcw, Copy, Check, Zap, Banknote, Globe, Image as ImageIcon } from 'lucide-react'
import DrugAppearanceModal from './DrugAppearanceModal'

interface Product {
  platform: string;
  name: string;
  spec: string;
  price: number;
  unit: string;
  stock: string;
  isCheapest?: boolean;
}

const Dashboard = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [nhiSearchTerm, setNhiSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [nhiResults, setNhiResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isNhiSearching, setIsNhiSearching] = useState(false)
  const [connectionError, setConnectionError] = useState(false)
  const [dbReloading, setDbReloading] = useState(false)
  const [dbReloadSuccess, setDbReloadSuccess] = useState(false)
  const [selectedDosage, setSelectedDosage] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [copiedBrand, setCopiedBrand] = useState<number | null>(null)
  const [isStopping, setIsStopping] = useState(false)
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false)
  const [maintenanceStatus, setMaintenanceStatus] = useState<any>(null)
  const [isAppearanceModalOpen, setIsAppearanceModalOpen] = useState(false)
  const [selectedAppearance, setSelectedAppearance] = useState<any>(null)
  const [isAppearanceLoading, setIsAppearanceLoading] = useState(false)
  const [indexingStatus, setIndexingStatus] = useState<any>(null) // 獨立的建索引狀態
  const [isStrictFilter, setIsStrictFilter] = useState(false) // 精確過濾開關
  const PLATFORMS = [
    { id: 'binli', name: '彬利' },
    { id: 'chahwa', name: '嘉鏵' },
    { id: 'mdt', name: '曼達特' },
    { id: 'coda', name: '可達藥品' },
    { id: 'jhao-hong', name: '兆宇 (兆宏)' },
    { id: 'yc', name: '益全生技' },
    { id: 'taichung', name: '泰昌藥品' },
    { id: 'yusheng', name: '宇盛' },
    { id: 'yeschain', name: '好鄰居 (躍獅)' },
  ]
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(PLATFORMS.map(p => p.id))
  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }
  const selectAllPlatforms = () => setSelectedPlatforms(PLATFORMS.map(p => p.id))
  const selectNonePlatforms = () => setSelectedPlatforms([])

  // 診斷偵測：啟動時檢查後端通訊是否正常
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await (window as any).electronAPI.invoke('ping')
        if (res !== 'pong') setConnectionError(true)
      } catch (e) {
        setConnectionError(true)
      }
    }
    checkConnection()

    // Listen for maintenance progress
    const removeListener = (window as any).electronAPI.onUpdateProgress((data: any) => {
      setMaintenanceStatus(data)
    })

    return () => {
      if (typeof removeListener === 'function') removeListener()
    }
  }, [])

  // 當搜尋結果改變時，重設劑量過濾器
  useEffect(() => {
    setSelectedDosage(null)
  }, [nhiResults])

  // 取得目前結果中的所有唯一劑量
  const uniqueDosages = Array.from(new Set(nhiResults.map(item => item.ds).filter(Boolean))).sort()

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const handleCopyBrand = (brand: string, idx: number) => {
    navigator.clipboard.writeText(brand)
    setCopiedBrand(idx)
    setTimeout(() => setCopiedBrand(null), 2000)
  }

  const handleReloadDb = async () => {
    setDbReloading(true)
    try {
      const res = await (window as any).electronAPI.invoke('reload-nhi-db')
      if (res.success) {
        setDbReloadSuccess(true)
        setTimeout(() => setDbReloadSuccess(false), 3000)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDbReloading(false)
    }
  }

  const handleIntegrateAppearance = async () => {
    setDbReloading(true)
    try {
      const res = await (window as any).electronAPI.invoke('integrate-appearance')
      if (res.success) {
        alert(`整合完成！共成功配對 ${res.count} 筆藥品外觀圖片。\n建議點擊「刷新本機資料庫」以載入最新結果。`)
        setDbReloadSuccess(true)
        setTimeout(() => setDbReloadSuccess(false), 3000)
      }
    } catch (e) {
      console.error(e)
      alert('整合過程發生錯誤。')
    } finally {
      setDbReloading(false)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchTerm.trim()) return

    setIsSearching(true)
    setIsStopping(false)
    setSearchResults([])
    setNhiResults([])

    try {
      // 只發動各平台即時比價，僅包含已勾選的平台
      const platformResults = await (window as any).electronAPI.performSearch(searchTerm, selectedPlatforms)

      // Calculate cheapest
      if (platformResults) {
        const allProducts = (platformResults || []).flat() as Product[]
        const minPrice = allProducts.length > 0 ? Math.min(...allProducts.map(p => p.price).filter(p => p > 0)) : 0
        const processedResults = allProducts.map(p => ({
          ...p,
          isCheapest: p.price === minPrice && p.price > 0
        }))

        setSearchResults(processedResults)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSearching(false)
      setIsStopping(false)
    }
  }

  const handleStopSearch = async () => {
    setIsStopping(true)
    try {
      await (window as any).electronAPI.invoke('interrupt-search')
    } catch (err) {
      console.error('Failed to interrupt search:', err)
    }
  }

  const handleNhiSearch = async (e: React.FormEvent, customTerm?: string) => {
    e.preventDefault()
    const finalTerm = customTerm || nhiSearchTerm
    if (!finalTerm.trim()) return

    setIsNhiSearching(true)
    setSelectedDosage(null)

    try {
      const localResults = await (window as any).electronAPI.invoke('search-nhi-local', finalTerm)
      setNhiResults(localResults || [])
      if (!customTerm) setNhiSearchTerm(finalTerm)
    } catch (err) {
      console.error(err)
    } finally {
      setIsNhiSearching(false)
    }
  }

  const handleClearNhiSearch = () => {
    setNhiSearchTerm('')
    setNhiResults([])
    setSelectedDosage(null)
  }

  const handleShowAppearance = async (item: any) => {
    // 如果索引中已經包含整合過的外觀資料，直接開啟彈窗（秒開）
    if (item.img || item.sh || item.cl) {
      setSelectedAppearance({
        ...item,
        lic: item.lic || 'N/A',
        n_cn: item.br || item.n_cn || item.n,
        n: item.br_en || item.n
      })
      setIsAppearanceModalOpen(true)
      return
    }

    // 否則，再嘗試向後端查詢（備案）
    setIsAppearanceLoading(true)
    try {
      const startTime = Date.now();
      const data = await (window as any).electronAPI.invoke('get-drug-appearance', { 
        license: item.lic, 
        name: item.br || item.n_cn,
        nhiCode: item.c 
      })
      
      // 確保至少顯示 300ms 讀取動畫，避免閃爍
      const elapsed = Date.now() - startTime;
      if (elapsed < 300) await new Promise(r => setTimeout(r, 300 - elapsed));

      if (data) {
        setSelectedAppearance(data)
        setIsAppearanceModalOpen(true)
      } else {
        alert(`暫時查無此藥的外觀資料。\n品名: ${item.br || item.n}\n建議嘗試其他關鍵字搜尋。`)
      }
    } catch (err) {
      console.error(err)
      alert('載入外觀資料時發生遠端通訊錯誤。')
    } finally {
      setIsAppearanceLoading(false)
    }
  }

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    const txtFiles = files.filter(f => f.name.toLowerCase().endsWith('.txt'))
    if (txtFiles.length === 0) return
    const paths = txtFiles.map(f => (f as any).path)
    await runIndexing(paths)
  }

  const handleOpenFileDialog = async () => {
    try {
      setMaintenanceStatus({ status: 'starting', count: 0 })
      const result = await (window as any).electronAPI.invoke('open-file-dialog')
      if (result && result.success) {
        setMaintenanceStatus({ status: 'success', count: result.count })
        setTimeout(() => setMaintenanceStatus(null), 5000)
      } else {
        // cancelled or failed
        setMaintenanceStatus(null)
      }
    } catch (err) {
      console.error(err)
      setMaintenanceStatus({ status: 'error' })
    }
  }

  const runIndexing = async (paths: string[]) => {
    setMaintenanceStatus({ status: 'starting', count: 0 })
    try {
      const result = await (window as any).electronAPI.invoke('process-nhi-txt', paths)
      if (result.success) {
        setMaintenanceStatus({ status: 'success', count: result.count })
        setTimeout(() => setMaintenanceStatus(null), 5000)
      }
    } catch (err) {
      console.error(err)
      setMaintenanceStatus({ status: 'error' })
    }
  }

  const handleAutoIndex = async () => {
    setIndexingStatus({ status: 'processing', count: 0 })
    try {
      const result = await (window as any).electronAPI.invoke('auto-index-nhi')
      if (result.success) {
        setIndexingStatus({ status: 'success', count: result.count })
        setTimeout(() => setIndexingStatus(null), 6000)
      } else {
        setIndexingStatus({ status: 'error', message: result.error || '建置失敗' })
        setTimeout(() => setIndexingStatus(null), 8000)
      }
    } catch (err) {
      console.error(err)
      setIndexingStatus({ status: 'error', message: '發生未預期錯誤' })
      setTimeout(() => setIndexingStatus(null), 8000)
    }
  }


  const displayedNhiResults = selectedDosage
    ? nhiResults.filter(item => item.ds === selectedDosage)
    : nhiResults

  return (
    <div className="p-4 md:p-8 w-full max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">

      {/* 📊 小型建索引進度條 (不干擾搜尋) */}
      {indexingStatus && (
        <div className={`flex items-center gap-3 px-4 py-2 text-sm font-bold rounded-none border-l-4 ${
          indexingStatus.status === 'processing' ? 'bg-indigo-50 border-indigo-500 text-indigo-800' :
          indexingStatus.status === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' :
          'bg-rose-50 border-rose-500 text-rose-800'
        }`}>
          {indexingStatus.status === 'processing' && <Loader2 size={16} className="animate-spin shrink-0" />}
          {indexingStatus.status === 'success' && <CheckCircle2 size={16} className="shrink-0" />}
          <span>
            {indexingStatus.status === 'processing' && `對全檔資料重建索引中，請稍候...`}
            {indexingStatus.status === 'success' && `✅ 建置完成！共導入 ${indexingStatus.count.toLocaleString()} 筆藥品。搜尋「可得安穩」吧！`}
            {indexingStatus.status === 'error' && `❌ 建置失敗：${indexingStatus.message}`}
          </span>
          <button onClick={() => setIndexingStatus(null)} className="ml-auto text-current opacity-50 hover:opacity-100">✕</button>
        </div>
      )}
      {connectionError && (
        <div className="bg-rose-50 border-2 border-rose-200 p-4 rounded-none flex items-center gap-4 animate-bounce">
          <div className="bg-rose-500 p-2 rounded-none text-white font-bold">!</div>
          <div className="flex-1">
            <h4 className="font-bold text-rose-800 text-sm">⚠️ 後端連線異常：偵測到舊版指令</h4>
            <p className="text-xs text-rose-600">請「完全關閉」本視窗，並在終端機重按 `npm run dev` 啟動，以載入最新的搜尋引擎。</p>
          </div>
        </div>
      )}


      <section className="space-y-8">
        <div className="clinical-table-container bg-white flex flex-col md:flex-row items-stretch border-4">
          <div className="flex-1 px-12 py-12 border-b md:border-b-0 md:border-r-4 border-slate-300">
            <h3 className="font-black text-slate-900 leading-none text-7xl tracking-tighter">健保藥品快速查詢</h3>
            <div className="flex items-center gap-4 mt-3">
              <p className="text-2xl text-teal-600 font-bold italic">NHI Official Drug Database Query</p>
              <button 
                onClick={() => setIsMaintenanceMode(!isMaintenanceMode)}
                className={`text-xs px-2 py-1 border-2 font-black transition-colors ${isMaintenanceMode ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-400 border-slate-200 hover:border-slate-400'}`}
              >
                {isMaintenanceMode ? '關閉維護' : '資料維護'}
              </button>
            </div>
          </div>
          <div className="p-4 flex items-center justify-center bg-slate-50 min-w-[300px]">
            <button
              onClick={handleAutoIndex}
              className="clinical-btn-tactile flex items-center gap-3 px-8 py-3 text-sm font-black clinical-btn-tactile-blue bg-indigo-600 border-indigo-800"
              title="自動掃描健保藥品離線資料庫並重建索引"
            >
              <RefreshCcw size={18} />
              一鍵重建資料庫
            </button>
          </div>
        </div>

        {/* 🛠️ 維護主控台：拖放區塊 */}
        {isMaintenanceMode && (
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className="animate-in slide-in-from-top-4 duration-300"
          >
            <div className="border-4 border-dashed border-teal-200 bg-teal-50/30 p-12 text-center group hover:border-teal-400 hover:bg-teal-50 transition-all cursor-crosshair">
              {!maintenanceStatus || maintenanceStatus.status === 'starting' ? (
                <div className="space-y-4">
                  <div className="text-6xl text-teal-200 group-hover:text-teal-400 transition-colors">↓</div>
                  <h4 className="text-2xl font-black text-teal-800">DROP NHI SOURCE TXT HERE</h4>
                  <p className="text-sm text-teal-600 font-medium">將健保署下載的原始藥檔 (.TXT) 拖入此處進行索引更新</p>
                  <p className="text-xs text-teal-400">— 或 —</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenFileDialog(); }}
                    className="mx-auto flex items-center gap-2 px-6 py-3 bg-teal-600 text-white text-sm font-black hover:bg-teal-700 transition-colors"
                  >
                    📂 點擊選擇檔案 (可一次選取多個)
                  </button>
                </div>
              ) : (
                <div className="space-y-4 relative">
                  {/* 緊急重置按鈕 */}
                  <button 
                    onClick={() => setMaintenanceStatus(null)}
                    className="absolute top-0 right-0 text-xs text-slate-400 hover:text-slate-700 px-2 py-1 border border-slate-200 rounded"
                  >✕ 取消</button>
                  <div className="flex justify-center flex-wrap gap-2">
                    {maintenanceStatus.status === 'processing' && (
                      <>
                        <Loader2 className="animate-spin text-teal-600" size={32} />
                        <div className="w-full">
                          <p className="text-3xl font-black text-teal-900 uppercase">Indexing Database...</p>
                          <p className="text-teal-600 font-bold mt-2">已處理: {maintenanceStatus.count.toLocaleString()} 筆數據</p>
                          <p className="text-xs text-teal-400 mt-1 italic">Current: {maintenanceStatus.currentFile}</p>
                        </div>
                      </>
                    )}
                    {maintenanceStatus.status === 'success' && (
                      <div className="py-4">
                        <CheckCircle2 className="text-emerald-500 mx-auto mb-4" size={64} />
                        <h4 className="text-4xl font-black text-emerald-900">索引更新成功</h4>
                        <p className="text-emerald-600 font-bold mt-2">共導入 {maintenanceStatus.count.toLocaleString()} 筆臨床藥品數據</p>
                      </div>
                    )}
                    {maintenanceStatus.status === 'error' && (
                      <div className="py-4">
                        <h4 className="text-4xl font-black text-rose-900">讀取失敗</h4>
                        <p className="text-rose-600 font-bold mt-2">請確認檔案格式是否正確或是否有權限讀取</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleNhiSearch} className="clinical-table-container border-4 bg-white">
          <div className="flex flex-col md:flex-row items-stretch">
            <div className="flex-1 relative group bg-white border-b-4 md:border-b-0 md:border-r-4 border-slate-300">
              <input
                type="text"
                value={nhiSearchTerm}
                onChange={(e) => setNhiSearchTerm(e.target.value)}
                placeholder="輸入關鍵字..."
                className="clinical-hero-input block w-full outline-none"
              />
            </div>
            <div className="p-1 flex items-center justify-center bg-slate-50 min-w-[200px] gap-2">
              <button
                type="button"
                onClick={handleClearNhiSearch}
                className="clinical-btn-tactile clinical-btn-tactile-slate px-4 py-2 text-sm font-black whitespace-nowrap"
              >
                清空
              </button>
              <button
                type="submit"
                disabled={isNhiSearching}
                className="clinical-btn-tactile clinical-btn-tactile-blue w-full px-5 py-2 text-sm font-black flex items-center justify-center gap-2"
              >
                {isNhiSearching ? <Loader2 size={16} className="animate-spin" /> : null}
                <span>搜尋</span>
              </button>
            </div>
          </div>
        </form>

        {/* 💡 健保署官方大數據結果 */}
        {isNhiSearching && (
          <div className="flex flex-col items-center justify-center py-8 text-teal-600">
            <Loader2 className="animate-spin mb-2" size={32} />
            <p className="text-xs">正在翻閱本地健保藥典...</p>
          </div>
        )}

        {/* 📚 專業健保資料表格區 */}
        {!isNhiSearching && nhiResults.length > 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* 🎯 劑量快篩標籤列 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
              <button
                onClick={() => setSelectedDosage(null)}
                className={`flex items-center justify-center px-4 py-4 text-xs font-black rounded-none transition-all border-2 ${
                  !selectedDosage 
                    ? 'bg-teal-600 text-white border-teal-600' 
                    : 'bg-white text-slate-500 border-slate-200 hover:border-teal-400 hover:text-teal-600'
                }`}
              >
                全部規格 (All)
              </button>
              {uniqueDosages.map(ds => (
                <button
                  key={ds}
                  onClick={() => setSelectedDosage(ds)}
                  className={`flex items-center justify-center px-4 py-4 text-xs font-black rounded-sm transition-all border-2 ${
                    selectedDosage === ds 
                      ? 'bg-teal-600 text-white border-teal-600' 
                      : 'bg-white text-slate-500 border-slate-200 hover:border-teal-400 hover:text-teal-600'
                  }`}
                >
                  {ds}
                </button>
              ))}
            </div>

            <div className="clinical-table-container border-2 border-slate-300">
              <div 
                className="overflow-x-auto" 
                style={{ 
                  overflowX: 'auto', 
                  display: 'block',
                  width: '100%',
                  WebkitOverflowScrolling: 'touch' 
                }}
              >
                <table className="clinical-table w-full" style={{ tableLayout: 'auto', minWidth: '1200px' }}>
                  <thead>
                    <tr className="bg-slate-100">
                      <th style={{ width: '120px' }} className="border p-3 text-xs font-black">健保代碼</th>
                      <th style={{ minWidth: '280px' }} className="border p-3 text-xs font-black">品牌 / 廠牌名稱</th>
                      <th style={{ width: '150px' }} className="border p-3 text-xs font-black">廠牌 (Manuf.)</th>
                      <th style={{ minWidth: '250px' }} className="border p-3 text-xs font-black">成分 (Ingredient)</th>
                      <th style={{ width: '100px' }} className="border p-3 text-xs font-black text-center">規格</th>
                      <th style={{ width: '100px' }} className="border p-3 text-xs font-black text-right">健保價</th>
                      <th style={{ width: '120px' }} className="border p-3 text-xs font-black text-center">同成分連動</th>
                      <th style={{ width: '120px' }} className="border p-3 text-xs font-black text-center">市場比價</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedNhiResults.map((item, idx) => (
                      <tr key={`${item.c}-${idx}`} className="hover:bg-slate-50 transition-colors border-b">
                        {/* 1. 健保代碼 */}
                        <td className="p-3 border text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="font-mono text-xs font-bold text-teal-600">{item.c}</span>
                            <button
                              onClick={() => handleCopyCode(item.c)}
                              className="p-1 text-slate-400 hover:text-teal-600 transition-colors"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        </td>

                        {/* 2. 品牌 / 廠牌名稱 (點擊看外觀) */}
                        <td className="p-3 border">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleShowAppearance(item)}
                                className="text-sm font-black text-blue-600 hover:text-blue-800 hover:underline text-left leading-tight"
                              >
                                {item.br || '未命名'}
                                <ImageIcon size={14} className="inline-block ml-1 opacity-40" />
                              </button>
                              
                              <button
                                onClick={() => handleCopyBrand(item.br || item.n, idx)}
                                className="text-slate-300 hover:text-slate-500"
                              >
                                <Copy size={10} />
                              </button>
                              
                              {(item.img || item.sh) && (
                                <span className="text-[9px] bg-teal-500 text-white px-1 font-bold rounded-sm">外觀</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium italic truncate max-w-[200px]">
                              {item.br_en || item.n}
                            </div>
                          </div>
                        </td>

                        {/* 3. 廠牌 */}
                        <td className="p-3 border text-xs font-bold text-slate-500 text-center uppercase">
                          {item.m || '-'}
                        </td>

                        {/* 4. 成分 (關鍵按鈕) */}
                        <td className="p-3 border">
                          <button
                            onClick={(e) => handleNhiSearch(e, item.ing)}
                            className="text-xs font-black text-slate-700 hover:text-teal-600 hover:underline text-left block w-full"
                          >
                            {item.ing || '無成分資料'}
                          </button>
                        </td>

                        {/* 5. 規格 */}
                        <td className="p-3 border text-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            {item.ds || '-'}
                          </span>
                        </td>

                        {/* 6. 健保價 */}
                        <td className="p-3 border text-right">
                          <span className="text-sm font-black text-rose-600">${item.p}</span>
                        </td>

                        {/* 7. 同成分 */}
                        <td className="p-3 border text-center">
                          <button
                            onClick={(e) => handleNhiSearch(e, item.ing)}
                            className="px-2 py-1 bg-teal-600 text-white text-[10px] font-black rounded hover:bg-teal-700"
                          >
                            找同成分
                          </button>
                        </td>

                        {/* 8. 市場比價 */}
                        <td className="p-3 border text-center">
                          <button
                            onClick={() => {
                              setSearchTerm(item.br || item.n_cn.split(' ')[0]);
                              document.getElementById('market-search-input')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-2 py-1 bg-slate-800 text-white text-[10px] font-black rounded hover:bg-black"
                          >
                            啟動比價
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!isNhiSearching && nhiSearchTerm.trim() !== '' && nhiResults.length === 0 && (
          <div className="bg-white/50 border border-dashed border-slate-200 rounded-none p-10 text-center">
            <p className="text-slate-400 font-bold mb-1">🔍 查無精確匹配資料</p>
            <p className="text-[10px] text-slate-300">請確認輸入的是 10 位健保碼，或標準的中英文品牌名</p>
          </div>
        )}
      </section>

      <div className="h-px bg-slate-100 w-full" />

      {/* --- Section 2: Market Price Comparison --- */}
      <section className="space-y-6">
        <div className="mb-6 mt-12 px-6">
          <h3 className="font-black text-slate-900 text-7xl tracking-tighter leading-none flex items-center gap-4">
            中盤即時比價查詢
          </h3>
          <p className="text-2xl text-teal-600 font-bold mt-3 italic">Automated Market Price Verification Console</p>
        </div>

        {/* 🚀 平台選擇控制區區塊 */}
        <div className="clinical-table-container border-4 bg-white p-6 space-y-6">
          <div className="flex flex-col md:flex-row items-stretch gap-10">
            <div className="flex-1">
              {/* 平台開關控制列 */}
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={selectAllPlatforms}
                className="clinical-btn-tactile clinical-btn-tactile-blue px-8 py-3 text-sm font-black"
              >
                全選 (Select All)
              </button>
              <button 
                onClick={selectNonePlatforms}
                className="clinical-btn-tactile clinical-btn-tactile-slate px-8 py-3 text-sm font-black"
              >
                清空 (Clear Area)
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {PLATFORMS.map(platform => {
              const isSelected = selectedPlatforms.includes(platform.id)
              return (
                <button
                  key={platform.id}
                  onClick={() => togglePlatform(platform.id)}
                  className={`clinical-btn-tactile flex flex-col items-center justify-center gap-2 px-4 py-6 text-center ${
                    isSelected 
                      ? 'clinical-btn-tactile-blue ring-4 ring-blue-50 z-10' 
                      : 'clinical-btn-tactile-slate'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-sm flex items-center justify-center border-2 transition-all ${
                    isSelected ? 'bg-white border-white text-blue-600' : 'bg-slate-200 border-slate-300'
                  }`}>
                    <div className="w-6 h-6 bg-slate-200 rounded-none" />
                  </div>
                  <span className="text-xs font-black tracking-tight">{platform.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <form onSubmit={handleSearch} className="clinical-table-container border-4 bg-white">
          <div className="flex flex-col md:flex-row items-stretch">
            <div className="flex-1 relative group bg-white border-b-4 md:border-b-0 md:border-r-4 border-slate-300">
              <input
                id="market-search-input"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="輸入商品名稱啟動比價..."
                className="clinical-hero-input block w-full outline-none"
              />
            </div>
            <div className="p-1.5 flex items-center justify-center bg-slate-100 min-w-[320px]">
              <div className="flex items-stretch gap-2 w-full h-full">
                <button
                  type="button"
                  onClick={() => setIsStrictFilter(!isStrictFilter)}
                  className={`clinical-btn-tactile flex-1 px-3 py-2 border-2 rounded-none text-xs font-black flex items-center justify-center gap-2 transition-all ${
                    isStrictFilter 
                      ? 'bg-amber-500 text-white border-amber-700 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]' 
                      : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
                  }`}
                  title={isStrictFilter ? "目前僅顯示精確匹配結果" : "切換至精確過濾 (排除雜訊)"}
                >
                  <CheckCircle2 size={16} className={isStrictFilter ? "text-white" : "text-slate-300"} />
                  <span>{isStrictFilter ? '已開啟精確' : '精確過濾'}</span>
                </button>

                {isSearching && (
                  <button
                    type="button"
                    onClick={handleStopSearch}
                    disabled={isStopping}
                    className="clinical-btn-tactile flex-1 px-4 py-2 bg-rose-600 text-white border-rose-800 border-2 rounded-none text-sm font-black flex items-center justify-center"
                  >
                    {isStopping ? <Loader2 size={16} className="animate-spin" /> : <span>停止</span>}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSearching}
                  className="clinical-btn-tactile clinical-btn-tactile-blue flex-2 px-6 py-2 text-base font-black flex items-center justify-center gap-2"
                >
                  {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Zap size={20} className="fill-current" />}
                  <span>{isSearching ? '發動中' : '啟動比價'}</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>

      <div className="clinical-table-container">
        <div className="overflow-x-auto">
          <table className="clinical-table min-w-[1000px]">
          <thead>
            <tr className="text-slate-500 text-sm font-semibold uppercase tracking-wider">
              <th>供應平台</th>
              <th>健保序號</th>
              <th>健保價</th>
              <th>藥品名稱 / 規格</th>
              <th>效期 / 備註</th>
              <th>
                <div className="flex items-center gap-2">單位售價 <ArrowUpDown size={14} /></div>
              </th>
              <th>單價</th>
              <th>庫存狀態</th>
              <th>狀態標記</th>
            </tr>
          </thead>
          <tbody className="">
            {(() => {
              // 實施過濾邏輯
              let displayData = [...searchResults];
              if (isStrictFilter && searchTerm.trim()) {
                // 邏輯：關鍵字必須在開頭，或者前面不是中文字（例如：(原廠)脈優）
                // 這樣可以濾掉「脂脈優」但保留「脈優」
                const regex = new RegExp(`(^|[^\\u4e00-\\u9fa5])${searchTerm}`, 'i');
                displayData = displayData.filter(p => regex.test(p.name));
              }

              return displayData.map((product, idx) => (
                <tr key={idx} className="hover:bg-teal-50/20 transition-colors">
                <td>
                  <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-none font-bold text-sm">
                    {product.platform}
                  </span>
                </td>
                <td>
                  <div className="font-mono text-sm text-slate-500">{product.nhiCode || '-'}</div>
                </td>
                <td>
                  <div className="font-bold text-slate-600">{product.nhiPrice ? `$${product.nhiPrice}` : '-'}</div>
                </td>
                <td>
                  <div className="font-bold text-slate-800">{product.name}</div>
                  <div className="text-xs text-slate-400 mt-1">{product.spec}</div>
                </td>
                <td>
                  <div className="text-xs font-bold text-rose-600">{product.expiry}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{product.memo}</div>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-black ${product.isCheapest ? 'text-emerald-600' : 'text-slate-700'}`}>
                      ${product.price}
                    </span>
                    <span className="text-slate-400 text-sm">/ {product.unit}</span>
                  </div>
                </td>
                <td>
                  <div className="font-bold text-indigo-600">{product.unitPrice ? `$${product.unitPrice}` : '-'}</div>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    {(() => {
                      // 放寬缺貨定義：包含「無、缺、售完、補貨、暫停、0」等關鍵字
                      const outOfStock = /無|缺|^0$|售完|補貨|暫停/i.test(product.stock);
                      return (
                        <>
                          <div className={`w-2 h-2 rounded-full ${outOfStock ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                          <span className={`text-sm font-black ${outOfStock ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {product.stock}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </td>
                <td>
                  {product.isCheapest && (
                    <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-none text-xs font-bold flex items-center gap-1">
                      <TrendingDown size={12} /> 最划算
                    </div>
                  )}
                </td>
              </tr>
            ));
          })()}
          </tbody>
        </table>
      </div>
    </div>

      <DrugAppearanceModal 
        isOpen={isAppearanceModalOpen}
        onClose={() => setIsAppearanceModalOpen(false)}
        data={selectedAppearance}
      />
      
      {isAppearanceLoading && (
        <div className="fixed inset-0 z-[110] bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center">
          <div className="bg-white p-6 border-4 border-slate-900 flex items-center gap-4">
            <Loader2 className="animate-spin text-blue-600" size={24} />
            <span className="font-black text-slate-900 uppercase tracking-tighter">Fetching Clinical Data...</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
