import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getCredentials: (platformId: string) => ipcRenderer.invoke('get-credentials', platformId),
  saveCredentials: (creds: any) => ipcRenderer.invoke('save-credentials', creds),
  performSearch: (searchTerm: string, platforms: string[]) => ipcRenderer.invoke('perform-search', { searchTerm, platforms }),
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
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
})
