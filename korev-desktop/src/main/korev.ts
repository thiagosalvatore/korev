import { join } from 'node:path';
import {
  AGENT_INFO,
  isAgentProvider,
  type AgentModel,
  type AgentPreference,
  type AgentProvider,
} from '../shared/agents';
import type { AuthState, Connection } from '../shared/auth';
import type { InboxSnapshot } from '../shared/inbox';
import type { ActionResult } from '../shared/merge';
import { IpcChannel } from '../shared/ipc-contract';
import type { RepoOwner, RepoPage } from '../shared/repos';
import type { InboxView, Settings, ThemePreference } from '../shared/settings';
import { buildInbox } from '../inbox/build-inbox';
import { liveKeeps } from '../inbox/keep';
import { myPrsIn } from '../inbox/stacks';
import {
  parseMergeRequest,
  parseMergeTool,
  parseTarget,
  parseTargets,
} from './action-input';
import { createAgentsService } from './agents/agents-service';
import type { CommandRunner } from './agents/command-runner';
import { isGithubUrl } from './app-origin';
import { isPrRef } from './repo-names';
import { createAuthService } from './auth-service';
import type { SecretCipher } from './encrypted-file';
import type { FileSystem } from './file-system';
import { DeviceFlowLogin } from './github/auth';
import { createGithubClient } from './github/client';
import {
  createInboxPoller,
  type InboxPoller,
  type Scheduler,
} from './github/inbox-poller';
import { createGithubWriter } from './github/mutations';
import { createPrActions } from './github/pr-actions';
import {
  GITHUB_OAUTH_CLIENT_ID,
  GITHUB_OAUTH_SCOPES,
  type GithubEndpoints,
} from './github/config';
import { applyRenames, type RepoRename } from './github/repo-access';
import { emptyRepoPage } from './github/repo-picker';
import type { FetchLike } from './github/request';
import { createInboxCache } from './inbox-cache';
import type { IpcHandlers } from './ipc';
import {
  createSettingsStore,
  notifyOnChange,
  type SettingsStore,
} from './settings-store';
import { createTokenStore } from './token-store';

const SETTINGS_FILE = 'settings.json';
const TOKEN_FILE = 'github-token.bin';
const INBOX_CACHE_FILE = 'inbox-cache.bin';
const INVALID_ACTION: ActionResult = {
  ok: false,
  message: 'Korev could not read that request.',
};
const NO_AGENT_MODELS: AgentModel[] = [];

const timers: Scheduler = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => clearTimeout(handle),
};

export interface KorevDeps {
  userDataPath: string;
  tempPath: string;
  env: NodeJS.ProcessEnv;
  runCommand: CommandRunner;
  fs: FileSystem;
  cipher: SecretCipher;
  fetch: FetchLike;
  github: GithubEndpoints;
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
  openExternal(url: string): Promise<void>;
  applyTheme(theme: ThemePreference): void;
  broadcast(
    channel: IpcChannel,
    payload: InboxSnapshot | AuthState | Settings,
  ): void;
  warn(message: string): void;
}

export interface Korev {
  handlers: IpcHandlers;
  settings: SettingsStore;
  inbox: Pick<InboxPoller, 'trigger' | 'suspend' | 'resume' | 'stop'>;
  start(): Promise<void>;
}

function isPrRefString(value: unknown): value is string {
  return typeof value === 'string' && isPrRef(value);
}

function sameRepoSet(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return (
    left.length === right.length && left.every((repo) => rightSet.has(repo))
  );
}

