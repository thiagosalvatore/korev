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
const THREADS_LIMIT = 100;
const REVIEWS_LIMIT = 100;
const APPROVED = 'APPROVED';
const INBOX_FAILED =
  'Korev could not reach GitHub. Check that `gh` is installed and signed in.';
const OPEN_PRS = 'is:pr is:open archived:false';
const INBOX_SEARCHES: Record<string, { filter: string; reason: InboxReason }> =
  {
    review: { filter: 'review-requested:@me', reason: 'review-requested' },
    mine: { filter: 'author:@me', reason: 'authored' },
  };
const INBOX_FRAGMENT = `fragment inboxPr on PullRequest {
  number title url isDraft createdAt updatedAt headRefName baseRefName reviewDecision mergeable
  author { login }
  reviewThreads(first: ${THREADS_LIMIT}) { nodes { isResolved } }
  latestOpinionatedReviews(first: ${REVIEWS_LIMIT}) { nodes { state } }
  viewerLatestReviewRequest { asCodeOwner }
  repository { url }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
}`;

function inboxQuery(alias: string, filter: string): string {
  return `query {
  ${alias}: search(query: "${OPEN_PRS} ${filter}", type: ISSUE, first: ${INBOX_LIMIT}) { nodes { ...inboxPr } }
}
${INBOX_FRAGMENT}`;
}

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
  createdAt?: string;
  updatedAt?: string;
  headRefName?: string;
  baseRefName?: string;
  reviewDecision?: InboxPullRequest['reviewDecision'];
  mergeable?: InboxPullRequest['mergeable'];
  author?: { login?: string } | null;
  repository?: { url?: string };
  reviewThreads?: { nodes?: { isResolved?: boolean }[] };
  latestOpinionatedReviews?: { nodes?: { state?: string }[] };
  viewerLatestReviewRequest?: { asCodeOwner?: boolean } | null;
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
    createdAt: str(pr.createdAt),
    updatedAt: str(pr.updatedAt),
    reviewDecision: pr.reviewDecision ?? null,
    mergeable: pr.mergeable ?? 'UNKNOWN',
    checks: rollupCheckState(
      pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state,
    ),
    unresolvedThreads: (pr.reviewThreads?.nodes ?? []).filter(
      (thread) => thread.isResolved === false,
    ).length,
    hasApproval: (pr.latestOpinionatedReviews?.nodes ?? []).some(
      (review) => review.state === APPROVED,
    ),
    requestedAsCodeOwner: pr.viewerLatestReviewRequest?.asCodeOwner === true,
  };
}

function readInboxResponse(json: string): InboxResponse {
  try {
    return JSON.parse(json) as InboxResponse;
  } catch {
    return {};
  }
}

export function parseInbox(
  responses: string[],
  repoIdsByUrl: Map<string, string>,
): InboxPullRequest[] {
  const data = Object.assign(
    {},
    ...responses.map((json) => readInboxResponse(json).data),
  ) as NonNullable<InboxResponse['data']>;
  return Object.entries(INBOX_SEARCHES)
    .flatMap(([alias, { reason }]) =>
      (data[alias]?.nodes ?? []).flatMap((pr) => {
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
    const results = await Promise.all(
      Object.entries(INBOX_SEARCHES).map(([alias, { filter }]) =>
        run(
          'gh',
          ['api', 'graphql', '-f', `query=${inboxQuery(alias, filter)}`],
          {
            cwd,
            env,
            timeoutMs: GH_TIMEOUT_MS,
          },
        ),
      ),
    );
    const failed = results.find((result) => result.exitCode !== 0);
    if (failed)
      return { ok: false, message: failed.stderr.trim() || INBOX_FAILED };
    return {
      ok: true,
      value: parseInbox(
        results.map((result) => result.stdout),
        repoIdsByUrl,
      ),
    };
  } catch {
    return { ok: false, message: INBOX_FAILED };
  }
}
