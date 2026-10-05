import {
  COLLAPSIBLE_SECTIONS,
  DEFAULT_SETTINGS,
  type CollapsedSections,
  type InboxView,
  type RepoFilter,
  type Settings,
  type ThemePreference,
  type WindowBounds,
} from '../shared/settings';
import {
  AGENT_PROVIDERS,
  isAgentProvider,
  isModelId,
  type AgentPreference,
} from '../shared/agents';
import {
  AGENT_TASK_KINDS,
  EXPLAIN_FORMATS,
  type AgentTaskKind,
  type AiTaskSettings,
} from '../shared/agent-tasks';
import type { MergeTool } from '../shared/merge';
import type { FileSystem } from './file-system';
import { isPrRef, isRepoName } from './repo-names';

const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];
const MERGE_TOOLS: readonly MergeTool[] = [
  'github',
  'trunk',
  'mergify',
  'aviator',
];
const VIEWS: readonly InboxView[] = ['review', 'mine'];
const CORRUPT_SETTINGS_PROBLEM = 'Settings were reset';

export interface SettingsLoadResult {
  settings: Settings;
  problem: string | null;
}

export interface SettingsStore {
  load(): Promise<SettingsLoadResult>;
  current(): Settings;
  update(patch: Partial<Settings>): Promise<Settings>;
}

function pickRepos(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.repos;
  return [...new Set(value.filter(isRepoName))];
}

function pickCollapsedSections(value: unknown): CollapsedSections {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([section, collapsed]) =>
        (COLLAPSIBLE_SECTIONS as readonly string[]).includes(section) &&
        typeof collapsed === 'boolean',
    ),
  );
}

function pickRepoFilter(value: unknown, watched: string[]): RepoFilter {
  const raw = (value ?? {}) as Partial<Record<InboxView, unknown>>;
  const pickWatched = (repos: unknown) =>
    pickRepos(repos).filter((repo) => watched.includes(repo));
  return { review: pickWatched(raw.review), mine: pickWatched(raw.mine) };
}

function pickMergeWith(value: unknown): Record<string, MergeTool> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([repo, tool]) =>
        isRepoName(repo) && MERGE_TOOLS.includes(tool as MergeTool),
    ),
  );
}

function pickKeptPrs(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([ref, keptAt]) =>
        isPrRef(ref) &&
        typeof keptAt === 'string' &&
        !Number.isNaN(Date.parse(keptAt)),
    ),
  );
}

function pickOneOf<T>(options: readonly T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function pickAgent(value: unknown): AgentPreference {
  const raw = (value ?? {}) as Partial<Record<keyof AgentPreference, unknown>>;
  const models = (raw.models ?? {}) as Record<string, unknown>;
  return {
    provider: pickOneOf([...AGENT_PROVIDERS, null], raw.provider, null),
    models: Object.fromEntries(
      Object.entries(models).filter(
        ([provider, model]) => isAgentProvider(provider) && isModelId(model),
      ),
    ),
  };
}

const INSTRUCTIONS_MAX_CHARS = 20_000;

function pickInstructions(
  value: unknown,
): Partial<Record<AgentTaskKind, string>> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([kind, text]) =>
        AGENT_TASK_KINDS.includes(kind as AgentTaskKind) &&
        typeof text === 'string' &&
        text.trim().length > 0 &&
        text.length <= INSTRUCTIONS_MAX_CHARS,
    ),
  );
}

function pickAiTasks(value: unknown): AiTaskSettings {
  const raw = (value ?? {}) as Partial<Record<keyof AiTaskSettings, unknown>>;
  return {
    explainFormat: pickOneOf(
      EXPLAIN_FORMATS,
      raw.explainFormat,
      DEFAULT_SETTINGS.aiTasks.explainFormat,
    ),
    instructions: pickInstructions(raw.instructions),
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pickBounds(value: unknown): WindowBounds | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y, width, height } = value as Record<string, unknown>;
  if (![x, y, width, height].every(isFiniteNumber)) return null;
  return { x, y, width, height } as WindowBounds;
}

function sanitize(raw: Record<string, unknown>): Settings {
  const repos = pickRepos(raw.repos);
  return {
    repos,
    theme: pickOneOf(THEMES, raw.theme, DEFAULT_SETTINGS.theme),
    lastView: pickOneOf(VIEWS, raw.lastView, DEFAULT_SETTINGS.lastView),
    windowBounds: pickBounds(raw.windowBounds),
    collapsedSections: pickCollapsedSections(raw.collapsedSections),
    mergeWith: pickMergeWith(raw.mergeWith),
    agent: pickAgent(raw.agent),
    keptPrs: pickKeptPrs(raw.keptPrs),
    repoFilter: pickRepoFilter(raw.repoFilter, repos),
    aiTasks: pickAiTasks(raw.aiTasks),
  };
}

function parseSettings(text: string): Settings | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return sanitize(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function createSettingsStore(deps: {
  fs: FileSystem;
  path: string;
}): SettingsStore {
  let settings: Settings = DEFAULT_SETTINGS;

  async function load(): Promise<SettingsLoadResult> {
    const contents = await deps.fs.read(deps.path);
    if (!contents)
      return { settings: (settings = DEFAULT_SETTINGS), problem: null };
    const parsed = parseSettings(contents.toString('utf8'));
    settings = parsed ?? DEFAULT_SETTINGS;
    return { settings, problem: parsed ? null : CORRUPT_SETTINGS_PROBLEM };
  }

  async function update(patch: Partial<Settings>): Promise<Settings> {
    settings = sanitize({ ...settings, ...patch });
    await deps.fs.writeAtomic(deps.path, JSON.stringify(settings, null, 2));
    return settings;
  }

  return { load, update, current: () => settings };
}

export function notifyOnChange(
  store: SettingsStore,
  onChange: (settings: Settings) => void,
): SettingsStore {
  return {
    ...store,
    async update(patch) {
      const updated = await store.update(patch);
      onChange(updated);
      return updated;
    },
  };
}