export function createKorev(deps: KorevDeps): Korev {
  const settings = notifyOnChange(
    createSettingsStore({
      fs: deps.fs,
      path: join(deps.userDataPath, SETTINGS_FILE),
    }),
    (changed) => deps.broadcast(IpcChannel.SettingsChanged, changed),
  );
  const tokenStore = createTokenStore({
    cipher: deps.cipher,
    fs: deps.fs,
    path: join(deps.userDataPath, TOKEN_FILE),
  });
  const inboxCache = createInboxCache({
    cipher: deps.cipher,
    fs: deps.fs,
    path: join(deps.userDataPath, INBOX_CACHE_FILE),
  });
  const github = createGithubClient({
    fetch: deps.fetch,
    apiUrl: deps.github.apiUrl,
  });

  const inbox = createInboxPoller({
    client: github,
    buildInbox,
    token: () => auth.token(),
    repos: () => settings.current().repos,
    mergeWith: () => settings.current().mergeWith,
    keptPrs: () => settings.current().keptPrs,
    renameRepos: followRepoRenames,
    now: () => new Date(),
    scheduler: timers,
    publish: publishInbox,
  });

  const prActions = createPrActions({
    writer: createGithubWriter({
      fetch: deps.fetch,
      apiUrl: deps.github.apiUrl,
    }),
    token: () => auth.token(),
    repoMerge: (repo) => inbox.snapshot().repoMerge[repo],
    mergeWith: (repo) => settings.current().mergeWith[repo] ?? 'github',
    now: () => Date.now(),
    scheduler: timers,
    onChange: () => broadcastInbox(inbox.snapshot()),
    refresh: () => void inbox.trigger('manual'),
  });

  const agents = createAgentsService({
    run: deps.runCommand,
    env: deps.env,
    scratchDir: deps.tempPath,
    preference: () => settings.current().agent,
  });

  const auth = createAuthService({
    tokenStore,
    fetchViewer: (token) => github.fetchViewer(token),
    createDeviceFlow: (onToken) =>
      new DeviceFlowLogin({
        fetch: deps.fetch,
        webUrl: deps.github.webUrl,
        clientId: GITHUB_OAUTH_CLIENT_ID,
        scopes: GITHUB_OAUTH_SCOPES,
        now: () => Date.now(),
        sleep: deps.sleep,
        onToken,
      }),
    onStateChange: (state) => deps.broadcast(IpcChannel.AuthChanged, state),
    onConnectionChange: followConnection,
    warn: deps.warn,
  });

  function withActions(snapshot: InboxSnapshot): InboxSnapshot {
    return { ...snapshot, actions: prActions.state() };
  }

  function broadcastInbox(snapshot: InboxSnapshot): void {
    deps.broadcast(IpcChannel.InboxUpdated, withActions(snapshot));
  }

  function pruneKeeps(snapshot: InboxSnapshot): void {
    if (snapshot.truncated.mine) return;
    const { keptPrs } = settings.current();
    const openPrs = myPrsIn(snapshot.mine).map((item) => item.pr);
    const live = liveKeeps(keptPrs, openPrs, new Date());
    if (Object.keys(live).length === Object.keys(keptPrs).length) return;
    settings.update({ keptPrs: live }).catch((error: unknown) => {
      deps.warn(`Could not prune kept PRs: ${String(error)}`);
    });
  }

  function publishInbox(snapshot: InboxSnapshot): void {
    if (snapshot.status === 'live') prActions.reconcile(snapshot);
    broadcastInbox(snapshot);
    if (snapshot.status !== 'live') return;
    pruneKeeps(snapshot);
    inboxCache.save(snapshot).catch((error: unknown) => {
      deps.warn(`Could not cache the inbox: ${String(error)}`);
    });
  }

  async function restoreCachedInbox(): Promise<void> {
    const login = auth.state().connection?.login;
    if (!login) return;
    const cached = await inboxCache.load(login).catch((error: unknown) => {
      deps.warn(`Could not read the cached inbox: ${String(error)}`);
      return null;
    });
    if (cached) inbox.restore(cached);
  }

  async function followConnection(connection: Connection | null) {
    github.clearSessionCache();
    if (!connection) {
      inbox.reset();
      await inboxCache.clear();
      return;
    }
    await restoreCachedInbox();
    void inbox.restart();
  }

  async function setRepos(repos: string[]): Promise<Settings> {
    const previous = settings.current().repos;
    const updated = await settings.update({ repos });
    if (sameRepoSet(previous, updated.repos)) inbox.rebuild();
    else void inbox.restart();
    return updated;
  }

  async function setTheme(theme: ThemePreference): Promise<Settings> {
    const updated = await settings.update({ theme });
    deps.applyTheme(updated.theme);
    return updated;
  }

  function setCollapsedSection(section: string, collapsed: unknown) {
    const { collapsedSections } = settings.current();
    return settings.update({
      collapsedSections: { ...collapsedSections, [section]: collapsed },
    });
  }

  async function setKept(refs: unknown, kept: unknown): Promise<Settings> {
    const current = settings.current();
    const valid = Array.isArray(refs) && refs.every(isPrRefString);
    if (!valid || typeof kept !== 'boolean') return current;
    const keptAt = new Date().toISOString();
    const keptPrs = { ...current.keptPrs };
    for (const ref of refs) {
      if (kept) keptPrs[ref] = keptAt;
      else delete keptPrs[ref];
    }
    const updated = await settings.update({ keptPrs });
    inbox.rebuild();
    return updated;
  }

  function setRepoFilter(view: InboxView, repos: unknown) {
    const { repoFilter } = settings.current();
    return settings.update({ repoFilter: { ...repoFilter, [view]: repos } });
  }

  async function setMergeWith(repo: unknown, tool: unknown) {
    const mergeTool = parseMergeTool(tool);
    const current = settings.current();
    if (typeof repo !== 'string' || !mergeTool) return current;
    const updated = await settings.update({
      mergeWith: { ...current.mergeWith, [repo]: mergeTool },
    });
    inbox.rebuild();
    return updated;
  }

  function forAgent<T>(
    run: (provider: AgentProvider) => Promise<T>,
    invalid: () => Promise<T>,
  ): (value: unknown) => Promise<T> {
    return (value) => (isAgentProvider(value) ? run(value) : invalid());
  }

  function withParsed<T>(
    parse: (value: unknown) => T | null,
    run: (parsed: T) => Promise<ActionResult>,
  ): (value: unknown) => Promise<ActionResult> {
    return (value) => {
      const parsed = parse(value);
      return parsed ? run(parsed) : Promise.resolve(INVALID_ACTION);
    };
  }

  async function followRepoRenames(renames: RepoRename[]): Promise<void> {
    const repos = applyRenames(settings.current().repos, renames);
    await settings.update({ repos });
  }

  function withToken<T>(
    disconnected: T,
    run: (token: string) => Promise<T>,
  ): Promise<T> {
    const token = auth.token();
    return token ? run(token) : Promise.resolve(disconnected);
  }

  function suggestedRepos(): Promise<string[]> {
    return withToken([], (token) => github.fetchSuggestedRepos(token));
  }

  function repoOwners(): Promise<RepoOwner[]> {
    return withToken([], (token) => github.fetchRepoOwners(token));
  }

  function repoPage(owner: string, cursor: unknown): Promise<RepoPage> {
    const pageCursor = typeof cursor === 'string' ? cursor : null;
    return withToken(emptyRepoPage(owner), (token) =>
      github.fetchRepoPage(token, owner, pageCursor),
    );
  }

  function searchRepos(owner: string, term: unknown): Promise<string[]> {
    const searchTerm = typeof term === 'string' ? term : '';
    return withToken([], (token) =>
      github.searchRepos(token, owner, searchTerm),
    );
  }

  async function openGithub(url: string): Promise<void> {
    if (isGithubUrl(url)) await deps.openExternal(url);
  }

  async function openAgentInstall(provider: AgentProvider): Promise<void> {
    await deps.openExternal(AGENT_INFO[provider].installUrl);
  }

  async function useToken(token: unknown) {
    if (typeof token !== 'string') {
      return { ok: false as const, message: 'Paste a GitHub token.' };
    }
    return auth.useToken(token);
  }

  const handlers: IpcHandlers = {
    [IpcChannel.InboxLoad]: () => withActions(inbox.snapshot()),
    [IpcChannel.InboxRefresh]: () => inbox.trigger('manual'),
    [IpcChannel.AuthGetState]: () => auth.state(),
    [IpcChannel.AuthStartDeviceFlow]: () => auth.startDeviceFlow(),
    [IpcChannel.AuthCancelDeviceFlow]: () => auth.cancelDeviceFlow(),
    [IpcChannel.AuthUseToken]: useToken,
    [IpcChannel.AuthDisconnect]: () => auth.disconnect(),
    [IpcChannel.AuthRetryUnlock]: () => auth.retryUnlock(),
    [IpcChannel.SettingsLoad]: () => settings.current(),
    [IpcChannel.SettingsSetRepos]: setRepos,
    [IpcChannel.SettingsSetTheme]: setTheme,
    [IpcChannel.SettingsSetLastView]: (lastView: InboxView) =>
      settings.update({ lastView }),
    [IpcChannel.SettingsSetCollapsedSection]: setCollapsedSection,
    [IpcChannel.SettingsSuggestedRepos]: suggestedRepos,
    [IpcChannel.ReposOwners]: repoOwners,
    [IpcChannel.ReposPage]: repoPage,
    [IpcChannel.ReposSearch]: searchRepos,
    [IpcChannel.ShellOpenGithub]: openGithub,
    [IpcChannel.ShellOpenAgentInstall]: forAgent(
      openAgentInstall,
      async () => undefined,
    ),
    [IpcChannel.SettingsSetMergeWith]: setMergeWith,
    [IpcChannel.SettingsSetKept]: setKept,
    [IpcChannel.SettingsSetRepoFilter]: setRepoFilter,
    [IpcChannel.PrMerge]: withParsed(parseMergeRequest, prActions.merge),
    [IpcChannel.PrClose]: withParsed(parseTargets, prActions.close),
    [IpcChannel.PrReopen]: withParsed(parseTarget, prActions.reopen),
    [IpcChannel.PrCancelQueue]: withParsed(parseTarget, prActions.cancelQueue),
    [IpcChannel.SettingsSetAgent]: (agent: AgentPreference) =>
      settings.update({ agent }),
    [IpcChannel.AgentsStatuses]: () => agents.statuses(),
    [IpcChannel.AgentsSignIn]: forAgent(agents.signIn, agents.statuses),
    [IpcChannel.AgentsCancelSignIn]: () => agents.cancelSignIn(),
    [IpcChannel.AgentsModels]: forAgent(
      agents.models,
      async () => NO_AGENT_MODELS,
    ),
    [IpcChannel.AgentsTest]: forAgent(agents.test, async () => INVALID_ACTION),
  };

  async function start(): Promise<void> {
    const { settings: loaded, problem } = await settings.load();
    if (problem) deps.warn(problem);
    deps.applyTheme(loaded.theme);
    await auth.init();
    await restoreCachedInbox();
    void inbox.start();
  }

  const lifecycle: Korev['inbox'] = {
    trigger: (reason) => inbox.trigger(reason),
    suspend: () => inbox.suspend(),
    resume: () => inbox.resume(),
    stop: () => {
      inbox.stop();
      prActions.stop();
      agents.stop();
    },
  };

  return { handlers, settings, inbox: lifecycle, start };
}
