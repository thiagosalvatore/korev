import {
  app,
  autoUpdater,
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
import { homedir, hostname } from 'node:os';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { spawn as spawnPty } from 'node-pty';
import {
  eventChannel,
  type DesktopApi,
  type KorevEvents,
  type QuitChoice,
} from './shared/api';
import type { AppCommand, Result, WindowBounds } from './shared/model';
import { appMenuTemplate } from './main/app-menu';
import { isAppUrl, isWebUrl, type AppOrigin } from './main/app-origin';
import { runProcess } from './main/command-runner';
import { errorMessage, type Notice } from './main/context';
import { nodeFileSystem } from './main/file-system';
import { registerIpcHandlers } from './main/ipc';
import { createKorev, type Korev } from './main/korev';
import { childEnv, resolveLoginPath } from './main/login-path';
import { sendPhoneNotification } from './main/phone-notifications';
import { createQuitGate, type QuitGate } from './main/quit-gate';
import { createDictation, WHISPER_MODELS } from './main/dictation';
import { createRemoteAccess } from './main/remote-access';
import {
  canReplaceBundle,
  fetchRelease,
  updateFeedUrl,
  type Release,
} from './main/updates';
import { tailnetStarter } from './main/tailnet';
import { loadWhisper } from './main/whisper';
import { restorableBounds } from './main/window-bounds';

const DEFAULT_WINDOW_SIZE = { width: 1440, height: 900 };
const MIN_WINDOW_SIZE = { width: 960, height: 600 };
const TRAFFIC_LIGHT_POSITION = { x: 16, y: 16 };
const DEV_ICON_PATH = '../../assets/icon.png';
const DEV_USER_DATA_DIR = 'Korev Dev';
const COMMAND_EVENT = 'command';
const FINISHED_SOUND = '/System/Library/Sounds/Glass.aiff';
const REMOTE_TOKEN_FILE = 'remote-token';
const TAILNET_STATE_DIR = 'tailscale';
const TAILNET_BINARY = 'korev-tailnet';
const TAILNET_BIN_DIR = 'tailnet/bin';
const UNPACKED_ASAR_DIR = 'app.asar.unpacked';
const TAILNET_HOSTNAME_PREFIX = 'korev-';
const MODELS_DIR = 'models';
const UPDATE_CHECK_INTERVAL_MS = 60 * 60_000;
const BUNDLE_FROM_EXE = '../../..';

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

function useSeparateDevData() {
  if (app.isPackaged || app.commandLine.hasSwitch('user-data-dir')) return;
  app.setPath('userData', path.join(app.getPath('appData'), DEV_USER_DATA_DIR));
}

useSeparateDevData();

let korevApp: Korev | null = null;
let quitGate: QuitGate | null = null;

function tailnetBinary(): string {
  const appDir = app.isPackaged
    ? path.join(process.resourcesPath, UNPACKED_ASAR_DIR)
    : app.getAppPath();
  return path.join(
    appDir,
    TAILNET_BIN_DIR,
    `${process.platform}-${process.arch}`,
    TAILNET_BINARY,
  );
}

const remote = createRemoteAccess({
  tokenPath: path.join(app.getPath('userData'), REMOTE_TOKEN_FILE),
  api: () => korevApp?.api ?? {},
  startTailnet: tailnetStarter({
    binary: tailnetBinary(),
    stateDir: path.join(app.getPath('userData'), TAILNET_STATE_DIR),
    hostname: TAILNET_HOSTNAME_PREFIX + hostname().split('.')[0],
  }),
  onChange: () => korevApp?.emitState(),
});

const dictation = createDictation({
  modelsDir: path.join(app.getPath('userData'), MODELS_DIR),
  models: WHISPER_MODELS,
  download: fetch,
  loadModel: loadWhisper,
  onChange: () => korevApp?.emitState(),
});

function emit<E extends keyof KorevEvents>(event: E, payload: KorevEvents[E]) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(eventChannel(event), payload);
  }
  remote.broadcast(event, payload);
  if (event === 'state') quitGate?.agentsChanged();
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

