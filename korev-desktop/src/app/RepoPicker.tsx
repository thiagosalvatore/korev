import { useCallback, useRef, useState } from 'react';
import { cn, Icon, Input } from '../design-system';
import { pickerLabel } from '../shared/format';
import type { AppState, Repo } from '../shared/model';
import { PANEL, useDismiss } from './ui/Menu';

function matching(repos: Repo[], query: string): Repo[] {
  const needle = query.trim().toLowerCase();
  return repos.filter((repo) => repo.name.toLowerCase().includes(needle));
}

export function RepoPicker({
  state,
  selected,
  onChange,
}: {
  state: AppState;
  selected: string[];
  onChange(repoIds: string[]): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mt-1">
            {visible.map((repo) => (
              <label
                key={repo.id}
                className="flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm text-fg-1 hover:bg-hover"
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
