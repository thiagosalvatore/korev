import type {
  Bucket,
  InboxSnapshot,
  ApprovedReview,
  MyEntry,
  MyPr,
  MySection,
  MyStack,
  MyStackLayer,
  PriorityTier,
  ReviewEntry,
  ReviewItem,
  ReviewStack,
  ReviewStackLayer,
} from '../shared/inbox';
import type {
  PullRequest,
  StackInfo,
  StackLayer,
} from '../shared/pull-request';
import { compareReviewItems } from './priority';
import { compareReposIn, type RepoComparator } from './repo-order';
import { SECTION_ORDER, bucketRank, topSeverityRank } from './severity';

interface HasPr {
  pr: PullRequest;
}

interface StackGroup<T extends HasPr> {
  info: StackInfo;
  repo: string;
  members: T[];
}

interface PlacedMyEntry {
  entry: MyEntry;
  lead: MyPr;
  updatedAt: number;
  prCount: number;
}

interface PlacedReviewEntry {
  entry: ReviewEntry;
  lead: ReviewItem;
}

const BUCKET_LABEL: Record<Bucket, string> = {
  'needs-you': 'Needs you',
  'korev-working': 'Korev working',
  'in-progress': 'In progress',
  ready: 'Ready to merge',
  stale: 'Stale',
  kept: 'Kept',
};

export function blocksLayers(pr: PullRequest): number {
  const stack = pr.stack;
  if (!stack) return 0;
  return stack.layers.filter(
    (layer) => layer.state === 'OPEN' && layer.position > stack.position,
  ).length;
}

function partitionByStack<T extends HasPr>(
  items: T[],
): { singles: T[]; groups: StackGroup<T>[] } {
  const singles: T[] = [];
  const groups = new Map<string, StackGroup<T>>();
  for (const item of items) {
    const info = item.pr.stack;
    if (!info) {
      singles.push(item);
      continue;
    }
    const group = groups.get(info.id) ?? {
      info,
      repo: item.pr.repo,
      members: [],
    };
    group.members.push(item);
    groups.set(info.id, group);
  }
  return { singles, groups: [...groups.values()] };
}

function stackPosition(pr: PullRequest): number {
  return pr.stack?.position ?? 0;
}

function orderedLayers<T extends HasPr, Layer extends { position: number }>(
  group: StackGroup<T>,
  toMember: (item: T) => Layer,
  toOther: (layer: StackLayer) => Layer,
): Layer[] {
  const memberNumbers = new Set(group.members.map((item) => item.pr.number));
  const others = group.info.layers
    .filter((layer) => !memberNumbers.has(layer.number))
    .map(toOther);
  return [...group.members.map(toMember), ...others].sort(
    (a, b) => a.position - b.position,
  );
}

function isPartial(info: StackInfo): boolean {
  return info.size > info.layers.length;
}

function updatedAtOf(item: MyPr): number {
  return Date.parse(item.pr.updatedAt);
}

function compareMyPrs(a: MyPr, b: MyPr): number {
  return (
    bucketRank(a.bucket) - bucketRank(b.bucket) ||
    topSeverityRank(a.reasons) - topSeverityRank(b.reasons) ||
    updatedAtOf(b) - updatedAtOf(a)
  );
}

function mostUrgent(items: MyPr[]): MyPr {
  return [...items].sort(compareMyPrs)[0];
}

function headlineFor(lead: MyPr): string {
  const prefix = `${BUCKET_LABEL[lead.bucket]}: #${lead.pr.number}`;
  const topReason = lead.reasons[0];
  if (!topReason || lead.bucket === 'ready') return prefix;
  return `${prefix} ${topReason.label}`;
}

function isOpenMyLayer(layer: MyStackLayer): boolean {
  if (layer.kind === 'mine') return layer.item.pr.state === 'OPEN';
  return layer.layer.state === 'OPEN';
}

function buildMyStack(group: StackGroup<MyPr>, lead: MyPr): MyStack {
  const layers = orderedLayers<MyPr, MyStackLayer>(
    group,
    (item) => ({ kind: 'mine', position: stackPosition(item.pr), item }),
    (layer) => ({ kind: 'other', position: layer.position, layer }),
  );
  return {
    id: group.info.id,
    repo: group.repo,
    baseRefName: group.info.baseRefName,
    size: group.info.size,
    openCount: layers.filter(isOpenMyLayer).length,
    partial: isPartial(group.info),
    bucket: lead.bucket,
    headline: headlineFor(lead),
    layers,
  };
}

function placeMyStack(group: StackGroup<MyPr>): PlacedMyEntry {
  const lead = mostUrgent(group.members);
  return {
    entry: { kind: 'stack', stack: buildMyStack(group, lead) },
    lead,
    updatedAt: Math.max(...group.members.map(updatedAtOf)),
    prCount: group.members.length,
  };
}

