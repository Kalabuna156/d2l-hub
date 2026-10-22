import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Packaged: resources/app. From source: the repository root.
const appRoot = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.resolve(here, '..');

app.setName('D2L Hub');

const SMOKE = process.env.D2L_HUB_SMOKE === '1';

// A smoke run gets its own profile so it can test a build while the normal app
// is open, and never reads or writes the user's real data.
if (SMOKE) {
  app.setPath('userData', path.join(os.tmpdir(), `d2l-hub-smoke-${process.pid}`));
}

/** Headless check used by the build to prove the packaged shell serves and renders. */
async function verify(appUrl) {
  const health = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
  const state = await fetch(`${appUrl}/api/state`, { signal: AbortSignal.timeout(10000) });
  const body = await state.json();
  console.log(`SMOKE health=${health.status} state=${state.status} chrome=${body.chromeAvailable}`);
  return health.status === 200 && state.status === 200;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(appUrl, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('The local D2L Hub server did not start in time.');
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

let mainWindow = null;
let updateTimer = null;

/** A running copy checks GitHub Releases this often. */
const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Auto-update from GitHub Releases. electron-builder bakes the feed into
 * resources/app-update.yml, downloads happen in the background, and the student
 * is only interrupted once the new version is ready to install.
 */
async function watchForUpdates() {
  if (!app.isPackaged || SMOKE) return;

  let autoUpdater;
  try {
    const updater = await import('electron-updater');
    autoUpdater = updater.autoUpdater ?? updater.default?.autoUpdater;
  } catch (error) {
    console.error('Updater unavailable:', error);
    return;
  }
  if (!autoUpdater) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Offline laptops, a missing release or a private feed must never block the app.
  autoUpdater.on('error', (error) => {
    console.error('Update check failed:', error?.message ?? error);
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`Update ${info.version} is downloading in the background`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: `D2L Hub ${info.version} is ready to install.`,
      detail:
        'Restart to finish updating. Your session, settings and saved files stay on this computer.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('Update check failed:', error?.message ?? error);
    });
  };

  // Let the window finish loading before the first check.
  setTimeout(check, 5000);
  updateTimer = setInterval(check, UPDATE_INTERVAL_MS);
  updateTimer.unref?.();
}

async function boot() {
  const port = await freePort();
  const appUrl = `http://127.0.0.1:${port}`;

  process.env.PORT = String(port);
  process.env.D2L_HUB_DATA_DIR = path.join(app.getPath('userData'), 'data');
  process.env.D2L_HUB_DIST = path.join(appRoot, 'dist');

  await import(pathToFileURL(path.join(appRoot, 'dist-server', 'index.mjs')).href);
  await waitForServer(appUrl);

  if (!SMOKE) buildMenu();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#07080d',
    title: 'D2L Hub',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!SMOKE) mainWindow?.show();
  });

  // Anything that is not the local app opens in the user's normal browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(appUrl)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(appUrl);

  if (!SMOKE) void watchForUpdates();

  if (SMOKE) {
    try {
      const ok = await verify(appUrl);
      const title = await mainWindow.webContents.executeJavaScript('document.title');
      const rendered = await mainWindow.webContents.executeJavaScript(
        'Boolean(document.querySelector("main") && document.querySelector("#root"))',
      );
      console.log(`SMOKE render=${rendered} title=${title}`);
      app.exit(ok && rendered ? 0 : 1);
    } catch (error) {
      console.error('SMOKE failed:', error);
      app.exit(1);
    }
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot).catch((error) => {
    console.error(error);
    if (!SMOKE) {
      dialog.showErrorBox(
        'D2L Hub could not start',
        error instanceof Error ? error.message : String(error),
      );
    }
    app.exit(1);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
