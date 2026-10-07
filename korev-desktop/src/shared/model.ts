export type AgentKind = 'claude' | 'codex';

export const AGENT_KINDS: readonly AgentKind[] = ['claude', 'codex'];

export const AGENT_LABELS: Record<AgentKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

export interface AgentModel {
  id: string;
  label: string;
}

export const CODEX_DEFAULT_MODEL = 'default';

export const EFFORT_LEVELS: Record<AgentKind, readonly string[]> = {
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['minimal', 'low', 'medium', 'high', 'xhigh'],
};

export const DEFAULT_EFFORT: Record<AgentKind, string> = {
  claude: 'high',
  codex: 'medium',
};

export const CLAUDE_MODELS: AgentModel[] = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

export type ThemePreference = 'system' | 'light' | 'dark';

export type EditorId =
  | 'cursor'
  | 'vscode'
  | 'zed'
  | 'xcode'
  | 'terminal'
  | 'iterm'
  | 'ghostty'
  | 'warp'
  | 'finder';

export interface EditorApp {
  id: EditorId;
  label: string;
}

export interface RepoScripts {
  setup: string;
  run: string;
  archive: string;
  runMode: 'concurrent' | 'nonconcurrent';
}

export const EMPTY_SCRIPTS: RepoScripts = {
  setup: '',
  run: '',
  archive: '',
  runMode: 'concurrent',
};

export type PromptKind =
  | 'general'
  | 'code_review'
  | 'create_pr'
  | 'fix_errors'
  | 'resolve_merge_conflicts'
  | 'rename_branch';

export interface RunScript {
  id: string;
  command: string;
  cwd: string | null;
  icon: string;
  isDefault: boolean;
}

export interface PreviewUrl {
  name: string;
  url: string;
}

export type RepoConfigSource = 'settings.toml' | 'korev.json' | 'app';

export interface RepoConfig {
  source: RepoConfigSource;
  setup: string;
  archive: string;
  runMode: RepoScripts['runMode'];
  runScripts: RunScript[];
  autoRunAfterSetup: boolean;
  previewUrls: PreviewUrl[];
  fileIncludeGlobs: string | null;
  environment: Record<string, string>;
  prompts: Partial<Record<PromptKind, string>>;
  archiveOnMerge: boolean | null;
  deleteBranchOnArchive: boolean | null;
  branchPrefix: string | null;
  spotlightTesting: boolean;
}

export interface Repo {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  scripts: RepoScripts;
  spotlightTesting?: boolean;
}

export type WorkspaceSource =
  | { kind: 'new'; baseBranch: string | null }
  | { kind: 'branch'; branch: string }
  | { kind: 'pr'; number: number; baseBranch: string }
  | { kind: 'issue'; number: number; title: string };

export interface PullRequestSummary {
  number: number;
  title: string;
  headRefName: string;
  baseRefName: string;
  author: string;
  isDraft: boolean;
}

export interface IssueSummary {
  number: number;
  title: string;
  body: string;
  url: string;
}

export interface ChatSession {
  id: string;
  title: string;
  agent: AgentKind;
  model: string;
  effort: string;
  fast: boolean;
  agentSessionId: string | null;
  createdAt: string;
}

export interface Workspace {
  id: string;
  repoId: string;
  groupId: string | null;
  name: string;
  branch: string;
  baseBranch: string;
  path: string;
  port: number;
  createdAt: string;
  archivedAt: string | null;
  archiveSnapshot: Checkpoint | null;
  sessions: ChatSession[];
}

export interface AskChat {
  id: string;
  repoIds: string[];
  session: ChatSession;
  createdAt: string;
}

export interface Settings {
  theme: ThemePreference;
  defaultAgent: AgentKind;
  defaultModels: Record<AgentKind, string>;
  branchPrefix: string;
  workspacesRoot: string;
  defaultEffort: Record<AgentKind, string>;
  defaultPlanMode: boolean;
  autoRenameBranches: boolean;
  deleteBranchOnArchive: boolean;
  archiveOnMerge: boolean;
  toolApprovals: boolean;
  loadout: string[];
  snippets: Snippet[];
  editor: EditorId;
  notifications: boolean;
  windowBounds: WindowBounds | null;
}

export interface Snippet {
  name: string;
  text: string;
}

export const LOADOUT_SIZE = 5;

