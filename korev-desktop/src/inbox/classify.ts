import type { MyPr, Reason, ReasonCode, ReasonSeverity } from '../shared/inbox';
import type { MergeTool, QueueStatus } from '../shared/merge';
import type { MergeStateStatus, PullRequest } from '../shared/pull-request';
import { countOf } from './format';
import { STALE_AFTER_DAYS, daysSince, isKeepActive, keepEndsAt } from './keep';
import { severityRank } from './severity';

export interface ClassifyContext {
  unknownMergeStreak: number;
  queue?: QueueStatus | null;
  now?: Date;
  keptAt?: string | null;
  needsAnswer?: boolean;
  korevWorking?: boolean;
}

type ReasonRule = (pr: PullRequest, context: ClassifyContext) => Reason | null;

const MAX_SYNCS_CHECKING_MERGEABILITY = 2;
const FIRST_SIGHTING: ClassifyContext = { unknownMergeStreak: 1 };

const READY_MERGE_STATES: ReadonlySet<MergeStateStatus> = new Set([
  'CLEAN',
  'HAS_HOOKS',
]);

const QUEUE_NAMES: Record<MergeTool, string> = {
  github: 'merge',
  trunk: 'Trunk',
  mergify: 'Mergify',
  aviator: 'Aviator',
};

const REASON_SEVERITY: Record<ReasonCode, ReasonSeverity> = {
  'needs-answer': 'danger',
  'removed-from-queue': 'warning',
  'in-queue': 'neutral',
  'checks-failing': 'danger',
  'changes-requested': 'danger',
  conflicts: 'danger',
  'unresolved-threads': 'warning',
  behind: 'warning',
  'optional-checks-failing': 'warning',
  'blocked-by-rules': 'warning',
  'checks-pending': 'neutral',
  draft: 'neutral',
  'waiting-on-review': 'neutral',
  'checking-mergeability': 'neutral',
  'mergeability-unknown': 'neutral',
  'no-checks': 'neutral',
  'ready-to-merge': 'success',
  stale: 'warning',
};

function reason(code: ReasonCode, label: string): Reason {
  return { code, label, severity: REASON_SEVERITY[code] };
}

function failingCheckNames(pr: PullRequest): string[] {
  return pr.checks
    .filter((check) => check.outcome === 'failing')
    .map((check) => check.name);
}

function pendingCheckCount(pr: PullRequest): number {
  return pr.checks.filter((check) => check.outcome === 'pending').length;
}

function isCiRunning(pr: PullRequest): boolean {
  return pendingCheckCount(pr) > 0 || pr.ci === 'running';
}

function checksFailingReason(pr: PullRequest): Reason | null {
  if (pr.mergeStateStatus === 'UNSTABLE') return null;
  const names = failingCheckNames(pr);
  if (names.length === 1)
    return reason('checks-failing', `${names[0]} failing`);
  if (names.length > 1) {
    return reason(
      'checks-failing',
      `${countOf(names.length, 'check')} failing`,
    );
  }
  if (pr.ci === 'failing') return reason('checks-failing', 'Checks failing');
  return null;
}

function changesRequestedReason(pr: PullRequest): Reason | null {
  if (pr.reviewDecision !== 'CHANGES_REQUESTED') return null;
  return reason('changes-requested', 'Changes requested');
}

function conflictsReason(pr: PullRequest): Reason | null {
  const conflicting =
    pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY';
  if (!conflicting) return null;
  return reason('conflicts', 'Merge conflicts');
}

function unresolvedThreadsReason(pr: PullRequest): Reason | null {
  if (pr.unresolvedThreads === 0) return null;
  return reason(
    'unresolved-threads',
    countOf(pr.unresolvedThreads, 'unresolved thread'),
  );
}

function behindReason(pr: PullRequest): Reason | null {
  if (pr.mergeStateStatus !== 'BEHIND') return null;
  return reason('behind', 'Behind base branch');
}

function optionalChecksReason(pr: PullRequest): Reason | null {
  if (pr.mergeStateStatus !== 'UNSTABLE') return null;
  const names = failingCheckNames(pr);
  if (names.length > 0) {
    return reason(
      'optional-checks-failing',
      `Optional checks failing · ${names.join(', ')}`,
    );
  }
  if (isCiRunning(pr)) return null;
  return reason('optional-checks-failing', 'Optional checks failing');
}

function ciRunningReason(pr: PullRequest): Reason | null {
  const pending = pendingCheckCount(pr);
  const total = pr.checks.length;
  if (pending > 0) {
    return reason(
      'checks-pending',
      `CI running · ${total - pending} of ${total}`,
    );
  }
  if (pr.ci === 'running') return reason('checks-pending', 'CI running');
  return null;
}

