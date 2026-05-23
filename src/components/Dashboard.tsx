import { useState, useEffect } from 'react'
import { Search, Loader2, ArrowUpDown, CheckCircle2, TrendingDown, Pill, RefreshCcw, Copy, Check, Zap, Banknote, Globe, Activity, Settings, Image as ImageIcon, Send, ShieldAlert } from 'lucide-react'
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
  const [isStrictFilter, setIsStrictFilter] = useState(true) // 精確過濾開關 (預設開啟)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' | null }>({ key: '', direction: null }) // 排序設定
  const [captchaQueue, setCaptchaQueue] = useState<any[]>([])
  const [captchaInputs, setCaptchaInputs] = useState<Record<string, string>>({})
  const [bridgeConnected, setBridgeConnected] = useState(true) // 預設為 true，網頁版會更新
  const [nhiFilter, setNhiFilter] = useState<'name' | 'code' | 'component'>('name')
  const [marketFilter, setMarketFilter] = useState<'name' | 'code' | 'component'>('name')

  const platformColorMap: Record<string, string> = {
    'binli': 'bg-blue-100 text-blue-800 border-blue-200',
    'chahwa': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'coda': 'bg-purple-100 text-purple-800 border-purple-200',
    'jhaohong': 'bg-orange-100 text-orange-800 border-orange-200',
    'mdt': 'bg-rose-100 text-rose-800 border-rose-200',
    'taichung': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'yc': 'bg-amber-100 text-amber-800 border-amber-200',
    'yeschain': 'bg-teal-100 text-teal-800 border-teal-200',
    'yusheng': 'bg-indigo-100 text-indigo-800 border-indigo-200'
  };
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

  // 診斷偵測：啟動時檢查後端狀態與環境
  useEffect(() => {
    // [手機端 API 偽裝] 如果沒偵測到 Electron，就自己創一個，讓所有按鈕都能走 HTTP 橋接
    if (!(window as any).electronAPI) {
      console.log('[Dashboard] 手機/網頁環境：正在注入 API 偽裝層...');
      const bridgeHost = window.location.hostname || 'localhost';
      const bridgeBase = `http://${bridgeHost}:3010/api`;

      (window as any).electronAPI = {
        invoke: async (channel: string, ...args: any[]) => {
          const res = await fetch(`${bridgeBase}/invoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, args })
          });
          return await res.json();
        },
        on: (channel: string, callback: any) => {
          // 手機端監聽器，目前暫不實作
          return () => {};
        },
        getCredentials: (id: string) => (window as any).electronAPI.invoke('get-credentials', id),
        saveCredentials: (creds: any) => (window as any).electronAPI.invoke('save-credentials', creds),
        performSearch: (searchTerm: string, platforms: string[]) => 
          (window as any).electronAPI.invoke('perform-search', { searchTerm, platforms }),
        interruptSearch: () => (window as any).electronAPI.invoke('interrupt-search'),
        getDrugAppearance: (args: any) => (window as any).electronAPI.invoke('get-drug-appearance', args),
        onRequestCaptcha: () => (() => {}),
        onUpdateProgress: () => (() => {}),
      };
    }

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

    // Listen for CAPTCHA requests
    let removeCaptchaListener: any;
    let pollInterval: any;

    if (navigator.userAgent.toLowerCase().includes('electron')) {
      // 電腦端監聽
      removeCaptchaListener = (window as any).electronAPI.onRequestCaptcha((data: any) => {
        console.log('[Dashboard] 收到驗證碼請求 (IPC):', data.platformName)
        setCaptchaQueue(prev => {
          const filtered = prev.filter(q => q.platformId !== data.platformId);
          return [...filtered, data];
        });
      })

      // 監聽清空請求 (防黑屏檢查)
      if (typeof (window as any).electronAPI.on === 'function') {
        (window as any).electronAPI.on('clear-captchas', () => {
          setCaptchaQueue([]);
          setCaptchaInputs({});
        });

        (window as any).electronAPI.on('clear-captcha-for-platform', (platformId: string) => {
          console.log(`[Dashboard] 收到清除指令 (平台: ${platformId})`);
          setCaptchaQueue(prev => prev.filter(q => q.platformId !== platformId));
          setCaptchaInputs(prev => {
            const next = { ...prev };
            delete next[platformId];
            return next;
          });
        });
      }
    } else {
      // 手機端/網頁版：啟動輪詢
      const bridgeHost = window.location.hostname || 'localhost';
      pollInterval = setInterval(async () => {
        try {
          const bridgeUrl = `http://${bridgeHost}:3010/api/captchas?t=${Date.now()}`;
          const res = await fetch(bridgeUrl)
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data)) {
              setCaptchaQueue(data)
              setBridgeConnected(true)
            }
          } else {
            setBridgeConnected(false)
          }
        } catch (e) {
          setBridgeConnected(false)
        }
      }, 2000)
    }

    return () => {
      if (typeof removeListener === 'function') removeListener()
      if (typeof removeCaptchaListener === 'function') removeCaptchaListener()
      if (pollInterval) clearInterval(pollInterval)
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

  const handleCaptchaSubmit = async (platformId: string) => {
    const code = captchaInputs[platformId]
    if (!code) return

    try {
      await (window as any).electronAPI.invoke('submit-captcha', {
        platformId,
        code
      })
      // 移除本地顯示
      setCaptchaQueue(prev => prev.filter(q => q.platformId !== platformId))
      setCaptchaInputs(prev => {
        const next = { ...prev }
        delete next[platformId]
        return next
      })
    } catch (err) {
      console.error('提交驗證碼失敗:', err)
    }
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

    try {
      // 只發動各平台即時比價，僅包含已勾選的平台
      const platformResults = await (window as any).electronAPI.invoke('perform-search', { 
        searchTerm, 
        platforms: selectedPlatforms, 
        filters: {
          name: marketFilter === 'name',
          code: marketFilter === 'code',
          component: marketFilter === 'component'
        }
      })

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
      const localResults = await (window as any).electronAPI.invoke('search-nhi-local', { 
        searchTerm: finalTerm, 
        filters: {
          name: nhiFilter === 'name',
          code: nhiFilter === 'code',
          component: nhiFilter === 'component'
        }
      })
      setNhiResults(localResults || [])
      if (!customTerm) setNhiSearchTerm(finalTerm)
    } catch (err) {
      console.error(err)
    } finally {
      setIsNhiSearching(false)
    }
  }

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null;
    }
    setSortConfig({ key, direction });
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
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-amber-500/30">
      {/* 🚀 頂部旗艦導航欄 - 深海黑 */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-900/20">
            <Zap className="text-slate-950 fill-current" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white uppercase">Pharmacy <span className="text-amber-500">Price Terminal</span></h1>
            <p className="text-[10px] font-black text-slate-500 tracking-widest uppercase">Clinical Data Management System</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isSearching ? 'bg-amber-400 animate-pulse' : 'bg-slate-700'}`} />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isSearching ? 'Syncing...' : 'System Ready'}</span>
            
            {/* 橋接狀態燈 - 強制顯示以便診斷 */}
            <div className="flex items-center gap-2 ml-2 px-2 py-0.5 bg-slate-800 rounded-md border border-white/5">
              <div className={`w-1.5 h-1.5 rounded-full ${bridgeConnected ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 animate-pulse'}`} />
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Bridge: {bridgeConnected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
          <div className="h-4 w-px bg-white/10 mx-2" />
          <button className="text-slate-500 hover:text-amber-400 transition-colors">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-8 space-y-12">
        {/* 📊 建索引進度條 */}
        {indexingStatus && (
          <div className={`flex items-center gap-3 px-4 py-2 text-sm font-bold rounded-lg border-l-4 ${
            indexingStatus.status === 'processing' ? 'bg-amber-500/10 border-amber-500 text-amber-400' :
            indexingStatus.status === 'success' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' :
            'bg-rose-500/10 border-rose-500 text-rose-400'
          }`}>
            {indexingStatus.status === 'processing' && <Loader2 size={16} className="animate-spin" />}
            <span>
              {indexingStatus.status === 'processing' && `對全檔資料重建索引中...`}
              {indexingStatus.status === 'success' && `✅ 建置完成！共導入 ${indexingStatus.count.toLocaleString()} 筆藥品。`}
              {indexingStatus.status === 'error' && `❌ 建置失敗：${indexingStatus.message}`}
            </span>
          </div>
        )}

        <section className="space-y-8">
          <div className="bg-slate-800/40 rounded-2xl border border-white/5 flex flex-col md:flex-row items-stretch overflow-hidden">
            <div className="flex-1 px-12 py-12 border-b md:border-b-0 md:border-r border-white/5">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-500 rounded-lg text-[10px] font-black uppercase tracking-wider mb-4 border border-amber-500/20">
                <Pill size={12} />
                Clinical Ocean Database
              </div>
              <h3 className="font-black text-white leading-none text-6xl tracking-tighter">健保藥品快速查詢</h3>
              <div className="flex items-center gap-4 mt-4">
                <p className="text-lg text-amber-500 font-bold">NHI Official Drug Database Search Engine</p>
                <button 
                  onClick={() => setIsMaintenanceMode(!isMaintenanceMode)}
                  className={`text-[10px] px-2 py-1 border rounded-md font-black transition-colors ${isMaintenanceMode ? 'bg-white text-slate-950 border-white' : 'text-slate-500 border-slate-800 hover:border-slate-600'}`}
                >
                  {isMaintenanceMode ? '關閉維護' : '資料維護'}
                </button>
              </div>
            </div>
            <div className="p-8 flex items-center justify-center bg-white/5 min-w-[350px]">
              <button
                onClick={handleAutoIndex}
                className="clinical-btn-tactile clinical-btn-tactile-blue flex items-center gap-4 px-12 py-6 text-xl font-black transition-all active:scale-95"
              >
                <RefreshCcw size={24} />
                一鍵重建資料庫
              </button>
            </div>
          </div>

        {/* 🛠️ 維護主控台 */}
        {isMaintenanceMode && (
          <div className="bg-slate-800/60 rounded-2xl border-2 border-dashed border-amber-500/30 p-12 text-center group hover:border-amber-500/50 hover:bg-amber-500/5 transition-all cursor-crosshair">
            <div onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop}>
              <div className="space-y-4">
                <div className="text-6xl text-amber-500/20 group-hover:text-amber-500/40 transition-colors">↓</div>
                <h4 className="text-2xl font-black text-amber-100 uppercase tracking-tight">Drop NHI Database Here</h4>
                <p className="text-sm text-amber-400/60 font-medium italic">支援拖放健保署 TXT 原始數據檔案進行增量更新</p>
                <button
                  onClick={(e) => { e.stopPropagation(); handleOpenFileDialog(); }}
                  className="clinical-btn-tactile clinical-btn-tactile-blue mx-auto flex items-center gap-4 px-12 py-6 text-xl font-black transition-all active:scale-95"
                >
                  <Globe size={24} />
                  點擊選擇健保資料檔案
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleNhiSearch} className="bg-slate-800 rounded-xl border border-white/10 overflow-hidden shadow-2xl">
          <div className="flex flex-col md:flex-row items-stretch">
            <div className="flex-1 relative bg-transparent border-b md:border-b-0 md:border-r border-white/5 flex items-center">
              <input
                type="text"
                value={nhiSearchTerm}
                onChange={(e) => setNhiSearchTerm(e.target.value)}
                placeholder="輸入商品名稱、健保碼或關鍵字..."
                className="block flex-1 pl-8 pr-4 py-6 text-lg font-bold bg-transparent outline-none placeholder:text-slate-600 text-white"
              />
              <div className="flex items-center gap-4 px-6 border-l border-white/5">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="nhi-filter"
                    checked={nhiFilter === 'name'} 
                    onChange={() => setNhiFilter('name')}
                    className="w-4 h-4 border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
                  />
                  <span className={`text-xs font-black uppercase tracking-wider transition-colors ${nhiFilter === 'name' ? 'text-amber-500' : 'text-slate-500 group-hover:text-slate-300'}`}>藥品名</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="nhi-filter"
                    checked={nhiFilter === 'code'} 
                    onChange={() => setNhiFilter('code')}
                    className="w-4 h-4 border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
                  />
                  <span className={`text-xs font-black uppercase tracking-wider transition-colors ${nhiFilter === 'code' ? 'text-amber-500' : 'text-slate-500 group-hover:text-slate-300'}`}>健保碼</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="nhi-filter"
                    checked={nhiFilter === 'component'} 
                    onChange={() => setNhiFilter('component')}
                    className="w-4 h-4 border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
                  />
                  <span className={`text-xs font-black uppercase tracking-wider transition-colors ${nhiFilter === 'component' ? 'text-amber-500' : 'text-slate-500 group-hover:text-slate-300'}`}>成分</span>
                </label>
              </div>
            </div>
            <div className="p-2 flex items-center justify-center bg-white/5 gap-3">
              <button
                type="button"
                onClick={handleClearNhiSearch}
                className="clinical-btn-tactile clinical-btn-tactile-slate px-6 py-4 text-lg font-black whitespace-nowrap rounded-sm"
              >
                清空
              </button>
              <button
                type="submit"
                disabled={isNhiSearching}
                className="clinical-btn-tactile clinical-btn-tactile-blue w-full px-8 py-4 text-xl font-black flex items-center justify-center gap-3 rounded-sm"
              >
                {isNhiSearching ? <Loader2 size={24} className="animate-spin" /> : null}
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
                                className="text-sm font-black text-amber-400 hover:text-amber-300 hover:underline text-left leading-tight"
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
        <div className="mb-6 mt-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-wider mb-2 border border-indigo-100">
            <Globe size={12} />
            Market Liquidity Tracker
          </div>
          <h3 className="font-black text-slate-900 text-5xl tracking-tight leading-none flex items-center gap-4">
            中盤即時比價終端
          </h3>
          <p className="text-lg text-indigo-600 font-bold mt-3">串接九大供應平台，即時監控市場價格波動</p>
        </div>

        {/* 🚀 平台選擇控制區區塊 */}
        <div className="clinical-table-container border-4 bg-white p-6 space-y-6">
          <div className="flex flex-col md:flex-row items-stretch gap-10">
            <div className="flex-1">
              {/* 平台開關控制列 */}
            </div>
            <div className="flex items-center gap-4 w-full">
              <button 
                onClick={selectAllPlatforms}
                className="clinical-btn-tactile clinical-btn-tactile-blue flex-1 py-6 text-xl font-black uppercase rounded-sm"
              >
                全選 (SELECT ALL)
              </button>
              <button 
                onClick={selectNonePlatforms}
                className="clinical-btn-tactile clinical-btn-tactile-slate flex-1 py-6 text-xl font-black uppercase rounded-sm"
              >
                清空 (CLEAR ALL)
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
                  className={`clinical-btn-tactile flex flex-col items-center justify-center gap-3 px-4 py-6 text-center rounded-sm ${
                    isSelected 
                      ? 'clinical-btn-tactile-blue ring-4 ring-amber-500/20 z-10' 
                      : 'clinical-btn-tactile-slate'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-sm flex items-center justify-center border-2 transition-all ${
                    isSelected ? 'bg-slate-950 border-amber-500 text-amber-500 shadow-md shadow-amber-500/10' : 'bg-slate-800 border-slate-700'
                  }`}>
                    <div className="w-8 h-8 bg-slate-700 rounded-none" />
                  </div>
                  <span className="text-xl font-black tracking-tight">{platform.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <form onSubmit={handleSearch} className="bg-slate-800 rounded-[2rem] shadow-2xl shadow-amber-900/20 border border-white/10 overflow-hidden group focus-within:ring-8 focus-within:ring-amber-500/10 transition-all duration-300">
          <div className="flex flex-col md:flex-row items-stretch">
            <div className="flex-1 relative bg-transparent border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-center">
              <input
                id="market-search-input"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="輸入商品名稱或關鍵字進行全平台比價..."
                className="block w-full px-12 pt-16 pb-12 text-5xl font-black bg-transparent outline-none placeholder:text-slate-700 text-white tracking-tighter"
              />
              <div className="flex items-center gap-8 px-12 pb-8">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="market-filter"
                    checked={marketFilter === 'name'} 
                    onChange={() => setMarketFilter('name')}
                    className="w-6 h-6 border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
                  />
                  <span className={`text-xl font-black uppercase tracking-widest transition-colors ${marketFilter === 'name' ? 'text-amber-500' : 'text-slate-600 group-hover:text-slate-400'}`}>藥品名稱 (DRUG NAME)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="market-filter"
                    checked={marketFilter === 'code'} 
                    onChange={() => setMarketFilter('code')}
                    className="w-6 h-6 border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
                  />
                  <span className={`text-xl font-black uppercase tracking-widest transition-colors ${marketFilter === 'code' ? 'text-amber-500' : 'text-slate-600 group-hover:text-slate-400'}`}>健保代碼 (NHI CODE)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="market-filter"
                    checked={marketFilter === 'component'} 
                    onChange={() => setMarketFilter('component')}
                    className="w-6 h-6 border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
                  />
                  <span className={`text-xl font-black uppercase tracking-widest transition-colors ${marketFilter === 'component' ? 'text-amber-500' : 'text-slate-600 group-hover:text-slate-400'}`}>成分名稱 (COMPONENT)</span>
                </label>
              </div>
            </div>
            <div className="p-6 flex items-center justify-center bg-white/5">
              <div className="flex items-stretch gap-4 w-full h-full">
                <button
                  type="button"
                  onClick={() => setIsStrictFilter(!isStrictFilter)}
                  className={`flex-1 px-4 py-6 text-xl font-black flex items-center justify-center gap-3 transition-all active:scale-95 clinical-btn-tactile rounded-sm ${
                    isStrictFilter 
                      ? 'clinical-btn-tactile-blue' 
                      : 'clinical-btn-tactile-slate opacity-60'
                  }`}
                >
                  <CheckCircle2 size={24} />
                  <span>{isStrictFilter ? '已開啟過濾' : '精確過濾'}</span>
                </button>

                {isSearching && (
                  <button
                    type="button"
                    onClick={handleStopSearch}
                    disabled={isStopping}
                    className="flex-1 px-6 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-sm text-lg font-black flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-rose-900/20"
                  >
                    {isStopping ? <Loader2 size={24} className="animate-spin" /> : <span>停止</span>}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSearching}
                  className="clinical-btn-tactile clinical-btn-tactile-blue flex-1 px-6 py-4 text-lg font-black flex items-center justify-center gap-3 transition-all active:scale-95 rounded-sm"
                >
                  {isSearching ? <Loader2 size={24} className="animate-spin" /> : <Zap size={24} className="fill-current" />}
                  <span>{isSearching ? '抓取中...' : '啟動比價'}</span>
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
              <th className="cursor-pointer hover:bg-white/5 transition-all" onClick={() => handleSort('nhiPrice')}>
                <div className="flex items-center gap-2 justify-center group/h">
                  健保價 
                  <div className={`p-1 rounded ${sortConfig.key === 'nhiPrice' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500 group-hover/h:text-slate-300'}`}>
                    <ArrowUpDown size={14} />
                  </div>
                </div>
              </th>
              <th>藥品名稱 / 規格</th>
              <th>效期 / 備註</th>
              <th className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleSort('price')}>
                <div className="flex items-center gap-2">單位售價 <ArrowUpDown size={14} className={sortConfig.key === 'price' ? 'text-blue-600' : 'text-slate-300'} /></div>
              </th>
              <th>單價</th>
              <th className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleSort('stock')}>
                <div className="flex items-center gap-2">庫存狀態 <ArrowUpDown size={14} className={sortConfig.key === 'stock' ? 'text-blue-600' : 'text-slate-300'} /></div>
              </th>
              <th>狀態標記</th>
            </tr>
          </thead>
          <tbody className="">
            {(() => {
              // 實施過濾邏輯
              // 1. 準備顯示資料 (不再物理刪除)
              let displayData = searchResults.map(p => {
                const term = searchTerm.trim().toLowerCase();
                
                // 基本匹配
                const basicMatch = (
                  p.name?.toLowerCase().includes(term) ||
                  (p.nhiCode?.toLowerCase() === term || p.nhiCode?.toLowerCase().includes(term)) ||
                  p.spec?.toLowerCase().includes(term) ||
                  p.memo?.toLowerCase().includes(term)
                );

                // 複方過濾邏輯 (如果開啟精確過濾)
                let isMatch = basicMatch;
                if (isStrictFilter && term && basicMatch) {
                  // 複方判斷：斜線兩側都是 4 個以上英文字母才算複方成分
                  // 排除劑量/單位格式（如 100MG/TAB、30錠/盒、5ML/VIAL）
                  const isActualCompound = (text: string) =>
                    /[A-Za-z]{4,}\/[A-Za-z]{4,}/.test(text);

                  const isSearchCompound = term.includes('+') || isActualCompound(term);
                  const isProductCompound =
                    (p.name + (p.spec || '')).includes('+') ||
                    isActualCompound(p.name + (p.spec || ''));

                  // 如果搜尋的是單方，但產品是複方，則隱藏
                  if (!isSearchCompound && isProductCompound) {
                    isMatch = false;
                  }
                }

                // 如果沒開啟過濾，或是符合過濾條件，則顯示
                const finalVisibility = !isStrictFilter || !term || isMatch;

                return { ...p, isMatch: finalVisibility };
              });

              // 2. 排序邏輯
              if (sortConfig.key && sortConfig.direction) {
                displayData.sort((a, b) => {
                  if (sortConfig.key === 'nhiPrice') {
                    const valA = typeof a.nhiPrice === 'number' ? a.nhiPrice : parseFloat(String(a.nhiPrice || '0').replace(/[^\d.]/g, ''));
                    const valB = typeof b.nhiPrice === 'number' ? b.nhiPrice : parseFloat(String(b.nhiPrice || '0').replace(/[^\d.]/g, ''));
                    return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                  }
                  if (sortConfig.key === 'price') {
                    const valA = a.price || 0;
                    const valB = b.price || 0;
                    return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                  }
                  if (sortConfig.key === 'stock') {
                    // 有貨優先：檢查字串中是否包含「無、缺、0、售完」
                    const isOutOfStock = (s: string) => /無|缺|^0$|售完|補貨|暫停/i.test(s || '');
                    const aOut = isOutOfStock(a.stock);
                    const bOut = isOutOfStock(b.stock);
                    if (aOut === bOut) return 0;
                    return sortConfig.direction === 'asc' ? (aOut ? 1 : -1) : (aOut ? -1 : 1);
                  }
                  return 0;
                });
              }

              return displayData.map((product, idx) => {
                // 根據平台定義「暴力高飽和」底色 (強制覆蓋版)
                const p = product.platform.toLowerCase();
                const bgColor = 
                  p.includes('yeschain') ? '!bg-blue-600/60' :
                  p.includes('裕利') ? '!bg-amber-600/60' :
                  p.includes('耀聖') ? '!bg-emerald-600/60' :
                  '!bg-purple-600/60';
                
                const borderColor = 
                  p.includes('yeschain') ? '!border-blue-400' :
                  p.includes('裕利') ? '!border-amber-400' :
                  p.includes('耀聖') ? '!border-emerald-400' :
                  '!border-purple-400';

                return (
                  <tr key={idx} className="border-b border-white/10 group" style={{ display: product.isMatch ? 'table-row' : 'none' }}>
                    <td className={`${bgColor} ${borderColor} !border-l-8 font-medium`}>
                      <span className="px-2 py-1 rounded-full text-[10px] font-black bg-slate-950 text-white border border-white/20 uppercase">
                        {product.platform}
                      </span>
                    </td>
                    <td className={bgColor}>
                      <div className="font-mono text-sm text-white font-bold">{product.nhiCode || '-'}</div>
                    </td>
                    <td className={bgColor}>
                      <div className="font-black text-white">$ {product.nhiPrice ? product.nhiPrice : '-'}</div>
                    </td>
                    <td className={bgColor}>
                      <div className="font-black text-white text-xl tracking-tight drop-shadow-md">{product.name}</div>
                      <div className="text-xs text-white/80 font-bold mt-1">{product.spec}</div>
                    </td>
                    <td className={bgColor}>
                      <div className="text-xs font-black text-white bg-rose-600/80 px-1 inline-block">{product.expiry}</div>
                      <div className="text-[10px] text-white/90 font-bold mt-0.5">{product.memo}</div>
                    </td>
                    <td className={bgColor}>
                      <div className="flex items-center gap-2">
                        <span className="text-3xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                          ${product.price}
                        </span>
                        <span className="text-white/70 text-sm font-bold">/ {product.unit}</span>
                      </div>
                    </td>
                    <td className={bgColor}>
                      <div className="font-black text-white text-lg drop-shadow-sm">{product.unitPrice ? `$${product.unitPrice}` : '-'}</div>
                    </td>
                    <td className={bgColor}>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const outOfStock = /無|缺|^0$|售完|補貨|暫停/i.test(product.stock);
                          return (
                            <span className={`px-2 py-1 rounded text-sm font-black ${outOfStock ? 'bg-rose-600 text-white animate-pulse' : 'bg-emerald-600 text-white'}`}>
                              {product.stock}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className={bgColor}>
                      {product.isCheapest && (
                        <div className="bg-yellow-400 text-slate-950 px-3 py-1 rounded-none text-[10px] font-black flex items-center gap-1 uppercase">
                          <TrendingDown size={12} /> TOP PRICE
                        </div>
                      )}
                    </td>
                  </tr>
                );
              });
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
      </main>

      {/* 驗證碼交互中心 (並列磁貼式) */}
      {captchaQueue.length > 0 && (
        <div className="fixed bottom-6 left-6 right-6 z-[100] flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {captchaQueue.map((req) => (
            <div 
              key={req.platformId}
              className="flex-shrink-0 w-80 bg-slate-900 border-2 border-amber-500/50 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in slide-in-from-bottom-10"
            >
              <div className="bg-amber-500 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} className="text-slate-900" />
                  <span className="font-black text-slate-900 text-xs uppercase tracking-tighter">
                    {req.platformName} 驗證碼
                  </span>
                </div>
                <div className="w-2 h-2 rounded-full bg-slate-900 animate-pulse" />
              </div>
              
              <div className="p-4 space-y-4">
                <div className="bg-white rounded-xl p-3 flex justify-center shadow-inner min-h-[60px]">
                  {req.image ? (
                    <img 
                      src={req.image} 
                      alt="captcha" 
                      className="h-12 object-contain"
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-[10px] font-bold">載入中...</span>
                    </div>
                  )}
                </div>

                <div className="relative group">
                  <input
                    type="text"
                    value={captchaInputs[req.platformId] || ''}
                    onChange={(e) => setCaptchaInputs(prev => ({
                      ...prev,
                      [req.platformId]: e.target.value
                    }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCaptchaSubmit(req.platformId)
                    }}
                    placeholder="請輸入驗證碼"
                    autoFocus
                    className="w-full bg-slate-800 border-2 border-white/5 rounded-xl px-4 py-3 text-white font-black placeholder:text-slate-600 focus:border-amber-500/50 transition-all outline-none"
                  />
                  <button 
                    onClick={() => handleCaptchaSubmit(req.platformId)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg transition-colors shadow-lg"
                  >
                    <Send size={18} />
                  </button>
                </div>
                
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest text-center">
                  Remote Verification Center • Active
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* 🚀 頁腳 */}
      <footer className="mt-20 border-t border-white/5 p-10 text-center bg-transparent">
        <p className="text-slate-500 font-bold text-sm">Handcrafted by Lithium Lee</p>
        <p className="text-[10px] text-slate-600 mt-2 tracking-widest uppercase font-black">Powered by Antigravity Engine</p>
      </footer>
    </div>
  )
}

export default Dashboard
