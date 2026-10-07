import { fileName } from './format';

const DEFAULT_LIMIT = 8;
const NAME_PREFIX_BONUS = -1000;

export function fuzzyRank(
  query: string,
  candidates: string[],
  limit = DEFAULT_LIMIT,
): string[] {
  const needle = query.toLowerCase();
  const scored: [number, string][] = [];
  for (const candidate of candidates) {
    const haystack = candidate.toLowerCase();
    let position = 0;
    let gaps = 0;
    for (const char of needle) {
      const found = haystack.indexOf(char, position);
      if (found === -1) {
        position = -1;
        break;
      }
      gaps += found - position;
      position = found + 1;
    }
    if (position === -1) continue;
    const nameBonus = fileName(haystack).startsWith(needle)
      ? NAME_PREFIX_BONUS
      : 0;
    scored.push([nameBonus + gaps * 2 + candidate.length, candidate]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, candidate]) => candidate);
}
