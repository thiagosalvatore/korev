import type { AiTaskSettings } from './agent-tasks';
import type { AgentPreference } from './agents';
import type { MergeTool } from './merge';

export type ThemePreference = 'system' | 'light' | 'dark';

export type InboxView = 'review' | 'mine';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const COLLAPSIBLE_SECTIONS = [
  'ready',
  'in-progress',
  'stale',
  'kept',
  'approved',
] as const;

export type CollapsibleSection = (typeof COLLAPSIBLE_SECTIONS)[number];

export type CollapsedSections = Partial<Record<CollapsibleSection, boolean>>;

export type RepoFilter = Record<InboxView, string[]>;

export interface Settings {
  repos: string[];
  theme: ThemePreference;
  lastView: InboxView;
  windowBounds: WindowBounds | null;
  collapsedSections: CollapsedSections;
  mergeWith: Record<string, MergeTool>;
  agent: AgentPreference;
  keptPrs: Record<string, string>;
  repoFilter: RepoFilter;
  aiTasks: AiTaskSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  repos: [],
  theme: 'system',
  lastView: 'review',
  windowBounds: null,
  collapsedSections: {},
  mergeWith: {},
  agent: { provider: null, models: {} },
  keptPrs: {},
  repoFilter: { review: [], mine: [] },
  aiTasks: { explainFormat: 'html', instructions: {} },
};
