import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Repo, Result, Workspace } from '../shared/model';
import type { Git } from './git';

const SYNC_INTERVAL_MS = 1_500;
const SNAPSHOT_MESSAGE = 'korev spotlight';
const SPOTLIGHT_REF = 'refs/korev/spotlight';
const BLOCKING_STATES = [
  'MERGE_HEAD',
  'rebase-merge',
  'rebase-apply',
  'CHERRY_PICK_HEAD',
];

interface ActiveSpotlight {
  workspace: Workspace;
  repo: Repo;
  restoreTo: string;
  lastTree: string | null;
  timer: ReturnType<typeof setInterval>;
  syncing: boolean;
}

export interface Spotlight {
  enable(repo: Repo, workspace: Workspace): Promise<Result>;
  disable(repoId: string): Promise<Result>;
  disableForWorkspace(workspaceId: string): Promise<void>;
  active(): Record<string, string>;
  disableAll(): Promise<void>;
}

async function rootIsClean(git: Git, repo: Repo): Promise<string | null> {
  const gitDir = (
    await git.run(repo.path, ['rev-parse', '--absolute-git-dir'])
  ).trim();
  if (BLOCKING_STATES.some((marker) => existsSync(path.join(gitDir, marker)))) {
    return `${repo.name} has a merge or rebase in progress in its root checkout.`;
  }
  const dirty = await git.run(repo.path, [
    'status',
    '--porcelain',
    '--untracked-files=no',
  ]);
  if (dirty.trim()) {
    return `${repo.name} has uncommitted changes in its root checkout. Commit or stash them first.`;
  }
  return null;
}

async function currentRef(git: Git, dir: string): Promise<string> {
  const branch = (
    await git.tryRun(dir, ['symbolic-ref', '--short', '-q', 'HEAD'])
  )?.trim();
  return branch || (await git.run(dir, ['rev-parse', 'HEAD'])).trim();
}

async function trackedSnapshot(
  git: Git,
  worktree: string,
): Promise<{ tree: string; head: string }> {
  const head = (await git.run(worktree, ['rev-parse', 'HEAD'])).trim();
  const gitDir = (
    await git.run(worktree, ['rev-parse', '--absolute-git-dir'])
  ).trim();
  const env = { GIT_INDEX_FILE: path.join(gitDir, 'korev-spotlight-index') };
  await git.run(worktree, ['read-tree', head], env);
  await git.run(worktree, ['add', '-u'], env);
  return { tree: (await git.run(worktree, ['write-tree'], env)).trim(), head };
}

async function syncOnce(git: Git, spotlight: ActiveSpotlight): Promise<void> {
  const { tree, head } = await trackedSnapshot(git, spotlight.workspace.path);
  if (tree === spotlight.lastTree) return;
  const commit = (
    await git.run(spotlight.workspace.path, [
      'commit-tree',
      tree,
      '-p',
      head,
      '-m',
      SNAPSHOT_MESSAGE,
    ])
  ).trim();
  await git.run(spotlight.workspace.path, [
    'update-ref',
    SPOTLIGHT_REF,
    commit,
  ]);
  await git.run(spotlight.repo.path, [
    'checkout',
    '--quiet',
    '--detach',
    commit,
  ]);
  spotlight.lastTree = tree;
}

export function createSpotlight(
  git: Git,
  onChange: () => void,
  onError: (message: string) => void,
): Spotlight {
  const spotlights = new Map<string, ActiveSpotlight>();

  async function disable(repoId: string): Promise<Result> {
    const spotlight = spotlights.get(repoId);
    if (!spotlight) return { ok: true, value: undefined };
    clearInterval(spotlight.timer);
    spotlights.delete(repoId);
    onChange();
    try {
      await git.run(spotlight.repo.path, [
        'checkout',
        '--quiet',
        '--force',
        spotlight.restoreTo,
      ]);
    } catch (error) {
      return {
        ok: false,
        message: `Could not restore ${spotlight.repo.name}: ${(error as Error).message}`,
      };
    }
    return { ok: true, value: undefined };
  }

  async function tick(spotlight: ActiveSpotlight) {
    if (spotlight.syncing) return;
    spotlight.syncing = true;
    try {
      await syncOnce(git, spotlight);
    } catch (error) {
      await disable(spotlight.repo.id);
      onError(`Spotlight stopped: ${(error as Error).message}`);
    } finally {
      spotlight.syncing = false;
    }
  }

  return {
    async enable(repo, workspace) {
      await disable(repo.id);
      const problem = await rootIsClean(git, repo);
      if (problem) return { ok: false, message: problem };
      const spotlight: ActiveSpotlight = {
        workspace,
        repo,
        restoreTo: await currentRef(git, repo.path),
        lastTree: null,
        syncing: false,
        timer: setInterval(() => void tick(spotlight), SYNC_INTERVAL_MS),
      };
      spotlights.set(repo.id, spotlight);
      onChange();
      await tick(spotlight);
      return spotlights.has(repo.id)
        ? { ok: true, value: undefined }
        : { ok: false, message: 'Spotlight could not start' };
    },
    disable,
    async disableForWorkspace(workspaceId) {
      for (const spotlight of [...spotlights.values()]) {
        if (spotlight.workspace.id === workspaceId)
          await disable(spotlight.repo.id);
      }
    },
    active: () =>
      Object.fromEntries(
        [...spotlights].map(([repoId, spotlight]) => [
          repoId,
          spotlight.workspace.id,
        ]),
      ),
    async disableAll() {
      for (const repoId of [...spotlights.keys()]) await disable(repoId);
    },
  };
}
