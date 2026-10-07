import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  powerSaveBlocker,
  screen,
  shell,
  type WebContents,
} from 'electron';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { spawn as spawnPty } from 'node-pty';
import { eventChannel, type KorevEvents } from './shared/api';
import type { AppCommand, WindowBounds } from './shared/model';
import { appMenuTemplate } from './main/app-menu';
import { isAppUrl, isWebUrl, type AppOrigin } from './main/app-origin';
import { runProcess } from './main/command-runner';
import type { Notice } from './main/context';
import { nodeFileSystem } from './main/file-system';
import { registerIpcHandlers } from './main/ipc';
import { createKorev, type Korev } from './main/korev';
import { childEnv, resolveLoginPath } from './main/login-path';
import { restorableBounds } from './main/window-bounds';

const DEFAULT_WINDOW_SIZE = { width: 1440, height: 900 };
const MIN_WINDOW_SIZE = { width: 960, height: 600 };
const TRAFFIC_LIGHT_POSITION = { x: 16, y: 16 };
const DEV_ICON_PATH = '../../assets/icon.png';
const COMMAND_EVENT = 'command';
const FINISHED_SOUND = '/System/Library/Sounds/Glass.aiff';

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

function emit<E extends keyof KorevEvents>(event: E, payload: KorevEvents[E]) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(eventChannel(event), payload);
  }
}

function sendToFocusedWindow(command: AppCommand) {
  BrowserWindow.getFocusedWindow()?.webContents.send(
    eventChannel(COMMAND_EVENT),
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

function showNotice(korev: () => Korev | null, notice: Notice) {
  if (!korev()?.settings().notifications || !Notification.isSupported()) return;
  const notification = new Notification({
    title: notice.title,
    body: notice.body,
    silent: true,
  });
  notification.on('click', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    window.show();
    window.focus();
    window.webContents.send(
      eventChannel('focus-workspace'),
      notice.workspaceId,
    );
  });
  notification.show();
}

function playSound() {
  if (process.platform !== 'darwin') {
    shell.beep();
    return;
  }
  execFile('afplay', [FINISHED_SOUND], (error) => {
    if (error) console.warn(error.message);
  });
}

let sleepBlocker: number | null = null;

function keepAwake(on: boolean) {
  if (on && sleepBlocker === null) {
    sleepBlocker = powerSaveBlocker.start('prevent-app-suspension');
  }
  if (!on && sleepBlocker !== null) {
    powerSaveBlocker.stop(sleepBlocker);
    sleepBlocker = null;
  }
}

async function chooseDirectory(): Promise<string | null> {
  const window = BrowserWindow.getFocusedWindow();
  const options: Electron.OpenDialogOptions = {
    properties: ['openDirectory'],
    buttonLabel: 'Open project',
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

async function createKorevApp(): Promise<Korev> {
  const loginPath = await resolveLoginPath(runProcess, process.env);
  const env = childEnv(process.env, loginPath);
  let korev: Korev | null = null;
  korev = await createKorev({
    run: runProcess,
    env,
    shell: process.env.SHELL,
    home: homedir(),
    userDataPath: app.getPath('userData'),
    fs: nodeFileSystem,
    spawnPty,
    emit,
    notify: (notice) => showNotice(() => korev, notice),
    playSound,
    isWindowFocused: () => BrowserWindow.getFocusedWindow() !== null,
    setBadge: (count) => app.setBadgeCount(count),
    keepAwake,
    now: () => new Date(),
    newId: () => randomUUID(),
    chooseDirectory,
    openPath: async (target) => {
      const problem = await shell.openPath(target);
      if (problem) console.warn(problem);
    },
    openExternal: async (url) => {
      if (isWebUrl(url)) await shell.openExternal(url);
    },
    applyTheme: (theme) => {
      nativeTheme.themeSource = theme;
    },
  });
  nativeTheme.themeSource = korev.settings().theme;
  return korev;
}

const QUIT_BUTTON = 0;

function confirmQuit(korev: Korev): boolean {
  const running = korev.runningAgents();
  if (!running) return true;
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    message: `${running} agent${running === 1 ? ' is' : 's are'} still working`,
    detail: 'Quitting stops them. Their chats keep everything up to now.',
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  });
  return choice === QUIT_BUTTON;
}

const BROWSER_PARTITION = 'persist:korev-browser';
const BLANK_PAGE = 'about:blank';

function hardenBrowserTab(contents: WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void contents.loadURL(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isWebUrl(url)) event.preventDefault();
  });
}

function hardenWebContents(contents: WebContents) {
  if (contents.getType() === 'webview') {
    hardenBrowserTab(contents);
    return;
  }
  contents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, appOrigin)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    params.partition = BROWSER_PARTITION;
    if (!isWebUrl(params.src) && params.src !== BLANK_PAGE)
      event.preventDefault();
  });
}

function rememberBounds(window: BrowserWindow, korev: Korev) {
  window.on('close', () => {
    const windowBounds: WindowBounds = window.getNormalBounds();
    void korev.updateSettings({ windowBounds });
  });
}

const createWindow = (korev: Korev) => {
  const savedBounds = restorableBounds(
    korev.settings().windowBounds,
    screen.getAllDisplays().map((display) => display.workArea),
  );
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
      webviewTag: true,
    },
  });
  rememberBounds(mainWindow, korev);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

app.on('web-contents-created', (_event, contents) =>
  hardenWebContents(contents),
);

function showDevDockIcon() {
  if (app.isPackaged) return;
  app.dock?.setIcon(path.join(__dirname, DEV_ICON_PATH));
}

app.whenReady().then(async () => {
  showDevDockIcon();
  installAppMenu();
  const korev = await createKorevApp();
  registerIpcHandlers(ipcMain, { ...korev.api }, (url) =>
    isAppUrl(url, appOrigin),
  );
  let shuttingDown = false;
  app.on('before-quit', (event) => {
    if (shuttingDown) return;
    if (!confirmQuit(korev)) {
      event.preventDefault();
      return;
    }
    shuttingDown = true;
    event.preventDefault();
    void korev.shutdown().finally(() => app.quit());
  });
  createWindow(korev);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(korev);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
