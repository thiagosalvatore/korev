import type { CheckState, PrCheck, PrStatus } from '../shared/model';
import type { CommandRunner } from './command-runner';

const GH_TIMEOUT_MS = 60_000;
const PR_FIELDS = 'number,url,title,state,isDraft,mergeable,statusCheckRollup';
const COMPLETED = 'COMPLETED';
const PASSING = new Set(['SUCCESS', 'NEUTRAL']);
const SKIPPED = new Set(['SKIPPED', 'CANCELLED', 'STALE']);
const FAILED_STATUS_STATES = new Set(['FAILURE', 'ERROR']);

type JsonRecord = Record<string, unknown>;

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
    checks: rollup.map(toCheck),
  };
}

export async function fetchPrStatus(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
  branch: string,
): Promise<PrStatus | null> {
  try {
    const result = await run(
      'gh',
      ['pr', 'view', branch, '--json', PR_FIELDS],
      {
        cwd,
        env,
        timeoutMs: GH_TIMEOUT_MS,
      },
    );
    return result.exitCode === 0 ? parsePrStatus(result.stdout) : null;
  } catch {
    return null;
  }
}

export async function mergePr(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  cwd: string,
  number: number,
): Promise<string | null> {
  const result = await run('gh', ['pr', 'merge', String(number), '--squash'], {
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
