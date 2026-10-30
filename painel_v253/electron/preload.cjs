const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("panelDesktop", {
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke("panel:open-external", url),
});
