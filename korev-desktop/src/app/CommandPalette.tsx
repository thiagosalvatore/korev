import { useId, useState, type KeyboardEvent } from 'react';
import { Dialog, Kbd, cn } from '../design-system';

export interface PaletteItem {
  id: string;
  label: string;
  detail?: string;
  hint?: string;
  run: () => void;
}

const MAX_MATCHES = 50;

function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function matchingItems(items: PaletteItem[], query: string): PaletteItem[] {
  const words = searchWords(query);
  return items
    .filter((item) => {
      const text = `${item.label} ${item.detail ?? ''}`.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .slice(0, MAX_MATCHES);
}

function wrapIndex(index: number, length: number): number {
  return (index + length) % length;
}

interface PaletteSearchProps {
  items: PaletteItem[];
  onPick: (item: PaletteItem) => void;
}

function PaletteSearch({ items, onPick }: PaletteSearchProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = matchingItems(items, query);
  const active = matches[Math.min(activeIndex, matches.length - 1)];
  const optionId = (item: PaletteItem) => `${listId}-${item.id}`;

  const moveBy = (step: number) => {
    if (matches.length === 0) return;
    setActiveIndex((index) => wrapIndex(index + step, matches.length));
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in steps) {
      event.preventDefault();
      moveBy(steps[event.key]);
      return;
    }
    if (event.key !== 'Enter' || !active) return;
    event.preventDefault();
    onPick(active);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        role="combobox"
        aria-label="Go to"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={active ? optionId(active) : undefined}
        placeholder="Search PRs by number, title or repo, or a command"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKey}
        className="h-9 w-full rounded-md border border-border-2 bg-inset px-3 type-ui text-fg-1 outline-none placeholder:text-fg-3 focus-visible:shadow-focus"
      />
      <div
        id={listId}
        role="listbox"
        aria-label="Matches"
        className="max-h-[50vh] overflow-auto"
      >
        {matches.length === 0 ? (
          <p className="m-0 px-2 py-3 type-ui text-fg-3">No matches.</p>
        ) : null}
        {matches.map((item) => (
          <div
            key={item.id}
            id={optionId(item)}
            role="option"
            aria-selected={item === active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item)}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5',
              item === active ? 'bg-active' : 'hover:bg-hover',
            )}
          >
            <span className="min-w-0 flex-1 truncate type-ui text-fg-1">
              {item.label}
            </span>
            {item.detail ? (
              <span className="shrink-0 font-mono text-xs text-fg-3">
                {item.detail}
              </span>
            ) : null}
            {item.hint ? <Kbd>{item.hint}</Kbd> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface CommandPaletteProps {
  open: boolean;
  items: PaletteItem[];
  onClose: () => void;
}

export function CommandPalette({ open, items, onClose }: CommandPaletteProps) {
  const pick = (item: PaletteItem) => {
    onClose();
    item.run();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Go to" width={560}>
      <PaletteSearch items={items} onPick={pick} />
    </Dialog>
  );
}
