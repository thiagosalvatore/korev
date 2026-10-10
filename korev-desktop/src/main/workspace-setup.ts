import { constants } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_INCLUDE_GLOBS,
  type Repo,
  type Workspace,
} from '../shared/model';
import { slugify, type Git } from './git';

export const FIRST_PORT = 55_000;
export const PORTS_PER_WORKSPACE = 10;
const EMPTY_WORKSPACE_NAME = 'workspace';
const UNTITLED_NAME = new RegExp(`^${EMPTY_WORKSPACE_NAME}(-\\d+)?$`);
const TASK_NAME_WORDS = 5;
const NAME_MAX_CHARS = 40;

export function truncateName(name: string): string {
  return name.slice(0, NAME_MAX_CHARS).replace(/-+$/, '');
}

export function firstWords(slug: string, count: number): string {
  return slug.split('-').slice(0, count).join('-');
}

export function nameFromTask(text: string | null): string {
  if (!text) return EMPTY_WORKSPACE_NAME;
  const words = firstWords(slugify(text), TASK_NAME_WORDS);
  return truncateName(words) || EMPTY_WORKSPACE_NAME;
}

export function isUntitledName(name: string): boolean {
  return UNTITLED_NAME.test(name);
}

export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  let name = base;
  let suffix = 2;
  while (taken.has(name)) {
    name = `${base}-${suffix}`;
    suffix += 1;
  }
  return name;
}

export function allocatePort(used: readonly number[]): number {
  let port = FIRST_PORT;
  while (used.includes(port)) port += PORTS_PER_WORKSPACE;
  return port;
}

export function workspaceEnv(
  repo: Repo,
  workspace: Workspace,
): Record<string, string> {
  return {
    KOREV_WORKSPACE_NAME: workspace.name,
    KOREV_WORKSPACE_PATH: workspace.path,
    KOREV_ROOT_PATH: repo.path,
    KOREV_DEFAULT_BRANCH: workspace.baseBranch,
    KOREV_PORT: String(workspace.port),
    KOREV_IS_LOCAL: '1',
    KOREV_WORKSPACE_ID: workspace.id,
  };
}

const WORKTREE_INCLUDE_FILE = '.worktreeinclude';

export async function includePatterns(
  repoPath: string,
  configured: string | null,
): Promise<string> {
  const fromFile = await readFile(
    path.join(repoPath, WORKTREE_INCLUDE_FILE),
    'utf8',
  ).catch(() => null);
  return fromFile ?? configured ?? DEFAULT_INCLUDE_GLOBS;
}

async function matchingUntrackedFiles(
  git: Git,
  repoPath: string,
  patterns: string,
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'korev-include-'));
  const patternFile = path.join(dir, 'patterns');
  try {
    await writeFile(patternFile, patterns);
    const output = await git.stdout(repoPath, [
      'ls-files',
      '--others',
      '--ignored',
      `--exclude-from=${patternFile}`,
    ]);
    return output.split('\n').filter(Boolean);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function copyIncludedFiles(
  git: Git,
  repoPath: string,
  workspacePath: string,
  patterns: string,
): Promise<string[]> {
  const candidates = await matchingUntrackedFiles(git, repoPath, patterns);
  if (!candidates.length) return [];
  const ignored = await git.stdout(
    repoPath,
    ['check-ignore', '--stdin'],
    candidates.join('\n'),
  );
  const copied: string[] = [];
  for (const file of ignored.split('\n').filter(Boolean)) {
    if (await copyIfMissing(repoPath, workspacePath, file)) copied.push(file);
  }
  return copied;
}

async function copyIfMissing(
  repoPath: string,
  workspacePath: string,
  file: string,
): Promise<boolean> {
  const target = path.join(workspacePath, file);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await copyFile(path.join(repoPath, file), target, constants.COPYFILE_EXCL);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

const LOCAL_URL =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+[^\s'"]*/;
const ESCAPE = String.fromCharCode(27);
const ANSI_ESCAPE = new RegExp(`${ESCAPE}\\[[0-9;?]*[A-Za-z]`, 'g');

export function findLocalUrl(output: string): string | null {
  const url = LOCAL_URL.exec(output.replace(ANSI_ESCAPE, ''))?.[0];
  return url ? url.replace('0.0.0.0', 'localhost') : null;
}
