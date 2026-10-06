import type {
  AgentKind,
  AppCommand,
  AppState,
  ChatItem,
  ChatSession,
  ChatUpdate,
  EditorId,
  FileChange,
  PrStatus,
  Repo,
  RepoScripts,
  Result,
  SendOptions,
  Settings,
  TerminalExit,
  TerminalKind,
  TerminalOutput,
  TerminalSize,
  Workspace,
} from './model';

export interface KorevApi {
  getState(): Promise<AppState>;
  addRepo(): Promise<Result<Repo | null>>;
  cloneRepo(url: string): Promise<Result<Repo>>;
  removeRepo(repoId: string): Promise<void>;
  updateRepo(repoId: string, patch: { defaultBranch?: string }): Promise<void>;
  updateRepoScripts(repoId: string, scripts: RepoScripts): Promise<void>;
  createWorkspace(repoId: string): Promise<Result<Workspace>>;
  archiveWorkspace(workspaceId: string): Promise<Result>;
  restoreWorkspace(workspaceId: string): Promise<Result>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  focusWorkspace(workspaceId: string | null): Promise<void>;
  newSession(workspaceId: string, agent: AgentKind): Promise<ChatSession>;
  closeSession(workspaceId: string, sessionId: string): Promise<void>;
  transcript(sessionId: string): Promise<ChatItem[]>;
  send(sessionId: string, options: SendOptions): Promise<Result>;
  stop(sessionId: string): Promise<void>;
  revert(sessionId: string, itemId: string): Promise<Result<string>>;
  saveAttachment(
    workspaceId: string,
    name: string,
    base64: string,
  ): Promise<Result<string>>;
  slashCommands(workspaceId: string): Promise<string[]>;
  createPr(workspaceId: string, sessionId: string): Promise<Result>;
  fixChecks(workspaceId: string, sessionId: string): Promise<Result>;
  resolveConflicts(workspaceId: string, sessionId: string): Promise<Result>;
  changes(workspaceId: string): Promise<FileChange[]>;
  fileDiff(workspaceId: string, path: string): Promise<string>;
  listFiles(workspaceId: string): Promise<string[]>;
  readFile(workspaceId: string, path: string): Promise<string | null>;
  prStatus(workspaceId: string): Promise<PrStatus | null>;
  mergePr(workspaceId: string): Promise<Result>;
  openIn(workspaceId: string, editor: EditorId): Promise<Result>;
  openExternal(url: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  openTerminal(
    ref: string,
    workspaceId: string,
    kind: TerminalKind,
    size: TerminalSize,
  ): Promise<Result<string>>;
  startScript(workspaceId: string, kind: TerminalKind): Promise<Result>;
  stopScript(workspaceId: string, kind: TerminalKind): Promise<void>;
  writeTerminal(ref: string, data: string): Promise<void>;
  resizeTerminal(ref: string, size: TerminalSize): Promise<void>;
  closeTerminal(ref: string): Promise<void>;
}

export interface KorevEvents {
  state: AppState;
  chat: ChatUpdate;
  'terminal-output': TerminalOutput;
  'terminal-exit': TerminalExit;
  command: AppCommand;
  'focus-workspace': string;
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
