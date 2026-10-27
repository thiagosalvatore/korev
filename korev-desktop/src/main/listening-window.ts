import { BrowserWindow, screen } from 'electron';
import { eventChannel } from '../shared/api';
import type { ListeningState } from '../shared/model';
import { LISTENING_HASH } from '../shared/voice';

const SIZE = { width: 320, height: 100 };
const BOTTOM_MARGIN = 24;
const FADE_MS = 300;

export interface ListeningWindowOptions {
  preload: string;
  load(window: BrowserWindow, hash: string): void;
}

function bottomCenterOfActiveDisplay(): Electron.Rectangle {
  const { workArea } = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  );
  return {
    ...SIZE,
    x: Math.round(workArea.x + (workArea.width - SIZE.width) / 2),
    y: workArea.y + workArea.height - SIZE.height - BOTTOM_MARGIN,
  };
}

function floatingWindow(preload: string): BrowserWindow {
  const window = new BrowserWindow({
    ...SIZE,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    focusable: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  window.setIgnoreMouseEvents(true);
  return window;
}

export function createListeningWindow(options: ListeningWindowOptions) {
  let window: BrowserWindow | null = null;
  let hideTimer: NodeJS.Timeout | null = null;

  function cancelHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  }

  function hideAfterFade(target: BrowserWindow) {
    hideTimer ??= setTimeout(() => {
      hideTimer = null;
      target.hide();
    }, FADE_MS);
  }

  function reveal(target: BrowserWindow) {
    cancelHide();
    if (target.isVisible()) return;
    target.setBounds(bottomCenterOfActiveDisplay());
    target.showInactive();
  }

  return {
    owns: (other: BrowserWindow) => other === window,
    open() {
      if (window) return;
      const created = floatingWindow(options.preload);
      created.on('closed', () => {
        cancelHide();
        window = null;
      });
      options.load(created, LISTENING_HASH);
      window = created;
    },
    show(state: ListeningState) {
      if (!window) return;
      if (state.phase === 'hidden') hideAfterFade(window);
      else reveal(window);
      window.webContents.send(eventChannel('listening'), state);
    },
    close() {
      window?.destroy();
    },
  };
}
