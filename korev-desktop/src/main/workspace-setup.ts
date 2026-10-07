import { copyFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EMPTY_SCRIPTS,
  type Repo,
  type RepoScripts,
  type Workspace,
} from '../shared/model';
import { slugify } from './git';

export const FIRST_PORT = 55_000;
export const PORTS_PER_WORKSPACE = 10;
const PROJECT_CONFIG_FILE = 'conductor.json';
const EMPTY_WORKSPACE_NAME = 'workspace';
const UNTITLED_NAME = new RegExp(`^${EMPTY_WORKSPACE_NAME}(-\\d+)?$`);
const TASK_NAME_WORDS = 5;
const NAME_MAX_CHARS = 40;

export function truncateName(name: string): string {
  return name.slice(0, NAME_MAX_CHARS).replace(/-+$/, '');
}

export function nameFromTask(text: string | null): string {
  if (!text) return EMPTY_WORKSPACE_NAME;
  const words = slugify(text).split('-').slice(0, TASK_NAME_WORDS).join('-');
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
    CONDUCTOR_WORKSPACE_NAME: workspace.name,
    CONDUCTOR_WORKSPACE_PATH: workspace.path,
    CONDUCTOR_ROOT_PATH: repo.path,
    CONDUCTOR_DEFAULT_BRANCH: workspace.baseBranch,
    CONDUCTOR_PORT: String(workspace.port),
    CONDUCTOR_IS_LOCAL: '1',
    CONDUCTOR_WORKSPACE_ID: workspace.id,
  };
}

interface ProjectConfig {
  scripts?: { setup?: unknown; run?: unknown; archive?: unknown };
  runScriptMode?: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function parseProjectConfig(json: string): Partial<RepoScripts> {
  let config: ProjectConfig;
  try {
    config = JSON.parse(json) as ProjectConfig;
  } catch {
    return {};
  }
  const scripts = config.scripts ?? {};
  const picked: Partial<RepoScripts> = {
    setup: text(scripts.setup),
    run: text(scripts.run),
    archive: text(scripts.archive),
    runMode:
      config.runScriptMode === 'nonconcurrent' ? 'nonconcurrent' : undefined,
  };
  return Object.fromEntries(
    Object.entries(picked).filter(([, value]) => value !== undefined),
  );
}

export async function effectiveScripts(
  repo: Repo,
  workspacePath: string,
): Promise<RepoScripts> {
  const json = await readFile(
    path.join(workspacePath, PROJECT_CONFIG_FILE),
    'utf8',
  ).catch(() => null);
  const fromProject = json ? parseProjectConfig(json) : {};
  return { ...EMPTY_SCRIPTS, ...repo.scripts, ...fromProject };
}

const COPIED_FILE_PATTERN = /^\.env/;

export async function copyLocalFiles(
  repoPath: string,
  workspacePath: string,
  isIgnored: (file: string) => Promise<boolean>,
): Promise<string[]> {
  const entries = await readdir(repoPath, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && COPIED_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name);
  const copied: string[] = [];
  for (const file of candidates) {
    if (!(await isIgnored(file))) continue;
    await copyFile(path.join(repoPath, file), path.join(workspacePath, file));
    copied.push(file);
  }
  return copied;
}
