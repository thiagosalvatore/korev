import type { MenuItemConstructorOptions } from 'electron';
import type { AppCommand } from '../shared/ipc-contract';

export interface AppMenuOptions {
  appName: string;
  isDevelopment: boolean;
  send(command: AppCommand): void;
}

const SEPARATOR: MenuItemConstructorOptions = { type: 'separator' };

function commandItem(
  label: string,
  accelerator: string,
  command: AppCommand,
  send: (command: AppCommand) => void,
): MenuItemConstructorOptions {
  return { label, accelerator, click: () => send(command) };
}

function appSubmenu(options: AppMenuOptions): MenuItemConstructorOptions[] {
  return [
    { role: 'about' },
    SEPARATOR,
    commandItem('Settings…', 'CmdOrCtrl+,', 'show-settings', options.send),
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

function developmentItems(
  isDevelopment: boolean,
): MenuItemConstructorOptions[] {
  if (!isDevelopment) return [];
  return [SEPARATOR, { role: 'forceReload' }, { role: 'toggleDevTools' }];
}

function viewSubmenu(options: AppMenuOptions): MenuItemConstructorOptions[] {
  const { send } = options;
  return [
    commandItem('Review Requests', 'CmdOrCtrl+1', 'show-review', send),
    commandItem('Open', 'CmdOrCtrl+2', 'show-open', send),
    commandItem('Ready to Merge', 'CmdOrCtrl+3', 'show-ready', send),
    commandItem('Stale', 'CmdOrCtrl+4', 'show-stale', send),
    SEPARATOR,
    commandItem('Refresh', 'CmdOrCtrl+R', 'refresh', send),
    commandItem('Keyboard Shortcuts', 'CmdOrCtrl+/', 'show-shortcuts', send),
    ...developmentItems(options.isDevelopment),
  ];
}

export function appMenuTemplate(
  options: AppMenuOptions,
): MenuItemConstructorOptions[] {
  return [
    { label: options.appName, submenu: appSubmenu(options) },
    { role: 'editMenu' },
    { label: 'View', submenu: viewSubmenu(options) },
    { role: 'windowMenu' },
  ];
}
