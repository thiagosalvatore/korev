import path from 'node:path';
import {
  CODEX_DEFAULT_MODEL,
  type AgentKind,
  type ChatSession,
  type Repo,
  type Result,
  type TerminalKind,
  type Workspace,
} from '../shared/model';
import { errorMessage, terminalRef, type Context } from './context';
import {
  addWorktree,
  branchExists,
  changedFiles,
  createCheckpoint,
  deleteBranch,
  isIgnored,
  removeWorktree,
  restoreCheckpoint,
  restoreWorktree,
  slugify,
  startPoint,
  userSlug,
} from './git';
import { DEFAULT_SHELL } from './login-path';
import {
  allocatePort,
  copyLocalFiles,
  effectiveScripts,
  pickWorkspaceName,
  workspaceEnv,
} from './workspace-setup';

const ARCHIVE_SCRIPT_TIMEOUT_MS = 5 * 60_000;
const GH_LOGIN_TIMEOUT_MS = 10_000;
const NEW_CHAT_TITLE = 'New chat';

export function newChatSession(ctx: Context, agent: AgentKind): ChatSession {
  const { settings } = ctx.store.state;
  return {
    id: ctx.deps.newId(),
    title: NEW_CHAT_TITLE,
    agent,
    model: settings.defaultModels[agent] ?? CODEX_DEFAULT_MODEL,
    effort: settings.defaultEffort[agent],
    agentSessionId: null,
    createdAt: ctx.deps.now().toISOString(),
  };
}

export function isUntitled(session: ChatSession): boolean {
  return session.title === NEW_CHAT_TITLE;
}

export function scriptEnv(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
): NodeJS.ProcessEnv {
  return { ...ctx.deps.env, ...workspaceEnv(repo, workspace) };
}

function activeWorkspaces(ctx: Context): Workspace[] {
  return ctx.store.state.workspaces.filter((ws) => !ws.archivedAt);
}

let githubLogin: Promise<string | null> | null = null;

function fetchGithubLogin(ctx: Context): Promise<string | null> {
  githubLogin ??= ctx.deps
    .run('gh', ['api', 'user', '--jq', '.login'], {
      env: ctx.deps.env,
      timeoutMs: GH_LOGIN_TIMEOUT_MS,
    })
    .then((result) =>
      result.exitCode === 0 ? result.stdout.trim() || null : null,
    )
    .catch(() => null);
  return githubLogin;
}

async function branchPrefix(ctx: Context, repo: Repo): Promise<string> {
  const custom = ctx.store.state.settings.branchPrefix.trim();
  if (custom) return custom;
  return (await fetchGithubLogin(ctx)) ?? (await userSlug(ctx.git, repo.path));
}

export function placeholderBranch(prefix: string, name: string): string {
  return `${prefix}/${name}`;
}

async function uniqueBranch(ctx: Context, repo: Repo, name: string) {
  const prefix = await branchPrefix(ctx, repo);
  const base = placeholderBranch(prefix, name);
  let branch = base;
  let suffix = 2;
  while (await branchExists(ctx.git, repo.path, branch)) {
    branch = `${base}-${suffix}`;
    suffix += 1;
  }
  return branch;
}

export async function startScript(
  ctx: Context,
  workspace: Workspace,
  kind: TerminalKind,
): Promise<Result> {
  if (kind === 'shell') return { ok: false, message: 'Not a script' };
  const repo = ctx.repo(workspace.repoId);
  const scripts = await effectiveScripts(repo, workspace.path);
  const command = scripts[kind].trim();
  if (!command) return { ok: false, message: `No ${kind} script configured` };
  if (kind === 'run' && scripts.runMode === 'nonconcurrent') {
    for (const other of activeWorkspaces(ctx)) {
      if (other.repoId === repo.id && other.id !== workspace.id) {
        ctx.terminals.close(terminalRef(other.id, 'run'));
      }
    }
  }
  if (kind === 'setup') ctx.setStatus(workspace.id, 'setting-up');
  ctx.terminals.start(terminalRef(workspace.id, kind), {
    cwd: workspace.path,
    env: scriptEnv(ctx, repo, workspace),
    command,
  });
  ctx.emitState();
  return { ok: true, value: undefined };
}

export function onScriptExit(ctx: Context, ref: string, exitCode: number) {
  const [workspaceId, kind] = ref.split(':');
  if (kind === 'setup' && ctx.runtime(workspaceId).status === 'setting-up') {
    if (exitCode === 0) ctx.setStatus(workspaceId, 'idle');
    else
      ctx.setStatus(
        workspaceId,
        'error',
        `Setup script failed (exit ${exitCode})`,
      );
  }
  ctx.emitState();
}

