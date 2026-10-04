import type { InboxView } from '../../shared/settings';
import { announce } from '../LiveAnnouncer';
import { saveRepoFilter, useSettings } from '../useSettings';

const NO_REPOS: string[] = [];

export interface RepoFilterState {
  repos: string[];
  watched: string[];
  set: (repos: string[]) => void;
  clear: () => void;
}

export function filterLabel(shown: number, total: number): string {
  return shown === total ? 'all repos' : `${shown} of ${total} repos`;
}

export function useRepoFilter(view: InboxView): RepoFilterState {
  const settings = useSettings();
  const repos = settings?.repoFilter[view] ?? NO_REPOS;
  const watched = settings?.repos ?? NO_REPOS;
  function set(next: string[]) {
    const chosen = watched.filter((repo) => next.includes(repo));
    const all = chosen.length === 0 || chosen.length === watched.length;
    const shown = all ? watched.length : chosen.length;
    announce(`Showing ${filterLabel(shown, watched.length)}`);
    void saveRepoFilter(view, all ? [] : chosen);
  }
  return { repos, watched, set, clear: () => set([]) };
}
