export type AgentKind = 'claude' | 'codex';

export const AGENT_KINDS: readonly AgentKind[] = ['claude', 'codex'];

export const AGENT_LABELS: Record<AgentKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

export const STOP_BEFORE_SWITCHING =
  'Stop the agent before switching to another one';

export interface AgentModel {
  id: string;
  label: string;
}

export interface ModelChoice extends AgentModel {
  agent: AgentKind;
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

export interface AppRunScript {
  name: string;
  command: string;
}

export interface RepoScripts {
  setup: string;
  run: AppRunScript[];
  archive: string;
  runMode: 'concurrent' | 'nonconcurrent';
}

export const EMPTY_SCRIPTS: RepoScripts = {
  setup: '',
  run: [],
  archive: '',
  runMode: 'concurrent',
};

export const SINGLE_RUN_SCRIPT_NAME = 'run';

export function runScriptsFromText(run: unknown): AppRunScript[] {
  if (Array.isArray(run)) return run as AppRunScript[];
  return typeof run === 'string' && run.trim()
    ? [{ name: SINGLE_RUN_SCRIPT_NAME, command: run }]
    : [];
}

export type PromptKind =
  | 'general'
  | 'code_review'
  | 'create_pr'
  | 'fix_errors'
  | 'resolve_merge_conflicts'
  | 'rename_branch';

export type RepoPrompts = Partial<Record<PromptKind, string>>;

export interface Skill {
  name: string;
  agents: AgentKind[];
}

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

export type RepoConfigSource =
  | 'settings.toml'
  | 'korev.json'
  | 'conductor'
  | 'app';

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
  prompts: RepoPrompts;
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
  prompts?: RepoPrompts;
  folderId?: string | null;
}

export interface RepoFolder {
  id: string;
  name: string;
}

export type WorkspaceSource =
  | { kind: 'new'; baseBranch: string | null }
  | { kind: 'branch'; branch: string }
  | { kind: 'worktree'; path: string; branch: string; baseBranch: string }
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
  planMode: boolean;
  agentSessionId: string | null;
  forkOnNextTurn: boolean;
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
  restoredAt: string | null;
  archiveSnapshot: Checkpoint | null;
  sessions: ChatSession[];
  prs: TrackedPr[];
}

export interface TrackedPr {
  url: string;
  sessionId: string | null;
}

export interface AskChat {
  id: string;
  repoIds: string[];
  session: ChatSession;
  createdAt: string;
  lastMessageAt: string;
}

export interface Settings {
  theme: ThemePreference;
  defaultAgent: AgentKind;
  defaultModels: Record<AgentKind, string>;
  branchPrefix: string;
  workspacesRoot: string;
  defaultEffort: Record<AgentKind, string>;
  defaultPlanMode: boolean;
  reviewModel: ReviewModel | null;
  autoRenameBranches: boolean;
  deleteBranchOnArchive: boolean;
  archiveOnMerge: boolean;
  toolApprovals: boolean;
  loadout: string[];
  snippets: Snippet[];
  editor: EditorId;
  notifications: boolean;
  notificationSound: boolean;
  keepAwake: boolean;
  remoteAccess: boolean;
  remotePort: number;
  phoneNotificationsUrl: string;
  windowBounds: WindowBounds | null;
}

