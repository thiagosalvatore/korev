import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Checkpoint, FileChange, FileStatus } from '../shared/model';
import type { CommandRunner } from './command-runner';

const GIT_TIMEOUT_MS = 120_000;
const CLONE_TIMEOUT_MS = 15 * 60_000;
const CONTEXT_DIR = '.context';
const ORIGIN_HEAD_PREFIX = 'refs/remotes/origin/';
const FALLBACK_BRANCH = 'main';
const BINARY_STAT = '-';
const SNAPSHOT_MESSAGE = 'korev checkpoint';
const CHECKPOINT_REF_PREFIX = 'refs/korev/checkpoints/';

export class GitError extends Error {
  constructor(args: readonly string[], stderr: string) {
    super(stderr.trim() || `git ${args.join(' ')} failed`);
    this.name = 'GitError';
  }
}

export interface Git {
  run(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string>;
  tryRun(cwd: string, args: string[]): Promise<string | null>;
  stdout(cwd: string, args: string[]): Promise<string>;
}

export function createGit(run: CommandRunner, env: NodeJS.ProcessEnv): Git {
  async function exec(
    cwd: string,
    args: string[],
    extraEnv: NodeJS.ProcessEnv = {},
    timeoutMs = GIT_TIMEOUT_MS,
  ) {
    return run('git', args, { cwd, env: { ...env, ...extraEnv }, timeoutMs });
  }
  return {
    async run(cwd, args, extraEnv) {
      const result = await exec(cwd, args, extraEnv);
      if (result.exitCode !== 0) throw new GitError(args, result.stderr);
      return result.stdout;
    },
    async tryRun(cwd, args) {
      try {
        const result = await exec(cwd, args);
        return result.exitCode === 0 ? result.stdout : null;
      } catch {
        return null;
      }
    },
    async stdout(cwd, args) {
      return (await exec(cwd, args)).stdout;
    },
  };
}

export async function repoRoot(git: Git, dir: string): Promise<string | null> {
  const root = await git.tryRun(dir, ['rev-parse', '--show-toplevel']);
  return root?.trim() || null;
}

export async function defaultBranch(git: Git, repo: string): Promise<string> {
  const originHead = await git.tryRun(repo, [
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
  ]);
  if (originHead?.startsWith(ORIGIN_HEAD_PREFIX)) {
    return originHead.trim().slice(ORIGIN_HEAD_PREFIX.length);
  }
  const current = await git.tryRun(repo, ['branch', '--show-current']);
  return current?.trim() || FALLBACK_BRANCH;
}

export async function cloneRepo(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  url: string,
  destination: string,
): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const result = await run('git', ['clone', url, destination], {
    env,
    timeoutMs: CLONE_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) throw new GitError(['clone'], result.stderr);
}

async function hasRemoteBranch(git: Git, repo: string, branch: string) {
  const ref = `refs/remotes/origin/${branch}`;
  return (await git.tryRun(repo, ['rev-parse', '--verify', ref])) !== null;
}

export async function startPoint(git: Git, repo: string, base: string) {
  await git.tryRun(repo, ['fetch', 'origin', base]);
  return (await hasRemoteBranch(git, repo, base)) ? `origin/${base}` : base;
}

async function excludeContextDir(git: Git, worktree: string): Promise<void> {
  const commonDir = (
    await git.run(worktree, ['rev-parse', '--git-common-dir'])
  ).trim();
  const excludeFile = path.resolve(worktree, commonDir, 'info', 'exclude');
  const existing = await readFile(excludeFile, 'utf8').catch(() => '');
  const entry = `/${CONTEXT_DIR}/`;
  if (existing.split('\n').includes(entry)) return;
  await mkdir(path.dirname(excludeFile), { recursive: true });
  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  await appendFile(excludeFile, `${separator}${entry}\n`);
}

export async function addWorktree(
  git: Git,
  repo: string,
  worktree: string,
  branch: string,
  from: string,
): Promise<void> {
  await mkdir(path.dirname(worktree), { recursive: true });
  await git.run(repo, [
    'worktree',
    'add',
    '--no-track',
    '-b',
    branch,
    worktree,
    from,
  ]);
  await mkdir(path.join(worktree, CONTEXT_DIR), { recursive: true });
  await excludeContextDir(git, worktree);
}

export async function restoreWorktree(
  git: Git,
  repo: string,
  worktree: string,
  branch: string,
): Promise<void> {
  await git.tryRun(repo, ['worktree', 'prune']);
  await git.run(repo, ['worktree', 'add', worktree, branch]);
  await mkdir(path.join(worktree, CONTEXT_DIR), { recursive: true });
}

export async function removeWorktree(
  git: Git,
  repo: string,
  worktree: string,
): Promise<void> {
  await git.tryRun(repo, ['worktree', 'remove', '--force', worktree]);
  await git.tryRun(repo, ['worktree', 'prune']);
}

export async function branchExists(git: Git, repo: string, branch: string) {
  const ref = `refs/heads/${branch}`;
  return (await git.tryRun(repo, ['rev-parse', '--verify', ref])) !== null;
}

export async function currentBranch(git: Git, worktree: string) {
  return (await git.tryRun(worktree, ['branch', '--show-current']))?.trim();
}

async function mergeBase(git: Git, worktree: string, base: string) {
  for (const candidate of [`origin/${base}`, base]) {
    const sha = await git.tryRun(worktree, ['merge-base', 'HEAD', candidate]);
    if (sha?.trim()) return sha.trim();
  }
  return 'HEAD';
}

function parseNumstat(output: string) {
  const stats = new Map<string, { additions: number; deletions: number }>();
  for (const line of output.split('\n')) {
    const [added, deleted, ...rest] = line.split('\t');
    if (!rest.length) continue;
    stats.set(rest.at(-1) ?? '', {
      additions: added === BINARY_STAT ? 0 : Number(added),
      deletions: deleted === BINARY_STAT ? 0 : Number(deleted),
    });
  }
  return stats;
}

function parseNameStatus(output: string): Map<string, FileStatus> {
  const statuses = new Map<string, FileStatus>();
  for (const line of output.split('\n')) {
    const [code, ...paths] = line.split('\t');
    if (!code || !paths.length) continue;
    statuses.set(paths.at(-1) ?? '', code.charAt(0) as FileStatus);
  }
  return statuses;
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

async function untrackedFiles(git: Git, worktree: string): Promise<string[]> {
  const output = await git.run(worktree, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]);
  return output.split('\n').filter(Boolean);
}

async function untrackedChange(
  worktree: string,
  file: string,
): Promise<FileChange> {
  const text = await readFile(path.join(worktree, file), 'utf8').catch(
    () => '',
  );
  return { path: file, status: 'A', additions: countLines(text), deletions: 0 };
}

export async function changedFiles(
  git: Git,
  worktree: string,
  base: string,
): Promise<FileChange[]> {
  const from = await mergeBase(git, worktree, base);
  const [numstat, nameStatus, untracked] = await Promise.all([
    git.run(worktree, ['diff', '--numstat', '-M', from]),
    git.run(worktree, ['diff', '--name-status', '-M', from]),
    untrackedFiles(git, worktree),
  ]);
  const stats = parseNumstat(numstat);
  const tracked = [...parseNameStatus(nameStatus)].map(([file, status]) => ({
    path: file,
    status,
    additions: stats.get(file)?.additions ?? 0,
    deletions: stats.get(file)?.deletions ?? 0,
  }));
  const added = await Promise.all(
    untracked.map((file) => untrackedChange(worktree, file)),
  );
  return [...tracked, ...added].sort((a, b) => a.path.localeCompare(b.path));
}

export async function fileDiff(
  git: Git,
  worktree: string,
  base: string,
  file: string,
): Promise<string> {
  const from = await mergeBase(git, worktree, base);
  const tracked = await git.run(worktree, ['diff', '-M', from, '--', file]);
  if (tracked) return tracked;
  const untracked = await git.tryRun(worktree, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    file,
  ]);
  if (!untracked?.trim()) return '';
  return git.stdout(worktree, ['diff', '--no-index', '/dev/null', file]);
}

