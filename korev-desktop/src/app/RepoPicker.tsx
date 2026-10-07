import { cn, Icon } from '../design-system';
import type { AppState } from '../shared/model';

export function RepoPicker({
  state,
  selected,
  onChange,
}: {
  state: AppState;
  selected: string[];
  onChange(repoIds: string[]): void;
}) {
  return (
    <div
      role="group"
      aria-label="Repositories"
      className="flex flex-wrap items-center gap-1.5"
    >
      {state.repos.map((repo) => {
        const picked = selected.includes(repo.id);
        return (
          <button
            key={repo.id}
            type="button"
            aria-pressed={picked}
            className={cn(
              'flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border border-border-2 bg-transparent px-2 text-sm text-fg-2 hover:bg-hover',
              picked && 'border-transparent bg-accent-subtle text-accent-text',
            )}
            onClick={() =>
              onChange(
                picked
                  ? selected.filter((repoId) => repoId !== repo.id)
                  : [...selected, repo.id],
              )
            }
          >
            <Icon name={picked ? 'check' : 'folder-git-2'} size={13} />
            {repo.name}
          </button>
        );
      })}
    </div>
  );
}
