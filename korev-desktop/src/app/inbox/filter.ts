import type { InboxSnapshot, MyEntry, MySection } from '../../shared/inbox';
import { requestedItems } from './selectors';

type EntryInRepo =
  | { kind: 'pr'; item: { pr: { repo: string } } }
  | { kind: 'stack'; stack: { repo: string } };

function entryRepo(entry: EntryInRepo): string {
  return entry.kind === 'pr' ? entry.item.pr.repo : entry.stack.repo;
}

function prCount(entry: MyEntry): number {
  if (entry.kind === 'pr') return 1;
  return entry.stack.layers.filter((layer) => layer.kind === 'mine').length;
}

function filterSection(section: MySection, repos: string[]): MySection {
  const entries = section.entries.filter((entry) =>
    repos.includes(entryRepo(entry)),
  );
  const count = entries.reduce((total, entry) => total + prCount(entry), 0);
  return { ...section, entries, count };
}

export function filterSnapshot(
  snapshot: InboxSnapshot,
  repos: string[],
): InboxSnapshot {
  if (repos.length === 0) return snapshot;
  const filtered: InboxSnapshot = {
    ...snapshot,
    mine: snapshot.mine.map((section) => filterSection(section, repos)),
    reviews: {
      entries: snapshot.reviews.entries.filter((entry) =>
        repos.includes(entryRepo(entry)),
      ),
      approved: snapshot.reviews.approved.filter((approved) =>
        repos.includes(approved.item.pr.repo),
      ),
    },
  };
  return { ...filtered, reviewCount: requestedItems(filtered).length };
}
