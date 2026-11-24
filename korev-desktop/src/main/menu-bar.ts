import type { MenuItemConstructorOptions } from 'electron';

export interface MenuBarOptions {
  running: number;
  open(): void;
  quit(): void;
}

const SEPARATOR: MenuItemConstructorOptions = { type: 'separator' };

export function menuBarTitle(running: number): string {
  return running ? String(running) : '';
}

function workingLabel(running: number): string {
  if (!running) return 'No agents working';
  return `${running} agent${running === 1 ? '' : 's'} working`;
}

export function menuBarTemplate(
  options: MenuBarOptions,
): MenuItemConstructorOptions[] {
  return [
    { label: workingLabel(options.running), enabled: false },
    SEPARATOR,
    { label: 'Open Korev', click: options.open },
    { label: 'Quit Korev', click: options.quit },
  ];
}
