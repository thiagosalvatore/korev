import type {
  AgentModel,
  AgentPreference,
  AgentProvider,
  AgentRunResult,
  AgentStatus,
} from './agents';
import type { AuthState, LoginState, TokenResult } from './auth';
import type { InboxSnapshot } from './inbox';
import type { ActionResult, MergeRequest, MergeTool, PrTarget } from './merge';
import type { RepoOwner, RepoPage } from './repos';
import type {
  CollapsibleSection,
  InboxView,
  Settings,
  ThemePreference,
} from './settings';

export enum IpcChannel {
  InboxLoad = 'inbox:load',
  InboxRefresh = 'inbox:refresh',
  InboxUpdated = 'inbox:updated',
  AuthGetState = 'auth:get-state',
  AuthChanged = 'auth:changed',
  AuthStartDeviceFlow = 'auth:start-device-flow',
  AuthCancelDeviceFlow = 'auth:cancel-device-flow',
  AuthUseToken = 'auth:use-token',
  AuthDisconnect = 'auth:disconnect',
  AuthRetryUnlock = 'auth:retry-unlock',
  SettingsLoad = 'settings:load',
  SettingsSetRepos = 'settings:set-repos',
  SettingsSetTheme = 'settings:set-theme',
  SettingsSetLastView = 'settings:set-last-view',
  SettingsSetCollapsedSection = 'settings:set-collapsed-section',
  SettingsSetMergeWith = 'settings:set-merge-with',
  SettingsSetAgent = 'settings:set-agent',
  SettingsSetKept = 'settings:set-kept',
  PrMerge = 'pr:merge',
  PrClose = 'pr:close',
  PrReopen = 'pr:reopen',
  PrCancelQueue = 'pr:cancel-queue',
  SettingsSuggestedRepos = 'settings:suggested-repos',
  SettingsChanged = 'settings:changed',
  ReposOwners = 'repos:owners',
  ReposPage = 'repos:page',
  ReposSearch = 'repos:search',
  ShellOpenGithub = 'shell:open-github',
  ShellOpenAgentInstall = 'shell:open-agent-install',
  AppCommand = 'app:command',
  AgentsStatuses = 'agents:statuses',
  AgentsSignIn = 'agents:sign-in',
  AgentsCancelSignIn = 'agents:cancel-sign-in',
  AgentsModels = 'agents:models',
  AgentsTest = 'agents:test',
}

export type AppCommand =
  | 'show-review'
  | 'show-mine'
  | 'show-settings'
  | 'refresh'
  | 'show-shortcuts';

export type Unsubscribe = () => void;

export interface KorevBridge {
  inbox: {
    load(): Promise<InboxSnapshot>;
    refresh(): Promise<void>;
    onUpdated(listener: (snapshot: InboxSnapshot) => void): Unsubscribe;
  };
  auth: {
    getState(): Promise<AuthState>;
    startDeviceFlow(): Promise<LoginState>;
    cancelDeviceFlow(): Promise<void>;
    useToken(token: string): Promise<TokenResult>;
    disconnect(): Promise<void>;
    retryUnlock(): Promise<void>;
    onChanged(listener: (state: AuthState) => void): Unsubscribe;
  };
  settings: {
    load(): Promise<Settings>;
    setRepos(repos: string[]): Promise<Settings>;
    setTheme(theme: ThemePreference): Promise<Settings>;
    setLastView(view: InboxView): Promise<Settings>;
    setCollapsedSection(
      section: CollapsibleSection,
      collapsed: boolean,
    ): Promise<Settings>;
    setMergeWith(repo: string, tool: MergeTool): Promise<Settings>;
    setAgent(agent: AgentPreference): Promise<Settings>;
    setKept(refs: string[], kept: boolean): Promise<Settings>;
    suggestedRepos(): Promise<string[]>;
    onChanged(listener: (settings: Settings) => void): Unsubscribe;
  };
  repos: {
    owners(): Promise<RepoOwner[]>;
    page(owner: string, cursor: string | null): Promise<RepoPage>;
    search(owner: string, term: string): Promise<string[]>;
  };
  pr: {
    merge(request: MergeRequest): Promise<ActionResult>;
    close(targets: PrTarget[]): Promise<ActionResult>;
    reopen(target: PrTarget): Promise<ActionResult>;
    cancelQueue(target: PrTarget): Promise<ActionResult>;
  };
  agents: {
    statuses(): Promise<AgentStatus[]>;
    signIn(provider: AgentProvider): Promise<AgentStatus[]>;
    cancelSignIn(): Promise<void>;
    models(provider: AgentProvider): Promise<AgentModel[]>;
    test(provider: AgentProvider): Promise<AgentRunResult>;
  };
  shell: {
    openGithub(url: string): Promise<void>;
    openAgentInstall(provider: AgentProvider): Promise<void>;
  };
  app: {
    onCommand(listener: (command: AppCommand) => void): Unsubscribe;
  };
}
