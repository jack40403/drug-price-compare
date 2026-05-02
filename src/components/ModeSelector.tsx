import { Layout, Chrome, Zap, Terminal, MousePointer2 } from 'lucide-react'

interface ModeSelectorProps {
  onSelect: (mode: 'chrome' | 'python') => void
}

const ModeSelector = ({ onSelect }: ModeSelectorProps) => {
  return (
    <div className="fixed inset-0 z-[200] bg-slate-900 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top-8 duration-700">
          <h1 className="text-5xl font-black text-white tracking-tighter mb-4">
            請選擇操作介面模式
          </h1>
          <p className="text-slate-400 text-lg font-medium">
            根據您的使用習慣選擇最佳的操作環境
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Chrome Mode Card */}
          <button
            onClick={() => onSelect('chrome')}
            className="group relative bg-slate-800 border-2 border-slate-700 p-8 text-left hover:border-blue-500 hover:bg-slate-800/50 transition-all duration-300 animate-in fade-in slide-in-from-left-8 duration-700"
          >
            <div className="absolute top-4 right-4 text-slate-600 group-hover:text-blue-500 transition-colors">
              <MousePointer2 size={32} />
            </div>
            
            <div className="bg-blue-600/20 w-16 h-16 rounded-xl flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
              <Chrome size={36} />
            </div>

            <h3 className="text-2xl font-black text-white mb-2">CHROME 操作模式</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              適合初次使用或需要手動介入的情況。搜尋時會開啟瀏覽器視窗，您可以看見完整的操作流程。
            </p>

            <ul className="space-y-2 text-xs font-bold text-slate-500">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                可視化瀏覽器操作
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                支援手動處理驗證碼
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                操作安全性較高
              </li>
            </ul>

            <div className="mt-8 py-3 bg-blue-600 text-white text-center font-black rounded-lg group-hover:bg-blue-500 transition-colors">
              雙擊進入 CHROME 模式
            </div>
          </button>

          {/* Python Mode Card */}
          <button
            onClick={() => onSelect('python')}
            className="group relative bg-slate-800 border-2 border-slate-700 p-8 text-left hover:border-emerald-500 hover:bg-slate-800/50 transition-all duration-300 animate-in fade-in slide-in-from-right-8 duration-700"
          >
            <div className="absolute top-4 right-4 text-slate-600 group-hover:text-emerald-500 transition-colors">
              <Terminal size={32} />
            </div>

            <div className="bg-emerald-600/20 w-16 h-16 rounded-xl flex items-center justify-center text-emerald-500 mb-6 group-hover:scale-110 transition-transform">
              <Zap size={36} />
            </div>

            <h3 className="text-2xl font-black text-white mb-2">PYTHON 自動模式</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              適合進階使用者。採用背景執行技術，不開啟視窗，模擬 Python 腳本的高速自動化體驗。
            </p>

            <ul className="space-y-2 text-xs font-bold text-slate-500">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                背景靜默執行 (Headless)
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                極速搜尋體驗
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                無干擾工作環境
              </li>
            </ul>

            <div className="mt-8 py-3 bg-emerald-600 text-white text-center font-black rounded-lg group-hover:bg-emerald-500 transition-colors">
              雙擊進入 PYTHON 模式
            </div>
          </button>
        </div>

        <div className="mt-12 text-center text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em]">
          Professional Pharmacy Console · Dynamic Launcher v2.0
        </div>
      </div>
    </div>
  )
}

export default ModeSelector
