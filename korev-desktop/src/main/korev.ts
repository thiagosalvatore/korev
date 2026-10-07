import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { KorevApi } from '../shared/api';
import {
  EMPTY_SCRIPTS,
  hasWorktree,
  type AgentAvailability,
  type AppState,
  type EditorApp,
  type EditorId,
  type PromptKind,
  type PrStatus,
  type Repo,
  type RepoFolder,
  type RepoScripts,
  type TerminalPreset,
  type Result,
  type Settings,
  type Workspace,
  type WorkspaceRuntime,
  type WorkspaceStatus,
} from '../shared/model';
import { detectAgents } from './agents';
import { askWorktreePath } from './ask-worktrees';
import { createChats, latestPlan, type TurnPrLinks } from './chats';
import { readConductorRepos, readConductorSettings } from './conductor-import';
import {
  errorMessage,
  NotFoundError,
  terminalRef,
  type Context,
  type CoreDeps,
} from './context';
import type { FileSystem } from './file-system';
import {
  changedFiles,
  cloneRepo,
  createGit,
  defaultBranch,
  fileDiff,
  listFiles,
  removeWorktree,
  listBranches,
  originOwner,
  repoRoot,
} from './git';
import {
  createPrPrompt,
  fetchPrStatus,
  onPrBranch,
  fetchReviewComments,
  fixChecksPrompt,
  mergePr,
  resolveConflictsPrompt,
  REVIEW_PROMPT,
} from './pull-requests';
import { expandPort, loadRepoConfig, withPrompt } from './repo-config';
import { listSkills } from './skills';
import { listIssues, listPullRequests } from './sources';
import { rangeFileDiff, rangeFiles, searchFiles } from './git-review';
import { findLocalUrl } from './workspace-setup';
import { createSpotlight } from './spotlight';
import { repoFavicon } from './repo-icon';
import { openStore, type PersistedState } from './store';
import { createTerminals, type SpawnPty } from './terminals';
import {
  archiveWorkspace,
  createWorkspaces,
  deleteWorkspace,
  newChatSession,
  onScriptExit,
  refreshStats,
  restoreWorkspace,
  scriptEnv,
  startScript,
  switchAgent,
  workspaceConfig,
  type SendTask,
  activeWorkspaces,
} from './workspaces';

export const PR_POLL_MS = 30_000;
const PR_CLOCK_SKEW_MS = 60_000;
const FILE_MAX_BYTES = 1_000_000;
const CONTEXT_DIR = '.context';
const ATTACHMENTS_DIR = 'attachments';
const COMMAND_EXTENSION = '.md';
const BUILTIN_COMMANDS = ['compact', 'review', 'init'];
const IMPLEMENT_PLAN_TASK = 'Implement your part of the plan below.';
const IMPLEMENT_CONVERSATION_TASK =
  'Implement your part of what we discussed above.';
const GITHUB_AVATAR_SIZE = 64;
const GITHUB_AVATAR_TIMEOUT_MS = 10_000;

async function githubAvatar(owner: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://github.com/${owner}.png?size=${GITHUB_AVATAR_SIZE}`,
      { signal: AbortSignal.timeout(GITHUB_AVATAR_TIMEOUT_MS) },
    );
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? 'image/png';
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

async function commandNames(dir: string): Promise<string[]> {
  const entries = await readdir(dir).catch(() => []);
  return entries
    .filter((entry) => entry.endsWith(COMMAND_EXTENSION))
    .map((entry) => entry.slice(0, -COMMAND_EXTENSION.length));
}
const REPOS_DIR = 'repos';
const REPO_NAME_FROM_URL = /([^/:]+?)(?:\.git)?\/?$/;

interface EditorDefinition extends EditorApp {
  app: string | null;
}

const EDITORS: EditorDefinition[] = [
  { id: 'cursor', label: 'Cursor', app: 'Cursor' },
  { id: 'vscode', label: 'VS Code', app: 'Visual Studio Code' },
  { id: 'zed', label: 'Zed', app: 'Zed' },
  { id: 'xcode', label: 'Xcode', app: 'Xcode' },
  { id: 'terminal', label: 'Terminal', app: 'Terminal' },
  { id: 'iterm', label: 'iTerm', app: 'iTerm' },
  { id: 'ghostty', label: 'Ghostty', app: 'Ghostty' },
  { id: 'warp', label: 'Warp', app: 'Warp' },
  { id: 'finder', label: 'Finder', app: null },
];

