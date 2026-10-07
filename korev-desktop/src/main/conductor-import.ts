import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EFFORT_LEVELS,
  type RepoScripts,
  type Settings,
} from '../shared/model';
import type { CommandRunner } from './command-runner';
import { flag, parseTomlSafely, table, text, type Table } from './repo-config';

const DATABASE_FILE =
  'Library/Application Support/com.conductor.app/conductor.db';
const SETTINGS_FILE = '.conductor/settings.toml';
const SQLITE_BINARY = 'sqlite3';
const SQLITE_TIMEOUT_MS = 15_000;
const VISIBLE_REPOS_QUERY =
  'select root_path, setup_script, run_script, archive_script, run_script_mode from repos where coalesce(hidden,0)=0';
const NONCONCURRENT = 'nonconcurrent';

export interface ConductorRepo {
  path: string;
  scripts: RepoScripts;
}

type RepoRow = Record<
  | 'root_path'
  | 'setup_script'
  | 'run_script'
  | 'archive_script'
  | 'run_script_mode',
  string | null
>;

function parseRows(json: string): RepoRow[] {
  try {
    const rows: unknown = JSON.parse(json);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function toConductorRepo(row: RepoRow, rootPath: string): ConductorRepo {
  return {
    path: rootPath,
    scripts: {
      setup: row.setup_script ?? '',
      run: row.run_script ?? '',
      archive: row.archive_script ?? '',
      runMode:
        row.run_script_mode === NONCONCURRENT ? NONCONCURRENT : 'concurrent',
    },
  };
}

export async function readConductorRepos(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  home: string,
): Promise<ConductorRepo[]> {
  const database = path.join(home, DATABASE_FILE);
  if (!existsSync(database)) return [];
  const result = await run(
    SQLITE_BINARY,
    ['-readonly', '-json', database, VISIBLE_REPOS_QUERY],
    { env, timeoutMs: SQLITE_TIMEOUT_MS },
  ).catch(() => null);
  if (result?.exitCode !== 0) return [];
  return parseRows(result.stdout).flatMap((row) =>
    row.root_path && existsSync(row.root_path)
      ? [toConductorRepo(row, row.root_path)]
      : [],
  );
}

function branchPrefixFrom(git: Table): string | undefined {
  if (git.branch_prefix_type === 'custom') return text(git.branch_prefix);
  if (git.branch_prefix_type === 'github_username') return '';
  return undefined;
}

function effortFrom(
  models: Table,
  current: Settings['defaultEffort'],
): Settings['defaultEffort'] | undefined {
  const level = text(table(models.codex).default_thinking_level);
  if (!level || !EFFORT_LEVELS.codex.includes(level)) return undefined;
  return { ...current, codex: level };
}

function settingsFrom(conductor: Table, current: Settings): Partial<Settings> {
  const git = table(conductor.git);
  const models = table(conductor.models);
  return {
    archiveOnMerge: flag(git.archive_on_merge),
    deleteBranchOnArchive: flag(git.delete_branch_on_archive),
    branchPrefix: branchPrefixFrom(git),
    defaultPlanMode: flag(models.default_plan_mode),
    defaultEffort: effortFrom(models, current.defaultEffort),
  };
}

function changedSettings(
  imported: Partial<Settings>,
  current: Settings,
): Partial<Settings> {
  return Object.fromEntries(
    Object.entries(imported).filter(
      ([key, value]) =>
        value !== undefined &&
        JSON.stringify(value) !==
          JSON.stringify(current[key as keyof Settings]),
    ),
  );
}

export async function readConductorSettings(
  home: string,
  current: Settings,
): Promise<Partial<Settings>> {
  const source = await readFile(path.join(home, SETTINGS_FILE), 'utf8').catch(
    () => null,
  );
  const conductor = parseTomlSafely(source);
  if (!conductor) return {};
  return changedSettings(settingsFrom(conductor, current), current);
}
