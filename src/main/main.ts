import { app, BrowserWindow, Notification, screen } from 'electron';
import { join } from 'node:path';
import { BENCHMARKS } from '../shared/summary.js';
import type { IpcEvent } from '../shared/types.js';
import { AlertService } from './alertService.js';
import { chooseModel, Copilot } from './copilot.js';
import { portfolioFacts } from './copilotContext.js';
import { buildDigest } from './digest.js';
import { findSetting } from './envSettings.js';
import { createFinnhubClient } from './finnhub.js';
import { registerIpcHandlers } from './ipc.js';
import { QuoteService } from './quoteService.js';
import { PortfolioStore } from './store.js';
import { loadWindowState, saveWindowState, saveWindowStateNow, visibleBounds, type WindowState } from './windowState.js';

// Set by scripts/dev.mjs. When it is missing we load the built files from disk.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

// One data folder for both `npm run dev` and the packaged app. By default
// Electron names it after the app, and the packaged app is called "Portfolio
// Widget", which would start it with an empty, separate folder.
app.setPath('userData', join(app.getPath('appData'), 'portfolio-widget'));

let mainWindow: BrowserWindow | null = null;

function isTrustedSender(url: string): boolean {
  return devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://');
}

function createWindow(state: WindowState): BrowserWindow {
  const bounds = visibleBounds(
    state.bounds,
    screen.getAllDisplays().map((display) => display.workArea),
  );
  const window = new BrowserWindow({
    width: 440,
    height: 720,
    ...bounds,
    alwaysOnTop: state.alwaysOnTop,
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

  // Keys are read here and stay in the main process. While developing they
  // live in the project folder's .env; the packaged app cannot see the project
  // folder, so it reads the .env in the data folder.
  const envFiles = app.isPackaged ? [join(userData, '.env')] : [join(app.getAppPath(), '.env'), join(userData, '.env')];
  const apiKey = findSetting('FINNHUB_API_KEY', envFiles);
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

  const facts = () => portfolioFacts(store.list(), quotes.current());
  const copilot = new Copilot(
    chooseModel({
      anthropicKey: findSetting('ANTHROPIC_API_KEY', envFiles),
      anthropicModel: findSetting('ANTHROPIC_MODEL', envFiles),
      ollamaModel: findSetting('OLLAMA_MODEL', envFiles),
    }),
    facts,
  );

  const windowFile = join(userData, 'window.json');
  const windowState = await loadWindowState(windowFile);

  registerIpcHandlers({
    store,
    quotes,
    copilot,
    digest: () => buildDigest(facts(), alerts.upcomingEarnings(), new Date()),
    isTrustedSender,
    onAlertsChanged: () => {
      void alerts.onQuotes(quotes.current());
      void alerts.checkEvents();
    },
    appInfo: () => ({ keyFile: envFiles[0], alwaysOnTop: windowState.alwaysOnTop }),
    setAlwaysOnTop: (on) => {
      windowState.alwaysOnTop = on;
      mainWindow?.setAlwaysOnTop(on);
      void saveWindowState(windowFile, windowState);
      return on;
    },
  });

  mainWindow = createWindow(windowState);
  // Size and position are saved when the window closes, so it reopens where I left it.
  mainWindow.on('close', () => {
    if (!mainWindow) return;
    windowState.bounds = mainWindow.getNormalBounds();
    saveWindowStateNow(windowFile, windowState);
  });
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
