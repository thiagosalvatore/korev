import type { AuthState } from '../shared/auth';
import type {
  ApprovedReview,
  InboxSnapshot,
  MyPr,
  MyStack,
  Priority,
  ReviewItem,
  ReviewRequest,
  ReviewStack,
} from '../shared/inbox';
import type {
  PullRequest,
  StackInfo,
  StackLayer,
} from '../shared/pull-request';
import type { RepoOwner, RepoPage } from '../shared/repos';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';

export const SYNCED_AT = '2026-10-03T14:02:00.000Z';
const OPENED_AT = '2026-10-01T09:00:00.000Z';

export function makePr(
  number: number,
  title: string,
  overrides: Partial<PullRequest> = {},
): PullRequest {
  const repo = overrides.repo ?? 'acme/api';
  return {
    id: `PR_${repo}_${number}`,
    number,
    title,
    url: `https://github.com/${repo}/pull/${number}`,
    repo,
    authorLogin: 'octocat',
    authorAvatarUrl: null,
    state: 'OPEN',
    isDraft: false,
    createdAt: OPENED_AT,
    updatedAt: SYNCED_AT,
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    ci: 'passing',
    checks: [],
    unresolvedThreads: 0,
    additions: 40,
    deletions: 8,
    changedFiles: 4,
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

function layer(
  position: number,
  number: number,
  title: string,
  overrides: Partial<StackLayer> = {},
): StackLayer {
  return {
    position,
    number,
    title,
    url: `https://github.com/acme/web/pull/${number}`,
    state: 'OPEN',
    isDraft: false,
    authorLogin: 'octocat',
    ...overrides,
  };
}

const FAILING_CHECKS: MyPr['reasons'] = [
  { code: 'checks-failing', label: '2 checks failing', severity: 'danger' },
  {
    code: 'unresolved-threads',
    label: '3 unresolved threads',
    severity: 'warning',
  },
];

const RATE_LIMIT_PR: MyPr = {
  pr: makePr(491, 'Rate-limit per tenant on ingestion endpoints', {
    ci: 'failing',
  }),
  bucket: 'needs-you',
  reasons: FAILING_CHECKS,
  queue: null,
};

const WEB_STACK_LAYERS: StackLayer[] = [
  layer(1, 302, 'App shell', { state: 'MERGED' }),
  layer(2, 303, 'IPC bridge and token store', { authorLogin: 'alex' }),
  layer(3, 304, 'Settings: org access states'),
  layer(4, 305, 'Settings: repo picker UI'),
];

function webStackAt(position: number): StackInfo {
  return {
    id: 'STACK_web',
    size: 4,
    baseRefName: 'main',
    position,
    layers: WEB_STACK_LAYERS,
  };
}

export const LINT_PR: MyPr = {
  pr: makePr(304, 'Settings: org access states', {
    repo: 'acme/web',
    ci: 'failing',
    stack: webStackAt(3),
  }),
  bucket: 'needs-you',
  reasons: [
    { code: 'checks-failing', label: 'Lint failing', severity: 'danger' },
  ],
  queue: null,
};

export const PICKER_PR: MyPr = {
  pr: makePr(305, 'Settings: repo picker UI', {
    repo: 'acme/web',
    ci: 'running',
    stack: webStackAt(4),
  }),
  bucket: 'in-progress',
  reasons: [
    { code: 'checks-pending', label: 'CI running', severity: 'neutral' },
  ],
  queue: null,
};

const EXPORTER_PR: MyPr = {
  pr: makePr(497, 'Retry flaky exporter on 502', { ci: 'running' }),
  bucket: 'in-progress',
  reasons: [
    { code: 'checks-pending', label: 'CI running', severity: 'neutral' },
  ],
  queue: null,
};

export const OTEL_PR: MyPr = {
  pr: makePr(480, 'Bump OpenTelemetry to 1.31'),
  bucket: 'ready',
  reasons: [
    { code: 'ready-to-merge', label: 'Ready to merge', severity: 'success' },
  ],
  queue: null,
};

function priority(tier: Priority['tier'], reasons: string[]): Priority {
  return { tier, score: 0, reasons };
}

const DIRECT_REQUEST: ReviewRequest = {
  requestedAt: '2026-10-01T14:02:00.000Z',
  approximate: false,
  direct: true,
  team: null,
};

function review(
  pr: PullRequest,
  overrides: Partial<ReviewItem> = {},
): ReviewItem {
  return {
    pr,
    request: DIRECT_REQUEST,
    size: { size: 'S', lines: 48, files: 4, filesTruncated: false },
    priority: priority('P2', ['waiting 2d']),
    blocksLayers: 0,
    ...overrides,
  };
}

export const INVOICE_REVIEW = review(
  makePr(91, 'Fix double-charge on retried invoices', {
    repo: 'acme/billing',
    authorLogin: 'maria',
  }),
  { priority: priority('P1', ['Requested from you directly', 'small']) },
);

const PLANNER_REVIEW = review(
  makePr(298, 'Query engine: planner rewrite', {
    repo: 'acme/web',
    authorLogin: 'li',
  }),
  { blocksLayers: 2, priority: priority('P1', ['blocks 2 layers']) },
);

const DASHBOARDS_REVIEW = review(
  makePr(299, 'Migrate dashboards to the new query engine', {
    repo: 'acme/web',
    authorLogin: 'li',
    ci: 'running',
  }),
  {
    request: { ...DIRECT_REQUEST, direct: false, team: '@acme/frontend' },
    size: { size: 'L', lines: 1840, files: 48, filesTruncated: false },
  },
);

export const SPIKE_REVIEW = review(
  makePr(470, 'Spike: replace cron with Temporal schedules', {
    authorLogin: 'sam',
    isDraft: true,
    ci: 'failing',
  }),
  {
    request: { ...DIRECT_REQUEST, approximate: true },
    priority: priority('P3', ['draft']),
  },
);

const WEB_STACK: MyStack = {
  id: 'STACK_web',
  repo: 'acme/web',
  baseRefName: 'main',
  size: 4,
  openCount: 3,
  partial: false,
  bucket: 'needs-you',
  headline: 'Needs you: #304 lint failing',
  layers: [
    { kind: 'mine', position: 4, item: PICKER_PR },
    { kind: 'mine', position: 3, item: LINT_PR },
    {
      kind: 'other',
      position: 2,
      layer: layer(2, 303, 'IPC bridge and token store', {
        authorLogin: 'alex',
      }),
    },
    {
      kind: 'other',
      position: 1,
      layer: layer(1, 302, 'App shell', { state: 'MERGED' }),
    },
  ],
};

const ENGINE_STACK: ReviewStack = {
  id: 'STACK_engine',
  repo: 'acme/web',
  baseRefName: 'main',
  size: 4,
  requestedCount: 2,
  partial: false,
  layers: [
    {
      kind: 'other',
      position: 1,
      layer: layer(1, 297, 'Query engine: types', { state: 'MERGED' }),
    },
    { kind: 'requested', position: 2, item: PLANNER_REVIEW },
    { kind: 'requested', position: 3, item: DASHBOARDS_REVIEW },
    {
      kind: 'other',
      position: 4,
      layer: layer(4, 300, 'Query engine: cleanup'),
    },
  ],
};

export const APPROVED_REVIEW: ApprovedReview = {
  item: review(
    makePr(312, 'Cache warehouse schemas', {
      repo: 'acme/web',
      authorLogin: 'li',
    }),
    { request: { ...DIRECT_REQUEST, direct: false, team: '@acme/frontend' } },
  ),
  approval: { kind: 'teammate', login: 'sakce' },
};

export function makeSnapshot(
  overrides: Partial<InboxSnapshot> = {},
): InboxSnapshot {
  return {
    status: 'live',
    syncedAt: SYNCED_AT,
    fromCache: false,
    viewerLogin: 'octocat',
    repoCount: 4,
    mine: [
      {
        bucket: 'needs-you',
        count: 3,
        entries: [
          { kind: 'pr', item: RATE_LIMIT_PR },
          { kind: 'stack', stack: WEB_STACK },
        ],
      },
      {
        bucket: 'ready',
        count: 1,
        entries: [{ kind: 'pr', item: OTEL_PR }],
      },
      {
        bucket: 'in-progress',
        count: 1,
        entries: [{ kind: 'pr', item: EXPORTER_PR }],
      },
    ],
    reviews: {
      entries: [
        { kind: 'pr', item: INVOICE_REVIEW },
        { kind: 'stack', stack: ENGINE_STACK },
        { kind: 'pr', item: SPIKE_REVIEW },
      ],
      approved: [],
    },
    reviewCount: 4,
    problems: [],
    repoMerge: {},
    repoAvatars: {},
    actions: {},
    truncated: { mine: false, reviews: false },
    stacksUnavailable: false,
    error: null,
    rateLimitResetAt: null,
    nextRetryAt: null,
    ...overrides,
  };
}

export const CONNECTED_AUTH: AuthState = {
  connection: { login: 'octocat', avatarUrl: null, method: 'oauth' },
  login: { status: 'idle' },
  storageProblem: null,
  unlockFailures: 0,
};

export const DISCONNECTED_AUTH: AuthState = {
  connection: null,
  login: { status: 'idle' },
  storageProblem: null,
  unlockFailures: 0,
};

export const WATCHING_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  repos: ['acme/api', 'acme/web'],
};

export function makeOwner(
  login: string,
  overrides: Partial<RepoOwner> = {},
): RepoOwner {
  return { login, kind: 'org', access: 'ok', actionUrl: null, ...overrides };
}

export function makeRepoPage(
  owner: string,
  repos: string[],
  overrides: Partial<RepoPage> = {},
): RepoPage {
  return {
    owner,
    repos,
    totalCount: repos.length,
    nextCursor: null,
    access: 'ok',
    actionUrl: null,
    ...overrides,
  };
}
