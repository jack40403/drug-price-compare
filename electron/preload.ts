import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getCredentials: (platformId: string) => ipcRenderer.invoke('get-credentials', platformId),
  saveCredentials: (creds: any) => ipcRenderer.invoke('save-credentials', creds),
  performSearch: (searchTerm: string, platforms: string[], filters?: any) => ipcRenderer.invoke('perform-search', { searchTerm, platforms, filters }),
  onUpdateProgress: (callback: (value: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value)
    ipcRenderer.on('update-progress', subscription)
    return () => ipcRenderer.removeListener('update-progress', subscription)
  },
  onInitMode: (callback: (mode: string) => void) => {
    const subscription = (_event: any, mode: string) => callback(mode)
    ipcRenderer.on('init-mode', subscription)
    return () => ipcRenderer.removeListener('init-mode', subscription)
  },
  onRequestCaptcha: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data)
    ipcRenderer.on('request-captcha', subscription)
    return () => ipcRenderer.removeListener('request-captcha', subscription)
  },
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
})
