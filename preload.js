console.log("✅ Preload script loaded");

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    selectFolder: () => ipcRenderer.invoke("select-folder"),
    getDownloadFolder: () => ipcRenderer.invoke("get-download-folder"),
    analyzeMedia: (url) => ipcRenderer.invoke("analyze-media", url),
    downloadMedia: (data) => ipcRenderer.invoke("download-media", data),
    

    onDownloadProgress: (callback) => {
        ipcRenderer.on("download-progress", (event, data) => {
            callback(data);
        });
    }
});