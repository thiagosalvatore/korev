import type {
  AgentKind,
  AppCommand,
  AskChat,
  AppState,
  ChatItem,
  ChatSession,
  ChatUpdate,
  EditorId,
  FileChange,
  IssueSummary,
  PermissionResponse,
  PullRequestSummary,
  RepoConfig,
  ReviewComment,
  SearchMatch,
  SearchOptions,
  TurnRange,
  WorkspaceSource,
  PrStatus,
  Repo,
  RepoFolder,
  RepoPrompts,
  RepoScripts,
  Result,
  SendOptions,
  Settings,
  Skill,
  TerminalExit,
  TerminalKind,
  TerminalPreset,
  TerminalOutput,
  TerminalSize,
  Workspace,
} from './model';

export interface KorevApi {
  getState(): Promise<AppState>;
  addRepo(): Promise<Result<Repo | null>>;
  cloneRepo(url: string): Promise<Result<Repo>>;
  importFromConductor(): Promise<{ repos: number; settings: number }>;
  removeRepo(repoId: string): Promise<void>;
  updateRepo(
    repoId: string,
    patch: {
      defaultBranch?: string;
      spotlightTesting?: boolean;
      prompts?: RepoPrompts;
    },
  ): Promise<void>;
  toggleSpotlight(workspaceId: string): Promise<Result>;
  updateRepoScripts(repoId: string, scripts: RepoScripts): Promise<void>;
  createFolder(name: string): Promise<RepoFolder>;
  renameFolder(folderId: string, name: string): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  moveRepo(
    repoId: string,
    target: { folderId: string | null; beforeId: string | null },
  ): Promise<void>;
  moveFolder(folderId: string, beforeId: string | null): Promise<void>;
  createWorkspaces(
    repoIds: string[],
    task: SendOptions | null,
    source?: WorkspaceSource,
  ): Promise<Result<Workspace[]>>;
  openPrAsWorkspace(
    workspaceId: string,
    prNumber: number,
  ): Promise<Result<Workspace>>;
  listBranches(repoId: string): Promise<string[]>;
  listPullRequests(repoId: string): Promise<PullRequestSummary[]>;
  listIssues(repoId: string): Promise<IssueSummary[]>;
  setBaseBranch(workspaceId: string, branch: string): Promise<void>;
  workspaceConfig(workspaceId: string): Promise<RepoConfig>;
  repoConfig(repoId: string): Promise<RepoConfig>;
  listSkills(repoId: string): Promise<Skill[]>;
  repoIcon(repoId: string): Promise<string | null>;
  startReview(workspaceId: string): Promise<Result<string>>;
  archiveWorkspace(workspaceId: string): Promise<Result>;
  restoreWorkspace(workspaceId: string): Promise<Result>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  focusWorkspace(workspaceId: string | null): Promise<void>;
  createAskChat(repoIds: string[]): Promise<AskChat>;
  deleteAskChat(askChatId: string): Promise<void>;
  startFromAsk(askChatId: string): Promise<Result<Workspace[]>>;
  newSession(workspaceId: string, agent: AgentKind): Promise<ChatSession>;
  closeSession(workspaceId: string, sessionId: string): Promise<void>;
  updateSession(
    sessionId: string,
    patch: {
      agent?: AgentKind;
      model?: string;
      effort?: string;
      fast?: boolean;
      planMode?: boolean;
      title?: string;
    },
  ): Promise<void>;
  transcript(sessionId: string): Promise<ChatItem[]>;
  send(sessionId: string, options: SendOptions): Promise<Result>;
  stop(sessionId: string): Promise<void>;
  respondPermission(
    sessionId: string,
    itemId: string,
    response: PermissionResponse,
  ): Promise<Result>;
  revert(sessionId: string, itemId: string): Promise<Result<string>>;
  saveAttachment(
    workspaceId: string,
    name: string,
    base64: string,
  ): Promise<Result<string>>;
  slashCommands(workspaceId: string): Promise<string[]>;
  repoSlashCommands(repoId: string): Promise<string[]>;
  createPr(workspaceId: string, sessionId: string): Promise<Result>;
  fixChecks(
    workspaceId: string,
    sessionId: string,
    prNumber: number,
  ): Promise<Result>;
  resolveConflicts(
    workspaceId: string,
    sessionId: string,
    prNumber: number,
  ): Promise<Result>;
  changes(workspaceId: string): Promise<FileChange[]>;
  fileDiff(
    workspaceId: string,
    path: string,
    range?: TurnRange | null,
  ): Promise<string>;
  rangeChanges(workspaceId: string, range: TurnRange): Promise<FileChange[]>;
  searchFiles(
    workspaceId: string,
    query: string,
    options: SearchOptions,
  ): Promise<SearchMatch[]>;
  writeFile(
    workspaceId: string,
    path: string,
    contents: string,
  ): Promise<Result>;
  reviewComments(
    workspaceId: string,
    prNumber: number,
  ): Promise<ReviewComment[]>;
  listFiles(workspaceId: string): Promise<string[]>;
  readFile(workspaceId: string, path: string): Promise<string | null>;
  prStatuses(workspaceId: string): Promise<PrStatus[]>;
  mergePr(workspaceId: string, prNumber: number): Promise<Result>;
  openIn(workspaceId: string, editor: EditorId): Promise<Result>;
  openExternal(url: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  openTerminal(
    ref: string,
    workspaceId: string,
    kind: TerminalKind,
    size: TerminalSize,
    preset?: TerminalPreset,
  ): Promise<Result<string>>;
  startScript(
    workspaceId: string,
    kind: TerminalKind,
    scriptId?: string,
  ): Promise<Result>;
  stopScript(workspaceId: string, kind: TerminalKind): Promise<void>;
  writeTerminal(ref: string, data: string): Promise<void>;
  resizeTerminal(ref: string, size: TerminalSize): Promise<void>;
  closeTerminal(ref: string): Promise<void>;
}

export interface Toast {
  title: string;
  tone: 'danger' | 'success' | 'neutral';
}

export interface KorevEvents {
  state: AppState;
  chat: ChatUpdate;
  'terminal-output': TerminalOutput;
  'terminal-exit': TerminalExit;
  command: AppCommand;
  'focus-workspace': string;
  toast: Toast;
}

export type Unsubscribe = () => void;

export interface KorevBridge {
  call(method: string, args: unknown[]): Promise<unknown>;
  on<E extends keyof KorevEvents>(
    event: E,
    listener: (payload: KorevEvents[E]) => void,
  ): Unsubscribe;
}

export const CALL_CHANNEL = 'korev:call';

export function eventChannel(event: keyof KorevEvents): string {
  return `korev:event:${event}`;
}
