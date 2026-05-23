import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import Settings from './components/Settings'
import ModeSelector from './components/ModeSelector'
import { LayoutDashboard, Settings as SettingsIcon, Pill, Globe, Search, RefreshCw } from 'lucide-react'

// Duplicate browser fallback removed, now handled in main.tsx

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard')
  const [mode, setMode] = useState<'chrome' | 'python' | null>(null)

  useEffect(() => {
    // 1. 如果是網頁版 (透過墊片識別)，自動進入後台模式
    if (window.navigator.userAgent.includes('Electron') === false) {
      console.log('[App] 偵測為網頁環境，自動啟動後台模式...');
      setMode('python');
      return;
    }

    // 2. 如果是 Electron，檢查是否有從後端傳入的初始模式
    if ((window as any).electronAPI) {
      const removeListener = (window as any).electronAPI.onInitMode((initMode: string) => {
        handleModeSelect(initMode as 'chrome' | 'python')
      })
      
      // 同時檢查本地儲存，預設 chrome 模式
      const savedMode = localStorage.getItem('app-mode') as 'chrome' | 'python' | null
      handleModeSelect(savedMode || 'chrome')
      
      return () => {
        if (typeof removeListener === 'function') removeListener()
      }
    }
  }, [])

  const handleModeSelect = (selectedMode: 'chrome' | 'python') => {
    setMode(selectedMode)
    localStorage.setItem('app-mode', selectedMode)
    // 通知後端設定模式
    if ((window as any).electronAPI) {
      (window as any).electronAPI.invoke('set-automation-mode', { 
        headless: selectedMode === 'python' 
      })
    }
  }

  const handleResetMode = () => {
    setMode(null)
    localStorage.removeItem('app-mode')
  }

  if (!mode) {
    return <ModeSelector onSelect={handleModeSelect} />
  }

  const isElectron = window.navigator.userAgent.includes('Electron');

  return (
    <div className={`flex flex-col ${isElectron ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-slate-50`}>
      {/* 🔝 Top Header Navigation */}
      <header className="bg-white border-b border-slate-200 shadow-sm z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg text-white">
                <Pill size={24} />
              </div>
              <h1 className="font-black text-2xl tracking-tighter text-slate-900">藥品比價小精靈</h1>
            </div>

            <nav className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-black transition-all ${
                  activeTab === 'dashboard' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard size={18} />
                比價儀表板
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-black transition-all ${
                  activeTab === 'settings' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <SettingsIcon size={18} />
                平台設定
              </button>
              
              <button 
                onClick={() => window.open('https://drugtw.com/figure', '_blank')}
                className="ml-4 flex items-center gap-2 px-6 py-2 bg-rose-50 text-rose-600 border-2 border-rose-100 rounded-full text-sm font-black hover:bg-rose-100 transition-all active:scale-95"
              >
                <Globe size={18} />
                藥台灣-藥品辨識
              </button>

              <button 
                onClick={() => window.open('https://info.nhi.gov.tw/INAE3000/INAE3000S01', '_blank')}
                className="ml-2 flex items-center gap-2 px-6 py-2 bg-blue-50 text-blue-600 border-2 border-blue-100 rounded-full text-sm font-black hover:bg-blue-100 transition-all active:scale-95"
              >
                <Search size={18} />
                健保用藥品項網路查詢
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
              mode === 'chrome' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
            }`}>
              {mode} MODE
            </div>
            <button 
              onClick={handleResetMode}
              title="切換操作模式"
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
            >
              <RefreshCw size={16} />
            </button>
            <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              Expert Pharmacy Console v2.0.0
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="h-full">
          {activeTab === 'dashboard' ? <Dashboard /> : <Settings />}
        </div>
      </main>
    </div>
  )
}

export default App
