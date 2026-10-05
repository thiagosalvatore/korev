import { mkdir, readdir, rm, stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandResult, CommandRunner } from './agents/command-runner';
import { childEnv, resolveLoginPath } from './agents/login-path';
import { splitRepoName } from './repo-names';

const GIT = 'git';
const DISK_USAGE = 'du';
const MINIMUM_GIT_VERSION = [2, 31] as const;
const GIT_VERSION_PATTERN = /(\d+)\.(\d+)/;
const NETWORK_TIMEOUT_MS = 2 * 60_000;
const LOCAL_TIMEOUT_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
export const UNUSED_CLONE_MS = 30 * DAY_MS;
const REPOS_DIR = 'repos';
const WORKTREES_DIR = 'worktrees';
const BRANCH_PREFIX = 'korev/';
const PULL_REF_PREFIX = 'refs/korev/pull/';
const WORKFLOWS_DIR = '.github/workflows/';
const KIB = 1024;
const DISABLED_HOOKS = ['-c', 'core.hooksPath=/dev/null'];
const PROMPT_HELPERS = ['GIT_ASKPASS', 'SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE'];
const ACCESS_TOKEN_USER = 'x-access-token';

export type GitFailure =
  | 'old-git'
  | 'no-identity'
  | 'signing'
  | 'protected'
  | 'head-moved'
  | 'other';

export const GIT_MESSAGES = {
  oldGit: 'Update git to 2.31 or later',
  noIdentity: 'Set git user.name and user.email',
  signing: "Your commit signing needs a prompt; Korev can't sign",
  headMoved: 'Someone pushed to this pull request while Korev was working.',
  failed: 'git failed',
} as const;

const NO_IDENTITY_PATTERN =
  /Please tell me who you are|unable to auto-detect email|empty ident name/;
const SIGNING_PATTERN =
  /failed to sign|gpg failed|signing failed|error: cannot run gpg|ssh-keygen|Couldn't load public key|failed to write commit object/i;
const PROTECTED_PATTERN = /GH006|protected branch/i;
const REMOTE_ERROR_PATTERN = /^remote: error: (.+)$/m;
const HEAD_MOVED_PATTERN =
  /\[rejected\]|non-fast-forward|fetch first|Updates were rejected/;

export class GitError extends Error {
  constructor(
    message: string,
    readonly reason: GitFailure,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export interface CheckoutTarget {
  repo: string;
  number: number;
  baseRefName: string;
}

export interface PushTarget {
  headRefName: string;
  url: string | null;
}

export interface Checkout {
  path: string;
  headOid: string;
}

export type PushResult =
  | { kind: 'pushed'; sha: string }
  | { kind: 'unchanged' }
  | { kind: 'workflow-files'; files: string[] };

export interface CheckoutsDeps {
  run: CommandRunner;
  env: NodeJS.ProcessEnv;
  root: string;
  gitUrl: string;
  token(): string | null;
  now(): number;
}

export interface Checkouts {
  open(target: CheckoutTarget): Promise<Checkout>;
  git(path: string, args: string[], timeoutMs?: number): Promise<string>;
  tryGit(path: string, args: string[]): Promise<CommandResult>;
  commitAll(path: string, message: string): Promise<boolean>;
  push(
    checkout: Checkout,
    target: PushTarget,
    canPushWorkflows: boolean,
  ): Promise<PushResult>;
  remove(target: Pick<CheckoutTarget, 'repo' | 'number'>): Promise<void>;
  sweep(watched: string[], keptRefs: string[]): Promise<void>;
  removeAll(keptRefs: string[]): Promise<void>;
  size(): Promise<number>;
}

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1)?.trim() ?? '';
}

export function gitFailure(stderr: string): GitError {
  if (NO_IDENTITY_PATTERN.test(stderr)) {
    return new GitError(GIT_MESSAGES.noIdentity, 'no-identity');
  }
  if (PROTECTED_PATTERN.test(stderr)) {
    const reason = REMOTE_ERROR_PATTERN.exec(stderr)?.[1] ?? lastLine(stderr);
    return new GitError(reason, 'protected');
  }
  if (HEAD_MOVED_PATTERN.test(stderr)) {
    return new GitError(GIT_MESSAGES.headMoved, 'head-moved');
  }
  if (SIGNING_PATTERN.test(stderr)) {
    return new GitError(GIT_MESSAGES.signing, 'signing');
  }
  return new GitError(lastLine(stderr) || GIT_MESSAGES.failed, 'other');
}