function downloadUpdate(): Promise<Result> {
  return new Promise((resolve) => {
    const settle = (result: Result) => {
      autoUpdater.off('update-downloaded', onDownloaded);
      autoUpdater.off('update-not-available', onNotAvailable);
      autoUpdater.off('error', onError);
      resolve(result);
    };
    const onDownloaded = () => settle({ ok: true, value: undefined });
    const onNotAvailable = () =>
      settle({ ok: false, message: 'No update is available' });
    const onError = (error: Error) =>
      settle({
        ok: false,
        message: `Could not install the update: ${errorMessage(error)}`,
      });
    autoUpdater.once('update-downloaded', onDownloaded);
    autoUpdater.once('update-not-available', onNotAvailable);
    autoUpdater.once('error', onError);
    autoUpdater.setFeedURL({
      url: updateFeedUrl(process.arch),
      serverType: 'json',
    });
    autoUpdater.checkForUpdates();
  });
}

async function installUpdate(release: Release): Promise<Result> {
  const bundle = path.resolve(app.getPath('exe'), BUNDLE_FROM_EXE);
  if (!(await canReplaceBundle(bundle))) {
    await shell.openExternal(release.url);
    return { ok: true, value: undefined };
  }
  const downloaded = await downloadUpdate();
  if (downloaded.ok) autoUpdater.quitAndInstall();
  return downloaded;
}

function watchForUpdates(korev: Korev) {
  if (!app.isPackaged) return;
  void korev.showWhatsNew();
  void korev.api.checkForUpdates();
  setInterval(() => void korev.api.checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
}

async function createKorevApp(): Promise<Korev> {
  const loginPath = await resolveLoginPath(runProcess, process.env);
  const env = childEnv(process.env, loginPath);
  const korev = await createKorev({
    run: runProcess,
    env,
    shell: process.env.SHELL,
    home: homedir(),
    userDataPath: app.getPath('userData'),
    fs: nodeFileSystem,
    spawnPty,
    emit,
    notify: (notice) => {
      showNotice(() => korevApp, notice);
      void sendPhoneNotification(
        korevApp?.settings().phoneNotificationsUrl ?? '',
        notice,
      );
    },
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
    remote,
    dictation,
    appVersion: app.getVersion(),
    fetchRelease,
    installUpdate,
  });
  korevApp = korev;
  nativeTheme.themeSource = korev.settings().theme;
  return korev;
}

const QUIT_BUTTONS: { label: string; choice: QuitChoice }[] = [
  { label: 'Quit when done', choice: 'wait' },
  { label: 'Quit now', choice: 'quit' },
  { label: 'Cancel', choice: 'cancel' },
];
const WAIT_BUTTON = QUIT_BUTTONS.findIndex(({ choice }) => choice === 'wait');
const CANCEL_BUTTON = QUIT_BUTTONS.findIndex(
  ({ choice }) => choice === 'cancel',
);

function askQuitNatively(running: number): QuitChoice {
  const index = dialog.showMessageBoxSync({
    type: 'warning',
    message: `${running} agent${running === 1 ? ' is' : 's are'} still working`,
    detail:
      'Quit now to stop them. Their chats keep everything up to now.\n\nOr let Korev quit by itself once they finish.',
    buttons: QUIT_BUTTONS.map(({ label }) => label),
    defaultId: WAIT_BUTTON,
    cancelId: CANCEL_BUTTON,
  });
  return QUIT_BUTTONS[index]?.choice ?? 'cancel';
}

function askQuit(running: number, gate: QuitGate) {
  const [window] = BrowserWindow.getAllWindows();
  if (!window) {
    setImmediate(() => gate.choose(askQuitNatively(running)));
    return;
  }
  window.show();
  window.focus();
  const command: AppCommand = 'confirm-quit';
  window.webContents.send(eventChannel(COMMAND_EVENT), command);
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
  const gate = createQuitGate({
    runningAgents: korev.runningAgents,
    ask: (running) => askQuit(running, gate),
    quit: () => app.quit(),
  });
  quitGate = gate;
  const desktopApi: DesktopApi = { chooseQuit: gate.choose };
  registerIpcHandlers(ipcMain, { ...korev.api, ...desktopApi }, (url) =>
    isAppUrl(url, appOrigin),
  );
  let shuttingDown = false;
  app.on('before-quit', (event) => {
    if (shuttingDown) return;
    if (!gate.shouldQuit()) {
      event.preventDefault();
      return;
    }
    shuttingDown = true;
    event.preventDefault();
    void Promise.all([
      korev.shutdown(),
      remote.close(),
      dictation.close(),
    ]).finally(() => app.quit());
  });
  createWindow(korev);
  void remote.apply(korev.settings());
  watchForUpdates(korev);

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
