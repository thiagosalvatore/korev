import type {
  ChangedFile,
  Check,
  CheckOutcome,
  CiState,
  MergeStateStatus,
  Mergeable,
  PrComment,
  PrState,
  PullRequest,
  ReviewDecision,
  ReviewRequestEvent,
  ReviewState,
  Reviewer,
  StackInfo,
  StackLayer,
  SubmittedReview,
} from '../../shared/pull-request';
import {
  type CheckContextNode,
  type CommentNode,
  type LatestReviewNode,
  type PullRequestNode,
  type ReviewerNode,
  type StackLayerNode,
  presentNodes,
} from './nodes';

export type WarningLogger = (message: string) => void;

const PR_STATES: readonly PrState[] = ['OPEN', 'CLOSED', 'MERGED'];
const MERGEABLE_VALUES: readonly Mergeable[] = [
  'MERGEABLE',
  'CONFLICTING',
  'UNKNOWN',
];
const MERGE_STATE_VALUES: readonly MergeStateStatus[] = [
  'BEHIND',
  'BLOCKED',
  'CLEAN',
  'DIRTY',
  'HAS_HOOKS',
  'UNKNOWN',
  'UNSTABLE',
];
const REVIEW_DECISIONS: readonly ReviewDecision[] = [
  'APPROVED',
  'CHANGES_REQUESTED',
  'REVIEW_REQUIRED',
];
const REVIEW_STATES: readonly ReviewState[] = [
  'APPROVED',
  'CHANGES_REQUESTED',
  'COMMENTED',
  'DISMISSED',
  'PENDING',
];

const CI_BY_ROLLUP: Record<string, CiState> = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  PENDING: 'running',
  EXPECTED: 'running',
};

const CHECK_RUN_OUTCOMES: Record<string, CheckOutcome> = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  TIMED_OUT: 'failing',
  ACTION_REQUIRED: 'failing',
  CANCELLED: 'failing',
  STARTUP_FAILURE: 'failing',
  NEUTRAL: 'skipped',
  SKIPPED: 'skipped',
  STALE: 'skipped',
};

const STATUS_CONTEXT_OUTCOMES: Record<string, CheckOutcome> = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  PENDING: 'pending',
  EXPECTED: 'pending',
};

const CHECK_RUN_TYPE = 'CheckRun';
const STATUS_CONTEXT_TYPE = 'StatusContext';
const USER_TYPE = 'User';
const TEAM_TYPE = 'Team';
const BOT_TYPE = 'Bot';
const COMPLETED_STATUS = 'COMPLETED';
const STACK_WARNING =
  'GitHub returned no usable stack data; showing stacked PRs as single PRs.';

let stackWarningLogged = false;

export function toPullRequest(
  node: PullRequestNode,
  warn: WarningLogger = console.warn,
): PullRequest {
  const files = presentNodes(node.files);
  const comments = presentNodes(node.comments).flatMap(toComment);
  return {
    id: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    repo: node.repository.nameWithOwner,
    authorLogin: node.author?.login ?? null,
    authorAvatarUrl: node.author?.avatarUrl ?? null,
    state: oneOf(node.state, PR_STATES, 'OPEN'),
    isDraft: node.isDraft,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    lastActivityAt: lastActivityAt(node, comments),
    reviewDecision: oneOf(node.reviewDecision, REVIEW_DECISIONS, null),
    mergeable: oneOf(node.mergeable, MERGEABLE_VALUES, 'UNKNOWN'),
    mergeStateStatus: oneOf(
      node.mergeStateStatus,
      MERGE_STATE_VALUES,
      'UNKNOWN',
    ),
    ci: toCiState(node.statusCheckRollup?.state),
    checks: presentNodes(node.statusCheckRollup?.contexts).map(toCheck),
    unresolvedThreads: countUnresolved(node),
    additions: node.additions,
    deletions: node.deletions,
    changedFiles: node.changedFiles,
    files: files.map(toChangedFile),
    filesTruncated: node.files?.pageInfo?.hasNextPage ?? false,
    pendingReviewers: toPendingReviewers(node),
    reviews: toSubmittedReviews(node),
    reviewRequestEvents: toReviewRequestEvents(node),
    stack: toStack(node, warn),
    isInMergeQueue: node.isInMergeQueue ?? false,
    comments,
  };
}

function lastActivityAt(node: PullRequestNode, comments: PrComment[]): string {
  const commitTimes = presentNodes(node.commits).flatMap((entry) =>
    entry.commit?.committedDate ? [entry.commit.committedDate] : [],
  );
  const humanCommentTimes = comments
    .filter((comment) => !comment.isBot)
    .map((comment) => comment.createdAt);
  return [node.createdAt, ...commitTimes, ...humanCommentTimes].reduce(
    (newest, time) => (Date.parse(time) > Date.parse(newest) ? time : newest),
  );
}

