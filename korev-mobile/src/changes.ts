import type { TurnRange } from '../../korev-desktop/src/shared/model';

export type RangeParams = {
  from?: string;
  to?: string;
};

export function rangeParams(range: TurnRange | null): RangeParams {
  return range ? { from: range.from, to: range.to } : {};
}

export function rangeOf({ from, to }: RangeParams): TurnRange | null {
  return from && to ? { from, to } : null;
}
