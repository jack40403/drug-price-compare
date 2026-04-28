import { useState } from 'react'
import Dashboard from './components/Dashboard'
import Settings from './components/Settings'
import { LayoutDashboard, Settings as SettingsIcon, Pill, Globe, Search } from 'lucide-react'

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard')

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
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
              
              {/* 🆕 藥台灣按鈕直接放在這裡 */}
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

          <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            Expert Pharmacy Console v1.0.0
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
