import type { PullRequest, StackLayer } from '../shared/pull-request';

export const NOW = new Date('2026-10-03T12:00:00Z');

export function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

export function daysAgo(days: number): string {
  return hoursAgo(days * 24);
}

export function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: `PR_${overrides.number ?? 1}`,
    number: 1,
    title: 'Add feature',
    url: 'https://github.com/acme/web/pull/1',
    repo: 'acme/web',
    headRefName: 'feature',
    baseRefName: 'main',
    headRefOid: 'abc1234def5678',
    headRepositoryUrl: null,
    isCrossRepository: false,
    maintainerCanModify: false,
    authorLogin: 'alice',
    authorAvatarUrl: null,
    state: 'OPEN',
    isDraft: false,
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(1),
    lastActivityAt: hoursAgo(1),
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    ci: 'passing',
    checks: [],
    unresolvedThreads: 0,
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    files: [],
    filesTruncated: false,
    pendingReviewers: [],
    reviews: [],
    reviewRequestEvents: [],
    stack: null,
    isInMergeQueue: false,
    comments: [],
    ...overrides,
  };
}

export function makeLayer(overrides: Partial<StackLayer> = {}): StackLayer {
  return {
    position: 1,
    number: 1,
    title: 'Layer',
    url: 'https://github.com/acme/web/pull/1',
    state: 'OPEN',
    isDraft: false,
    authorLogin: 'alice',
    ...overrides,
  };
}
