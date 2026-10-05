import { join } from 'node:path';
import { DEFAULT_INSTRUCTIONS } from '../shared/agent-tasks';
import type {
  AgentTaskKind,
  AiTaskSettings,
  ExplanationView,
} from '../shared/agent-tasks';
import {
  AGENT_INFO,
  isAgentProvider,
  type AgentModel,
  type AgentPreference,
  type AgentProvider,
} from '../shared/agents';
import type { AuthState, Connection } from '../shared/auth';
import type { InboxSnapshot } from '../shared/inbox';
import type { ActionResult, PrTarget } from '../shared/merge';
import { prRef } from '../shared/pr-ref';
import type { PullRequest } from '../shared/pull-request';
import { explanationDocument } from '../shared/explanation-document';
import { IpcChannel } from '../shared/ipc-contract';
import type { RepoOwner, RepoPage } from '../shared/repos';
import type { InboxView, Settings, ThemePreference } from '../shared/settings';
import { buildInbox } from '../inbox/build-inbox';
import { liveKeeps } from '../inbox/keep';
import { myPrsIn, pullRequestsIn } from '../inbox/stacks';
import {
  parseAnswers,
  parseMergeRequest,
  parseMergeTool,
  parseTarget,
  parseTargets,
} from './action-input';
import { createAgentTasks } from './agent-tasks/engine';
import { createExplainTask } from './agent-tasks/explain';
import {
  createExplanations,
  explanationBody,
} from './agent-tasks/explanations';
import { createTaskStore } from './agent-tasks/task-store';
import { createAgentsService } from './agents/agents-service';
import type { CommandRunner } from './agents/command-runner';
import { isGithubUrl } from './app-origin';
import { createCheckouts } from './checkouts';
import { isPrRef, splitRepoName } from './repo-names';
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
import { createTaskReads } from './github/task-reads';
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
const AGENT_TASKS_FILE = 'agent-tasks.bin';
const EXPLANATIONS_FILE = 'explanations.bin';
const EXPLANATION_COPIES_DIR = 'korev-explanations';
const CHECKOUTS_BUSY = 'Wait for Korev to finish its running tasks first.';
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
  openPath(path: string): Promise<void>;
  prefersDark(): boolean;
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
    fs: deps.fs,
    preference: () => settings.current().agent,
  });

  const checkouts = createCheckouts({
    run: deps.runCommand,
    env: deps.env,
    root: deps.userDataPath,
    gitUrl: deps.github.gitUrl,
    token: () => auth.token(),
    now: () => Date.now(),
  });

  const taskReads = createTaskReads({
    fetch: deps.fetch,
    apiUrl: deps.github.apiUrl,
  });

  const explanations = createExplanations({
    cipher: deps.cipher,
    fs: deps.fs,
    path: join(deps.userDataPath, EXPLANATIONS_FILE),
  });
  const explanationCopies = new Set<string>();

  const agentTasks = createAgentTasks({
    tasks: {
      explain: createExplainTask({
        checkouts,
        runAgent: agents.run,
        prBody: async (pr) => (await readPrText(pr))?.body ?? '',
        format: () => settings.current().aiTasks.explainFormat,
        save: (ref, explanation) => explanations.save(ref, explanation),
        now: () => Date.now(),
      }),
    },
    findPr,
    prState: async (ref) => {
      const [repo, number] = ref.split('#');
      return (
        (await readPrText({ repo, number: Number(number) }))?.state ?? null
      );
    },
    instructions: taskInstructions,
    store: createTaskStore({
      cipher: deps.cipher,
      fs: deps.fs,
      path: join(deps.userDataPath, AGENT_TASKS_FILE),
    }),
    login: () => auth.state().connection?.login ?? null,
    releaseCheckout: (ref) => {
      const [repo, number] = ref.split('#');
      return checkouts.remove({ repo, number: Number(number) });
    },
    now: () => Date.now(),
    onChange: () => broadcastInbox(inbox.snapshot()),
    onSettled: () => undefined,
    warn: deps.warn,
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
    return {
      ...snapshot,
      actions: prActions.state(),
      agentTasks: agentTasks.state(),
    };
  }

  function findPr(ref: string): PullRequest | null {
    return (
      pullRequestsIn(inbox.snapshot()).find((pr) => prRef(pr) === ref) ?? null
    );
  }

  function readPrText(pr: { repo: string; number: number }) {
    const token = auth.token();
    return token ? taskReads.pullRequestText(token, pr) : Promise.resolve(null);
  }

  function taskInstructions(kind: AgentTaskKind): string {
    return (
      settings.current().aiTasks.instructions[kind] ??
      DEFAULT_INSTRUCTIONS[kind]
    );
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
    if (snapshot.status === 'live') {
      prActions.reconcile(snapshot);
      agentTasks.reconcile(snapshot);
    }
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

  async function removeExplanationCopies(): Promise<void> {
    const copies = [...explanationCopies];
    explanationCopies.clear();
    await Promise.all(copies.map((path) => deps.fs.remove(path)));
  }

  async function forgetAiWork(): Promise<void> {
    await agentTasks.clear();
    await explanations.clear();
    await removeExplanationCopies();
    await checkouts.removeAll([]);
  }

  function sweepCheckouts(): void {
    checkouts
      .sweep(settings.current().repos, agentTasks.keptRefs())
      .catch((error: unknown) => {
        deps.warn(`Could not clean up checkouts: ${String(error)}`);
      });
  }

  async function restoreAiWork(): Promise<void> {
    const login = auth.state().connection?.login;
    if (!login) return;
    await agentTasks.restore(login);
    await explanations.load(login).catch((error: unknown) => {
      deps.warn(`Could not read saved explanations: ${String(error)}`);
    });
    sweepCheckouts();
  }

  async function followConnection(connection: Connection | null) {
    github.clearSessionCache();
    if (!connection) {
      inbox.reset();
      await inboxCache.clear();
      await forgetAiWork().catch((error: unknown) => {
        deps.warn(`Could not remove Korev's AI work: ${String(error)}`);
      });
      return;
    }
    await restoreCachedInbox();
    await restoreAiWork();
    void inbox.restart();
  }

  async function setRepos(repos: string[]): Promise<Settings> {
    const previous = settings.current().repos;
    const updated = await settings.update({ repos });
    if (sameRepoSet(previous, updated.repos)) inbox.rebuild();
    else {
      void inbox.restart();
      sweepCheckouts();
    }
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

  function setAiTasks(patch: unknown): Promise<Settings> {
    if (typeof patch !== 'object' || patch === null) {
      return Promise.resolve(settings.current());
    }
    const aiTasks: AiTaskSettings = {
      ...settings.current().aiTasks,
      ...(patch as Partial<AiTaskSettings>),
    };
    return settings.update({ aiTasks });
  }

  function explain(target: PrTarget, regenerate: unknown): ActionResult {
    const ref = prRef(target);
    const stored = explanations.get(ref);
    const current = findPr(ref)?.headRefOid;
    if (regenerate !== true && stored && stored.headOid === current) {
      return { ok: true };
    }
    return agentTasks.start(ref, 'explain');
  }

  function explanationView(target: PrTarget): ExplanationView | null {
    const ref = prRef(target);
    const stored = explanations.get(ref);
    if (!stored) return null;
    const current = findPr(ref)?.headRefOid;
    return {
      headOid: stored.headOid,
      body: explanationBody(stored),
      stale: current !== undefined && current !== stored.headOid,
    };
  }

  async function openExplanation(target: PrTarget): Promise<void> {
    const view = explanationView(target);
    if (!view) return;
    const { owner, name } = splitRepoName(target.repo);
    const path = join(
      deps.tempPath,
      EXPLANATION_COPIES_DIR,
      `${owner}-${name}-${target.number}.html`,
    );
    const theme = deps.prefersDark() ? 'dark' : 'light';
    await deps.fs.writeAtomic(path, explanationDocument(view.body, theme));
    explanationCopies.add(path);
    await deps.openPath(path);
  }

  async function removeCheckouts(): Promise<ActionResult> {
    if (agentTasks.isBusy()) return { ok: false, message: CHECKOUTS_BUSY };
    await checkouts.removeAll(agentTasks.keptRefs());
    return { ok: true };
  }

  function withTarget<T>(
    run: (target: PrTarget, ...rest: unknown[]) => T,
    invalid: T,
  ): (value: unknown, ...rest: unknown[]) => T {
    return (value, ...rest) => {
      const target = parseTarget(value);
      return target ? run(target, ...rest) : invalid;
    };
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
    [IpcChannel.SettingsSetAiTasks]: setAiTasks,
    [IpcChannel.AiExplain]: withTarget(explain, INVALID_ACTION),
    [IpcChannel.AiExplanation]: withTarget(explanationView, null),
    [IpcChannel.AiOpenExplanation]: withTarget(
      openExplanation,
      Promise.resolve(),
    ),
    [IpcChannel.AiAnswer]: withTarget((target, answers) => {
      const parsed = parseAnswers(answers);
      return parsed ? agentTasks.answer(prRef(target), parsed) : INVALID_ACTION;
    }, INVALID_ACTION),
    [IpcChannel.AiCancel]: withTarget(
      (target) => agentTasks.cancel(prRef(target)),
      undefined,
    ),
    [IpcChannel.AiDismiss]: withTarget(
      (target) => agentTasks.dismiss(prRef(target)),
      Promise.resolve(),
    ),
    [IpcChannel.AiCheckoutsSize]: () => checkouts.size(),
    [IpcChannel.AiRemoveCheckouts]: removeCheckouts,
  };

  async function start(): Promise<void> {
    const { settings: loaded, problem } = await settings.load();
    if (problem) deps.warn(problem);
    deps.applyTheme(loaded.theme);
    await auth.init();
    await restoreCachedInbox();
    await restoreAiWork();
    void inbox.start();
  }

  const lifecycle: Korev['inbox'] = {
    trigger: (reason) => inbox.trigger(reason),
    suspend: () => inbox.suspend(),
    resume: () => inbox.resume(),
    stop: () => {
      inbox.stop();
      prActions.stop();
      agentTasks.stop();
      agents.stop();
      void removeExplanationCopies();
    },
  };

  return { handlers, settings, inbox: lifecycle, start };
}