export interface ReviewModel {
  agent: AgentKind;
  model: string;
  effort: string;
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

export type ReviewDecision =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REVIEW_REQUIRED';

export interface PrStatus {
  number: number;
  url: string;
  title: string;
  state: PrState;
  isDraft: boolean;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  reviewDecision: ReviewDecision | null;
  mergedAt: string | null;
  headRefName: string;
  baseRefName: string;
  createdAt: string;
  checks: PrCheck[];
  stack: PrStack | null;
}

export interface PrStack {
  openBelow: number;
  openAbove: number;
  belowReady: boolean;
}

export type MergeScope = 'pr' | 'partial-stack' | 'stack';

export function mergeScope(pr: PrStatus): MergeScope {
  if (!pr.stack || pr.stack.openBelow === 0) return 'pr';
  return pr.stack.openAbove === 0 ? 'stack' : 'partial-stack';
}

export interface GitWorktree {
  path: string;
  branch: string | null;
}

export interface WorkspaceRuntime {
  status: WorkspaceStatus;
  unread: boolean;
  stats: DiffStats | null;
  prs: PrStatus[];
  strayWorktrees: GitWorktree[];
  message: string | null;
  pendingPrompt: string | null;
  runUrl: string | null;
}

export type PrStep =
  | 'create'
  | 'archive'
  | 'resolve-conflicts'
  | 'fix-errors'
  | 'checks-running'
  | 'draft'
  | 'changes-requested'
  | 'waiting-for-review'
  | 'stack-blocked'
  | 'merge'
  | 'merge-partial-stack'
  | 'merge-stack';

export type PrStepTone = 'primary' | 'secondary' | 'success' | 'danger';

export const PR_STEPS: Record<PrStep, { label: string; tone: PrStepTone }> = {
  create: { label: 'Create PR', tone: 'primary' },
  archive: { label: 'Archive', tone: 'secondary' },
  'resolve-conflicts': { label: 'Resolve conflicts', tone: 'danger' },
  'fix-errors': { label: 'Fix errors', tone: 'danger' },
  'checks-running': { label: 'Checks running', tone: 'secondary' },
  draft: { label: 'Draft', tone: 'secondary' },
  'changes-requested': { label: 'Changes requested', tone: 'danger' },
  'waiting-for-review': { label: 'Waiting for review', tone: 'secondary' },
  'stack-blocked': { label: "Stack can't be merged", tone: 'secondary' },
  merge: { label: 'Merge', tone: 'success' },
  'merge-partial-stack': { label: 'Merge partial stack', tone: 'success' },
  'merge-stack': { label: 'Merge stack', tone: 'success' },
};

const MERGE_STEP_BY_SCOPE: Record<MergeScope, PrStep> = {
  pr: 'merge',
  'partial-stack': 'merge-partial-stack',
  stack: 'merge-stack',
};

export const MERGE_STEPS: ReadonlySet<PrStep> = new Set(
  Object.values(MERGE_STEP_BY_SCOPE),
);

export function mergeStep(pr: PrStatus): PrStep {
  return MERGE_STEP_BY_SCOPE[mergeScope(pr)];
}

export function stackBlocked(pr: PrStatus): boolean {
  return pr.stack?.belowReady === false;
}

export function nextPrStep(pr: PrStatus | null): PrStep {
  if (!pr || pr.state === 'CLOSED') return 'create';
  if (pr.state === 'MERGED') return 'archive';
  if (pr.mergeable === 'CONFLICTING') return 'resolve-conflicts';
  if (pr.checks.some((check) => check.state === 'failure')) return 'fix-errors';
  if (pr.checks.some((check) => check.state === 'pending'))
    return 'checks-running';
  if (pr.isDraft) return 'draft';
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'changes-requested';
  if (pr.reviewDecision === 'REVIEW_REQUIRED') return 'waiting-for-review';
  if (stackBlocked(pr)) return 'stack-blocked';
  return mergeStep(pr);
}

export type PrBadge =
  | 'merged'
  | 'closed'
  | 'conflicts'
  | 'checks-failing'
  | 'checks-running'
  | 'draft'
  | 'open';

export const PR_BADGE_LABELS: Record<PrBadge, string> = {
  merged: 'Merged',
  closed: 'Closed',
  conflicts: 'Conflicts',
  'checks-failing': 'Checks failing',
  'checks-running': 'Checks running',
  draft: 'Draft',
  open: 'Open',
};

export function prBadge(pr: PrStatus): PrBadge {
  if (pr.state === 'MERGED') return 'merged';
  if (pr.state === 'CLOSED') return 'closed';
  if (pr.mergeable === 'CONFLICTING') return 'conflicts';
  if (pr.checks.some((check) => check.state === 'failure'))
    return 'checks-failing';
  if (pr.checks.some((check) => check.state === 'pending'))
    return 'checks-running';
  if (pr.isDraft) return 'draft';
  return 'open';
}

export function primaryPr(
  workspace: Workspace,
  runtime: WorkspaceRuntime | undefined,
  chosenUrl?: string | null,
): PrStatus | null {
  const prs = runtime?.prs ?? [];
  const chosen = prs.find((pr) => pr.url === chosenUrl);
  if (chosen) return chosen;
  const open = prs.filter((pr) => pr.state === 'OPEN');
  return (
    open.find((pr) => pr.headRefName === workspace.branch) ??
    open[0] ??
    prs[0] ??
    null
  );
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
  folders: RepoFolder[];
  rootOrder: string[];
  workspaces: Workspace[];
  askChats: AskChat[];
  settings: Settings;
  runtime: Record<string, WorkspaceRuntime>;
  runningSessions: string[];
  runningTerminals: string[];
  planLimits: PlanLimits;
  spotlights: Record<string, string>;
  agents: AgentAvailability[];
  editors: EditorApp[];
  remote: RemoteStatus;
}

export interface RemoteStatus {
  address: string | null;
  devices: string[];
  onTailnet: boolean;
  error: string | null;
}

export interface RemotePairing {
  url: string;
  token: string;
}

export interface Checkpoint {
  head: string;
  snapshot: string;
}

export interface ContextUsage {
  usedTokens: number;
  windowTokens: number;
}

export interface PlanLimit {
  label: string;
  usedPercent: number;
  resetsAt: number | null;
}

export interface TurnUsage {
  context: ContextUsage | null;
  limits: PlanLimit[];
}

export type PlanLimits = Partial<Record<AgentKind, PlanLimit[]>>;

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
      context?: ContextUsage | null;
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
  lanes?: PlanLane[];
}

export interface PlanLane {
  name: string;
  body: string;
}

const LANES_HEADING = '## Lanes';
const LANE_PREFIX = '### ';
const SECTION_PREFIX = '## ';

export function planLanes(plan: string): PlanLane[] {
  const lines = plan.split('\n');
  const start = lines.findIndex((line) => line.trim() === LANES_HEADING);
  if (start === -1) return [];
  const lanes: PlanLane[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith(SECTION_PREFIX)) break;
    if (line.startsWith(LANE_PREFIX))
      lanes.push({ name: line.slice(LANE_PREFIX.length).trim(), body: '' });
    else if (lanes.length) lanes.at(-1)!.body += `${line}\n`;
  }
  if (lanes.length < 2) return [];
  return lanes.map((lane) => ({ ...lane, body: lane.body.trim() }));
}

export const DISMISS_QUESTION: PermissionResponse = {
  allow: false,
  message: 'The user dismissed the question.',
};

export function answerQuestions(
  questions: AgentQuestion[],
  answers: Record<string, string[]>,
): PermissionResponse | null {
  if (!questions.every((question) => answers[question.question]?.length))
    return null;
  return {
    allow: true,
    answers: Object.fromEntries(
      Object.entries(answers).map(([question, value]) => [
        question,
        value.join(', '),
      ]),
    ),
  };
}

export interface ChatUpdate {
  sessionId: string;
  item: ChatItem;
}

export function upsertChatItem(items: ChatItem[], item: ChatItem): ChatItem[] {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...items, item];
  const next = [...items];
  next[index] = item;
  return next;
}

export interface SendOptions {
  text: string;
  agent: AgentKind;
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
