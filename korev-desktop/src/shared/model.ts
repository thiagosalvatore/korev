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

export interface Repo {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  scripts: RepoScripts;
}

export interface ChatSession {
  id: string;
  title: string;
  agent: AgentKind;
  model: string;
  effort: string;
  agentSessionId: string | null;
  createdAt: string;
}

export interface Workspace {
  id: string;
  repoId: string;
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
  editor: EditorId;
  notifications: boolean;
  windowBounds: WindowBounds | null;
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
    }
  | { id: string; kind: 'notice'; text: string };

export interface ChatUpdate {
  sessionId: string;
  item: ChatItem;
}

export interface SendOptions {
  text: string;
  model: string;
  effort: string;
  planMode: boolean;
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
  | 'select-workspace-1'
  | 'select-workspace-2'
  | 'select-workspace-3'
  | 'select-workspace-4'
  | 'select-workspace-5'
  | 'select-workspace-6'
  | 'select-workspace-7'
  | 'select-workspace-8'
  | 'select-workspace-9';
