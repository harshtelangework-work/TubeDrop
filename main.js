const { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem } = require("electron");
const path = require("path");
const store = require("./settings");
const { createServer } = require("./server");

let mainWindow = null;
let backendServer = null;

// ===============================
// Backend (Express + Socket.IO), running in-process
// ===============================
async function startBackend() {
    backendServer = createServer();
    await backendServer.start();
}

async function stopBackend() {
    if (!backendServer) return;
    await backendServer.stop();
    backendServer = null;
}

// ===============================
// Window
// ===============================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        autoHideMenuBar: true,
        icon: path.join(__dirname, "build", "TubeDrop.ico"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, "index.html"));

    // Electron doesn't show a native right-click menu (Cut/Copy/Paste/Select
    // All) by default. Ctrl+V still works because that's a plain keyboard
    // shortcut Chromium handles on its own, but right-click paste needs this
    // wired up explicitly -- otherwise right-clicking the URL field (or any
    // other input) does nothing.
    mainWindow.webContents.on("context-menu", (event, params) => {
        if (!params.isEditable) return;

        const menu = new Menu();

        menu.append(new MenuItem({ label: "Cut", role: "cut", enabled: params.editFlags.canCut }));
        menu.append(new MenuItem({ label: "Copy", role: "copy", enabled: params.editFlags.canCopy }));
        menu.append(new MenuItem({ label: "Paste", role: "paste", enabled: params.editFlags.canPaste }));
        menu.append(new MenuItem({ type: "separator" }));
        menu.append(new MenuItem({ label: "Select All", role: "selectAll", enabled: params.editFlags.canSelectAll }));

        menu.popup({ window: mainWindow });
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    return mainWindow;
}

// ===============================
// App lifecycle
// ===============================
app.whenReady().then(async () => {
    try {
        await startBackend();
    } catch (err) {
        console.error("Failed to start TubeDrop's download engine:", err);
        dialog.showErrorBox(
            "TubeDrop",
            "TubeDrop's download engine failed to start:\n" + err.message
        );
    }

    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", async () => {
    await stopBackend();

    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", async () => {
    await stopBackend();
});

// ===============================
// Browse Folder
// ===============================
ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog({
        properties: ["openDirectory"]
    });

    if (result.canceled) {
        return null;
    }

    const folder = result.filePaths[0];

    const data = store.loadSettings();
    data.downloadFolder = folder;
    store.saveSettings(data);

    return folder;
});

// ===============================
// Get Saved Download Folder
// ===============================
ipcMain.handle("get-download-folder", () => {
    const data = store.loadSettings();
    return data.downloadFolder;
});

// ===============================
// Analyze Media
// ===============================
ipcMain.handle("analyze-media", async (event, url) => {
    if (!backendServer) {
        throw new Error("The download engine isn't ready yet. Please try again in a moment.");
    }

    return backendServer.backend.analyze(url);
});

// ===============================
// Download Media
// ===============================
ipcMain.handle("download-media", async (event, data) => {
    if (!backendServer) {
        throw new Error("The download engine isn't ready yet. Please try again in a moment.");
    }

    return backendServer.backend.download(data, (progress) => {
        if (mainWindow) {
            mainWindow.webContents.send("download-progress", progress);
        }
        backendServer.io.emit("download-progress", progress);
    });
});

// ===============================
// Cancel Download
// ===============================
ipcMain.handle("cancel-download", () => {
    if (backendServer) {
        backendServer.backend.cancelDownload();
    }
});
