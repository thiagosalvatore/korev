import { shell, type MenuItemConstructorOptions } from 'electron';
import { CHANGELOG_URL } from '../shared/links';
import type { AppCommand } from '../shared/model';

export interface AppMenuOptions {
  appName: string;
  isDevelopment: boolean;
  send(command: AppCommand): void;
}

const SEPARATOR: MenuItemConstructorOptions = { type: 'separator' };

type CommandEntry = [label: string, accelerator: string, command: AppCommand];

function items(
  entries: (CommandEntry | null)[],
  send: (command: AppCommand) => void,
): MenuItemConstructorOptions[] {
  return entries.map((entry) =>
    entry
      ? { label: entry[0], accelerator: entry[1], click: () => send(entry[2]) }
      : SEPARATOR,
  );
}

function appSubmenu(options: AppMenuOptions): MenuItemConstructorOptions[] {
  return [
    { role: 'about' },
    { label: 'Check for Updates…', click: () => options.send('check-updates') },
    SEPARATOR,
    ...items([['Settings…', 'CmdOrCtrl+,', 'show-settings']], options.send),
    SEPARATOR,
    { role: 'services' },
    SEPARATOR,
    { role: 'hide' },
    { role: 'hideOthers' },
    { role: 'unhide' },
    SEPARATOR,
    { role: 'quit' },
  ];
}

const FILE_ENTRIES: (CommandEntry | null)[] = [
  ['New Workspace', 'CmdOrCtrl+N', 'new-workspace'],
  ['New Chat', 'CmdOrCtrl+T', 'new-chat'],
  ['Close Tab', 'CmdOrCtrl+W', 'close-tab'],
  null,
  ['Archive Workspace', 'CmdOrCtrl+Shift+A', 'archive-workspace'],
  ['Open In…', 'CmdOrCtrl+O', 'open-in'],
];

const VIEW_ENTRIES: (CommandEntry | null)[] = [
  ['Command Palette', 'CmdOrCtrl+K', 'show-palette'],
  ['Quick Open File', 'CmdOrCtrl+P', 'quick-open'],
  ['Search in Files', 'CmdOrCtrl+Shift+F', 'search-files'],
  null,
  ['Toggle Left Sidebar', 'CmdOrCtrl+B', 'toggle-sidebar'],
  ['Toggle Right Sidebar', 'CmdOrCtrl+Alt+B', 'toggle-panel'],
  ['Toggle Terminal', 'CmdOrCtrl+J', 'toggle-terminal'],
  ['Toggle Zen Mode', 'CmdOrCtrl+.', 'toggle-zen'],
  ['Toggle Grid View', 'CmdOrCtrl+G', 'toggle-grid'],
  ['Toggle Theme', 'CmdOrCtrl+Alt+T', 'toggle-theme'],
  null,
  ['Open Diff View', 'CmdOrCtrl+Shift+D', 'open-diff'],
];

const WORKSPACE_ENTRIES: (CommandEntry | null)[] = [
  ['Previous Workspace', 'CmdOrCtrl+Alt+Up', 'previous-workspace'],
  ['Next Workspace', 'CmdOrCtrl+Alt+Down', 'next-workspace'],
  null,
  ...Array.from(
    { length: 9 },
    (_, index): CommandEntry => [
      `Workspace ${index + 1}`,
      `CmdOrCtrl+${index + 1}`,
      `select-workspace-${index + 1}` as AppCommand,
    ],
  ),
  null,
  ['Start or Stop Run Script', 'CmdOrCtrl+R', 'run-script'],
  ['Create PR', 'CmdOrCtrl+Shift+P', 'create-pr'],
  ['Merge PR', 'CmdOrCtrl+Shift+M', 'merge-pr'],
  ['Fix Errors', 'CmdOrCtrl+Shift+X', 'fix-errors'],
];

const CHAT_ENTRIES: (CommandEntry | null)[] = [
  ['Focus Chat Input', 'CmdOrCtrl+L', 'focus-composer'],
  ['Cancel Agent', 'CmdOrCtrl+Shift+Backspace', 'cancel-agent'],
];

function developmentItems(
  isDevelopment: boolean,
): MenuItemConstructorOptions[] {
  if (!isDevelopment) return [];
  return [SEPARATOR, { role: 'forceReload' }, { role: 'toggleDevTools' }];
}

export function appMenuTemplate(
  options: AppMenuOptions,
): MenuItemConstructorOptions[] {
  const { send } = options;
  return [
    { label: options.appName, submenu: appSubmenu(options) },
    { label: 'File', submenu: items(FILE_ENTRIES, send) },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...items(VIEW_ENTRIES, send),
        SEPARATOR,
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        ...developmentItems(options.isDevelopment),
      ],
    },
    { label: 'Workspace', submenu: items(WORKSPACE_ENTRIES, send) },
    { label: 'Chat', submenu: items(CHAT_ENTRIES, send) },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Korev Release Notes',
          click: () => void shell.openExternal(CHANGELOG_URL),
        },
      ],
    },
  ];
}
