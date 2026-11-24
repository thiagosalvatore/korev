type ShortcutEvent = Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'key'>;

export function isShortcut(event: ShortcutEvent, key: string): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === key;
}
