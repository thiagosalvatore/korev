import { Badge, Button } from '../../design-system';
import type { PrActionState, QueueStatus } from '../../shared/merge';
import { KEEP_DAYS } from '../../inbox/keep';
import { formatAge, joinMeta } from '../format';
import { TEXT_BUTTON } from '../layout';
import { MINUTE_MS, useNow } from '../useNow';
import { isBusy } from './action-state';
import { numberSpan } from './merge-plan';

export const MERGE_KEY = 'M';
export const CLOSE_KEY = 'X';
export const KEEP_KEY = 'K';
const LOCKED_HINT = 'Waiting for GitHub sync';
const OPEN_ON_GITHUB = 'Open on GitHub';

export interface KeepAction {
  kept: boolean;
  failed: boolean;
  onToggle: () => void;
}

export interface PanelActions {
  state: PrActionState | null;
  queue: QueueStatus | null;
  queueName: string;
  mergeLabel: string;
  ready: boolean;
  locked: boolean;
  onMerge: () => void;
  onClose: () => void;
  onCancelQueue: () => void;
  onOpenGithub: () => void;
  keep: KeepAction | null;
}

function lockedTitle(locked: boolean): string | undefined {
  return locked ? LOCKED_HINT : undefined;
}

export function KeepButton({ keep }: { keep: KeepAction }) {
  return (
    <Button size="sm" kbd={`⇧${KEEP_KEY}`} onClick={keep.onToggle}>
      {keep.kept ? 'Stop keeping' : `Keep for ${KEEP_DAYS} days`}
    </Button>
  );
}

export function KeepFailure({ keep }: { keep: KeepAction }) {
  return (
    <p className="m-0 text-xs text-danger-text">
      Couldn't save ·{' '}
      <button type="button" className={TEXT_BUTTON} onClick={keep.onToggle}>
        Retry
      </button>
    </p>
  );
}

function isQueued(actions: PanelActions): boolean {
  return actions.queue?.kind === 'queued';
}

export function footerOpensGithub(actions: PanelActions): boolean {
  return !isQueued(actions) && !actions.ready;
}

export function ActionFooter({
  actions,
  demoted = false,
}: {
  actions: PanelActions;
  demoted?: boolean;
}) {
  const primary = demoted ? 'secondary' : 'primary';
  const disabled = actions.locked || isBusy(actions.state);
  return (
    <div className="flex flex-wrap gap-2">
      {isQueued(actions) ? (
        <Button
          className="flex-1"
          disabled={disabled}
          title={lockedTitle(actions.locked)}
          onClick={actions.onCancelQueue}
        >
          Cancel
        </Button>
      ) : actions.ready ? (
        <Button
          variant={primary}
          className="flex-1"
          kbd={`⇧${MERGE_KEY}`}
          disabled={disabled}
          title={lockedTitle(actions.locked)}
          onClick={actions.onMerge}
        >
          {actions.mergeLabel}
        </Button>
      ) : (
        <Button
          variant={primary}
          className="flex-1"
          kbd={demoted ? undefined : '⌘↵'}
          onClick={actions.onOpenGithub}
        >
          {OPEN_ON_GITHUB}
        </Button>
      )}
      <Button
        variant="danger"
        kbd={`⇧${CLOSE_KEY}`}
        disabled={disabled}
        title={lockedTitle(actions.locked)}
        onClick={actions.onClose}
      >
        Close
      </Button>
    </div>
  );
}

function actionLine(state: PrActionState): string | null {
  switch (state.kind) {
    case 'merging':
      return `Merging ${numberSpan(state.numbers)}…`;
    case 'still-merging':
      return 'Still merging on GitHub. Korev updates on the next sync.';
    case 'merge-failed':
    case 'close-failed':
      return state.message;
    default:
      return null;
  }
}

function QueueLine({
  queue,
  queueName,
}: {
  queue: QueueStatus;
  queueName: string;
}) {
  const now = useNow(MINUTE_MS);
  if (queue.kind === 'removed') {
    return (
      <p className="m-0 text-sm text-warning-text">
        {joinMeta([`Removed from ${queueName} queue`, queue.reason])}
      </p>
    );
  }
  const source = queue.tool === 'github' ? null : 'from PR comments';
  const when = queue.at ? `${formatAge(queue.at, now)} ago` : null;
  const text = joinMeta([
    `Queued${queue.by ? ` by @${queue.by}` : ''}${when ? ` ${when}` : ''}`,
    source,
  ]);
  return (
    <p className="m-0 text-sm text-fg-2">
      {queue.url ? (
        <a href={queue.url} className="text-fg-2 underline">
          {text}
        </a>
      ) : (
        text
      )}
    </p>
  );
}

export function ActionStatus({ actions }: { actions: PanelActions }) {
  const line = actions.state ? actionLine(actions.state) : null;
  const failed =
    actions.state?.kind === 'merge-failed' ||
    actions.state?.kind === 'close-failed';
  if (!line && !actions.queue) return null;
  return (
    <section className="mt-4.5 flex flex-col gap-1.5">
      {failed ? (
        <span>
          <Badge tone="danger">
            {actions.state?.kind === 'merge-failed'
              ? 'Merge failed'
              : 'Close failed'}
          </Badge>
        </span>
      ) : null}
      {line ? (
        <p
          className={
            failed ? 'm-0 text-sm text-danger-text' : 'm-0 text-sm text-fg-2'
          }
        >
          {line}
        </p>
      ) : null}
      {actions.queue ? (
        <QueueLine queue={actions.queue} queueName={actions.queueName} />
      ) : null}
    </section>
  );
}
