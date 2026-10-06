import type {
  Bucket,
  InboxSnapshot,
  ReviewEntry,
  ReviewItem,
} from '../../shared/inbox';
import { prRef } from '../../shared/pr-ref';
import type { PullRequest } from '../../shared/pull-request';
import type { MyPrsView } from '../../shared/settings';
import { myPrsIn } from '../../inbox/stacks';

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

export function listedPullRequests(snapshot: InboxSnapshot): PullRequest[] {
  return [...myPrsIn(snapshot.mine), ...requestedItems(snapshot)].map(
    (item) => item.pr,
  );
}

export function sectionCounts(snapshot: InboxSnapshot): SectionCount[] {
  return snapshot.mine
    .filter((section) => section.bucket !== 'kept')
    .map(({ bucket, count }) => ({ bucket, count }));
}

export function hasTopPriority(snapshot: InboxSnapshot): boolean {
  return requestedItems(snapshot).some((item) => item.priority.tier === 'P1');
}

export const MY_PRS_VIEW_BUCKETS: Record<MyPrsView, readonly Bucket[]> = {
  open: ['needs-you', 'korev-working', 'in-progress'],
  ready: ['ready'],
  stale: ['stale', 'kept'],
};

const MY_PRS_VIEWS = Object.keys(MY_PRS_VIEW_BUCKETS) as MyPrsView[];

export function myPrsViewSnapshot(
  snapshot: InboxSnapshot,
  view: MyPrsView,
): InboxSnapshot {
  const buckets = MY_PRS_VIEW_BUCKETS[view];
  return {
    ...snapshot,
    mine: snapshot.mine.filter((section) => buckets.includes(section.bucket)),
  };
}

export function bucketCount(snapshot: InboxSnapshot, bucket: Bucket): number {
  return snapshot.mine.find((section) => section.bucket === bucket)?.count ?? 0;
}

export function myPrsViewOf(
  snapshot: InboxSnapshot,
  ref: string,
): MyPrsView | null {
  const holdsRef = (view: MyPrsView) =>
    myPrsIn(myPrsViewSnapshot(snapshot, view).mine).some(
      ({ pr }) => prRef(pr) === ref,
    );
  return MY_PRS_VIEWS.find(holdsRef) ?? null;
}
