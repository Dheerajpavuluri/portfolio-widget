import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { registerLotHandlers } from './ipc.js';
import { LotStore } from './lotStore.js';

// Set by scripts/dev.mjs. When it is missing we load the built files from disk.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

function isTrustedSender(url: string): boolean {
  return devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://');
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 420,
    height: 660,
    minWidth: 360,
    minHeight: 420,
    title: 'Portfolio',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      // These are Electron's defaults; they are spelled out so the security
      // model is visible here. The page gets no Node.js, runs in a sandbox,
      // and only sees what the preload script exposes.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The widget never needs to leave its own page or open new windows.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../../dist/renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  // userData is the per-user app folder, e.g. ~/Library/Application Support/portfolio-widget
  // on macOS or %APPDATA%\portfolio-widget on Windows. Nothing is stored in the project folder.
  const store = new LotStore(join(app.getPath('userData'), 'portfolio.json'));
  await store.load();
  registerLotHandlers(store, isTrustedSender);
  createWindow();

  // macOS keeps apps running with no windows; clicking the dock icon reopens one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
