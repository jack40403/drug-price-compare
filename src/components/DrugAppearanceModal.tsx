import { X, Image as ImageIcon, Ruler, Palette, PenTool, Layout, Box } from 'lucide-react'

// Reuse Pill icon locally for the header, defined before main component to avoid hoisting issues in some environments
const PillIcon = ({ className, size = 20 }: { className?: string, size?: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="3" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>
  </svg>
);

interface DrugAppearanceProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
}

const DrugAppearanceModal = ({ isOpen, onClose, data }: DrugAppearanceProps) => {
  if (!isOpen) return null;

  // 數據歸一化 (Normalization): 同時支援新舊資料格式
  // 新格式 (整合版): img, sh, cl, b1, b2, sz, lic
  // 舊格式 (原始版): 外觀圖檔連結, 形狀, 顏色, 標註一, 標註二, 外觀尺寸, 許可證字號
  const normalizedData = {
    license: data.lic || data.許可證字號 || 'Unknown License',
    nameCn: data.n_cn || data.中文品名 || '資料載入中...',
    nameEn: data.n || data.英文品名 || '',
    imgUrl: data.img || data.外觀圖檔連結,
    shape: data.sh || data.形狀 || '-',
    color: data.cl || data.顏色 || '-',
    mark1: data.b1 || data.標註一 || '',
    mark2: data.b2 || data.標註二 || '',
    size: data.sz || data.外觀尺寸 || '-',
    description: data.desc || data.外觀描述 || '無詳細描述資訊。'
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 rounded-xl border border-slate-200">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-teal-500 p-2 rounded-lg">
              <PillIcon className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">藥品外觀比對報告</h2>
              <p className="text-teal-400 text-[10px] font-mono font-bold uppercase tracking-widest leading-none mt-1">
                {normalizedData.license}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 transition-colors rounded-full"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col md:flex-row h-full max-h-[85vh] overflow-hidden">
          {/* Left Column: Image & Identity */}
          <div className="md:w-[45%] bg-slate-50 flex flex-col border-r border-slate-100 h-full overflow-y-auto">
            <div className="p-8 flex flex-col items-center">
              {normalizedData.imgUrl ? (
                <div className="relative bg-white p-4 shadow-sm border border-slate-100 rounded-lg group">
                  <img 
                    src={normalizedData.imgUrl} 
                    alt={normalizedData.nameCn}
                    className="max-h-[220px] w-auto object-contain transition-transform group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://placehold.co/400x300?text=Image+Not+Found'
                    }}
                  />
                  <div className="absolute -top-2 -right-2 bg-teal-600 text-white px-2 py-1 text-[9px] font-bold rounded">官方庫存圖</div>
                </div>
              ) : (
                <div className="w-full aspect-square border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-300 gap-3">
                  <ImageIcon size={48} />
                  <span className="text-xs font-bold uppercase tracking-widest">暫無影像</span>
                </div>
              )}

              <div className="mt-8 w-full space-y-4">
                <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm">
                  <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest block mb-2">CLINICAL_IDENTITY</span>
                  <h3 className="text-xl font-black text-slate-900 leading-tight mb-1">{normalizedData.nameCn}</h3>
                  <p className="text-sm font-medium text-slate-400 italic line-clamp-2">{normalizedData.nameEn}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Physical Details */}
          <div className="md:w-[55%] p-8 space-y-8 overflow-y-auto h-full bg-white">
            
            {/* 1. 基本物理特性 */}
            <section>
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <div className="w-4 h-[2px] bg-slate-200"></div>
                基本物理特性
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Layout size={12} className="text-teal-500" />
                    <span className="text-[10px] font-bold uppercase">形狀</span>
                  </div>
                  <div className="text-base font-black text-slate-800">{normalizedData.shape}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Palette size={12} className="text-teal-500" />
                    <span className="text-[10px] font-bold uppercase">顏色</span>
                  </div>
                  <div className="text-base font-black text-slate-800">{normalizedData.color}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Ruler size={12} className="text-teal-500" />
                    <span className="text-[10px] font-bold uppercase">尺寸(mm)</span>
                  </div>
                  <div className="text-base font-black text-slate-800">{normalizedData.size}</div>
                </div>
              </div>
            </section>

            {/* 2. 表面標記 (極度重要) */}
            <section>
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <div className="w-4 h-[2px] bg-slate-200"></div>
                表面標記辨識
              </h4>
              <div className="bg-indigo-50/50 p-6 rounded-2xl border-2 border-indigo-100/50 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="bg-white p-2 rounded-lg shadow-sm border border-indigo-100">
                    <PenTool className="text-indigo-600" size={20} />
                  </div>
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-600/70">標記面 A</span>
                      <span className="text-sm font-black text-slate-800 bg-white px-3 py-1 rounded shadow-sm border border-indigo-50">{normalizedData.mark1 || '不適用'}</span>
                    </div>
                    {normalizedData.mark2 && (
                      <div className="flex items-center justify-between border-t border-indigo-100 pt-3">
                        <span className="text-xs font-bold text-indigo-600/70">標記面 B</span>
                        <span className="text-sm font-black text-slate-800 bg-white px-3 py-1 rounded shadow-sm border border-indigo-50">{normalizedData.mark2}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 3. 備註說明 */}
            <section>
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <div className="w-4 h-[2px] bg-slate-200"></div>
                臨床描述
              </h4>
              <div className="bg-amber-50/30 p-5 rounded-xl border border-amber-100/50 flex gap-3">
                <Box size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600 leading-relaxed font-medium italic">
                  {normalizedData.description}
                </p>
              </div>
            </section>

            <button 
              onClick={onClose}
              className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black transition-all shadow-lg hover:shadow-indigo-200/50 tracking-tight"
            >
              完成確認並返回
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DrugAppearanceModal;
