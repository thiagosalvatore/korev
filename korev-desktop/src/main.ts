import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  powerMonitor,
  safeStorage,
  screen,
  shell,
  type WebContents,
} from 'electron';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import started from 'electron-squirrel-startup';
import { IpcChannel, type AppCommand } from './shared/ipc-contract';
import type { WindowBounds } from './shared/settings';
import { appMenuTemplate } from './main/app-menu';
import { isAppUrl, type AppOrigin } from './main/app-origin';
import { nodeFileSystem } from './main/file-system';
import { registerIpcHandlers } from './main/ipc';
import { githubEndpoints } from './main/github/config';
import { runProcess } from './main/agents/command-runner';
import { createKorev, type Korev, type TaskNote } from './main/korev';
import { createSafeStorageCipher } from './main/safe-storage-cipher';
import { restorableBounds } from './main/window-bounds';

const DEFAULT_WINDOW_SIZE = { width: 1280, height: 832 };
const MIN_WINDOW_SIZE = { width: 760, height: 520 };
const TRAFFIC_LIGHT_POSITION = { x: 18, y: 17 };
const DEV_ICON_PATH = '../../assets/icon.png';

const appOrigin: AppOrigin = {
  devServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
  rendererDirectory: path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}`,
  ),
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

function broadcast(channel: string, payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

function sendToFocusedWindow(command: AppCommand) {
  BrowserWindow.getFocusedWindow()?.webContents.send(
    IpcChannel.AppCommand,
    command,
  );
}

function installAppMenu() {
  const template = appMenuTemplate({
    appName: app.name,
    isDevelopment: !app.isPackaged,
    send: sendToFocusedWindow,
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showTaskNote(note: TaskNote) {
  if (BrowserWindow.getFocusedWindow() || !Notification.isSupported()) return;
  const notification = new Notification({ title: note.title, body: note.body });
  notification.on('click', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    window.show();
    window.focus();
    window.webContents.send(IpcChannel.AppFocusPr, note.ref);
  });
  notification.show();
}

function createKorevApp(): Korev {
  return createKorev({
    userDataPath: app.getPath('userData'),
    tempPath: app.getPath('temp'),
    env: process.env,
    runCommand: runProcess,
    fs: nodeFileSystem,
    cipher: createSafeStorageCipher(safeStorage, process.platform),
    fetch: (input, init) => fetch(input, init),
    github: githubEndpoints(app.isPackaged, process.env),
    sleep: (milliseconds, signal) => delay(milliseconds, undefined, { signal }),
    openExternal: (url) => shell.openExternal(url),
    openPath: async (filePath) => {
      const problem = await shell.openPath(filePath);
      if (problem) console.warn(problem);
    },
    prefersDark: () => nativeTheme.shouldUseDarkColors,
    notify: showTaskNote,
    applyTheme: (theme) => {
      nativeTheme.themeSource = theme;
    },
    broadcast,
    warn: (message) => console.warn(message),
  });
}

function hardenWebContents(contents: WebContents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, appOrigin)) event.preventDefault();
  });
}

function keepInboxFresh(korev: Korev) {
  app.on('browser-window-focus', () => void korev.inbox.trigger('focus'));
  powerMonitor.on('suspend', () => korev.inbox.suspend());
  powerMonitor.on('resume', () => void korev.inbox.resume());
  app.on('before-quit', () => korev.inbox.stop());
}

function rememberBounds(window: BrowserWindow, korev: Korev) {
  window.on('close', () => {
    const windowBounds: WindowBounds = window.getNormalBounds();
    void korev.settings.update({ windowBounds });
  });
}

const createWindow = (korev: Korev) => {
  const savedBounds = restorableBounds(
    korev.settings.current().windowBounds,
    screen.getAllDisplays().map((display) => display.workArea),
  );
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    ...DEFAULT_WINDOW_SIZE,
    ...savedBounds,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: TRAFFIC_LIGHT_POSITION,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  rememberBounds(mainWindow, korev);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

app.on('web-contents-created', (_event, contents) =>
  hardenWebContents(contents),
);

function showDevDockIcon() {
  if (app.isPackaged) return;
  app.dock?.setIcon(path.join(__dirname, DEV_ICON_PATH));
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  showDevDockIcon();
  installAppMenu();
  const korev = createKorevApp();
  registerIpcHandlers(ipcMain, korev.handlers, (url) =>
    isAppUrl(url, appOrigin),
  );
  await korev.start();
  keepInboxFresh(korev);
  createWindow(korev);

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(korev);
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