export async function listFiles(git: Git, worktree: string): Promise<string[]> {
  const output = await git.run(worktree, [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
  ]);
  return [...new Set(output.split('\n').filter(Boolean))].sort();
}

export async function createCheckpoint(
  git: Git,
  worktree: string,
): Promise<Checkpoint | null> {
  const head = (await git.tryRun(worktree, ['rev-parse', 'HEAD']))?.trim();
  if (!head) return null;
  const indexFile = path.join(
    (await git.run(worktree, ['rev-parse', '--absolute-git-dir'])).trim(),
    'korev-checkpoint-index',
  );
  const env = { GIT_INDEX_FILE: indexFile };
  await git.run(worktree, ['read-tree', head], env);
  await git.run(worktree, ['add', '-A'], env);
  const tree = (await git.run(worktree, ['write-tree'], env)).trim();
  const snapshot = (
    await git.run(worktree, ['commit-tree', tree, '-p', head, '-m', SNAPSHOT_MESSAGE])
  ).trim();
  await git.run(worktree, ['update-ref', `${CHECKPOINT_REF_PREFIX}${snapshot}`, snapshot]);
  return { head, snapshot };
}

export async function restoreCheckpoint(
  git: Git,
  worktree: string,
  checkpoint: Checkpoint,
): Promise<void> {
  await git.run(worktree, ['reset', '--hard', checkpoint.head]);
  await git.run(worktree, ['clean', '-fd']);
  await git.run(worktree, ['checkout', checkpoint.snapshot, '--', '.']);
  await git.run(worktree, ['reset', '--mixed', checkpoint.head]);
}

export async function isIgnored(git: Git, dir: string, file: string) {
  return (await git.tryRun(dir, ['check-ignore', '-q', file])) !== null;
}

export async function renameBranch(git: Git, worktree: string, from: string, to: string) {
  await git.run(worktree, ['branch', '-m', from, to]);
}

export async function deleteBranch(git: Git, repo: string, branch: string) {
  await git.tryRun(repo, ['branch', '-D', branch]);
}

export async function hasUpstream(git: Git, worktree: string) {
  return (await git.tryRun(worktree, ['rev-parse', '--abbrev-ref', '@{upstream}'])) !== null;
}

export async function userSlug(git: Git, dir: string): Promise<string> {
  const name = (await git.tryRun(dir, ['config', 'user.name']))?.trim() ?? '';
  return slugify(name) || 'korev';
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