export function loadoutKey(agent: AgentKind, model: string): string {
  return `${agent}:${model}`;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WorkspaceStatus =
  | 'idle'
  | 'creating'
  | 'failed'
  | 'setting-up'
  | 'working'
  | 'waiting'
  | 'error';

export interface DiffStats {
  additions: number;
  deletions: number;
}

export type PrState = 'OPEN' | 'CLOSED' | 'MERGED';

export type CheckState = 'pending' | 'success' | 'failure' | 'skipped';

export interface PrCheck {
  name: string;
  state: CheckState;
  url: string | null;
}

export interface PrStatus {
  number: number;
  url: string;
  title: string;
  state: PrState;
  isDraft: boolean;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  checks: PrCheck[];
}

export interface WorkspaceRuntime {
  status: WorkspaceStatus;
  unread: boolean;
  stats: DiffStats | null;
  pr: PrStatus | null;
  message: string | null;
  pendingPrompt: string | null;
  runUrl: string | null;
}

export function hasWorktree(runtime: WorkspaceRuntime): boolean {
  return runtime.status !== 'creating' && runtime.status !== 'failed';
}

export interface AgentAvailability {
  agent: AgentKind;
  version: string | null;
  models: AgentModel[];
}

export interface AppState {
  repos: Repo[];
  workspaces: Workspace[];
  askChats: AskChat[];
  settings: Settings;
  runtime: Record<string, WorkspaceRuntime>;
  runningSessions: string[];
  runningTerminals: string[];
  spotlights: Record<string, string>;
  agents: AgentAvailability[];
  editors: EditorApp[];
}

export interface Checkpoint {
  head: string;
  snapshot: string;
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface Todo {
  text: string;
  status: TodoStatus;
}

export type ChatItem =
  | {
      id: string;
      kind: 'user';
      text: string;
      at: string;
      checkpoint: Checkpoint | null;
      queued?: boolean;
    }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'thinking'; text: string }
  | {
      id: string;
      kind: 'tool';
      name: string;
      summary: string;
      detail: string;
      output: string | null;
      failed: boolean;
    }
  | { id: string; kind: 'todos'; todos: Todo[] }
  | {
      id: string;
      kind: 'result';
      ok: boolean;
      text: string;
      durationMs: number | null;
      costUsd: number | null;
      turn?: TurnChanges | null;
    }
  | { id: string; kind: 'notice'; text: string }
  | {
      id: string;
      kind: 'permission';
      tool: string;
      summary: string;
      detail: string;
      questions: AgentQuestion[] | null;
      plan: string | null;
      status: PermissionStatus;
    };

export type PermissionStatus = 'pending' | 'allowed' | 'denied' | 'expired';

export interface AgentQuestion {
  question: string;
  header: string;
  options: { label: string; description: string }[];
  multiSelect: boolean;
}

export interface PermissionResponse {
  allow: boolean;
  answers?: Record<string, string>;
  message?: string;
}

export interface ChatUpdate {
  sessionId: string;
  item: ChatItem;
}

export interface SendOptions {
  text: string;
  model: string;
  effort: string;
  planMode: boolean;
  fast: boolean;
}

export type FileStatus = 'A' | 'M' | 'D' | 'R';

export interface FileChange {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
}

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface TerminalOutput {
  ref: string;
  data: string;
}

export interface TerminalExit {
  ref: string;
  exitCode: number;
}

export type TerminalKind = 'shell' | 'setup' | 'run';

export type TerminalPreset = 'shell' | 'claude' | 'codex';

export type AppCommand =
  | 'new-workspace'
  | 'new-chat'
  | 'close-tab'
  | 'show-settings'
  | 'show-palette'
  | 'toggle-terminal'
  | 'toggle-sidebar'
  | 'toggle-panel'
  | 'create-pr'
  | 'focus-composer'
  | 'run-script'
  | 'previous-workspace'
  | 'next-workspace'
  | 'archive-workspace'
  | 'open-in'
  | 'merge-pr'
  | 'fix-errors'
  | 'open-diff'
  | 'cancel-agent'
  | 'toggle-theme'
  | 'toggle-zen'
  | 'quick-open'
  | 'search-files'
  | 'select-workspace-1'
  | 'select-workspace-2'
  | 'select-workspace-3'
  | 'select-workspace-4'
  | 'select-workspace-5'
  | 'select-workspace-6'
  | 'select-workspace-7'
  | 'select-workspace-8'
  | 'select-workspace-9';

export interface TurnRange {
  from: string;
  to: string;
}

export interface TurnChanges {
  range: TurnRange;
  files: FileChange[];
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  text: string;
}

export interface ReviewComment {
  id: number;
  path: string;
  line: number | null;
  body: string;
  author: string;
  url: string;
}
