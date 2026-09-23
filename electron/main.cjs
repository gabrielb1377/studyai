const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const DEV_URL = process.env.STUDYAI_DEV_URL || "http://127.0.0.1:3000";
const SERVER_PORT = process.env.STUDYAI_DESKTOP_PORT || "3210";
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".mp3", ".wav", ".m4a", ".mp4", ".webm", ".mov"]);
let mainWindow;
let splashWindow;
let tray;
let serverProcess;
let quitting = false;
let minimizeToTray = true;
let pendingFiles = [];

function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "server", "public", "icons", "icon-192.png")
    : path.join(__dirname, "..", "public", "icons", "icon-192.png");
}

function materialPaths(argv) {
  return argv.filter((item) => ALLOWED_EXTENSIONS.has(path.extname(item).toLowerCase())).map((item) => path.resolve(item));
}

function queueFiles(paths) {
  pendingFiles = [...new Set([...pendingFiles, ...paths])];
  if (!mainWindow || mainWindow.webContents.isLoading()) return;
  mainWindow.loadURL(`${app.isPackaged ? `http://127.0.0.1:${SERVER_PORT}` : DEV_URL}/importar`).then(() => {
    mainWindow.webContents.send("files:open", pendingFiles);
    pendingFiles = [];
  });
}

async function waitForServer(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* servidor iniciando */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("O servidor local do StudyAI não iniciou a tempo.");
}

async function startProductionServer() {
  const serverRoot = path.join(process.resourcesPath, "server");
  const serverFile = path.join(serverRoot, "server.js");
  serverProcess = spawn(process.execPath, [serverFile], {
    cwd: serverRoot,
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production", PORT: SERVER_PORT, HOSTNAME: "127.0.0.1" },
    stdio: "ignore",
  });
  await waitForServer(`http://127.0.0.1:${SERVER_PORT}`);
  return `http://127.0.0.1:${SERVER_PORT}`;
}

function createSplash() {
  splashWindow = new BrowserWindow({ width: 430, height: 280, frame: false, transparent: true, alwaysOnTop: true, resizable: false, show: false });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.once("ready-to-show", () => splashWindow?.show());
}

function createMenu() {
  const template = [
    { label: "Arquivo", submenu: [
      { label: "Importar materiais…", accelerator: "CmdOrCtrl+O", click: async () => { const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], filters: [{ name: "Materiais", extensions: [...ALLOWED_EXTENSIONS].map((extension) => extension.slice(1)) }] }); if (!result.canceled) queueFiles(result.filePaths); } },
      { type: "separator" },
      { role: "quit", label: "Sair" },
    ] },
    { label: "Editar", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "Exibir", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
    { label: "Estudo", submenu: [
      { label: "Dashboard", accelerator: "CmdOrCtrl+1", click: () => mainWindow?.loadURL(`${app.isPackaged ? `http://127.0.0.1:${SERVER_PORT}` : DEV_URL}/`) },
      { label: "Biblioteca", accelerator: "CmdOrCtrl+2", click: () => mainWindow?.loadURL(`${app.isPackaged ? `http://127.0.0.1:${SERVER_PORT}` : DEV_URL}/biblioteca`) },
      { label: "Workspace", accelerator: "CmdOrCtrl+3", click: () => mainWindow?.loadURL(`${app.isPackaged ? `http://127.0.0.1:${SERVER_PORT}` : DEV_URL}/estudo`) },
    ] },
    { label: "Ajuda", submenu: [{ label: "Documentação", click: () => shell.openExternal("https://github.com/") }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 20, height: 20 }));
  tray.setToolTip("StudyAI");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir StudyAI", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: "Importar material", click: () => mainWindow?.loadURL(`${app.isPackaged ? `http://127.0.0.1:${SERVER_PORT}` : DEV_URL}/importar`) },
    { type: "separator" },
    { label: "Sair", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("double-click", () => mainWindow?.show());
}

async function createWindow() {
  createSplash();
  const url = app.isPackaged ? await startProductionServer() : DEV_URL;
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 620, show: false,
    title: "StudyAI", icon: iconPath(), backgroundColor: "#fafbf9",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => { if (target.startsWith("http")) void shell.openExternal(target); return { action: "deny" }; });
  mainWindow.once("ready-to-show", () => { splashWindow?.close(); mainWindow?.show(); if (pendingFiles.length) queueFiles([]); });
  await mainWindow.loadURL(url);
  mainWindow.on("close", (event) => { if (!quitting && minimizeToTray) { event.preventDefault(); mainWindow.hide(); } });
  createMenu();
  createTray();
  if (app.isPackaged) setTimeout(() => void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined), 8_000);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_event, argv) => { mainWindow?.show(); queueFiles(materialPaths(argv)); });
  app.on("open-file", (event, filePath) => { event.preventDefault(); queueFiles([filePath]); });
  app.whenReady().then(() => { app.setAsDefaultProtocolClient("studyai"); pendingFiles = materialPaths(process.argv); return createWindow(); }).catch((error) => dialog.showErrorBox("StudyAI não iniciou", error instanceof Error ? error.message : String(error)));
}

app.on("before-quit", () => { quitting = true; serverProcess?.kill(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); else mainWindow?.show(); });

ipcMain.handle("app:get-version", () => app.getVersion());
ipcMain.handle("app:get-launch-at-startup", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("app:set-launch-at-startup", (_event, value) => { app.setLoginItemSettings({ openAtLogin: value, openAsHidden: true }); return app.getLoginItemSettings().openAtLogin; });
ipcMain.handle("app:set-minimize-to-tray", (_event, value) => { minimizeToTray = value; });
ipcMain.handle("dialog:select-folder", async () => { const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] }); return result.canceled ? null : result.filePaths[0]; });
ipcMain.handle("file:read", async (_event, filePath) => { const stat = await fs.stat(filePath); return { data: await fs.readFile(filePath), name: path.basename(filePath), lastModified: stat.mtimeMs }; });
ipcMain.handle("notification:show", (_event, { title, body }) => { if (Notification.isSupported()) new Notification({ title, body, icon: iconPath() }).show(); });
ipcMain.handle("update:check", async () => { if (!app.isPackaged) return { status: "development", version: app.getVersion() }; try { const result = await autoUpdater.checkForUpdates(); return { status: result?.updateInfo?.version !== app.getVersion() ? "available" : "current", version: result?.updateInfo?.version }; } catch (error) { return { status: "error", version: app.getVersion(), message: error instanceof Error ? error.message : String(error) }; } });

for (const status of ["checking-for-update", "update-available", "update-not-available", "download-progress", "update-downloaded", "error"]) {
  autoUpdater.on(status, (value) => mainWindow?.webContents.send("update:status", { status, version: value?.version, message: value instanceof Error ? value.message : undefined }));
}
