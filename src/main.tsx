import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// --- Web 瀏覽器相容性墊片 (手機遠端操作必備) ---
if (!(window as any).electronAPI) {
  console.log('[Web] 偵測到瀏覽器環境，正在啟動 HTTP 橋接墊片...');
  (window as any).electronAPI = {
    invoke: async (channel: string, ...args: any[]) => {
      try {
        const response = await fetch('/api/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, args })
        });
        return await response.json();
      } catch (e) {
        console.error(`[Web Bridge] Invoke failed (${channel}):`, e);
        return { error: '連線至電腦主機失敗' };
      }
    },
    performSearch: async (searchTerm: string, platforms: string[]) => {
      const response = await fetch('/api/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'perform-search', args: [{ searchTerm, platforms }] })
      });
      return await response.json();
    },
    onUpdateProgress: () => () => {},
    onInitMode: (callback: (mode: string) => void) => {
      // 網頁版預設為 Web 模式
      setTimeout(() => callback('web'), 100);
      return () => {};
    },
    onRequestCaptcha: (callback: (data: any) => void) => {
      // 網頁版驗證碼輪詢邏輯 (未來擴充)
      return () => {};
    }
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
