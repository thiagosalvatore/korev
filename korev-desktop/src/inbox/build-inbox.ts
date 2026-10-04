import type {
  ApprovedReview,
  MySection,
  ReviewItem,
  ReviewList,
} from '../shared/inbox';
import type { MergeTool } from '../shared/merge';
import { prRef } from '../shared/pr-ref';
import type { PullRequest } from '../shared/pull-request';
import { approvalFor } from './approval';
import { classifyMyPr } from './classify';
import type { UnknownMergeStreaks } from './merge-streaks';
import { priority } from './priority';
import { queueStatusFor } from './queue-status';
import { reviewRequestFor, type Viewer } from './request-age';
import { prSize } from './size';
import { blocksLayers, groupMyPrs, groupReviews, sortApproved } from './stacks';

export interface InboxInput {
  mine: PullRequest[];
  reviews: PullRequest[];
  viewer: Viewer;
  now: Date;
  unknownMergeStreaks: UnknownMergeStreaks;
  repoOrder: string[];
  mergeWith: Record<string, MergeTool>;
  keptPrs: Record<string, string>;
}

export interface Inbox {
  mine: MySection[];
  reviews: ReviewList;
  reviewCount: number;
}

interface SortedReview {
  item: ReviewItem;
  approved: ApprovedReview | null;
}

function toReviewItem(pr: PullRequest, viewer: Viewer, now: Date): ReviewItem {
  const request = reviewRequestFor(pr, viewer);
  const size = prSize(pr);
  const blocking = blocksLayers(pr);
  return {
    pr,
    request,
    size,
    blocksLayers: blocking,
    priority: priority(
      { request, size, blocksLayers: blocking, isDraft: pr.isDraft, ci: pr.ci },
      now,
    ),
  };
}

function sortReview(item: ReviewItem, viewer: Viewer): SortedReview {
  const approval = approvalFor(item.pr, item.request, viewer);
  return { item, approved: approval ? { item, approval } : null };
}

function toReviewList(sorted: SortedReview[], repoOrder: string[]): ReviewList {
  const waiting = sorted.filter((review) => !review.approved);
  const approved = sorted.flatMap((review) =>
    review.approved ? [review.approved] : [],
  );
  return {
    entries: groupReviews(
      waiting.map((review) => review.item),
      repoOrder,
    ),
    approved: sortApproved(approved, repoOrder),
  };
}

export function buildInbox({
  mine,
  reviews,
  viewer,
  now,
  unknownMergeStreaks,
  repoOrder,
  mergeWith,
  keptPrs,
}: InboxInput): Inbox {
  const classified = mine.map((pr) =>
    classifyMyPr(pr, {
      unknownMergeStreak: unknownMergeStreaks[pr.id] ?? 0,
      queue: queueStatusFor(pr, mergeWith[pr.repo] ?? 'github'),
      now,
      keptAt: keptPrs[prRef(pr)] ?? null,
    }),
  );
  const sorted = reviews.map((pr) =>
    sortReview(toReviewItem(pr, viewer, now), viewer),
  );
  return {
    mine: groupMyPrs(classified, repoOrder),
    reviews: toReviewList(sorted, repoOrder),
    reviewCount: sorted.filter((review) => !review.approved).length,
  };
}