export async function refreshStats(ctx: Context, workspace: Workspace) {
  if (workspace.archivedAt) return [];
  try {
    const files = await changedFiles(
      ctx.git,
      workspace.path,
      workspace.baseBranch,
    );
    ctx.runtime(workspace.id).stats = {
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    };
    ctx.emitState();
    return files;
  } catch {
    return [];
  }
}

export async function createWorkspace(
  ctx: Context,
  repoId: string,
): Promise<Result<Workspace>> {
  const repo = ctx.repo(repoId);
  const { state } = ctx.store;
  const name = pickWorkspaceName(
    new Set(state.workspaces.map((ws) => ws.name)),
  );
  try {
    const branch = await uniqueBranch(ctx, repo, name);
    const worktree = path.join(
      state.settings.workspacesRoot,
      slugify(repo.name) || repo.id,
      name,
    );
    const from = await startPoint(ctx.git, repo.path, repo.defaultBranch);
    await addWorktree(ctx.git, repo.path, worktree, branch, from);
    await copyLocalFiles(repo.path, worktree, (file) =>
      isIgnored(ctx.git, repo.path, file),
    ).catch(() => []);
    const workspace: Workspace = {
      id: ctx.deps.newId(),
      repoId,
      name,
      branch,
      baseBranch: repo.defaultBranch,
      path: worktree,
      port: allocatePort(activeWorkspaces(ctx).map((ws) => ws.port)),
      createdAt: ctx.deps.now().toISOString(),
      archivedAt: null,
      archiveSnapshot: null,
      sessions: [newChatSession(ctx, state.settings.defaultAgent)],
    };
    state.workspaces.push(workspace);
    ctx.store.save();
    ctx.emitState();
    void startScript(ctx, workspace, 'setup');
    return { ok: true, value: workspace };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

async function runArchiveScript(ctx: Context, workspace: Workspace) {
  const repo = ctx.repo(workspace.repoId);
  const scripts = await effectiveScripts(repo, workspace.path);
  if (!scripts.archive.trim()) return;
  await ctx.deps
    .run(ctx.deps.shell || DEFAULT_SHELL, ['-lc', scripts.archive], {
      cwd: workspace.path,
      env: scriptEnv(ctx, repo, workspace),
      timeoutMs: ARCHIVE_SCRIPT_TIMEOUT_MS,
    })
    .catch(() => undefined);
}

export async function archiveWorkspace(
  ctx: Context,
  workspaceId: string,
  stopSessions: (workspace: Workspace) => void,
): Promise<Result> {
  const workspace = ctx.workspace(workspaceId);
  if (workspace.archivedAt) return { ok: true, value: undefined };
  stopSessions(workspace);
  ctx.terminals.closeMatching(`${workspace.id}:`);
  await runArchiveScript(ctx, workspace);
  const repo = ctx.repo(workspace.repoId);
  workspace.archiveSnapshot = await createCheckpoint(
    ctx.git,
    workspace.path,
  ).catch(() => null);
  await removeWorktree(ctx.git, repo.path, workspace.path);
  if (ctx.store.state.settings.deleteBranchOnArchive) {
    await deleteBranch(ctx.git, repo.path, workspace.branch);
  }
  workspace.archivedAt = ctx.deps.now().toISOString();
  const runtime = ctx.runtime(workspace.id);
  runtime.status = 'idle';
  runtime.unread = false;
  runtime.stats = null;
  ctx.store.save();
  ctx.emitState();
  return { ok: true, value: undefined };
}

export async function restoreWorkspace(
  ctx: Context,
  workspaceId: string,
): Promise<Result> {
  const workspace = ctx.workspace(workspaceId);
  const repo = ctx.repo(workspace.repoId);
  try {
    await restoreWorktree(ctx.git, repo.path, workspace.path, workspace.branch);
    const snapshot = workspace.archiveSnapshot;
    const head = (
      await ctx.git.tryRun(workspace.path, ['rev-parse', 'HEAD'])
    )?.trim();
    if (snapshot && head === snapshot.head) {
      await restoreCheckpoint(ctx.git, workspace.path, snapshot);
    }
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
  workspace.archivedAt = null;
  workspace.archiveSnapshot = null;
  workspace.port = allocatePort(activeWorkspaces(ctx).map((ws) => ws.port));
  ctx.store.save();
  ctx.emitState();
  void startScript(ctx, workspace, 'setup');
  void refreshStats(ctx, workspace);
  return { ok: true, value: undefined };
}

export async function deleteWorkspace(ctx: Context, workspaceId: string) {
  const { state } = ctx.store;
  const workspace = ctx.workspace(workspaceId);
  if (!workspace.archivedAt) return;
  state.workspaces = state.workspaces.filter((ws) => ws.id !== workspaceId);
  await Promise.all(
    workspace.sessions.map((session) => ctx.store.removeTranscript(session.id)),
  );
  ctx.store.save();
  ctx.emitState();
}
