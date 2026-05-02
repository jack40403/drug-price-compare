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
  onRequestCaptcha: (callback) => {
    const subscription = (_event, data) => callback(data);
    electron.ipcRenderer.on("request-captcha", subscription);
    return () => electron.ipcRenderer.removeListener("request-captcha", subscription);
  },
  invoke: (channel, ...args) => electron.ipcRenderer.invoke(channel, ...args),
  on: (channel, callback) => {
    const subscription = (_event, ...args) => callback(...args);
    electron.ipcRenderer.on(channel, subscription);
    return () => electron.ipcRenderer.removeListener(channel, subscription);
  }
});
