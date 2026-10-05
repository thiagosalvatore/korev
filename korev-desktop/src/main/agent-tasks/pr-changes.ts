import type { PullRequest } from '../../shared/pull-request';
import type { Checkouts } from '../checkouts';

export const DIFF_LIMIT_CHARS = 150_000;
const DIFF_CUT_NOTE =
  '\n[Korev cut the diff here. Read the files for the rest.]';

export interface PrChanges {
  diffStat: string;
  diff: string;
}

function limitDiff(diff: string): string {
  if (diff.length <= DIFF_LIMIT_CHARS) return diff;
  return `${diff.slice(0, DIFF_LIMIT_CHARS)}${DIFF_CUT_NOTE}`;
}

export async function readPrChanges(
  checkouts: Checkouts,
  path: string,
  pr: PullRequest,
): Promise<PrChanges> {
  const range = `origin/${pr.baseRefName}...HEAD`;
  const [diffStat, diff] = await Promise.all([
    checkouts.git(path, ['diff', '--stat', range]),
    checkouts.git(path, ['diff', range]),
  ]);
  return { diffStat, diff: limitDiff(diff) };
}
