import type { WindowBounds } from '../shared/model';

export type Area = WindowBounds;

const MIN_VISIBLE_PIXELS = 100;

function overlap(
  start: number,
  length: number,
  areaStart: number,
  areaLength: number,
) {
  return (
    Math.min(start + length, areaStart + areaLength) -
    Math.max(start, areaStart)
  );
}

function isMostlyInside(bounds: WindowBounds, area: Area): boolean {
  return (
    overlap(bounds.x, bounds.width, area.x, area.width) >= MIN_VISIBLE_PIXELS &&
    overlap(bounds.y, bounds.height, area.y, area.height) >= MIN_VISIBLE_PIXELS
  );
}

export function restorableBounds(
  saved: WindowBounds | null,
  workAreas: Area[],
): WindowBounds | null {
  if (!saved) return null;
  return workAreas.some((area) => isMostlyInside(saved, area)) ? saved : null;
}
