const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studyaiDesktop", {
  isElectron: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getLaunchAtStartup: () => ipcRenderer.invoke("app:get-launch-at-startup"),
  setLaunchAtStartup: (value) => ipcRenderer.invoke("app:set-launch-at-startup", Boolean(value)),
  selectDefaultFolder: () => ipcRenderer.invoke("dialog:select-folder"),
  setMinimizeToTray: (value) => ipcRenderer.invoke("app:set-minimize-to-tray", Boolean(value)),
  readFile: (path) => ipcRenderer.invoke("file:read", path),
  showNotification: (title, body) => ipcRenderer.invoke("notification:show", { title, body }),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  onOpenFiles: (callback) => {
    const listener = (_event, paths) => callback(paths);
    ipcRenderer.on("files:open", listener);
    return () => ipcRenderer.removeListener("files:open", listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
});
