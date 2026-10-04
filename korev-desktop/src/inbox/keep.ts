import { prRef } from '../shared/pr-ref';
import type { PullRequest } from '../shared/pull-request';

const MS_PER_DAY = 86_400_000;
export const STALE_AFTER_DAYS = 14;
export const KEEP_DAYS = 30;

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(iso)) / MS_PER_DAY);
}

export function keepEndsAt(keptAt: string): string {
  return new Date(Date.parse(keptAt) + KEEP_DAYS * MS_PER_DAY).toISOString();
}

export function isKeepActive(
  keptAt: string,
  lastActivityAt: string,
  now: Date,
): boolean {
  return (
    Date.parse(lastActivityAt) <= Date.parse(keptAt) &&
    Date.parse(keepEndsAt(keptAt)) > now.getTime()
  );
}

export function liveKeeps(
  keptPrs: Record<string, string>,
  openPrs: PullRequest[],
  now: Date,
): Record<string, string> {
  const activityByRef = new Map(
    openPrs.map((pr) => [prRef(pr), pr.lastActivityAt]),
  );
  return Object.fromEntries(
    Object.entries(keptPrs).filter(([ref, keptAt]) => {
      const lastActivityAt = activityByRef.get(ref);
      return (
        lastActivityAt !== undefined &&
        isKeepActive(keptAt, lastActivityAt, now)
      );
    }),
  );
}
