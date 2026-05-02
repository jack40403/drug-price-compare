"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  getCredentials: (platformId) => electron.ipcRenderer.invoke("get-credentials", platformId),
  saveCredentials: (creds) => electron.ipcRenderer.invoke("save-credentials", creds),
  performSearch: (searchTerm, platforms) => electron.ipcRenderer.invoke("perform-search", { searchTerm, platforms }),
  onUpdateProgress: (callback) => {
    const subscription = (_event, value) => callback(value);
    electron.ipcRenderer.on("update-progress", subscription);
    return () => electron.ipcRenderer.removeListener("update-progress", subscription);
  },
  onInitMode: (callback) => {
    const subscription = (_event, mode) => callback(mode);
    electron.ipcRenderer.on("init-mode", subscription);
    return () => electron.ipcRenderer.removeListener("init-mode", subscription);
  },
  invoke: (channel, ...args) => electron.ipcRenderer.invoke(channel, ...args)
});