function toComment(node: CommentNode): PrComment[] {
  if (!node.body || !node.createdAt || !node.url) return [];
  return [
    {
      authorLogin: node.author?.login ?? null,
      isBot: node.author?.__typename === BOT_TYPE,
      body: node.body,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt ?? node.createdAt,
      url: node.url,
    },
  ];
}

function oneOf<TValue extends string, TFallback>(
  value: string | null | undefined,
  allowed: readonly TValue[],
  fallback: TFallback,
): TValue | TFallback {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function toCiState(rollupState: string | undefined): CiState {
  if (!rollupState) return 'none';
  return CI_BY_ROLLUP[rollupState] ?? 'none';
}

function toCheck(context: CheckContextNode): Check {
  if (context.__typename === STATUS_CONTEXT_TYPE) {
    return {
      name: context.context ?? '',
      outcome: STATUS_CONTEXT_OUTCOMES[context.state ?? ''] ?? 'pending',
    };
  }
  return { name: context.name ?? '', outcome: checkRunOutcome(context) };
}

function checkRunOutcome(context: CheckContextNode): CheckOutcome {
  if (context.__typename !== CHECK_RUN_TYPE) return 'pending';
  if (context.status !== COMPLETED_STATUS) return 'pending';
  return CHECK_RUN_OUTCOMES[context.conclusion ?? ''] ?? 'skipped';
}

function countUnresolved(node: PullRequestNode): number {
  return presentNodes(node.reviewThreads).filter((thread) => !thread.isResolved)
    .length;
}

function toChangedFile(file: ChangedFile): ChangedFile {
  return {
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
  };
}

function toReviewer(node: ReviewerNode | null | undefined): Reviewer | null {
  if (node?.__typename === USER_TYPE && node.login) {
    return { kind: 'user', login: node.login };
  }
  if (node?.__typename === TEAM_TYPE && node.slug && node.organization?.login) {
    return { kind: 'team', org: node.organization.login, slug: node.slug };
  }
  return null;
}

function toPendingReviewers(node: PullRequestNode): Reviewer[] {
  return presentNodes(node.reviewRequests)
    .map((request) => toReviewer(request.requestedReviewer))
    .filter((reviewer): reviewer is Reviewer => reviewer !== null);
}

function toSubmittedReview(node: LatestReviewNode): SubmittedReview[] {
  const login = node.author?.login;
  const state = oneOf(node.state, REVIEW_STATES, null);
  if (!login || !state) return [];
  return [{ login, state, isBot: node.author?.__typename === BOT_TYPE }];
}

function toSubmittedReviews(node: PullRequestNode): SubmittedReview[] {
  const reviews = presentNodes(node.latestReviews).flatMap(toSubmittedReview);
  return [...new Map(reviews.map((review) => [review.login, review])).values()];
}

function toReviewRequestEvents(node: PullRequestNode): ReviewRequestEvent[] {
  return presentNodes(node.timelineItems).flatMap((event) => {
    const reviewer = toReviewer(event.requestedReviewer);
    if (!reviewer || !event.createdAt) return [];
    return [{ reviewer, createdAt: event.createdAt }];
  });
}

function toStack(node: PullRequestNode, warn: WarningLogger): StackInfo | null {
  if (node.stack === null) return null;
  const stack = parseStack(node);
  if (!stack) warnOnce(warn);
  return stack;
}

function parseStack(node: PullRequestNode): StackInfo | null {
  const { stack, stackEntry } = node;
  if (!stack?.id || !stack.baseRefName) return null;
  if (typeof stack.size !== 'number') return null;
  if (typeof stackEntry?.position !== 'number') return null;
  if (!Array.isArray(stack.entries?.nodes)) return null;
  return {
    id: stack.id,
    size: stack.size,
    baseRefName: stack.baseRefName,
    position: stackEntry.position,
    layers: presentNodes(stack.entries)
      .flatMap(toStackLayer)
      .sort((lower, upper) => lower.position - upper.position),
  };
}

function toStackLayer(entry: StackLayerNode): StackLayer[] {
  const pullRequest = entry.pullRequest;
  if (typeof entry.position !== 'number' || !pullRequest) return [];
  if (typeof pullRequest.number !== 'number') return [];
  return [
    {
      position: entry.position,
      number: pullRequest.number,
      title: pullRequest.title ?? '',
      url: pullRequest.url ?? '',
      state: oneOf(pullRequest.state, PR_STATES, 'OPEN'),
      isDraft: pullRequest.isDraft ?? false,
      authorLogin: pullRequest.author?.login ?? null,
    },
  ];
}

function warnOnce(warn: WarningLogger): void {
  if (stackWarningLogged) return;
  stackWarningLogged = true;
  warn(STACK_WARNING);
}
