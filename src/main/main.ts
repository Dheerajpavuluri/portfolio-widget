import { app, BrowserWindow, Notification } from 'electron';
import { join } from 'node:path';
import { BENCHMARKS } from '../shared/summary.js';
import type { IpcEvent } from '../shared/types.js';
import { findApiKey } from './apiKey.js';
import { createFinnhubClient } from './finnhub.js';
import { registerIpcHandlers } from './ipc.js';
import { AlertService } from './alertService.js';
import { PortfolioStore } from './store.js';
import { QuoteService } from './quoteService.js';

// Set by scripts/dev.mjs. When it is missing we load the built files from disk.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function isTrustedSender(url: string): boolean {
  return devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://');
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 440,
    height: 720,
    minWidth: 400,
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
  return window;
}

async function start(): Promise<void> {
  // userData is the per-user app folder, e.g. ~/Library/Application Support/portfolio-widget
  // on macOS or %APPDATA%\portfolio-widget on Windows. Nothing is stored in the project folder.
  const userData = app.getPath('userData');
  const store = new PortfolioStore(join(userData, 'portfolio.json'));
  await store.load();

  // The key is read here and stays in the main process. The project folder's
  // .env is checked first, which is where it lives while developing.
  const apiKey = findApiKey([join(app.getAppPath(), '.env'), join(userData, '.env')]);
  const finnhub = apiKey ? createFinnhubClient(apiKey) : null;

  const alerts = new AlertService({
    store,
    events: finnhub,
    memoryFile: join(userData, 'alert-memory.json'),
    notify: (notice) => {
      if (Notification.isSupported()) new Notification({ title: notice.title, body: notice.body }).show();
    },
  });
  await alerts.load();

  const quotes = new QuoteService({
    source: finnhub,
    // Held tickers plus the market benchmarks shown in the strip.
    getTickers: () => [...new Set([...store.list().map((lot) => lot.ticker), ...BENCHMARKS.map((b) => b.ticker)])],
    publish: (snapshot) => {
      const channel: IpcEvent = 'quotes:updated';
      mainWindow?.webContents.send(channel, snapshot);
      void alerts.onQuotes(snapshot);
    },
  });

  registerIpcHandlers({
    store,
    quotes,
    isTrustedSender,
    onAlertsChanged: () => {
      void alerts.onQuotes(quotes.current());
      void alerts.checkEvents();
    },
  });
  mainWindow = createWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  quotes.start();
  alerts.start();
  app.on('before-quit', () => {
    quotes.stop();
    alerts.stop();
  });
}

// Two copies of the app would both write to the same data file, so only one
// may run. Starting it again brings the open window to the front instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(start);

  // Closing the widget quits it on every platform, including macOS, where apps
  // normally keep running in the background with no windows.
  app.on('window-all-closed', () => app.quit());
}
