export const CANCEL_SLIDE = 100;
export const LOCK_SLIDE = 80;
export const MIN_HOLD_MS = 500;

export type SlideAction = 'cancel' | 'lock' | null;
export type ReleaseAction = 'hint' | 'done';

export function slideAction(dx: number, dy: number): SlideAction {
  if (dx <= -CANCEL_SLIDE) return 'cancel';
  if (dy <= -LOCK_SLIDE) return 'lock';
  return null;
}

export function releaseAction(heldMs: number): ReleaseAction {
  return heldMs < MIN_HOLD_MS ? 'hint' : 'done';
}
