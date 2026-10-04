import type { MyPr } from '../../shared/inbox';
import type { PrActionState } from '../../shared/merge';
import { formatAge } from '../format';
import { NARROW_HIDDEN } from '../layout';
import { MINUTE_MS, useNow } from '../useNow';
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
  if (!action) return <ReasonChips reasons={item.reasons} />;
  return (
    <span className="flex justify-end">
      <ActionChip state={action} />
    </span>
  );
}

export function MyPrRow({ item, stackPlace }: MyPrRowProps) {
  const now = useNow(MINUTE_MS);
  const { pr } = item;
  const action = usePrAction(prRef(pr));
  const settled = settledLabel(action);
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
            <span className={NARROW_HIDDEN}>
              {settled
                ? ` · ${settled}`
                : ` · updated ${formatAge(pr.updatedAt, now)}`}
            </span>
          </>
        }
      />
      <RowStatus item={item} action={settled ? null : action} />
    </PrRow>
  );
}