const APPLICATION_DIRS = [
  '/Applications',
  '/System/Applications',
  '/System/Applications/Utilities',
];

function installedEditors(home: string): EditorApp[] {
  const dirs = [...APPLICATION_DIRS, path.join(home, 'Applications')];
  return EDITORS.filter(
    (editor) =>
      editor.app === null ||
      dirs.some((dir) => existsSync(path.join(dir, `${editor.app}.app`))),
  ).map(({ id, label }) => ({ id, label }));
}

export interface KorevDeps extends CoreDeps {
  fs: FileSystem;
  spawnPty: SpawnPty;
  userDataPath: string;
  chooseDirectory(): Promise<string | null>;
  openPath(target: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  applyTheme(theme: Settings['theme']): void;
}

export interface Korev {
  api: KorevApi;
  runningAgents(): number;
  settings(): Settings;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  shutdown(): Promise<void>;
}

function moveBefore<T extends { id: string }>(
  items: T[],
  item: T,
  beforeId: string | null,
): T[] {
  if (beforeId === item.id) return items;
  const rest = items.filter((entry) => entry !== item);
  const index = rest.findIndex((entry) => entry.id === beforeId);
  rest.splice(index === -1 ? rest.length : index, 0, item);
  return rest;
}

function rootItems({
  repos,
  folders,
  rootOrder,
}: PersistedState): (Repo | RepoFolder)[] {
  const inFolder = (repo: Repo) =>
    folders.some((folder) => folder.id === repo.folderId);
  const unordered = [...repos.filter((repo) => !inFolder(repo)), ...folders];
  const ordered = rootOrder.flatMap(
    (id) => unordered.find((item) => item.id === id) ?? [],
  );
  return [...ordered, ...unordered.filter((item) => !ordered.includes(item))];
}

const IDLE: WorkspaceRuntime = {
  status: 'idle',
  unread: false,
  stats: null,
  prs: [],
  message: null,
  pendingPrompt: null,
  runUrl: null,
};
const RUN_REF_SUFFIX = ':run';
const TERMINAL_PRESETS: Record<TerminalPreset, string | null> = {
  shell: null,
  claude: 'claude',
  codex: 'codex',
};

function mergedSinceRestore(workspace: Workspace, pr: PrStatus): boolean {
  if (pr.state !== 'MERGED') return false;
  if (!workspace.restoredAt) return true;
  return Date.parse(pr.mergedAt ?? '') > Date.parse(workspace.restoredAt);
}

function mergedNumbers(prs: PrStatus[]): string {
  const numbers = prs
    .filter((pr) => pr.state === 'MERGED')
    .map((pr) => `#${pr.number}`);
  return `${numbers.length === 1 ? 'PR' : 'PRs'} ${numbers.join(', ')}`;
}

function readyToArchive(workspace: Workspace, prs: PrStatus[]): boolean {
  return (
    prs.length > 0 &&
    prs.length >= workspace.prs.length &&
    prs.every((pr) => pr.state !== 'OPEN') &&
    prs.some((pr) => mergedSinceRestore(workspace, pr))
  );
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(message: string): Result<never> {
  return { ok: false, message };
}

function insideWorkspace(root: string, file: string): string | null {
  const resolved = path.resolve(root, file);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

const HOME_PREFIX = `~${path.sep}`;

function readablePath(root: string, home: string, file: string): string {
  if (file.startsWith(HOME_PREFIX))
    return path.join(home, file.slice(HOME_PREFIX.length));
  return path.resolve(root, file);
}

export async function createKorev(deps: KorevDeps): Promise<Korev> {
  const store = await openStore(deps.fs, deps.userDataPath, deps.home);
  const git = createGit(deps.run, deps.env);
  const runtimes = new Map<string, WorkspaceRuntime>();
  let agents: AgentAvailability[] = [];
  const editors = installedEditors(deps.home);

  const ctx: Context = {
    deps,
    store,
    git,
    terminals: createTerminals({
      spawnPty: deps.spawnPty,
      shell: deps.shell,
      onOutput: (ref, data) => {
        deps.emit('terminal-output', { ref, data });
        if (ref.endsWith(RUN_REF_SUFFIX)) detectRunUrl(ref, data);
      },
      onExit: (ref, exitCode) => {
        deps.emit('terminal-exit', { ref, exitCode });
        void onScriptExit(ctx, ref, exitCode);
      },
    }),
    runningSessions: new Set(),
    planLimits: {},
    focusedWorkspaceId: null,
    runtime(workspaceId) {
      let runtime = runtimes.get(workspaceId);
      if (!runtime) {
        runtime = { ...IDLE };
        runtimes.set(workspaceId, runtime);
      }
      return runtime;
    },
    setStatus(workspaceId, status: WorkspaceStatus, message = null) {
      const runtime = ctx.runtime(workspaceId);
      runtime.status = status;
      runtime.message = message;
    },
    emitState: () => {
      deps.emit('state', snapshot());
      deps.setBadge(
        [...runtimes.values()].filter((runtime) => runtime.unread).length,
      );
      deps.keepAwake(
        store.state.settings.keepAwake && ctx.runningSessions.size > 0,
      );
    },
    workspace(workspaceId) {
      const found = store.state.workspaces.find((ws) => ws.id === workspaceId);
      if (!found) throw new NotFoundError('Workspace', workspaceId);
      return found;
    },
    repo(repoId) {
      const found = store.state.repos.find((repo) => repo.id === repoId);
      if (!found) throw new NotFoundError('Repository', repoId);
      return found;
    },
  };
  const chats = createChats(
    ctx,
    (workspaceId, links) =>
      void trackOpenedPrs(workspaceId, links)
        .then(() => refreshPrs(workspaceId))
        .catch(() => null),
  );
  const spotlight = createSpotlight(
    git,
    () => ctx.emitState(),
    (message) =>
      deps.notify({
        title: 'Spotlight',
        body: message,
        workspaceId: ctx.focusedWorkspaceId ?? '',
      }),
  );

  async function archive(workspaceId: string) {
    await spotlight.disableForWorkspace(workspaceId);
    return archiveWorkspace(ctx, workspaceId, chats.stopWorkspace);
  }

  function detectRunUrl(ref: string, data: string) {
    const runtime = ctx.runtime(ref.slice(0, -RUN_REF_SUFFIX.length));
    if (runtime.runUrl) return;
    const url = findLocalUrl(data);
    if (!url) return;
    runtime.runUrl = url;
    ctx.emitState();
  }

  function snapshot(): AppState {
    const { repos, folders, workspaces, askChats, settings } = store.state;
    return {
      repos,
      folders,
      rootOrder: rootItems(store.state).map((item) => item.id),
      workspaces,
      askChats,
      settings,
      runtime: Object.fromEntries(
        workspaces.map((ws) => [ws.id, ctx.runtime(ws.id)]),
      ),
      runningSessions: [...ctx.runningSessions],
      runningTerminals: ctx.terminals.running(),
      planLimits: ctx.planLimits,
      spotlights: spotlight.active(),
      agents,
      editors,
    };
  }

  async function registerRepo(
    dir: string,
    scripts: RepoScripts = EMPTY_SCRIPTS,
  ): Promise<Result<Repo>> {
    const root = await repoRoot(git, dir);
    if (!root) return fail(`${dir} is not a git repository`);
    const existing = store.state.repos.find((repo) => repo.path === root);
    if (existing) return ok(existing);
    const repo: Repo = {
      id: deps.newId(),
      name: path.basename(root),
      path: root,
      defaultBranch: await defaultBranch(git, root),
      scripts: { ...scripts },
    };
    store.state.repos.push(repo);
    store.save();
    ctx.emitState();
    return ok(repo);
  }

  function fetchPr(workspace: Workspace, ref: string) {
    return fetchPrStatus(deps.run, deps.env, workspace.path, ref);
  }

  function track(workspace: Workspace, url: string, sessionId: string | null) {
    if (!url || workspace.prs.some((pr) => pr.url === url)) return;
    workspace.prs.push({ url, sessionId });
    store.save();
  }

  async function trackOpenedPrs(workspaceId: string, links: TurnPrLinks) {
    const workspace = ctx.workspace(workspaceId);
    const since = Date.parse(links.startedAt) - PR_CLOCK_SKEW_MS;
    const statuses = await Promise.all(
      links.urls
        .filter((url) => !workspace.prs.some((pr) => pr.url === url))
        .map((url) => fetchPr(workspace, url)),
    );
    for (const pr of statuses) {
      if (pr && Date.parse(pr.createdAt) >= since)
        track(workspace, pr.url, links.sessionId);
    }
  }

  async function refreshPrs(workspaceId: string): Promise<PrStatus[]> {
    const workspace = ctx.workspace(workspaceId);
    if (workspace.archivedAt) return [];
    const branchPr = await fetchPr(workspace, workspace.branch);
    if (branchPr) track(workspace, branchPr.url, null);
    const runtime = ctx.runtime(workspaceId);
    const lastKnown = (url: string) =>
      runtime.prs.find((pr) => pr.url === url) ?? null;
    const fetched = await Promise.all(
      workspace.prs.map(async ({ url }) =>
        url === branchPr?.url
          ? branchPr
          : ((await fetchPr(workspace, url)) ?? lastKnown(url)),
      ),
    );
    const prs = fetched.filter((pr): pr is PrStatus => pr !== null);
    if (JSON.stringify(runtime.prs) !== JSON.stringify(prs)) {
      runtime.prs = prs;
      ctx.emitState();
    }
    if (readyToArchive(workspace, prs))
      await archiveIfConfigured(workspaceId, prs);
    return prs;
  }

  let checkingPrs = false;

  async function refreshAllPrs() {
    if (checkingPrs) return;
    checkingPrs = true;
    try {
      for (const workspace of activeWorkspaces(ctx))
        await refreshPrs(workspace.id).catch(() => null);
    } finally {
      checkingPrs = false;
    }
  }

  async function archiveIfConfigured(workspaceId: string, prs: PrStatus[]) {
    const workspace = ctx.workspace(workspaceId);
    const config = await workspaceConfig(ctx, workspace);
    if (!(config.archiveOnMerge ?? store.state.settings.archiveOnMerge)) return;
    if (
      ctx.runningSessions.size &&
      workspace.sessions.some((session) => ctx.runningSessions.has(session.id))
    )
      return;
    const archived = await archive(workspaceId);
    if (!archived.ok) return;
    deps.emit('toast', {
      title: `${mergedNumbers(prs)} merged. Archived ${workspace.name}`,
      tone: 'success',
    });
  }

  async function actionPrompt(
    workspaceId: string,
    kind: PromptKind,
    base: string,
  ) {
    const config = await workspaceConfig(ctx, ctx.workspace(workspaceId));
    return withPrompt(base, config.prompts[kind]);
  }

  function trackedPr(workspaceId: string, prNumber: number) {
    return (
      ctx.runtime(workspaceId).prs.find((pr) => pr.number === prNumber) ?? null
    );
  }

  function workspacePath(workspaceId: string) {
    const workspace = ctx.workspace(workspaceId);
    if (workspace.archivedAt) throw new Error('Workspace is archived');
    if (!hasWorktree(ctx.runtime(workspaceId)))
      throw new Error('Workspace has no worktree yet');
    return workspace;
  }

  async function slashCommandsAt(projectPath: string) {
    const dirs = [
      path.join(projectPath, '.claude', 'commands'),
      path.join(deps.home, '.claude', 'commands'),
    ];
    const names = await Promise.all(dirs.map((dir) => commandNames(dir)));
    const skills = (await listSkills(deps.home, projectPath))
      .filter((skill) => skill.agents.includes('claude'))
      .map((skill) => skill.name);
    return [
      ...new Set([...BUILTIN_COMMANDS, ...names.flat(), ...skills]),
    ].sort();
  }

  async function openShell(
    ref: string,
    workspaceId: string,
    preset: TerminalPreset,
  ) {
    const workspace = workspacePath(workspaceId);
    const repo = ctx.repo(workspace.repoId);
    ctx.terminals.start(ref, {
      cwd: workspace.path,
      env: await scriptEnv(ctx, repo, workspace),
      command: TERMINAL_PRESETS[preset] ?? undefined,
    });
  }

  function assertOwnRef(ref: string, workspaceId: string) {
    if (!ref.startsWith(`${workspaceId}:`))
      throw new Error('Terminal does not belong to workspace');
  }

  function allSessions() {
    return [
      ...store.state.workspaces.flatMap((workspace) => workspace.sessions),
      ...store.state.askChats.map((ask) => ask.session),
    ];
  }

  async function deleteAskChat(askChatId: string) {
    const ask = store.state.askChats.find((entry) => entry.id === askChatId);
    if (!ask) return;
    store.state.askChats = store.state.askChats.filter(
      (entry) => entry !== ask,
    );
    await chats.forget(ask.session.id);
    store.save();
    ctx.emitState();
  }

  function folder(folderId: string) {
    const found = store.state.folders.find((entry) => entry.id === folderId);
    if (!found) throw new NotFoundError('Folder', folderId);
    return found;
  }

  function moveToRoot(item: Repo | RepoFolder, beforeId: string | null) {
    store.state.rootOrder = moveBefore(
      rootItems(store.state),
      item,
      beforeId,
    ).map((entry) => entry.id);
  }

  function saveAndEmit() {
    store.save();
    ctx.emitState();
  }

  async function removeRepoFromAskChats(repo: Repo) {
    for (const ask of store.state.askChats) {
      ask.repoIds = ask.repoIds.filter((repoId) => repoId !== repo.id);
      if (!ask.repoIds.length) await deleteAskChat(ask.id);
    }
    await removeWorktree(
      git,
      repo.path,
      askWorktreePath(store.state.settings.workspacesRoot, repo),
    );
  }

  async function updateSettings(patch: Partial<Settings>) {
    Object.assign(store.state.settings, patch);
    if (patch.theme) deps.applyTheme(patch.theme);
    store.save();
    ctx.emitState();
  }

  async function importFromConductor() {
    const repoCountBefore = store.state.repos.length;
    for (const repo of await readConductorRepos(deps.run, deps.env, deps.home))
      await registerRepo(repo.path, repo.scripts);
    const settings = await readConductorSettings(
      deps.home,
      store.state.settings,
    );
    await updateSettings(settings);
    return {
      repos: store.state.repos.length - repoCountBefore,
      settings: Object.keys(settings).length,
    };
  }

  async function sendToActiveSession(
    workspaceId: string,
    sessionId: string,
    text: string,
  ) {
    const workspace = ctx.workspace(workspaceId);
    const session =
      workspace.sessions.find((entry) => entry.id === sessionId) ??
      workspace.sessions[0];
    if (!session) return fail('No chat in this workspace');
    return chats.send(session.id, {
      text,
      agent: session.agent,
      model: session.model,
      effort: session.effort,
      planMode: false,
      fast: session.fast,
    });
  }

  const api: KorevApi = {
    getState: async () => snapshot(),
    async addRepo() {
      const dir = await deps.chooseDirectory();
      if (!dir) return ok(null);
      return registerRepo(dir);
    },
    async cloneRepo(url) {
      const name = REPO_NAME_FROM_URL.exec(url.trim())?.[1];
      if (!name) return fail('That does not look like a git URL');
      const destination = path.join(deps.userDataPath, REPOS_DIR, name);
      try {
        await cloneRepo(deps.run, deps.env, url.trim(), destination);
      } catch (error) {
        return fail(errorMessage(error));
      }
      return registerRepo(destination);
    },
    importFromConductor,
    async removeRepo(repoId) {
      const { state } = store;
      const workspaces = state.workspaces.filter((ws) => ws.repoId === repoId);
      for (const workspace of workspaces) {
        await archive(workspace.id);
        await deleteWorkspace(ctx, workspace.id);
      }
      await removeRepoFromAskChats(ctx.repo(repoId));
      state.repos = state.repos.filter((repo) => repo.id !== repoId);
      store.save();
      ctx.emitState();
    },
    async updateRepo(repoId, patch) {
      const repo = ctx.repo(repoId);
      if (patch.defaultBranch?.trim())
        repo.defaultBranch = patch.defaultBranch.trim();
      if (patch.spotlightTesting !== undefined)
        repo.spotlightTesting = patch.spotlightTesting;
      if (patch.prompts) repo.prompts = patch.prompts;
      store.save();
      ctx.emitState();
    },
    async updateRepoScripts(repoId, scripts) {
      ctx.repo(repoId).scripts = scripts;
      store.save();
      ctx.emitState();
    },
    async createFolder(name) {
      const created = { id: deps.newId(), name: name.trim() };
      store.state.folders.push(created);
      saveAndEmit();
      return created;
    },
    async renameFolder(folderId, name) {
      folder(folderId).name = name.trim();
      saveAndEmit();
    },
    async deleteFolder(folderId) {
      const { state } = store;
      state.folders = state.folders.filter((entry) => entry.id !== folderId);
      for (const repo of state.repos) {
        if (repo.folderId === folderId) repo.folderId = null;
      }
      saveAndEmit();
    },
    async moveRepo(repoId, { folderId, beforeId }) {
      const repo = ctx.repo(repoId);
      if (folderId === null) {
        repo.folderId = null;
        moveToRoot(repo, beforeId);
      } else {
        repo.folderId = folder(folderId).id;
        store.state.repos = moveBefore(store.state.repos, repo, beforeId);
      }
      saveAndEmit();
    },
    async moveFolder(folderId, beforeId) {
      moveToRoot(folder(folderId), beforeId);
      saveAndEmit();
    },
    createWorkspaces: async (repoIds, task, source) =>
      createWorkspaces(ctx, repoIds, task, chats.send, null, source),
    async startFromAsk(askChatId) {
      const ask = store.state.askChats.find((entry) => entry.id === askChatId);
      if (!ask) return fail('Ask chat not found');
      if (chats.isRunning(ask.session.id))
        return fail('Wait for the answer to finish');
      const history = await chats.transcript(ask.session.id);
      const plan = latestPlan(history);
      const sendWithHistory: SendTask = async (sessionId, options) => {
        await chats.seed(sessionId, history);
        return chats.send(sessionId, options);
      };
      return createWorkspaces(
        ctx,
        ask.repoIds,
        {
          text: plan ? IMPLEMENT_PLAN_TASK : IMPLEMENT_CONVERSATION_TASK,
          agent: ask.session.agent,
          model: ask.session.model,
          effort: ask.session.effort,
          planMode: false,
          fast: ask.session.fast,
        },
        sendWithHistory,
        plan,
      );
    },
    listBranches: (repoId) => listBranches(git, ctx.repo(repoId).path),
    listPullRequests: (repoId) =>
      listPullRequests(deps.run, deps.env, ctx.repo(repoId).path),
    listIssues: (repoId) =>
      listIssues(deps.run, deps.env, ctx.repo(repoId).path),
    async setBaseBranch(workspaceId, branch) {
      const workspace = ctx.workspace(workspaceId);
      if (!branch.trim()) return;
      workspace.baseBranch = branch.trim();
      store.save();
      ctx.emitState();
      void refreshStats(ctx, workspace);
    },
    async workspaceConfig(workspaceId) {
      const workspace = workspacePath(workspaceId);
      const config = await workspaceConfig(ctx, workspace);
      return {
        ...config,
        previewUrls: config.previewUrls.map((preview) => ({
          ...preview,
          url: expandPort(preview.url, workspace.port),
        })),
      };
    },
    repoConfig: (repoId) =>
      loadRepoConfig(ctx.repo(repoId), ctx.repo(repoId).path),
    listSkills: (repoId) => listSkills(deps.home, ctx.repo(repoId).path),
    async repoIcon(repoId) {
      const repoPath = ctx.repo(repoId).path;
      const favicon = await repoFavicon(repoPath);
      if (favicon) return favicon;
      const owner = await originOwner(git, repoPath);
      return owner ? githubAvatar(owner) : null;
    },
    async startReview(workspaceId) {
      const workspace = workspacePath(workspaceId);
      const { reviewModel, defaultAgent } = store.state.settings;
      const session = {
        ...newChatSession(ctx, reviewModel?.agent ?? defaultAgent),
        ...reviewModel,
      };
      const text = await actionPrompt(
        workspaceId,
        'code_review',
        REVIEW_PROMPT,
      );
      workspace.sessions.push(session);
      const sent = await chats.send(session.id, {
        text,
        agent: session.agent,
        model: session.model,
        effort: session.effort,
        planMode: false,
        fast: session.fast,
      });
      return sent.ok ? ok(session.id) : sent;
    },
    archiveWorkspace: (workspaceId) => archive(workspaceId),
    async toggleSpotlight(workspaceId) {
      const workspace = workspacePath(workspaceId);
      const repo = ctx.repo(workspace.repoId);
      if (spotlight.active()[repo.id] === workspaceId)
        return spotlight.disable(repo.id);
      return spotlight.enable(repo, workspace);
    },
    restoreWorkspace: (workspaceId) => restoreWorkspace(ctx, workspaceId),
    deleteWorkspace: (workspaceId) => deleteWorkspace(ctx, workspaceId),
    async focusWorkspace(workspaceId) {
      ctx.focusedWorkspaceId = workspaceId;
      if (!workspaceId) return;
      const runtime = ctx.runtime(workspaceId);
      if (!runtime.unread) return;
      runtime.unread = false;
      ctx.emitState();
    },
    async createAskChat(repoIds) {
      for (const repoId of repoIds) ctx.repo(repoId);
      const createdAt = deps.now().toISOString();
      const ask = {
        id: deps.newId(),
        repoIds,
        session: newChatSession(ctx, store.state.settings.defaultAgent),
        createdAt,
        lastMessageAt: createdAt,
      };
      store.state.askChats.push(ask);
      store.save();
      ctx.emitState();
      return ask;
    },
    deleteAskChat,
    async newSession(workspaceId, agent) {
      const session = newChatSession(ctx, agent);
      ctx.workspace(workspaceId).sessions.push(session);
      store.save();
      ctx.emitState();
      return session;
    },
    async closeSession(workspaceId, sessionId) {
      const workspace = ctx.workspace(workspaceId);
      if (workspace.sessions.length <= 1) return;
      workspace.sessions = workspace.sessions.filter(
        (entry) => entry.id !== sessionId,
      );
      await chats.forget(sessionId);
      store.save();
      ctx.emitState();
    },
    async updateSession(sessionId, patch) {
      const session = allSessions().find((entry) => entry.id === sessionId);
      if (!session) return;
      if (patch.agent && patch.agent !== session.agent) {
        if (ctx.runningSessions.has(sessionId)) return;
        switchAgent(session, patch.agent);
        session.effort = store.state.settings.defaultEffort[patch.agent];
      }
      if (patch.model) session.model = patch.model;
      if (patch.effort) session.effort = patch.effort;
      if (patch.fast !== undefined) session.fast = patch.fast;
      if (patch.planMode !== undefined) session.planMode = patch.planMode;
      if (patch.title?.trim()) session.title = patch.title.trim();
      store.save();
      ctx.emitState();
    },
    transcript: (sessionId) => chats.transcript(sessionId),
    send: (sessionId, options) => chats.send(sessionId, options),
    stop: async (sessionId) => chats.stop(sessionId),
    respondPermission: async (sessionId, itemId, response) =>
      chats.respondPermission(sessionId, itemId, response),
    revert: (sessionId, itemId) => chats.revert(sessionId, itemId),
    async changes(workspaceId) {
      const workspace = workspacePath(workspaceId);
      const files = await refreshStats(ctx, workspace);
      return files.length
        ? files
        : changedFiles(git, workspace.path, workspace.baseBranch).catch(
            () => [],
          );
    },
    async fileDiff(workspaceId, file, range) {
      const workspace = workspacePath(workspaceId);
      if (range) return rangeFileDiff(git, workspace.path, range, file);
      return fileDiff(git, workspace.path, workspace.baseBranch, file);
    },
    rangeChanges: (workspaceId, range) =>
      rangeFiles(git, workspacePath(workspaceId).path, range),
    searchFiles: (workspaceId, query, options) =>
      searchFiles(git, workspacePath(workspaceId).path, query, options),
    async writeFile(workspaceId, file, contents) {
      const target = insideWorkspace(workspacePath(workspaceId).path, file);
      if (!target) return fail('That file is outside the workspace');
      try {
        await writeFile(target, contents);
      } catch (error) {
        return fail(errorMessage(error));
      }
      void refreshStats(ctx, ctx.workspace(workspaceId));
      return ok(undefined);
    },
    async reviewComments(workspaceId, prNumber) {
      const workspace = workspacePath(workspaceId);
      return fetchReviewComments(deps.run, deps.env, workspace.path, prNumber);
    },
    async listFiles(workspaceId) {
      return listFiles(git, workspacePath(workspaceId).path);
    },
    async readFile(workspaceId, file) {
      const target = readablePath(
        workspacePath(workspaceId).path,
        deps.home,
        file,
      );
      const contents = await readFile(target).catch(() => null);
      if (!contents || contents.length > FILE_MAX_BYTES) return null;
      return contents.toString('utf8');
    },
    prStatuses: (workspaceId) => refreshPrs(workspaceId),
    async mergePr(workspaceId, prNumber) {
      const workspace = workspacePath(workspaceId);
      const problem = await mergePr(
        deps.run,
        deps.env,
        workspace.path,
        prNumber,
      );
      await refreshPrs(workspaceId);
      return problem ? fail(problem) : ok(undefined);
    },
    async createPr(workspaceId, sessionId) {
      const workspace = ctx.workspace(workspaceId);
      return sendToActiveSession(
        workspaceId,
        sessionId,
        await actionPrompt(
          workspaceId,
          'create_pr',
          createPrPrompt(workspace.baseBranch),
        ),
      );
    },
    async resolveConflicts(workspaceId, sessionId, prNumber) {
      const workspace = ctx.workspace(workspaceId);
      const pr = trackedPr(workspaceId, prNumber);
      if (!pr) return fail(`Pull request #${prNumber} is not tracked here`);
      return sendToActiveSession(
        workspaceId,
        sessionId,
        await actionPrompt(
          workspaceId,
          'resolve_merge_conflicts',
          onPrBranch(
            resolveConflictsPrompt(workspace.baseBranch),
            pr,
            workspace.branch,
          ),
        ),
      );
    },
    async saveAttachment(workspaceId, name, base64) {
      const workspace = workspacePath(workspaceId);
      const safeName = `${deps.now().getTime()}-${path.basename(name).replace(/[^\w.-]+/g, '_')}`;
      const relative = path.join(CONTEXT_DIR, ATTACHMENTS_DIR, safeName);
      await mkdir(path.join(workspace.path, CONTEXT_DIR, ATTACHMENTS_DIR), {
        recursive: true,
      });
      await writeFile(
        path.join(workspace.path, relative),
        Buffer.from(base64, 'base64'),
      );
      return ok(relative);
    },
    slashCommands: (workspaceId) =>
      slashCommandsAt(workspacePath(workspaceId).path),
    repoSlashCommands: (repoId) => slashCommandsAt(ctx.repo(repoId).path),
    async fixChecks(workspaceId, sessionId, prNumber) {
      const pr = trackedPr(workspaceId, prNumber);
      if (!pr) return fail(`Pull request #${prNumber} is not tracked here`);
      return sendToActiveSession(
        workspaceId,
        sessionId,
        await actionPrompt(
          workspaceId,
          'fix_errors',
          onPrBranch(
            fixChecksPrompt(pr.checks),
            pr,
            ctx.workspace(workspaceId).branch,
          ),
        ),
      );
    },
    async openIn(workspaceId, editorId: EditorId) {
      const workspace = workspacePath(workspaceId);
      const editor = EDITORS.find((entry) => entry.id === editorId);
      if (!editor) return fail('Unknown app');
      if (!editor.app) {
        await deps.openPath(workspace.path);
        return ok(undefined);
      }
      const result = await deps.run(
        'open',
        ['-a', editor.app, workspace.path],
        {
          env: deps.env,
          timeoutMs: 15_000,
        },
      );
      return result.exitCode === 0
        ? ok(undefined)
        : fail(result.stderr.trim() || `Could not open ${editor.label}`);
    },
    openExternal: (url) => deps.openExternal(url),
    updateSettings,
    async openTerminal(ref, workspaceId, kind, size, preset = 'shell') {
      assertOwnRef(ref, workspaceId);
      if (kind === 'shell' && !ctx.terminals.isRunning(ref)) {
        await openShell(ref, workspaceId, preset);
        ctx.emitState();
      }
      return ok(ctx.terminals.attach(ref, size) ?? '');
    },
    startScript: (workspaceId, kind, scriptId) =>
      startScript(ctx, workspacePath(workspaceId), kind, scriptId ?? null),
    async stopScript(workspaceId, kind) {
      ctx.terminals.close(terminalRef(workspaceId, kind));
      ctx.emitState();
    },
    writeTerminal: async (ref, data) => ctx.terminals.write(ref, data),
    resizeTerminal: async (ref, size) => ctx.terminals.resize(ref, size),
    async closeTerminal(ref) {
      ctx.terminals.close(ref);
      ctx.emitState();
    },
  };

  void detectAgents(deps.run, deps.env).then((detected) => {
    agents = detected;
    ctx.emitState();
  });
  for (const workspace of activeWorkspaces(ctx))
    void refreshStats(ctx, workspace);
  void refreshAllPrs();
  const prWatch = setInterval(() => void refreshAllPrs(), PR_POLL_MS);

  return {
    api,
    runningAgents: () => ctx.runningSessions.size,
    settings: () => store.state.settings,
    updateSettings,
    async shutdown() {
      clearInterval(prWatch);
      await spotlight.disableAll();
      for (const session of allSessions()) chats.stop(session.id);
      await chats.settled();
      ctx.terminals.closeAll();
      await store.flush();
    },
  };
}
