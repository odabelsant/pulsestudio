const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,

  createTerminal: (options) => ipcRenderer.invoke("terminal:create", options),
  writeTerminal: (data) => ipcRenderer.send("terminal:write", data),
  resizeTerminal: (cols, rows) => ipcRenderer.send("terminal:resize", { cols, rows }),
  killTerminal: () => ipcRenderer.send("terminal:kill"),

  onTerminalData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("terminal:data", handler);
    return () => ipcRenderer.removeListener("terminal:data", handler);
  },

  onTerminalExit: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("terminal:exit", handler);
    return () => ipcRenderer.removeListener("terminal:exit", handler);
  },

  almLoadConnections: () => ipcRenderer.invoke("alm:load-connections"),
  almTestConnection: (input) => ipcRenderer.invoke("alm:test-connection", input),
  almSaveConnection: (input) => ipcRenderer.invoke("alm:save-connection", input),
  almDeleteConnection: (id) => ipcRenderer.invoke("alm:delete-connection", id),
});
