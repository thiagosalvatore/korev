import type { MyPr } from '../../shared/inbox';
import type { PrActionState } from '../../shared/merge';
import { isKeptMergeable } from '../../shared/agent-tasks';
import { formatAge, joinMeta } from '../format';
import { useSettings } from '../useSettings';
import { NARROW_HIDDEN } from '../layout';
import { MINUTE_MS, useNow } from '../useNow';
import { AgentTaskChip, hasChip, useAgentTask } from '../ai/agent-task-state';
import { ActionChip, settledLabel, usePrAction } from './action-state';
import { CiIcon } from './CiIcon';
import { LAYER_GRID, MINE_GRID } from './grid';
import { LayerLabel, PrRow, PrSummary, prRef, type StackPlace } from './PrRow';
import { ReasonChips } from './ReasonChips';

export interface MyPrRowProps {
  item: MyPr;
  stackPlace?: StackPlace;
}

function RowStatus({
  item,
  action,
}: {
  item: MyPr;
  action: PrActionState | null;
}) {
  const task = useAgentTask(prRef(item.pr));
  if (action) {
    return (
      <span className="flex justify-end">
        <ActionChip state={action} />
      </span>
    );
  }
  if (hasChip(task)) {
    return (
      <span className="flex justify-end">
        <AgentTaskChip state={task} />
      </span>
    );
  }
  return <ReasonChips reasons={item.reasons} />;
}

const MS_PER_DAY = 86_400_000;
const KEEP_MERGEABLE_NOTE = 'Keep mergeable';

export function daysLeft(until: string, now: number): number {
  return Math.max(0, Math.round((Date.parse(until) - now) / MS_PER_DAY));
}

function rowNote(item: MyPr, now: number): string | null {
  if (item.keptUntil) return `Kept · ${daysLeft(item.keptUntil, now)}d left`;
  if (item.bucket === 'stale') return null;
  return `updated ${formatAge(item.pr.updatedAt, now)}`;
}

function useKeepMergeableNote(item: MyPr): string | null {
  const settings = useSettings();
  if (!settings) return null;
  const on = isKeptMergeable(settings.aiTasks.keepMergeable, prRef(item.pr));
  return on ? KEEP_MERGEABLE_NOTE : null;
}

export function MyPrRow({ item, stackPlace }: MyPrRowProps) {
  const now = useNow(MINUTE_MS);
  const { pr } = item;
  const action = usePrAction(prRef(pr));
  const settled = settledLabel(action);
  const keepMergeable = useKeepMergeableNote(item);
  const note =
    settled ?? (joinMeta([rowNote(item, now), keepMergeable]) || null);
  return (
    <PrRow
      optionKey={prRef(pr)}
      url={pr.url}
      className={stackPlace ? LAYER_GRID : MINE_GRID}
    >
      {stackPlace ? <LayerLabel {...stackPlace} /> : null}
      <CiIcon state={pr.ci} checks={pr.checks} />
      <PrSummary
        title={pr.title}
        repo={stackPlace ? undefined : pr.repo}
        muted={settled !== null}
        meta={
          <>
            <span className="font-mono">#{pr.number}</span>
            {note ? <span className={NARROW_HIDDEN}> · {note}</span> : null}
          </>
        }
      />
      <RowStatus item={item} action={settled ? null : action} />
    </PrRow>
  );
}
