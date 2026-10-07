import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { KorevApi } from '../shared/api';
import {
  hasWorktree,
  type AgentAvailability,
  type AppState,
  type EditorApp,
  type EditorId,
  type Repo,
  type Result,
  type Settings,
  type WorkspaceRuntime,
  type WorkspaceStatus,
} from '../shared/model';
import { detectAgents } from './agents';
import { createChats } from './chats';
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
  repoRoot,
} from './git';
import {
  createPrPrompt,
  fetchPrStatus,
  fixChecksPrompt,
  mergePr,
  resolveConflictsPrompt,
} from './pull-requests';
import { openStore } from './store';
import { createTerminals, type SpawnPty } from './terminals';
import {
  archiveWorkspace,
  createWorkspace,
  deleteWorkspace,
  newChatSession,
  onScriptExit,
  refreshStats,
  restoreWorkspace,
  scriptEnv,
  startScript,
} from './workspaces';

const FILE_MAX_BYTES = 1_000_000;
const CONTEXT_DIR = '.context';
const ATTACHMENTS_DIR = 'attachments';
const COMMAND_EXTENSION = '.md';
const BUILTIN_COMMANDS = ['compact', 'review', 'init'];

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

const IDLE: WorkspaceRuntime = {
  status: 'idle',
  unread: false,
  stats: null,
  pr: null,
  message: null,
  pendingPrompt: null,
};

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
      onOutput: (ref, data) => deps.emit('terminal-output', { ref, data }),
      onExit: (ref, exitCode) => {
        deps.emit('terminal-exit', { ref, exitCode });
        onScriptExit(ctx, ref, exitCode);
      },
    }),
    runningSessions: new Set(),
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
  const chats = createChats(ctx);

  function snapshot(): AppState {
    const { repos, workspaces, settings } = store.state;
    return {
      repos,
      workspaces,
      settings,
      runtime: Object.fromEntries(
        workspaces.map((ws) => [ws.id, ctx.runtime(ws.id)]),
      ),
      runningSessions: [...ctx.runningSessions],
      runningTerminals: ctx.terminals.running(),
      agents,
      editors,
    };
  }

  async function registerRepo(dir: string): Promise<Result<Repo>> {
    const root = await repoRoot(git, dir);
    if (!root) return fail(`${dir} is not a git repository`);
    const existing = store.state.repos.find((repo) => repo.path === root);
    if (existing) return ok(existing);
    const repo: Repo = {
      id: deps.newId(),
      name: path.basename(root),
      path: root,
      defaultBranch: await defaultBranch(git, root),
      scripts: { setup: '', run: '', archive: '', runMode: 'concurrent' },
    };
    store.state.repos.push(repo);
    store.save();
    ctx.emitState();
    return ok(repo);
  }

  async function refreshPr(workspaceId: string) {
    const workspace = ctx.workspace(workspaceId);
    if (workspace.archivedAt) return null;
    const pr = await fetchPrStatus(
      deps.run,
      deps.env,
      workspace.path,
      workspace.branch,
    );
    const runtime = ctx.runtime(workspaceId);
    if (JSON.stringify(runtime.pr) !== JSON.stringify(pr)) {
      runtime.pr = pr;
      ctx.emitState();
    }
    return pr;
  }

  function workspacePath(workspaceId: string) {
    const workspace = ctx.workspace(workspaceId);
    if (workspace.archivedAt) throw new Error('Workspace is archived');
    if (!hasWorktree(ctx.runtime(workspaceId)))
      throw new Error('Workspace has no worktree yet');
    return workspace;
  }

  function openShell(ref: string, workspaceId: string) {
    const workspace = workspacePath(workspaceId);
    const repo = ctx.repo(workspace.repoId);
    ctx.terminals.start(ref, {
      cwd: workspace.path,
      env: scriptEnv(ctx, repo, workspace),
    });
  }

  function assertOwnRef(ref: string, workspaceId: string) {
    if (!ref.startsWith(`${workspaceId}:`))
      throw new Error('Terminal does not belong to workspace');
  }

  async function updateSettings(patch: Partial<Settings>) {
    Object.assign(store.state.settings, patch);
    if (patch.theme) deps.applyTheme(patch.theme);
    store.save();
    ctx.emitState();
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
      model: session.model,
      effort: session.effort,
      planMode: false,
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
    async removeRepo(repoId) {
      const { state } = store;
      const workspaces = state.workspaces.filter((ws) => ws.repoId === repoId);
      for (const workspace of workspaces) {
        await archiveWorkspace(ctx, workspace.id, chats.stopWorkspace);
        await deleteWorkspace(ctx, workspace.id);
      }
      state.repos = state.repos.filter((repo) => repo.id !== repoId);
      store.save();
      ctx.emitState();
    },
    async updateRepo(repoId, patch) {
      const repo = ctx.repo(repoId);
      if (patch.defaultBranch?.trim())
        repo.defaultBranch = patch.defaultBranch.trim();
      store.save();
      ctx.emitState();
    },
    async updateRepoScripts(repoId, scripts) {
      ctx.repo(repoId).scripts = scripts;
      store.save();
      ctx.emitState();
    },
    createWorkspace: async (repoId, task) =>
      createWorkspace(ctx, repoId, task, chats.send),
    archiveWorkspace: (workspaceId) =>
      archiveWorkspace(ctx, workspaceId, chats.stopWorkspace),
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
      for (const workspace of store.state.workspaces) {
        const session = workspace.sessions.find(
          (entry) => entry.id === sessionId,
        );
        if (!session) continue;
        if (patch.model) session.model = patch.model;
        if (patch.effort) session.effort = patch.effort;
        if (patch.title?.trim()) session.title = patch.title.trim();
      }
      store.save();
      ctx.emitState();
    },
    transcript: (sessionId) => chats.transcript(sessionId),
    send: (sessionId, options) => chats.send(sessionId, options),
    stop: async (sessionId) => chats.stop(sessionId),
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
    async fileDiff(workspaceId, file) {
      const workspace = workspacePath(workspaceId);
      return fileDiff(git, workspace.path, workspace.baseBranch, file);
    },
    async listFiles(workspaceId) {
      return listFiles(git, workspacePath(workspaceId).path);
    },
    async readFile(workspaceId, file) {
      const target = insideWorkspace(workspacePath(workspaceId).path, file);
      if (!target) return null;
      const contents = await readFile(target).catch(() => null);
      if (!contents || contents.length > FILE_MAX_BYTES) return null;
      return contents.toString('utf8');
    },
    prStatus: (workspaceId) => refreshPr(workspaceId),
    async mergePr(workspaceId) {
      const workspace = workspacePath(workspaceId);
      const pr = ctx.runtime(workspaceId).pr ?? (await refreshPr(workspaceId));
      if (!pr) return fail('No pull request for this branch');
      const problem = await mergePr(
        deps.run,
        deps.env,
        workspace.path,
        pr.number,
      );
      await refreshPr(workspaceId);
      return problem ? fail(problem) : ok(undefined);
    },
    async createPr(workspaceId, sessionId) {
      const workspace = ctx.workspace(workspaceId);
      return sendToActiveSession(
        workspaceId,
        sessionId,
        createPrPrompt(workspace.baseBranch),
      );
    },
    async resolveConflicts(workspaceId, sessionId) {
      const workspace = ctx.workspace(workspaceId);
      return sendToActiveSession(
        workspaceId,
        sessionId,
        resolveConflictsPrompt(workspace.baseBranch),
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
    async slashCommands(workspaceId) {
      const workspace = workspacePath(workspaceId);
      const dirs = [
        path.join(workspace.path, '.claude', 'commands'),
        path.join(deps.home, '.claude', 'commands'),
      ];
      const names = await Promise.all(dirs.map((dir) => commandNames(dir)));
      return [...new Set([...BUILTIN_COMMANDS, ...names.flat()])].sort();
    },
    async fixChecks(workspaceId, sessionId) {
      const pr = ctx.runtime(workspaceId).pr;
      if (!pr) return fail('No pull request for this branch');
      return sendToActiveSession(
        workspaceId,
        sessionId,
        fixChecksPrompt(pr.checks),
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
    async openTerminal(ref, workspaceId, kind, size) {
      assertOwnRef(ref, workspaceId);
      if (kind === 'shell' && !ctx.terminals.isRunning(ref)) {
        openShell(ref, workspaceId);
        ctx.emitState();
      }
      return ok(ctx.terminals.attach(ref, size) ?? '');
    },
    startScript: (workspaceId, kind) =>
      startScript(ctx, workspacePath(workspaceId), kind),
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
  for (const workspace of store.state.workspaces) {
    if (workspace.archivedAt) continue;
    void refreshStats(ctx, workspace);
    void refreshPr(workspace.id).catch(() => null);
  }

  return {
    api,
    runningAgents: () => ctx.runningSessions.size,
    settings: () => store.state.settings,
    updateSettings,
    async shutdown() {
      for (const workspace of store.state.workspaces)
        chats.stopWorkspace(workspace);
      ctx.terminals.closeAll();
      await store.flush();
    },
  };
}
