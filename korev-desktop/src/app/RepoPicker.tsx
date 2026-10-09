import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { cn, Icon, Input } from '../design-system';
import { pickerLabel } from '../shared/format';
import type { AppState, Repo } from '../shared/model';
import { focusComposer } from './actions';
import { PANEL, useDismiss } from './ui/Menu';

function matching(repos: Repo[], query: string): Repo[] {
  const needle = query.trim().toLowerCase();
  return repos.filter((repo) => repo.name.toLowerCase().includes(needle));
}

export function RepoPicker({
  state,
  selected,
  onChange,
  defaultOpen = false,
}: {
  state: AppState;
  selected: string[];
  onChange(repoIds: string[]): void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);
  const picked = state.repos.filter((repo) => selected.includes(repo.id));
  const visible = matching(state.repos, query);

  function toggle(repoId: string) {
    onChange(
      selected.includes(repoId)
        ? selected.filter((id) => id !== repoId)
        : [...selected, repoId],
    );
  }

  function proceed() {
    if (!selected.length && visible[active]) toggle(visible[active].id);
    close();
    focusComposer();
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(
        (value) =>
          (value + step + visible.length) % Math.max(visible.length, 1),
      );
    }
    if (event.key === ' ' && visible[active]) {
      event.preventDefault();
      toggle(visible[active].id);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      proceed();
    }
  }

  return (
    <div ref={root} className="relative inline-flex">
      <button
        type="button"
        aria-label="Repositories"
        aria-expanded={open}
        className={cn(
          'flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border bg-transparent px-2 text-sm hover:bg-hover',
          picked.length
            ? 'border-border-2 text-fg-2'
            : 'border-accent-border text-fg-1',
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="folder-git-2" size={13} />
        <span className="max-w-64 truncate">{pickerLabel(picked)}</span>
        <Icon name="chevron-down" size={12} className="text-fg-4" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Choose repositories"
          className={cn(PANEL, 'top-[calc(100%+4px)] left-0 w-72')}
        >
          <Input
            icon="search"
            aria-label="Search repositories"
            placeholder="Search repositories"
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onSearchKey}
          />
          <div className="mt-1">
            {visible.map((repo, index) => (
              <label
                key={repo.id}
                className={cn(
                  'flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm text-fg-1',
                  index === active && 'bg-active',
                )}
                onMouseMove={() => setActive(index)}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(repo.id)}
                  onChange={() => toggle(repo.id)}
                />
                <span className="min-w-0 flex-1 truncate">{repo.name}</span>
              </label>
            ))}
            {visible.length ? null : (
              <div className="px-2 py-1.5 text-sm text-fg-4">
                No repositories match
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
