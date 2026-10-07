import {
  mergeScope,
  type CheckState,
  type PrCheck,
  type PrStack,
  type PrStatus,
  type ReviewComment,
} from '../shared/model';
import type { CommandRunner } from './command-runner';

const GH_TIMEOUT_MS = 60_000;
const PR_FIELDS =
  'number,url,title,state,isDraft,mergeable,mergedAt,reviewDecision,statusCheckRollup,headRefName,baseRefName,createdAt';
const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g;
const COMPLETED = 'COMPLETED';
const PASSING = new Set(['SUCCESS', 'NEUTRAL']);
const SKIPPED = new Set(['SKIPPED', 'CANCELLED', 'STALE']);
const FAILED_STATUS_STATES = new Set(['FAILURE', 'ERROR']);
const RUNNING_STATUS_STATES = new Set(['PENDING', 'EXPECTED']);
const BLOCKING_REVIEW_DECISIONS = new Set([
  'CHANGES_REQUESTED',
  'REVIEW_REQUIRED',
]);
const MAX_STACK_SIZE = 100;
const STACK_QUERY = `query($url: URI!) {
  resource(url: $url) {
    ... on PullRequest {
      stackEntry { position }
      stack {
        entries(first: ${MAX_STACK_SIZE}) {
          nodes {
            position
            pullRequest {
              number url state isDraft mergeable reviewDecision
              commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
            }
          }
        }
      }
    }
  }
}`;

type JsonRecord = Record<string, unknown>;

interface StackPullRequest {
  number: number;
  url: string;
  state: string;
  isDraft?: boolean;
  mergeable?: string;
  reviewDecision?: string | null;
  commits?: {
    nodes: { commit: { statusCheckRollup: { state: string } | null } }[];
  };
}

interface StackEntry {
  position: number;
  pullRequest: StackPullRequest | null;
}

