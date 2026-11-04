import type {
  InboxPullRequest,
  InboxReason,
  IssueSummary,
  PullRequestSummary,
  Result,
} from '../shared/model';
import type { CommandRunner } from './command-runner';
import { rollupCheckState } from './pull-requests';

const GH_TIMEOUT_MS = 30_000;
const LIST_LIMIT = '50';
const INBOX_LIMIT = 100;
const INBOX_FAILED =
  'Korev could not reach GitHub. Check that `gh` is installed and signed in.';
const OPEN_PRS = 'is:pr is:open archived:false';
const INBOX_SEARCHES: Record<string, InboxReason> = {
  review: 'review-requested',
  mine: 'authored',
};
const INBOX_QUERY = `query {
  review: search(query: "${OPEN_PRS} review-requested:@me", type: ISSUE, first: ${INBOX_LIMIT}) { nodes { ...inboxPr } }
  mine: search(query: "${OPEN_PRS} author:@me", type: ISSUE, first: ${INBOX_LIMIT}) { nodes { ...inboxPr } }
}
fragment inboxPr on PullRequest {
  number title url isDraft updatedAt headRefName baseRefName reviewDecision mergeable
  author { login }
  repository { url }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
}`;

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

function searchArgs(query: string): string[] {
  const trimmed = query.trim();
  return trimmed ? ['--search', trimmed] : [];
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
  query = '',
): Promise<PullRequestSummary[]> {
  const rows = await ghJson(run, env, cwd, [
    'pr',
    'list',
    '--limit',
    LIST_LIMIT,
    ...searchArgs(query),
    '--json',
    'number,title,headRefName,baseRefName,author,isDraft',
  ]);
  return parsePullRequests(rows);
}

export async function listIssues(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
  query = '',
): Promise<IssueSummary[]> {
  const rows = await ghJson(run, env, cwd, [
    'issue',
    'list',
    '--limit',
    LIST_LIMIT,
    ...searchArgs(query),
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

interface SearchedPr {
  number?: number;
  title?: string;
  url?: string;
  isDraft?: boolean;
  updatedAt?: string;
  headRefName?: string;
  baseRefName?: string;
  reviewDecision?: InboxPullRequest['reviewDecision'];
  mergeable?: InboxPullRequest['mergeable'];
  author?: { login?: string } | null;
  repository?: { url?: string };
  commits?: {
    nodes?: { commit?: { statusCheckRollup?: { state?: string } | null } }[];
  };
}

type InboxResponse = {
  data?: Record<string, { nodes?: SearchedPr[] } | undefined>;
};

function toInboxPr(
  pr: SearchedPr,
  reason: InboxReason,
  repoId: string,
): InboxPullRequest {
  return {
    repoId,
    reason,
    number: pr.number ?? 0,
    title: str(pr.title),
    url: str(pr.url),
    author: str(pr.author?.login),
    isDraft: pr.isDraft === true,
    headRefName: str(pr.headRefName),
    baseRefName: str(pr.baseRefName),
    updatedAt: str(pr.updatedAt),
    reviewDecision: pr.reviewDecision ?? null,
    mergeable: pr.mergeable ?? 'UNKNOWN',
    checks: rollupCheckState(
      pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state,
    ),
  };
}

export function parseInbox(
  json: string,
  repoIdsByUrl: Map<string, string>,
): InboxPullRequest[] {
  let response: InboxResponse;
  try {
    response = JSON.parse(json) as InboxResponse;
  } catch {
    return [];
  }
  return Object.entries(INBOX_SEARCHES)
    .flatMap(([alias, reason]) =>
      (response.data?.[alias]?.nodes ?? []).flatMap((pr) => {
        const repoId = repoIdsByUrl.get(str(pr.repository?.url).toLowerCase());
        return repoId && typeof pr.number === 'number'
          ? [toInboxPr(pr, reason, repoId)]
          : [];
      }),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listInbox(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
  repoIdsByUrl: Map<string, string>,
): Promise<Result<InboxPullRequest[]>> {
  try {
    const result = await run(
      'gh',
      ['api', 'graphql', '-f', `query=${INBOX_QUERY}`],
      { cwd, env, timeoutMs: GH_TIMEOUT_MS },
    );
    if (result.exitCode !== 0)
      return { ok: false, message: result.stderr.trim() || INBOX_FAILED };
    return { ok: true, value: parseInbox(result.stdout, repoIdsByUrl) };
  } catch {
    return { ok: false, message: INBOX_FAILED };
  }
}
