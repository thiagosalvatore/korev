import type { IssueSummary, PullRequestSummary } from '../shared/model';
import type { CommandRunner } from './command-runner';

const GH_TIMEOUT_MS = 30_000;
const LIST_LIMIT = '50';

type JsonRecord = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function ghJson(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
  args: string[],
): Promise<JsonRecord[]> {
  try {
    const result = await run('gh', args, {
      cwd,
      env,
      timeoutMs: GH_TIMEOUT_MS,
    });
    if (result.exitCode !== 0) return [];
    const parsed: unknown = JSON.parse(result.stdout);
    return Array.isArray(parsed) ? (parsed as JsonRecord[]) : [];
  } catch {
    return [];
  }
}

export function parsePullRequests(rows: JsonRecord[]): PullRequestSummary[] {
  return rows.flatMap((row) =>
    typeof row.number === 'number'
      ? [
          {
            number: row.number,
            title: str(row.title),
            headRefName: str(row.headRefName),
            baseRefName: str(row.baseRefName),
            author: str((row.author as JsonRecord | undefined)?.login),
            isDraft: row.isDraft === true,
          },
        ]
      : [],
  );
}

export async function listPullRequests(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<PullRequestSummary[]> {
  const rows = await ghJson(run, env, cwd, [
    'pr',
    'list',
    '--limit',
    LIST_LIMIT,
    '--json',
    'number,title,headRefName,baseRefName,author,isDraft',
  ]);
  return parsePullRequests(rows);
}

export async function listIssues(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<IssueSummary[]> {
  const rows = await ghJson(run, env, cwd, [
    'issue',
    'list',
    '--limit',
    LIST_LIMIT,
    '--json',
    'number,title,body,url',
  ]);
  return rows.flatMap((row) =>
    typeof row.number === 'number'
      ? [
          {
            number: row.number,
            title: str(row.title),
            body: str(row.body),
            url: str(row.url),
          },
        ]
      : [],
  );
}
