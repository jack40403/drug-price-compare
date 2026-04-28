import { useState, useEffect } from 'react'
import { Save, ShieldCheck, Lock, User, Globe, Activity } from 'lucide-react'

const PLATFORMS = [
  { id: 'binli', name: '彬利', url: 'https://twbingli.com' },
  { id: 'chahwa', name: '嘉鏵', url: 'https://www.chahwa.com.tw' },
  { id: 'mdt', name: '蔓達特', url: 'https://www.mdtky.com.tw' },
  { id: 'coda', name: '可達藥品', url: 'https://www.codadrug.com.tw' },
  { id: 'jhao-hong', name: '兆宇 (兆宏)', url: 'https://jhao-hong.com.tw' },
  { id: 'yc', name: '益全生技', url: 'https://ycmedicine.com.tw' },
  { id: 'taichung', name: '泰昌藥品', url: 'https://taichung-pc.com.tw' },
  { id: 'yusheng', name: '育勝', url: 'https://yusheng0307.com' },
  { id: 'yeschain', name: '好鄰居 (躍獅)', url: 'https://www.yeschain.com.tw' },
]

const Settings = () => {
  const [creds, setCreds] = useState<Record<string, { username: string; password: string }>>({})
  const [activePlatform, setActivePlatform] = useState(PLATFORMS[0].id)
  const [isSaved, setIsSaved] = useState(false)

  // Load existing credentials when active platform changes
  useEffect(() => {
    const loadCreds = async () => {
      const data = await (window as any).electronAPI.getCredentials(activePlatform)
      if (data) {
        setCreds(prev => ({ ...prev, [activePlatform]: data }))
      }
    }
    loadCreds()
  }, [activePlatform])

  const handleSave = async () => {
    const platformCreds = creds[activePlatform]
    if (!platformCreds) return

    await (window as any).electronAPI.saveCredentials({ 
      platformId: activePlatform, 
      ...platformCreds 
    })
    
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const updateCred = (field: 'username' | 'password', value: string) => {
    setCreds(prev => ({
      ...prev,
      [activePlatform]: {
        ...(prev[activePlatform] || { username: '', password: '' }),
        [field]: value
      }
    }))
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in slide-in-from-right duration-500">
      <header className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
          <Globe className="text-blue-600" /> 平台帳號資訊
        </h2>
        <p className="text-slate-500">您的憑證將透過系統安全加密存儲，僅供自動登入爬蟲使用。</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Platform List */}
        <div className="space-y-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePlatform(p.id)}
              className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all border-2 ${
                activePlatform === p.id 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200 pointer-events-none' 
                  : 'bg-white border-slate-50 text-slate-600 hover:border-slate-200'
              }`}
            >
              <span className="font-bold">{p.name}</span>
              <Activity size={16} className={activePlatform === p.id ? 'opacity-100' : 'opacity-0'} />
            </button>
          ))}
        </div>

        {/* Credentials Form */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">
                {PLATFORMS.find(p => p.id === activePlatform)?.name} 連線設定
              </h3>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                <ShieldCheck size={14} /> 安全加密中
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-500 flex items-center gap-2">
                  <User size={16} /> 會員帳號 (Account)
                </label>
                <input
                  type="text"
                  value={creds[activePlatform]?.username || ''}
                  onChange={(e) => updateCred('username', e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all"
                  placeholder="請輸入平台帳號..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-500 flex items-center gap-2">
                  <Lock size={16} /> 會員密碼 (Password)
                </label>
                <input
                  type="password"
                  value={creds[activePlatform]?.password || ''}
                  onChange={(e) => updateCred('password', e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all"
                  placeholder="請輸入平台密碼..."
                />
              </div>
            </div>

            <div className="pt-4 flex items-center gap-4">
              <button
                onClick={handleSave}
                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold transition-all ${
                  isSaved ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {isSaved ? <ShieldCheck size={20} /> : <Save size={20} />}
                {isSaved ? '已安全儲存' : '儲存加密憑證'}
              </button>
            </div>
          </div>
          
          <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex gap-4 items-start text-blue-800">
            <Lock className="shrink-0 mt-1" size={20} />
            <div className="text-sm">
              <span className="font-bold block mb-1">隱私政策</span>
              您的登入資訊將僅用於與該藥品平台的伺服器進行通訊。我們不會於任何第三方伺服器儲存或分享您的帳號資料。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