export function isSupportedGit(versionOutput: string): boolean {
  const match = GIT_VERSION_PATTERN.exec(versionOutput);
  if (!match) return false;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  const [needMajor, needMinor] = MINIMUM_GIT_VERSION;
  return major > needMajor || (major === needMajor && minor >= needMinor);
}

function authHeader(token: string): string {
  const credentials = Buffer.from(`${ACCESS_TOKEN_USER}:${token}`);
  return `AUTHORIZATION: basic ${credentials.toString('base64')}`;
}

function withoutPromptHelpers(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !PROMPT_HELPERS.includes(name)),
  );
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function childDirs(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map(({ name }) => name);
}

function sameRepo(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function refRepo(ref: string): string {
  return ref.split('#')[0];
}

export function createCheckouts(deps: CheckoutsDeps): Checkouts {
  let loginPath: Promise<string> | null = null;
  let versionChecked: Promise<void> | null = null;

  async function gitEnv(): Promise<NodeJS.ProcessEnv> {
    loginPath ??= resolveLoginPath(deps.run, deps.env);
    const env: NodeJS.ProcessEnv = {
      ...withoutPromptHelpers(childEnv(deps.env, await loginPath)),
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
    };
    const token = deps.token();
    if (!token) return env;
    return {
      ...env,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `http.${deps.gitUrl}/.extraheader`,
      GIT_CONFIG_VALUE_0: authHeader(token),
    };
  }

  async function tryGit(
    cwd: string,
    args: string[],
    timeoutMs = LOCAL_TIMEOUT_MS,
  ): Promise<CommandResult> {
    return deps.run(GIT, [...DISABLED_HOOKS, ...args], {
      cwd,
      timeoutMs,
      env: await gitEnv(),
    });
  }

  async function git(
    cwd: string,
    args: string[],
    timeoutMs = LOCAL_TIMEOUT_MS,
  ): Promise<string> {
    const result = await tryGit(cwd, args, timeoutMs);
    if (result.exitCode !== 0) throw gitFailure(result.stderr);
    return result.stdout.trim();
  }

  async function checkVersion(): Promise<void> {
    const result = await deps.run(GIT, ['--version'], {
      timeoutMs: LOCAL_TIMEOUT_MS,
      env: await gitEnv(),
    });
    if (!isSupportedGit(result.stdout)) {
      throw new GitError(GIT_MESSAGES.oldGit, 'old-git');
    }
  }

  function ensureVersion(): Promise<void> {
    versionChecked ??= checkVersion().catch((error: unknown) => {
      versionChecked = null;
      throw error;
    });
    return versionChecked;
  }

  function clonePath(repo: string): string {
    const { owner, name } = splitRepoName(repo);
    return join(deps.root, REPOS_DIR, owner, name);
  }

  function worktreeDir(repo: string): string {
    const { owner, name } = splitRepoName(repo);
    return join(deps.root, WORKTREES_DIR, owner, name);
  }

  function worktreePath(target: Pick<CheckoutTarget, 'repo' | 'number'>) {
    return join(worktreeDir(target.repo), String(target.number));
  }

  async function ensureClone(repo: string): Promise<string> {
    const path = clonePath(repo);
    if (!(await exists(path))) {
      await mkdir(join(path, '..'), { recursive: true });
      await git(
        deps.root,
        [
          'clone',
          '--no-checkout',
          '--filter=blob:none',
          `${deps.gitUrl}/${repo}.git`,
          path,
        ],
        NETWORK_TIMEOUT_MS,
      );
    }
    const now = new Date(deps.now());
    await utimes(path, now, now);
    return path;
  }

  async function open(target: CheckoutTarget): Promise<Checkout> {
    await ensureVersion();
    const clone = await ensureClone(target.repo);
    const pullRef = `${PULL_REF_PREFIX}${target.number}`;
    await git(
      clone,
      [
        'fetch',
        '--no-tags',
        'origin',
        `+refs/pull/${target.number}/head:${pullRef}`,
        `+refs/heads/${target.baseRefName}:refs/remotes/origin/${target.baseRefName}`,
      ],
      NETWORK_TIMEOUT_MS,
    );
    const path = worktreePath(target);
    if (!(await exists(path))) {
      await mkdir(worktreeDir(target.repo), { recursive: true });
      await git(
        clone,
        [
          'worktree',
          'add',
          '-B',
          `${BRANCH_PREFIX}${target.number}`,
          path,
          pullRef,
        ],
        NETWORK_TIMEOUT_MS,
      );
    }
    return { path, headOid: await git(clone, ['rev-parse', pullRef]) };
  }

  async function commitAll(path: string, message: string): Promise<boolean> {
    await git(path, ['add', '-A']);
    const staged = await git(path, ['diff', '--cached', '--name-only']);
    const merging =
      (await tryGit(path, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']))
        .exitCode === 0;
    if (!staged && !merging) return false;
    await git(path, ['commit', '-m', message]);
    return true;
  }

  async function push(
    checkout: Checkout,
    target: PushTarget,
    canPushWorkflows: boolean,
  ): Promise<PushResult> {
    const sha = await git(checkout.path, ['rev-parse', 'HEAD']);
    if (sha === checkout.headOid) return { kind: 'unchanged' };
    const changed = await git(checkout.path, [
      'diff',
      '--name-only',
      checkout.headOid,
      sha,
    ]);
    const files = changed
      .split('\n')
      .filter((file) => file.startsWith(WORKFLOWS_DIR));
    if (files.length > 0 && !canPushWorkflows) {
      return { kind: 'workflow-files', files };
    }
    await git(
      checkout.path,
      [
        'push',
        target.url ? `${target.url}.git` : 'origin',
        `HEAD:refs/heads/${target.headRefName}`,
      ],
      NETWORK_TIMEOUT_MS,
    );
    return { kind: 'pushed', sha };
  }

  async function removeWorktree(repo: string, path: string, number: string) {
    const clone = clonePath(repo);
    if (await exists(clone)) {
      await tryGit(clone, ['worktree', 'remove', '--force', path]);
      await tryGit(clone, ['branch', '-D', `${BRANCH_PREFIX}${number}`]);
    }
    await rm(path, { recursive: true, force: true });
    if (await exists(clone)) await tryGit(clone, ['worktree', 'prune']);
  }

  async function remove(target: Pick<CheckoutTarget, 'repo' | 'number'>) {
    await removeWorktree(
      target.repo,
      worktreePath(target),
      String(target.number),
    );
  }

  async function clonedRepos(): Promise<string[]> {
    const reposRoot = join(deps.root, REPOS_DIR);
    const owners = await childDirs(reposRoot);
    const nested = await Promise.all(
      owners.map(async (owner) =>
        (await childDirs(join(reposRoot, owner))).map(
          (name) => `${owner}/${name}`,
        ),
      ),
    );
    return nested.flat();
  }

  async function removeRepo(repo: string, keptRefs: string[]) {
    const kept = new Set(
      keptRefs.filter((ref) => sameRepo(refRepo(ref), repo)),
    );
    const numbers = await childDirs(worktreeDir(repo));
    for (const number of numbers) {
      if (kept.has(`${repo}#${number}`)) continue;
      await removeWorktree(repo, join(worktreeDir(repo), number), number);
    }
    if (kept.size > 0) return;
    await rm(clonePath(repo), { recursive: true, force: true });
    await rm(worktreeDir(repo), { recursive: true, force: true });
  }

  async function isUnused(repo: string): Promise<boolean> {
    const info = await stat(clonePath(repo));
    return deps.now() - info.mtimeMs > UNUSED_CLONE_MS;
  }

  async function sweep(watched: string[], keptRefs: string[]) {
    for (const repo of await clonedRepos()) {
      if (keptRefs.some((ref) => sameRepo(refRepo(ref), repo))) continue;
      const isWatched = watched.some((name) => sameRepo(name, repo));
      if (isWatched && !(await isUnused(repo))) continue;
      await removeRepo(repo, keptRefs);
    }
  }

  async function removeAll(keptRefs: string[]) {
    for (const repo of await clonedRepos()) await removeRepo(repo, keptRefs);
  }

  async function size(): Promise<number> {
    const dirs = [join(deps.root, REPOS_DIR), join(deps.root, WORKTREES_DIR)];
    const present = (
      await Promise.all(
        dirs.map(async (dir) => ((await exists(dir)) ? dir : null)),
      )
    ).filter((dir): dir is string => dir !== null);
    if (present.length === 0) return 0;
    const result = await deps.run(DISK_USAGE, ['-sk', ...present], {
      timeoutMs: LOCAL_TIMEOUT_MS,
    });
    return result.stdout
      .split('\n')
      .map((line) => Number.parseInt(line, 10))
      .filter(Number.isFinite)
      .reduce((total, kib) => total + kib * KIB, 0);
  }

  return {
    open,
    git,
    tryGit: (path, args) => tryGit(path, args),
    commitAll,
    push,
    remove,
    sweep,
    removeAll,
    size,
  };
}
