import type {
  Bucket,
  InboxSnapshot,
  ReviewEntry,
  ReviewItem,
} from '../../shared/inbox';

export interface SectionCount {
  bucket: Bucket;
  count: number;
}

function requestedInEntry(entry: ReviewEntry): ReviewItem[] {
  if (entry.kind === 'pr') return [entry.item];
  return entry.stack.layers.flatMap((layer) =>
    layer.kind === 'requested' ? [layer.item] : [],
  );
}

export function requestedItems(snapshot: InboxSnapshot): ReviewItem[] {
  return snapshot.reviews.entries.flatMap(requestedInEntry);
}

export function sectionCounts(snapshot: InboxSnapshot): SectionCount[] {
  return snapshot.mine
    .filter((section) => section.bucket !== 'kept')
    .map(({ bucket, count }) => ({ bucket, count }));
}

export function needsYouCount(snapshot: InboxSnapshot): number {
  return (
    snapshot.mine.find((section) => section.bucket === 'needs-you')?.count ?? 0
  );
}

export function hasTopPriority(snapshot: InboxSnapshot): boolean {
  return requestedItems(snapshot).some((item) => item.priority.tier === 'P1');
}
