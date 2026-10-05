import { FORK_WITHOUT_EDITS, canPushFixes } from '../../shared/agent-tasks';
import type { PullRequest } from '../../shared/pull-request';
import {
  GitError,
  type Checkout,
  type Checkouts,
  type PushTarget,
} from '../checkouts';
import { TaskError } from './engine';

export const FIX_TIMEOUT_MS = 30 * 60_000;
const CONFLICT_MARKER = 'conflict marker';

export interface FixDeps {
  checkouts: Checkouts;
  canPushWorkflows(): Promise<boolean>;
}

export function pushTarget(pr: PullRequest): PushTarget {
  return {
    headRefName: pr.headRefName,
    url: pr.isCrossRepository ? pr.headRepositoryUrl : null,
  };
}

export function openForFix(checkouts: Checkouts, pr: PullRequest) {
  if (!canPushFixes(pr)) throw new TaskError(FORK_WITHOUT_EDITS);
  return checkouts.open({
    repo: pr.repo,
    number: pr.number,
    baseRefName: pr.baseRefName,
  });
}

function workflowRefusal(files: string[]): TaskError {
  return new TaskError(
    `This change touches ${files.join(', ')}. Korev's GitHub sign-in can't push workflow files; push it from your terminal.`,
  );
}

export async function commitAndPush(
  deps: FixDeps,
  checkout: Checkout,
  pr: PullRequest,
  message: string,
): Promise<string[]> {
  await deps.checkouts.commitAll(checkout.path, message);
  const result = await deps.checkouts.push(
    checkout,
    pushTarget(pr),
    await deps.canPushWorkflows(),
  );
  if (result.kind === 'workflow-files') throw workflowRefusal(result.files);
  return result.kind === 'pushed' ? [result.sha] : [];
}

export async function leftoverMarkers(
  checkouts: Checkouts,
  path: string,
  files: string[],
): Promise<string[]> {
  if (files.length === 0) return [];
  await checkouts.git(path, ['add', '-A']);
  const check = await checkouts.tryGit(path, [
    'diff',
    '--cached',
    '--check',
    '--',
    ...files,
  ]);
  const marked = check.stdout
    .split('\n')
    .filter((line) => line.includes(CONFLICT_MARKER))
    .map((line) => line.split(':')[0]);
  return [...new Set(marked)];
}

export async function retryIfHeadMoved<T>(
  checkouts: Checkouts,
  pr: PullRequest,
  attempt: () => Promise<T>,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof GitError) || error.reason !== 'head-moved') {
      throw error;
    }
    await checkouts.remove(pr);
    return attempt();
  }
}