function inQueueReason(
  _pr: PullRequest,
  { queue }: ClassifyContext,
): Reason | null {
  if (queue?.kind !== 'queued') return null;
  return reason('in-queue', `In ${QUEUE_NAMES[queue.tool]} queue`);
}

function removedFromQueueReason(
  _pr: PullRequest,
  { queue }: ClassifyContext,
): Reason | null {
  if (queue?.kind !== 'removed') return null;
  return reason(
    'removed-from-queue',
    `Removed from ${QUEUE_NAMES[queue.tool]} queue`,
  );
}

function draftReason(pr: PullRequest): Reason | null {
  if (!pr.isDraft) return null;
  return reason('draft', 'Draft');
}

function blockedReason(pr: PullRequest): Reason | null {
  if (pr.mergeStateStatus !== 'BLOCKED') return null;
  if (pr.reviewDecision === 'REVIEW_REQUIRED') {
    return reason('waiting-on-review', 'Waiting on required review');
  }
  return reason('blocked-by-rules', 'Blocked by branch rules');
}

function mergeabilityReason(
  pr: PullRequest,
  { unknownMergeStreak }: ClassifyContext,
): Reason | null {
  if (pr.mergeStateStatus !== 'UNKNOWN') return null;
  if (unknownMergeStreak > MAX_SYNCS_CHECKING_MERGEABILITY) {
    return reason('mergeability-unknown', 'Mergeability unknown');
  }
  return reason('checking-mergeability', 'Checking mergeability…');
}

function needsAnswerReason(
  _pr: PullRequest,
  { needsAnswer }: ClassifyContext,
): Reason | null {
  return needsAnswer ? reason('needs-answer', 'Korev needs your answer') : null;
}

const NEEDS_YOU_RULES: readonly ReasonRule[] = [
  needsAnswerReason,
  checksFailingReason,
  changesRequestedReason,
  conflictsReason,
  unresolvedThreadsReason,
  behindReason,
  optionalChecksReason,
  removedFromQueueReason,
];

const IN_PROGRESS_RULES: readonly ReasonRule[] = [
  inQueueReason,
  ciRunningReason,
  draftReason,
  blockedReason,
  mergeabilityReason,
];

function isReason(candidate: Reason | null): candidate is Reason {
  return candidate !== null;
}

function collectReasons(
  pr: PullRequest,
  context: ClassifyContext,
  rules: readonly ReasonRule[],
): Reason[] {
  return rules
    .map((rule) => rule(pr, context))
    .filter(isReason)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function isReadyToMerge(pr: PullRequest): boolean {
  return (
    READY_MERGE_STATES.has(pr.mergeStateStatus) &&
    !pr.isDraft &&
    pr.unresolvedThreads === 0
  );
}

function staleDays(item: MyPr, { now }: ClassifyContext): number | null {
  if (!now || item.bucket === 'ready' || item.queue?.kind === 'queued') {
    return null;
  }
  const days = daysSince(item.pr.lastActivityAt, now);
  return days > STALE_AFTER_DAYS ? days : null;
}

function withStaleness(item: MyPr, context: ClassifyContext): MyPr {
  if (context.needsAnswer) return item;
  const days = staleDays(item, context);
  if (days === null || !context.now) return item;
  const { keptAt } = context;
  if (keptAt && isKeepActive(keptAt, item.pr.lastActivityAt, context.now)) {
    return { ...item, bucket: 'kept', keptUntil: keepEndsAt(keptAt) };
  }
  const stale = reason('stale', `No activity for ${days}d`);
  return { ...item, bucket: 'stale', reasons: [stale, ...item.reasons] };
}

export function classifyMyPr(
  pr: PullRequest,
  context: ClassifyContext = FIRST_SIGHTING,
): MyPr {
  const item = classifyByState(pr, context);
  if (context.korevWorking && !context.needsAnswer) {
    return { ...item, bucket: 'korev-working' };
  }
  return withStaleness(item, context);
}

function classifyByState(pr: PullRequest, context: ClassifyContext): MyPr {
  const needsYou = collectReasons(pr, context, NEEDS_YOU_RULES);
  const queue = context.queue ?? null;
  if (needsYou.length > 0) {
    return { pr, bucket: 'needs-you', reasons: needsYou, queue };
  }
  const inProgress = collectReasons(pr, context, IN_PROGRESS_RULES);
  if (inProgress.length === 0 && isReadyToMerge(pr)) {
    return {
      pr,
      bucket: 'ready',
      reasons: [reason('ready-to-merge', 'Ready to merge')],
      queue,
    };
  }
  return { pr, bucket: 'in-progress', reasons: inProgress, queue };
}
