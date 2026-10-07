import type {
  FileChange,
  SearchMatch,
  SearchOptions,
  TurnRange,
} from '../shared/model';
import { parseNameStatus, parseNumstat, type Git } from './git';

const SEARCH_RESULT_LIMIT = 500;
const SEARCH_LINE_MAX_CHARS = 300;
const GREP_LINE = /^(.+?)\0(\d+)\0(\d+)\0(.*)$/;

export async function rangeFiles(
  git: Git,
  worktree: string,
  range: TurnRange,
): Promise<FileChange[]> {
  const [numstat, nameStatus] = await Promise.all([
    git.run(worktree, ['diff', '--numstat', '-M', range.from, range.to]),
    git.run(worktree, ['diff', '--name-status', '-M', range.from, range.to]),
  ]);
  const stats = parseNumstat(numstat);
  return [...parseNameStatus(nameStatus)].map(([path, status]) => ({
    path,
    status,
    additions: stats.get(path)?.additions ?? 0,
    deletions: stats.get(path)?.deletions ?? 0,
  }));
}

export function rangeFileDiff(
  git: Git,
  worktree: string,
  range: TurnRange,
  file: string,
): Promise<string> {
  return git.run(worktree, ['diff', '-M', range.from, range.to, '--', file]);
}

function grepArgs(query: string, options: SearchOptions): string[] {
  return [
    'grep',
    '-n',
    '--column',
    '-z',
    '-I',
    '--untracked',
    '--exclude-standard',
    ...(options.caseSensitive ? [] : ['-i']),
    ...(options.wholeWord ? ['-w'] : []),
    options.regex ? '-E' : '-F',
    '-e',
    query,
  ];
}

export function parseGrepOutput(output: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  for (const line of output.split('\n')) {
    const parsed = GREP_LINE.exec(line);
    if (!parsed) continue;
    matches.push({
      file: parsed[1],
      line: Number(parsed[2]),
      column: Number(parsed[3]),
      text: parsed[4].slice(0, SEARCH_LINE_MAX_CHARS),
    });
    if (matches.length >= SEARCH_RESULT_LIMIT) break;
  }
  return matches;
}

export async function searchFiles(
  git: Git,
  worktree: string,
  query: string,
  options: SearchOptions,
): Promise<SearchMatch[]> {
  if (!query.trim()) return [];
  return parseGrepOutput(await git.stdout(worktree, grepArgs(query, options)));
}