interface StackResponse {
  data?: {
    resource?: {
      stackEntry?: { position: number } | null;
      stack?: { entries: { nodes: StackEntry[] } } | null;
    } | null;
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function checkRunState(check: JsonRecord): CheckState {
  if (check.status !== COMPLETED) return 'pending';
  const conclusion = str(check.conclusion);
  if (PASSING.has(conclusion)) return 'success';
  if (SKIPPED.has(conclusion)) return 'skipped';
  return 'failure';
}

function statusContextState(check: JsonRecord): CheckState {
  const state = str(check.state);
  if (state === 'SUCCESS') return 'success';
  if (FAILED_STATUS_STATES.has(state)) return 'failure';
  return 'pending';
}

function toCheck(check: JsonRecord): PrCheck {
  const isStatusContext = check.__typename === 'StatusContext';
  return {
    name: str(isStatusContext ? check.context : check.name),
    state: isStatusContext ? statusContextState(check) : checkRunState(check),
    url: str(isStatusContext ? check.targetUrl : check.detailsUrl) || null,
  };
}

export function parsePrStatus(json: string): PrStatus | null {
  let raw: JsonRecord;
  try {
    raw = JSON.parse(json) as JsonRecord;
  } catch {
    return null;
  }
  if (typeof raw.number !== 'number') return null;
  const rollup = Array.isArray(raw.statusCheckRollup)
    ? (raw.statusCheckRollup as JsonRecord[])
    : [];
  return {
    number: raw.number,
    url: str(raw.url),
    title: str(raw.title),
    state: str(raw.state) as PrStatus['state'],
    isDraft: raw.isDraft === true,
    mergeable: (str(raw.mergeable) || 'UNKNOWN') as PrStatus['mergeable'],
    reviewDecision: (str(raw.reviewDecision) ||
      null) as PrStatus['reviewDecision'],
    mergedAt: str(raw.mergedAt) || null,
    headRefName: str(raw.headRefName),
    baseRefName: str(raw.baseRefName),
    createdAt: str(raw.createdAt),
    checks: rollup.map(toCheck),
    stack: null,
  };
}

export function parsePrStack(json: string): PrStack | null {
  let response: StackResponse;
  try {
    response = JSON.parse(json) as StackResponse;
  } catch {
    return null;
  }
  const resource = response.data?.resource;
  const position = resource?.stackEntry?.position;
  if (typeof position !== 'number') return null;
  const open = (resource?.stack?.entries.nodes ?? []).filter(
    (entry) => entry.pullRequest?.state === 'OPEN',
  );
  const below = open.filter((entry) => entry.position < position);
  return {
    openBelow: below.length,
    openAbove: open.filter((entry) => entry.position > position).length,
    belowReady: below.every(
      ({ pullRequest }) => pullRequest && readyToMerge(pullRequest),
    ),
  };
}

function readyToMerge(pr: StackPullRequest): boolean {
  const checks = pr.commits?.nodes[0]?.commit.statusCheckRollup?.state ?? '';
  return (
    pr.mergeable !== 'CONFLICTING' &&
    !FAILED_STATUS_STATES.has(checks) &&
    !RUNNING_STATUS_STATES.has(checks) &&
    !pr.isDraft &&
    !BLOCKING_REVIEW_DECISIONS.has(pr.reviewDecision ?? '')
  );
}

async function fetchPrStack(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
  url: string,
): Promise<PrStack | null> {
  try {
    const result = await run(
      'gh',
      ['api', 'graphql', '-f', `query=${STACK_QUERY}`, '-f', `url=${url}`],
      { cwd, env, timeoutMs: GH_TIMEOUT_MS },
    );
    return result.exitCode === 0 ? parsePrStack(result.stdout) : null;
  } catch {
    return null;
  }
}

export function findPrUrls(text: string): string[] {
  return [...new Set(text.match(PR_URL))];
}

export async function fetchPrStatus(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
  ref: string,
): Promise<PrStatus | null> {
  try {
    const result = await run('gh', ['pr', 'view', ref, '--json', PR_FIELDS], {
      cwd,
      env,
      timeoutMs: GH_TIMEOUT_MS,
    });
    if (result.exitCode !== 0) return null;
    const status = parsePrStatus(result.stdout);
    if (status?.state !== 'OPEN') return status;
    return { ...status, stack: await fetchPrStack(run, env, cwd, status.url) };
  } catch {
    return null;
  }
}

function mergeArgs(pr: PrStatus): string[] {
  const number = String(pr.number);
  return mergeScope(pr) === 'pr'
    ? ['pr', 'merge', number, '--squash']
    : ['stack', 'merge', number, '--yes', '--squash'];
}

export async function mergePr(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
  pr: PrStatus,
): Promise<string | null> {
  const result = await run('gh', mergeArgs(pr), {
    cwd,
    env,
    timeoutMs: GH_TIMEOUT_MS,
  });
  return result.exitCode === 0 ? null : result.stderr.trim() || 'Merge failed';
}

export function createPrPrompt(baseBranch: string): string {
  return [
    'Create a pull request for the work in this workspace.',
    '1. Review the uncommitted changes and commit them with a clear message (do not commit files under .context/).',
    `2. Push the current branch to origin and open a PR against \`${baseBranch}\` with \`gh pr create\`.`,
    '3. Write a concise title and a description that explains what changed and why.',
    'Reply with the PR URL when done.',
  ].join('\n');
}

export function fixChecksPrompt(checks: PrCheck[]): string {
  const failing = checks
    .filter((check) => check.state === 'failure')
    .map((check) => `- ${check.name}${check.url ? ` (${check.url})` : ''}`);
  return [
    'These CI checks are failing on the pull request for this branch:',
    ...failing,
    'Use `gh` to read the failing logs, fix the cause, commit and push.',
  ].join('\n');
}

export function resolveConflictsPrompt(baseBranch: string): string {
  return `Resolve any existing merge conflicts with the remote branch (origin/${baseBranch}). Then, commit and push your changes.`;
}

export function onPrBranch(prompt: string, pr: PrStatus, branch: string) {
  if (!pr.headRefName || pr.headRefName === branch) return prompt;
  return `${prompt}\nThis is about pull request #${pr.number} (${pr.url}) on branch ${pr.headRefName}, not the current branch.`;
}

export const REVIEW_PROMPT =
  'Review the changes on this branch compared to its target branch (committed and uncommitted). Look for bugs, missing tests and unclear code. List concrete findings with file and line, most severe first. Do not edit files.';

export function parseReviewComments(json: string): ReviewComment[] {
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return (rows as JsonRecord[]).flatMap((row) =>
    typeof row.id === 'number'
      ? [
          {
            id: row.id,
            path: str(row.path),
            line: typeof row.line === 'number' ? row.line : null,
            body: str(row.body),
            author: str((row.user as JsonRecord | undefined)?.login),
            url: str(row.html_url),
          },
        ]
      : [],
  );
}

export async function fetchReviewComments(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
  number: number,
): Promise<ReviewComment[]> {
  try {
    const result = await run(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/pulls/${number}/comments`,
        '--paginate',
        '--jq',
        '.',
      ],
      { cwd, env, timeoutMs: GH_TIMEOUT_MS },
    );
    return result.exitCode === 0 ? parseReviewComments(result.stdout) : [];
  } catch {
    return [];
  }
}
