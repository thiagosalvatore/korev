import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type {
  PreviewUrl,
  PromptKind,
  RepoConfig,
  RepoScripts,
  RunScript,
} from '../shared/model';

const SHARED_SETTINGS_FILE = '.korev/settings.toml';
const LOCAL_SETTINGS_FILE = '.korev/settings.local.toml';
const JSON_CONFIG_FILE = 'korev.json';
const DEFAULT_RUN_ICON = 'play';
const SINGLE_RUN_ID = 'run';
const PROMPT_KINDS: readonly PromptKind[] = [
  'general',
  'code_review',
  'create_pr',
  'fix_errors',
  'resolve_merge_conflicts',
  'rename_branch',
];
const PORT_OFFSET = /\$\(\(\s*KOREV_PORT\s*\+\s*(\d)\s*\)\)/g;
const PORT_VARIABLE = /\$\{?KOREV_PORT\}?/g;

type Table = Record<string, unknown>;

export interface RepoConfigFiles {
  sharedToml: string | null;
  localToml: string | null;
  jsonConfig: string | null;
}

function table(value: unknown): Table {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Table)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function flag(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function parseTomlSafely(source: string | null): Table | null {
  if (source === null) return null;
  try {
    return parseToml(source) as Table;
  } catch {
    return null;
  }
}

function deepMerge(base: Table, override: Table): Table {
  const merged: Table = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    const bothTables =
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value);
    merged[key] = bothTables
      ? deepMerge(existing as Table, value as Table)
      : value;
  }
  return merged;
}

function quoteArg(arg: string): string {
  return /^[\w./=:@%+${}-]+$/.test(arg)
    ? arg
    : `"${arg.replace(/["\\`]/g, '\\$&')}"`;
}

function runScriptFrom(id: string, value: unknown): RunScript | null {
  const entry = table(value);
  const command = text(entry.command);
  if (!command || entry.hide === true) return null;
  const args = Array.isArray(entry.args)
    ? entry.args.filter((arg) => typeof arg === 'string')
    : [];
  const availableIn = entry.available_in;
  const cloudOnly =
    availableIn === 'cloud' ||
    (Array.isArray(availableIn) && !availableIn.includes('local'));
  if (cloudOnly) return null;
  return {
    id,
    command: [command, ...args.map(quoteArg)].join(' '),
    cwd: text(table(entry.options).cwd) ?? null,
    icon: text(entry.icon) ?? DEFAULT_RUN_ICON,
    isDefault: entry.default === true,
  };
}

function runScriptsFrom(value: unknown): RunScript[] {
  if (typeof value === 'string') {
    return value.trim()
      ? [
          {
            id: SINGLE_RUN_ID,
            command: value,
            cwd: null,
            icon: DEFAULT_RUN_ICON,
            isDefault: true,
          },
        ]
      : [];
  }
  const scripts = Object.entries(table(value)).flatMap(
    ([id, entry]) => runScriptFrom(id, entry) ?? [],
  );
  if (scripts.length && !scripts.some((script) => script.isDefault))
    scripts[0].isDefault = true;
  return scripts;
}

function previewUrlsFrom(value: unknown): PreviewUrl[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = table(entry);
    const url = text(item.url);
    return url ? [{ name: text(item.name) ?? url, url }] : [];
  });
}

function stringsFrom(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(table(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function environmentFrom(value: unknown): Record<string, string> {
  const variables = table(value);
  return { ...stringsFrom(variables), ...stringsFrom(variables.local) };
}

function promptsFrom(value: unknown): Partial<Record<PromptKind, string>> {
  const prompts = stringsFrom(value);
  return Object.fromEntries(
    PROMPT_KINDS.flatMap((kind) =>
      prompts[kind]?.trim() ? [[kind, prompts[kind]]] : [],
    ),
  );
}

function branchPrefixFrom(git: Table): string | null {
  if (git.branch_prefix_type === 'none') return '';
  if (git.branch_prefix_type === 'custom') return text(git.branch_prefix) ?? '';
  return null;
}

function fromSettings(settings: Table, app: RepoScripts): RepoConfig {
  const scripts = table(settings.scripts);
  return {
    source: 'settings.toml',
    setup: text(scripts.setup) ?? '',
    archive: text(scripts.archive) ?? '',
    runMode:
      scripts.run_mode === 'nonconcurrent' ? 'nonconcurrent' : app.runMode,
    runScripts: runScriptsFrom(scripts.run),
    autoRunAfterSetup: scripts.auto_run_after_setup === true,
    previewUrls: previewUrlsFrom(settings.preview_urls),
    fileIncludeGlobs: text(settings.file_include_globs) ?? null,
    environment: environmentFrom(settings.environment_variables),
    prompts: promptsFrom(settings.prompts),
    archiveOnMerge: flag(table(settings.git).archive_on_merge) ?? null,
    deleteBranchOnArchive:
      flag(table(settings.git).delete_branch_on_archive) ?? null,
    branchPrefix: branchPrefixFrom(table(settings.git)),
  };
}

function fromApp(app: RepoScripts): RepoConfig {
  return {
    source: 'app',
    setup: app.setup,
    archive: app.archive,
    runMode: app.runMode,
    runScripts: runScriptsFrom(app.run),
    autoRunAfterSetup: false,
    previewUrls: [],
    fileIncludeGlobs: null,
    environment: {},
    prompts: {},
    archiveOnMerge: null,
    deleteBranchOnArchive: null,
    branchPrefix: null,
  };
}

function fromJsonConfig(json: string, app: RepoScripts): RepoConfig | null {
  let raw: Table;
  try {
    raw = table(JSON.parse(json));
  } catch {
    return null;
  }
  const scripts = table(raw.scripts);
  const base = fromApp(app);
  return {
    ...base,
    source: 'korev.json',
    setup: text(scripts.setup) ?? base.setup,
    archive: text(scripts.archive) ?? base.archive,
    runScripts:
      typeof scripts.run === 'string'
        ? runScriptsFrom(scripts.run)
        : base.runScripts,
    runMode:
      raw.runScriptMode === 'nonconcurrent' ? 'nonconcurrent' : base.runMode,
  };
}

export function resolveRepoConfig(
  app: RepoScripts,
  files: RepoConfigFiles,
): RepoConfig {
  const shared = parseTomlSafely(files.sharedToml);
  const local = parseTomlSafely(files.localToml);
  if (shared || local)
    return fromSettings(deepMerge(shared ?? {}, local ?? {}), app);
  if (files.jsonConfig)
    return fromJsonConfig(files.jsonConfig, app) ?? fromApp(app);
  return fromApp(app);
}

async function readOptional(dir: string, file: string): Promise<string | null> {
  return readFile(path.join(dir, file), 'utf8').catch(() => null);
}

export async function loadRepoConfig(
  app: RepoScripts,
  dir: string,
): Promise<RepoConfig> {
  const [sharedToml, localToml, jsonConfig] = await Promise.all([
    readOptional(dir, SHARED_SETTINGS_FILE),
    readOptional(dir, LOCAL_SETTINGS_FILE),
    readOptional(dir, JSON_CONFIG_FILE),
  ]);
  return resolveRepoConfig(app, { sharedToml, localToml, jsonConfig });
}

export function expandPort(template: string, port: number): string {
  return template
    .replace(PORT_OFFSET, (_match, offset: string) =>
      String(port + Number(offset)),
    )
    .replace(PORT_VARIABLE, String(port));
}

export function withPrompt(base: string, extra: string | undefined): string {
  return extra?.trim()
    ? `${base}\n\nAdditional instructions for this repository:\n${extra.trim()}`
    : base;
}
