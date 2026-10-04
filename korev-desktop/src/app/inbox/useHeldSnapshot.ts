import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InboxSnapshot } from '../../shared/inbox';
import { SECOND_MS } from '../useNow';
import type { ListModel } from './list-model';
import { changeCount, diffStructure } from './structure';

export const IDLE_APPLY_MS = 10 * SECOND_MS;

export interface HeldSnapshot {
  displayed: InboxSnapshot;
  pendingCount: number;
  apply: () => void;
}

export function useHeldSnapshot(
  incoming: InboxSnapshot,
  model: ListModel,
  holding: boolean,
  resetKey: string,
): HeldSnapshot {
  const [base, setBase] = useState(incoming);
  const [baseKey, setBaseKey] = useState(resetKey);
  if (baseKey !== resetKey) {
    setBaseKey(resetKey);
    setBase(incoming);
  }
  const mayHold = holding && !base.fromCache && baseKey === resetKey;
  if (!mayHold && base !== incoming) setBase(incoming);
  const structuralChanges = useMemo(
    () =>
      changeCount(
        diffStructure(model.placements(base), model.placements(incoming)),
      ),
    [model, base, incoming],
  );
  const pendingCount = mayHold ? structuralChanges : 0;
  const isHolding = pendingCount > 0;
  const displayed = useMemo(
    () => (isHolding ? model.refresh(base, incoming) : incoming),
    [model, isHolding, base, incoming],
  );
  const apply = useCallback(() => setBase(incoming), [incoming]);
  return { displayed, pendingCount, apply };
}

export function useIdleApply(active: boolean, apply: () => void): () => void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ active, apply });
  useEffect(() => {
    latest.current = { active, apply };
  });
  const restart = useCallback(() => {
    clearTimeout(timer.current);
    if (!latest.current.active) return;
    timer.current = setTimeout(() => latest.current.apply(), IDLE_APPLY_MS);
  }, []);
  useEffect(() => {
    restart();
    return () => clearTimeout(timer.current);
  }, [active, restart]);
  return restart;
}
