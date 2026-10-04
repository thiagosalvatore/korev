import { Dialog, Kbd } from '../design-system';

interface Shortcut {
  keys: string[];
  label: string;
}

export const SHORTCUT_SHEET_KEY = '?';

const SHORTCUTS: Shortcut[] = [
  { keys: ['J', '↓'], label: 'Next pull request' },
  { keys: ['K', '↑'], label: 'Previous pull request' },
  {
    keys: ['→', '←'],
    label: 'Expand or collapse a section, approved PRs or stack layers',
  },
  { keys: ['↵'], label: 'Open details' },
  { keys: ['⌘↵'], label: 'Open on GitHub' },
  { keys: ['Esc'], label: 'Close details' },
  { keys: ['⇧M'], label: 'Merge the selected PR (My PRs)' },
  { keys: ['⇧X'], label: 'Close the selected PR (My PRs)' },
  { keys: ['⇧K'], label: 'Keep or stop keeping a stale PR (My PRs)' },
  { keys: ['.'], label: 'Show held updates' },
  { keys: ['⌘1'], label: 'Review requests' },
  { keys: ['⌘2'], label: 'My PRs' },
  { keys: ['⌘,'], label: 'Settings' },
  { keys: ['⌘R'], label: 'Refresh' },
  { keys: [SHORTCUT_SHEET_KEY], label: 'Keyboard shortcuts' },
];

export interface ShortcutSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutSheet({ open, onClose }: ShortcutSheetProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.label} className="contents">
            <dt className="flex gap-1">
              {shortcut.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dt>
            <dd className="m-0 text-sm text-fg-2">{shortcut.label}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
