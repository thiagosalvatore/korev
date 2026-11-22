import {
  failingRequiredChecks,
  MERGE_STEPS,
  nextPrStep,
  PR_BADGE_LABELS,
  prBadge,
  type PrStatus,
  type PrStep,
} from '../../../korev-desktop/src/shared/model';

export type ChatStatusKind = 'working' | 'waiting' | 'ready' | 'done' | 'alert';

export interface ChatStatus {
  kind: ChatStatusKind;
  label: string;
}

const STEP_STATUS: Partial<Record<PrStep, ChatStatus>> = {
  archive: { kind: 'done', label: 'Merged' },
  'fix-errors': { kind: 'alert', label: 'Checks failing' },
  'resolve-conflicts': { kind: 'alert', label: 'Has conflicts' },
};

const READY: ChatStatus = { kind: 'ready', label: 'Ready to merge' };

export function chatStatus({
  running,
  waiting,
  pr,
}: {
  running: boolean;
  waiting: boolean;
  pr: PrStatus | null;
}): ChatStatus | null {
  if (running) return { kind: 'working', label: 'Working' };
  if (waiting) return { kind: 'waiting', label: 'Needs your answer' };
  if (!pr) return null;
  const step = nextPrStep(pr);
  if (MERGE_STEPS.has(step)) return READY;
  return STEP_STATUS[step] ?? null;
}

const PASSED_STATES = new Set(['success', 'skipped']);

function checksSummary(pr: PrStatus): string {
  const failing = failingRequiredChecks(pr);
  if (failing.length === 1) return `${failing[0].name} failing`;
  if (failing.length > 1) return `${failing.length} checks failing`;
  if (
    pr.state === 'OPEN' &&
    pr.checks.length &&
    pr.checks.every((check) => PASSED_STATES.has(check.state))
  )
    return 'checks passed';
  return PR_BADGE_LABELS[prBadge(pr)].toLowerCase();
}

export function prCapsuleLabel(pr: PrStatus | null): string {
  if (!pr) return 'No PR yet';
  return `#${pr.number} · ${checksSummary(pr)}`;
}
