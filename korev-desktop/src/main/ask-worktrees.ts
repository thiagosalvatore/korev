import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Repo } from '../shared/model';
import {
  addDetachedWorktree,
  checkoutDetached,
  slugify,
  startPoint,
  type Git,
} from './git';

const ASK_WORKTREE_DIR = '.ask';

export function askWorktreePath(workspacesRoot: string, repo: Repo): string {
  return path.join(
    workspacesRoot,
    slugify(repo.name) || repo.id,
    ASK_WORKTREE_DIR,
  );
}

export function askScratchPath(workspacesRoot: string): string {
  return path.join(workspacesRoot, ASK_WORKTREE_DIR);
}

export async function prepareAskWorktree(
  git: Git,
  workspacesRoot: string,
  repo: Repo,
  inUse: boolean,
): Promise<string> {
  const worktree = askWorktreePath(workspacesRoot, repo);
  const exists = existsSync(worktree);
  if (exists && inUse) return worktree;
  const from = await startPoint(git, repo.path, repo.defaultBranch);
  if (exists) await checkoutDetached(git, worktree, from);
  else await addDetachedWorktree(git, repo.path, worktree, from);
  return worktree;
}
