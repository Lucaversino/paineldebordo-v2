const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");

const DEFAULT_PANEL_URL = "https://paineldebordo.vercel.app";
const panelUrl = process.env.PANEL_URL || DEFAULT_PANEL_URL;

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#031419",
    autoHideMenuBar: true,
    title: "Painel de Bordo — Pesca Industrial",
    icon: path.join(__dirname, "../public/favicon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  // Mantém o WebView isolado: nenhuma integração Node é permitida no MarineTraffic.
  win.webContents.on("will-attach-webview", (_event, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(panelUrl);
}

ipcMain.handle("panel:open-external", async (_event, url) => {
  if (!isHttpUrl(url)) return false;
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
