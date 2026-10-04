import { CheckboxMenu, cn, type CheckboxMenuGroup } from '../../design-system';
import type { InboxView } from '../../shared/settings';
import { NARROW_QUERY, NO_DRAG } from '../layout';
import { useMediaQuery } from '../useMediaQuery';
import { OwnerAvatar } from './OwnerAvatar';
import { filterLabel, useRepoFilter } from './useRepoFilter';

const OWNER_SEPARATOR = '/';

function ownerGroups(
  repos: string[],
  repoAvatars: Record<string, string>,
): CheckboxMenuGroup[] {
  const byOwner = new Map<string, string[]>();
  for (const repo of repos) {
    const [owner] = repo.split(OWNER_SEPARATOR);
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), repo]);
  }
  return [...byOwner].map(([owner, ownerRepos]) => {
    const avatarUrl = ownerRepos.map((repo) => repoAvatars[repo]).find(Boolean);
    return {
      id: owner,
      label: owner,
      icon: avatarUrl ? <OwnerAvatar src={avatarUrl} size="sm" /> : undefined,
      items: ownerRepos.map((repo) => ({
        id: repo,
        label: repo.split(OWNER_SEPARATOR)[1],
      })),
    };
  });
}

function triggerText(shown: number, total: number, compact: boolean): string {
  if (shown === total) return compact ? 'All' : 'All repos';
  return compact ? `${shown}/${total}` : `${shown} of ${total} repos`;
}

export interface RepoFilterMenuProps {
  view: InboxView;
  repoAvatars: Record<string, string>;
}

export function RepoFilterMenu({ view, repoAvatars }: RepoFilterMenuProps) {
  const filter = useRepoFilter(view);
  const compact = useMediaQuery(NARROW_QUERY);
  const active = filter.repos.length > 0;
  const total = filter.watched.length;
  const shown = active ? filter.repos.length : total;
  return (
    <CheckboxMenu
      label={`Repo filter, ${filterLabel(shown, total)}`}
      triggerLabel={triggerText(shown, total, compact)}
      triggerIcon="funnel"
      triggerClassName={cn(NO_DRAG, active && 'text-accent-text')}
      groups={ownerGroups(filter.watched, repoAvatars)}
      selected={active ? filter.repos : filter.watched}
      onChange={filter.set}
      resetLabel="Show all repos"
      onReset={filter.clear}
    />
  );
}