function placeMyPr(item: MyPr): PlacedMyEntry {
  return {
    entry: { kind: 'pr', item },
    lead: item,
    updatedAt: updatedAtOf(item),
    prCount: 1,
  };
}

function compareMyEntries(compareRepos: RepoComparator) {
  return (a: PlacedMyEntry, b: PlacedMyEntry): number =>
    compareRepos(a.lead.pr.repo, b.lead.pr.repo) ||
    topSeverityRank(a.lead.reasons) - topSeverityRank(b.lead.reasons) ||
    b.updatedAt - a.updatedAt;
}

function sectionFor(
  bucket: Bucket,
  placed: PlacedMyEntry[],
  compareRepos: RepoComparator,
): MySection {
  const inBucket = placed
    .filter((candidate) => candidate.lead.bucket === bucket)
    .sort(compareMyEntries(compareRepos));
  return {
    bucket,
    count: inBucket.reduce((total, candidate) => total + candidate.prCount, 0),
    entries: inBucket.map((candidate) => candidate.entry),
  };
}

export function groupMyPrs(items: MyPr[], repoOrder: string[]): MySection[] {
  const { singles, groups } = partitionByStack(items);
  const placed = [...singles.map(placeMyPr), ...groups.map(placeMyStack)];
  const compareRepos = compareReposIn(repoOrder);
  return SECTION_ORDER.map((bucket) =>
    sectionFor(bucket, placed, compareRepos),
  );
}

export function myPrsIn(sections: MySection[]): MyPr[] {
  return sections
    .flatMap((section) => section.entries)
    .flatMap((entry) =>
      entry.kind === 'pr'
        ? [entry.item]
        : entry.stack.layers.flatMap((layer) =>
            layer.kind === 'mine' ? [layer.item] : [],
          ),
    );
}

function buildReviewStack(group: StackGroup<ReviewItem>): ReviewStack {
  return {
    id: group.info.id,
    repo: group.repo,
    baseRefName: group.info.baseRefName,
    size: group.info.size,
    requestedCount: group.members.length,
    partial: isPartial(group.info),
    layers: orderedLayers<ReviewItem, ReviewStackLayer>(
      group,
      (item) => ({ kind: 'requested', position: stackPosition(item.pr), item }),
      (layer) => ({ kind: 'other', position: layer.position, layer }),
    ),
  };
}

const TIER_ORDER: readonly PriorityTier[] = ['P1', 'P2', 'P3'];

function tierRank(item: ReviewItem): number {
  return TIER_ORDER.indexOf(item.priority.tier);
}

export function compareReviewsIn(
  repoOrder: string[],
): (a: ReviewItem, b: ReviewItem) => number {
  const compareRepos = compareReposIn(repoOrder);
  return (a, b) =>
    tierRank(a) - tierRank(b) ||
    compareRepos(a.pr.repo, b.pr.repo) ||
    compareReviewItems(a, b);
}

function placeReviewStack(group: StackGroup<ReviewItem>): PlacedReviewEntry {
  return {
    entry: { kind: 'stack', stack: buildReviewStack(group) },
    lead: [...group.members].sort(compareReviewItems)[0],
  };
}

function placeReviewItem(item: ReviewItem): PlacedReviewEntry {
  return { entry: { kind: 'pr', item }, lead: item };
}

export function groupReviews(
  items: ReviewItem[],
  repoOrder: string[],
): ReviewEntry[] {
  const { singles, groups } = partitionByStack(items);
  const compare = compareReviewsIn(repoOrder);
  return [...singles.map(placeReviewItem), ...groups.map(placeReviewStack)]
    .sort((a, b) => compare(a.lead, b.lead))
    .map((placed) => placed.entry);
}

export function sortApproved(
  approved: ApprovedReview[],
  repoOrder: string[],
): ApprovedReview[] {
  const compare = compareReviewsIn(repoOrder);
  return [...approved].sort((left, right) => compare(left.item, right.item));
}

export function reviewItemsIn(entries: ReviewEntry[]): ReviewItem[] {
  return entries.flatMap((entry) =>
    entry.kind === 'pr'
      ? [entry.item]
      : entry.stack.layers.flatMap((layer) =>
          layer.kind === 'requested' ? [layer.item] : [],
        ),
  );
}

export function pullRequestsIn(snapshot: InboxSnapshot): PullRequest[] {
  return [
    ...myPrsIn(snapshot.mine),
    ...reviewItemsIn(snapshot.reviews.entries),
    ...snapshot.reviews.approved.map(({ item }) => item),
  ].map((item) => item.pr);
}
