import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CODEX_DEFAULT_MODEL,
  type AgentKind,
  type ChatSession,
  type GitWorktree,
  type PlanLane,
  type Repo,
  type RepoConfig,
  type Result,
  type SendOptions,
  type TerminalKind,
  type Workspace,
  type WorkspaceSource,
} from '../shared/model';
import { errorMessage, terminalRef, type Context } from './context';
import {
  addBranchWorktree,
  addDetachedWorktree,
  addWorktree,
  branchExists,
  changedFiles,
  createCheckpoint,
  currentBranch,
  deleteBranch,
  listWorktrees,
  prepareWorktree,
  removeCleanWorktree,
  removeWorktree,
  restoreCheckpoint,
  restoreWorktree,
  slugify,
  startPoint,
  userSlug,
} from './git';
import { askWorktreePath } from './ask-worktrees';
import { DEFAULT_SHELL } from './login-path';
import { loadRepoConfig, withPrompt } from './repo-config';
import {
  allocatePort,
  copyIncludedFiles,
  includePatterns,
  nameFromTask,
  truncateName,
  uniqueName,
  workspaceEnv,
} from './workspace-setup';

const ARCHIVE_SCRIPT_TIMEOUT_MS = 5 * 60_000;
const GH_TIMEOUT_MS = 60_000;
const NEW_CHAT_TITLE = 'New chat';
const NAMING_TIMEOUT_MS = 60_000;
const NAMING_MODEL = 'claude-haiku-4-5';
const NAMING_TASK_CHARS = 4_000;
const NAMING_SYSTEM_PROMPT =
  'You name git branches. Given a task, reply with a 2 to 4 word lowercase kebab-case branch name and nothing else.';
const TITLE_SYSTEM_PROMPT =
  "You title chat conversations. Given the user's first message, reply with a 3 to 6 word title in sentence case, without quotes or trailing punctuation, and nothing else.";
const SURROUNDING_QUOTES = /^["'`]+|["'`]+$/g;
const NAMING_ARGS = [
  '-p',
  '--model',
  NAMING_MODEL,
  '--no-session-persistence',
  '--output-format',
  'text',
  '--tools',
  '',
  '--setting-sources',
  '',
  '--disable-slash-commands',
  '--strict-mcp-config',
  '--system-prompt',
];
const NEW_SOURCE: WorkspaceSource = { kind: 'new', baseBranch: null };

type CheckoutSource = Exclude<WorkspaceSource, { kind: 'new' }>;

export type SendTask = (
  sessionId: string,
  options: SendOptions,
) => Promise<Result>;

export function newChatSession(ctx: Context, agent: AgentKind): ChatSession {
  const { settings } = ctx.store.state;
  return {
    id: ctx.deps.newId(),
    title: NEW_CHAT_TITLE,
    agent,
    model: settings.defaultModels[agent] ?? CODEX_DEFAULT_MODEL,
    effort: settings.defaultEffort[agent],
    fast: false,
    planMode: settings.defaultPlanMode,
    agentSessionId: null,
    forkOnNextTurn: false,
    createdAt: ctx.deps.now().toISOString(),
  };
}

export function forkChatSession(
  ctx: Context,
  session: ChatSession,
): ChatSession {
  return {
    ...session,
    id: ctx.deps.newId(),
    forkOnNextTurn: session.agentSessionId !== null,
    createdAt: ctx.deps.now().toISOString(),
  };
}

export function switchAgent(session: ChatSession, agent: AgentKind) {
  if (session.agent === agent) return;
  session.agent = agent;
  session.agentSessionId = null;
}

export function isUntitled(session: ChatSession): boolean {
  return session.title === NEW_CHAT_TITLE;
}

export function workspaceConfig(
  ctx: Context,
  workspace: Workspace,
): Promise<RepoConfig> {
  return loadRepoConfig(ctx.repo(workspace.repoId), workspace.path);
}

export async function scriptEnv(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
): Promise<NodeJS.ProcessEnv> {
  const config = await loadRepoConfig(repo, workspace.path);
  return {
    ...ctx.deps.env,
    ...config.environment,
    ...workspaceEnv(repo, workspace),
  };
}

export function activeWorkspaces(ctx: Context): Workspace[] {
  return ctx.store.state.workspaces.filter((ws) => !ws.archivedAt);
}

let githubLogin: Promise<string | null> | null = null;

function fetchGithubLogin(ctx: Context): Promise<string | null> {
  githubLogin ??= ctx.deps
    .run('gh', ['api', 'user', '--jq', '.login'], {
      env: ctx.deps.env,
      timeoutMs: GH_TIMEOUT_MS,
    })
    .then((result) =>
      result.exitCode === 0 ? result.stdout.trim() || null : null,
    )
    .catch(() => null);
  return githubLogin;
}

async function branchPrefix(ctx: Context, repo: Repo): Promise<string> {
  const config = await loadRepoConfig(repo, repo.path);
  if (config.branchPrefix !== null) return config.branchPrefix;
  const custom = ctx.store.state.settings.branchPrefix.trim();
  if (custom) return custom;
  return (await fetchGithubLogin(ctx)) ?? (await userSlug(ctx.git, repo.path));
}

export function placeholderBranch(prefix: string, name: string): string {
  return prefix ? `${prefix.replace(/\/+$/, '')}/${name}` : name;
}

export async function renameBranchPrompt(
  repo: Repo,
): Promise<string | undefined> {
  return (await loadRepoConfig(repo, repo.path)).prompts.rename_branch;
}

async function askNamingModel(
  ctx: Context,
  systemPrompt: string,
  task: string,
): Promise<string | null> {
  const result = await ctx.deps
    .run('claude', [...NAMING_ARGS, systemPrompt], {
      cwd: tmpdir(),
      env: ctx.deps.env,
      stdin: `Task:\n${task.slice(0, NAMING_TASK_CHARS)}`,
      timeoutMs: NAMING_TIMEOUT_MS,
    })
    .catch(() => null);
  if (result?.exitCode !== 0) return null;
  return result.stdout.trim().split('\n').at(-1)?.trim() || null;
}

export async function suggestName(
  ctx: Context,
  task: string,
  extraPrompt?: string,
): Promise<string | null> {
  const answer = await askNamingModel(
    ctx,
    withPrompt(NAMING_SYSTEM_PROMPT, extraPrompt),
    task,
  );
  return truncateName(slugify(answer ?? '')) || null;
}

export async function suggestTitle(
  ctx: Context,
  task: string,
): Promise<string | null> {
  const answer = await askNamingModel(ctx, TITLE_SYSTEM_PROMPT, task);
  return answer?.replace(SURROUNDING_QUOTES, '').trim() || null;
}

function workspaceNames(ctx: Context, repoId: string, except?: Workspace) {
  return new Set(
    ctx.store.state.workspaces
      .filter((ws) => ws.repoId === repoId && ws !== except)
      .map((ws) => ws.name),
  );
}

function worktreePath(ctx: Context, repo: Repo, name: string) {
  return path.join(
    ctx.store.state.settings.workspacesRoot,
    slugify(repo.name) || repo.id,
    name,
  );
}

async function claimName(
  ctx: Context,
  repos: Repo[],
  workspaces: Workspace[],
  base: string,
) {
  const prefixes = await Promise.all(
    repos.map((repo) => branchPrefix(ctx, repo)),
  );
  for (let suffix = 1; ; suffix += 1) {
    const name = suffix === 1 ? base : `${base}-${suffix}`;
    const branches = prefixes.map((prefix) => placeholderBranch(prefix, name));
    const existing = await Promise.all(
      repos.map((repo, index) =>
        branchExists(ctx.git, repo.path, branches[index]),
      ),
    );
    if (existing.some(Boolean)) continue;
    const taken = repos.some((repo, index) =>
      workspaceNames(ctx, repo.id, workspaces[index]).has(name),
    );
    if (taken) continue;
    workspaces.forEach((workspace, index) => {
      workspace.name = name;
      workspace.branch = branches[index];
      workspace.path = worktreePath(ctx, repos[index], name);
    });
    return;
  }
}

async function taskName(
  ctx: Context,
  repo: Repo,
  fallback: string,
  task: string | null,
) {
  if (!task || !ctx.store.state.settings.autoRenameBranches) return fallback;
  return (
    (await suggestName(ctx, task, await renameBranchPrompt(repo))) ?? fallback
  );
}

function runScriptFor(config: RepoConfig, scriptId: string | null) {
  return (
    config.runScripts.find((script) => script.id === scriptId) ??
    config.runScripts.find((script) => script.isDefault) ??
    config.runScripts[0]
  );
}

function stopOtherRunScripts(ctx: Context, workspace: Workspace) {
  for (const other of activeWorkspaces(ctx)) {
    if (other.repoId === workspace.repoId && other.id !== workspace.id) {
      ctx.terminals.close(terminalRef(other.id, 'run'));
    }
  }
}

export async function startScript(
  ctx: Context,
  workspace: Workspace,
  kind: TerminalKind,
  scriptId: string | null = null,
): Promise<Result> {
  if (kind === 'shell') return { ok: false, message: 'Not a script' };
  const repo = ctx.repo(workspace.repoId);
  const config = await workspaceConfig(ctx, workspace);
  const runScript = kind === 'run' ? runScriptFor(config, scriptId) : null;
  const command = (
    kind === 'setup' ? config.setup : (runScript?.command ?? '')
  ).trim();
  if (!command) return { ok: false, message: `No ${kind} script configured` };
  if (kind === 'run' && config.runMode === 'nonconcurrent') {
    stopOtherRunScripts(ctx, workspace);
  }
  if (kind === 'setup') ctx.setStatus(workspace.id, 'setting-up');
  if (kind === 'run') ctx.runtime(workspace.id).runUrl = null;
  ctx.terminals.start(terminalRef(workspace.id, kind), {
    cwd: runScript?.cwd
      ? path.join(workspace.path, runScript.cwd)
      : workspace.path,
    env: await scriptEnv(ctx, repo, workspace),
    command,
  });
  ctx.emitState();
  return { ok: true, value: undefined };
}

export async function onScriptExit(
  ctx: Context,
  ref: string,
  exitCode: number,
) {
  const [workspaceId, kind] = ref.split(':');
  const runtime = ctx.runtime(workspaceId);
  if (kind === 'run') runtime.runUrl = null;
  if (kind !== 'setup' || runtime.status !== 'setting-up') {
    ctx.emitState();
    return;
  }
  if (exitCode === 0) ctx.setStatus(workspaceId, 'idle');
  else
    ctx.setStatus(
      workspaceId,
      'error',
      `Setup script failed (exit ${exitCode})`,
    );
  ctx.emitState();
  const workspace = ctx.store.state.workspaces.find(
    (ws) => ws.id === workspaceId,
  );
  if (exitCode !== 0 || !workspace || workspace.archivedAt) return;
  const config = await workspaceConfig(ctx, workspace);
  if (config.autoRunAfterSetup) await startScript(ctx, workspace, 'run');
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

export function firstPrompt(
  task: string,
  plan: string | null,
  repo: Repo,
  linked: boolean,
): string {
  return [
    task,
    plan ? `<plan>\n${plan}\n</plan>` : null,
    linked
      ? `This task spans several repositories. Each one has its own linked workspace and agent. You own the ${repo.name} part: change files in this workspace only. Your system prompt lists the linked workspaces, which you can read.`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function failCreation(ctx: Context, workspace: Workspace, error: unknown) {
  ctx.setStatus(
    workspace.id,
    'failed',
    `Could not create the worktree: ${errorMessage(error)}`,
  );
}

async function copyLocalFiles(ctx: Context, repo: Repo, workspace: Workspace) {
  const config = await loadRepoConfig(repo, repo.path);
  const patterns = await includePatterns(repo.path, config.fileIncludeGlobs);
  await copyIncludedFiles(ctx.git, repo.path, workspace.path, patterns).catch(
    () => [],
  );
}

async function finishWorktree(ctx: Context, repo: Repo, workspace: Workspace) {
  await copyLocalFiles(ctx, repo, workspace);
  ctx.setStatus(workspace.id, 'idle');
  ctx.runtime(workspace.id).pendingPrompt = null;
}

async function addWorkspaceWorktree(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  from: string,
): Promise<boolean> {
  try {
    await addWorktree(
      ctx.git,
      repo.path,
      workspace.path,
      workspace.branch,
      from,
    );
  } catch (error) {
    failCreation(ctx, workspace, error);
    return false;
  }
  await finishWorktree(ctx, repo, workspace);
  return true;
}

function firstMessage(
  task: SendOptions,
  plan: string | null,
  repo: Repo,
  workspace: Workspace,
  acrossRepos: boolean,
): SendOptions {
  const [session] = workspace.sessions;
  return {
    ...task,
    text: firstPrompt(task.text, plan, repo, acrossRepos),
    model: task.model || session.model,
    effort: task.effort || session.effort,
  };
}

async function startCreated(
  ctx: Context,
  repos: Repo[],
  workspaces: Workspace[],
  created: boolean[],
  task: SendOptions | null,
  plan: string | null,
  send: SendTask,
) {
  ctx.store.save();
  ctx.emitState();
  await Promise.all(
    workspaces.map(async (workspace, index) => {
      if (!created[index]) return;
      void startScript(ctx, workspace, 'setup');
      if (task)
        await send(
          workspace.sessions[0].id,
          firstMessage(task, plan, repos[index], workspace, repos.length > 1),
        );
    }),
  );
}

async function prepareNewWorkspaces(
  ctx: Context,
  repos: Repo[],
  workspaces: Workspace[],
  task: SendOptions | null,
  plan: string | null,
  send: SendTask,
) {
  const name = taskName(ctx, repos[0], workspaces[0].name, task?.text ?? null);
  await prepareNamedWorkspaces(ctx, repos, workspaces, name, task, plan, send);
}

async function prepareNamedWorkspaces(
  ctx: Context,
  repos: Repo[],
  workspaces: Workspace[],
  pickedName: Promise<string>,
  task: SendOptions | null,
  plan: string | null,
  send: SendTask,
) {
  let startPoints: string[];
  try {
    const [name, ...froms] = await Promise.all([
      pickedName,
      ...repos.map((repo, index) =>
        startPoint(ctx.git, repo.path, workspaces[index].baseBranch),
      ),
    ]);
    await claimName(ctx, repos, workspaces, name);
    startPoints = froms;
  } catch (error) {
    for (const workspace of workspaces) failCreation(ctx, workspace, error);
    ctx.emitState();
    return;
  }
  const created = await Promise.all(
    workspaces.map((workspace, index) =>
      addWorkspaceWorktree(ctx, repos[index], workspace, startPoints[index]),
    ),
  );
  await startCreated(ctx, repos, workspaces, created, task, plan, send);
}

async function checkOutPullRequest(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  number: number,
): Promise<string> {
  await addDetachedWorktree(
    ctx.git,
    repo.path,
    workspace.path,
    await startPoint(ctx.git, repo.path, workspace.baseBranch),
  );
  const result = await ctx.deps.run('gh', ['pr', 'checkout', String(number)], {
    cwd: workspace.path,
    env: ctx.deps.env,
    timeoutMs: GH_TIMEOUT_MS,
  });
  const branch = await currentBranch(ctx.git, workspace.path);
  if (result.exitCode !== 0 || !branch) {
    await removeWorktree(ctx.git, repo.path, workspace.path);
    throw new Error(
      result.stderr.trim() || `Could not check out PR #${number}`,
    );
  }
  return branch;
}

async function checkOutSource(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  source: CheckoutSource,
) {
  if (source.kind === 'branch') {
    await addBranchWorktree(ctx.git, repo.path, workspace.path, source.branch);
    return;
  }
  if (source.kind === 'worktree') {
    await prepareWorktree(ctx.git, workspace.path);
    return;
  }
  if (source.kind === 'pr') {
    workspace.branch = await checkOutPullRequest(
      ctx,
      repo,
      workspace,
      source.number,
    );
    return;
  }
  await claimName(ctx, [repo], [workspace], workspace.name);
  await addWorktree(
    ctx.git,
    repo.path,
    workspace.path,
    workspace.branch,
    await startPoint(ctx.git, repo.path, workspace.baseBranch),
  );
}

async function prepareSourceWorkspace(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  source: CheckoutSource,
  task: SendOptions | null,
  send: SendTask,
) {
  try {
    await checkOutSource(ctx, repo, workspace, source);
  } catch (error) {
    failCreation(ctx, workspace, error);
    ctx.emitState();
    return;
  }
  await finishWorktree(ctx, repo, workspace);
  await startCreated(ctx, [repo], [workspace], [true], task, null, send);
}

function sourceName(source: WorkspaceSource, task: SendOptions | null) {
  if (source.kind === 'branch' || source.kind === 'worktree')
    return truncateName(slugify(source.branch.split('/').at(-1) ?? ''));
  if (source.kind === 'pr') return `pr-${source.number}`;
  if (source.kind === 'issue')
    return truncateName(`${source.number}-${slugify(source.title)}`);
  return nameFromTask(task?.text ?? null);
}

function sourceBaseBranch(source: WorkspaceSource, repo: Repo) {
  if (source.kind === 'pr' || source.kind === 'worktree')
    return source.baseBranch;
  if (source.kind === 'new' && source.baseBranch) return source.baseBranch;
  return repo.defaultBranch;
}

function addDraftWorkspace(
  ctx: Context,
  repo: Repo,
  name: string,
  groupId: string | null,
  task: SendOptions | null,
  source: WorkspaceSource,
): Workspace {
  const workspace: Workspace = {
    id: ctx.deps.newId(),
    repoId: repo.id,
    groupId,
    name,
    branch:
      source.kind === 'branch' || source.kind === 'worktree'
        ? source.branch
        : name,
    baseBranch: sourceBaseBranch(source, repo),
    path:
      source.kind === 'worktree' ? source.path : worktreePath(ctx, repo, name),
    port: allocatePort(activeWorkspaces(ctx).map((ws) => ws.port)),
    createdAt: ctx.deps.now().toISOString(),
    archivedAt: null,
    restoredAt: null,
    archiveSnapshot: null,
    sessions: [newChatSession(ctx, ctx.store.state.settings.defaultAgent)],
    prs: [],
  };
  ctx.store.state.workspaces.push(workspace);
  ctx.setStatus(workspace.id, 'creating');
  ctx.runtime(workspace.id).pendingPrompt = task?.text ?? null;
  return workspace;
}

export function createWorkspaces(
  ctx: Context,
  repoIds: string[],
  task: SendOptions | null,
  send: SendTask,
  plan: string | null = null,
  source: WorkspaceSource = NEW_SOURCE,
): Result<Workspace[]> {
  if (!repoIds.length) return { ok: false, message: 'Pick a repository' };
  if (source.kind !== 'new' && repoIds.length > 1) {
    return {
      ok: false,
      message: 'A branch, pull request or issue belongs to one repository',
    };
  }
  const repos = repoIds.map((repoId) => ctx.repo(repoId));
  const groupId = repos.length > 1 ? ctx.deps.newId() : null;
  const taken = new Set(
    repos.flatMap((repo) => [...workspaceNames(ctx, repo.id)]),
  );
  const name = uniqueName(sourceName(source, task) || 'workspace', taken);
  const workspaces = repos.map((repo) =>
    addDraftWorkspace(ctx, repo, name, groupId, task, source),
  );
  ctx.store.save();
  ctx.emitState();
  if (source.kind === 'new') {
    void prepareNewWorkspaces(ctx, repos, workspaces, task, plan, send);
  } else {
    void prepareSourceWorkspace(
      ctx,
      repos[0],
      workspaces[0],
      source,
      task,
      send,
    );
  }
  return { ok: true, value: workspaces };
}

function laneTask(lane: PlanLane): string {
  return `Implement the ${lane.name} lane of the plan below. The other lanes are built at the same time in linked workspaces, which your system prompt lists. Build only your lane.`;
}

export function createLaneWorkspaces(
  ctx: Context,
  origin: Workspace,
  lanes: PlanLane[],
  options: Omit<SendOptions, 'text'>,
  plan: string,
  send: SendTask,
) {
  const repo = ctx.repo(origin.repoId);
  const groupId = (origin.groupId ??= ctx.deps.newId());
  const source: WorkspaceSource = {
    kind: 'new',
    baseBranch: origin.baseBranch,
  };
  const taken = workspaceNames(ctx, repo.id);
  const created = lanes.map((lane) => {
    const name = uniqueName(nameFromTask(lane.name), taken);
    taken.add(name);
    const laneOptions = { ...options, text: laneTask(lane) };
    const workspace = addDraftWorkspace(
      ctx,
      repo,
      name,
      groupId,
      laneOptions,
      source,
    );
    return { workspace, laneOptions };
  });
  ctx.store.save();
  ctx.emitState();
  for (const { workspace, laneOptions } of created) {
    void prepareNamedWorkspaces(
      ctx,
      [repo],
      [workspace],
      Promise.resolve(workspace.name),
      laneOptions,
      plan,
      send,
    );
  }
}

async function runArchiveScript(
  ctx: Context,
  workspace: Workspace,
  config: RepoConfig,
) {
  if (!config.archive.trim()) return;
  const repo = ctx.repo(workspace.repoId);
  await ctx.deps
    .run(ctx.deps.shell || DEFAULT_SHELL, ['-lc', config.archive], {
      cwd: workspace.path,
      env: await scriptEnv(ctx, repo, workspace),
      timeoutMs: ARCHIVE_SCRIPT_TIMEOUT_MS,
    })
    .catch(() => undefined);
}

function realPath(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

function isInside(root: string, target: string): boolean {
  return realPath(target).startsWith(`${realPath(root)}${path.sep}`);
}

export async function strayWorktrees(
  ctx: Context,
  workspace: Workspace,
): Promise<GitWorktree[]> {
  const repo = ctx.repo(workspace.repoId);
  const known = new Set(
    [
      repo.path,
      askWorktreePath(ctx.store.state.settings.workspacesRoot, repo),
      ...ctx.store.state.workspaces.map((other) => other.path),
    ].map(realPath),
  );
  const prBranches = new Set(
    ctx.runtime(workspace.id).prs.map((pr) => pr.headRefName),
  );
  const worktrees = await listWorktrees(ctx.git, repo.path).catch(() => []);
  return worktrees.filter(
    (worktree) =>
      !known.has(realPath(worktree.path)) &&
      ((worktree.branch !== null && prBranches.has(worktree.branch)) ||
        isInside(workspace.path, worktree.path)),
  );
}

function mergedPrBranches(ctx: Context, workspace: Workspace): Set<string> {
  return new Set(
    ctx
      .runtime(workspace.id)
      .prs.filter((pr) => pr.state === 'MERGED')
      .map((pr) => pr.headRefName),
  );
}

async function removeStrayWorktrees(
  ctx: Context,
  workspace: Workspace,
  deleteBranches: boolean,
): Promise<Result<string[]>> {
  const repo = ctx.repo(workspace.repoId);
  const merged = mergedPrBranches(ctx, workspace);
  const kept: string[] = [];
  for (const stray of await strayWorktrees(ctx, workspace)) {
    if (await removeCleanWorktree(ctx.git, repo.path, stray.path)) {
      if (deleteBranches && stray.branch && merged.has(stray.branch))
        await deleteBranch(ctx.git, repo.path, stray.branch);
      continue;
    }
    if (isInside(workspace.path, stray.path))
      return {
        ok: false,
        message: `${stray.path} has uncommitted changes. Commit or remove them before archiving.`,
      };
    kept.push(stray.path);
  }
  return { ok: true, value: kept };
}

function reportKeptWorktrees(ctx: Context, kept: string[]) {
  for (const worktree of kept)
    ctx.deps.emit('toast', {
      title: `Kept ${worktree}: it has uncommitted changes`,
      tone: 'neutral',
    });
}

export async function archiveWorkspace(
  ctx: Context,
  workspaceId: string,
  stopSessions: (workspace: Workspace) => void,
): Promise<Result> {
  const workspace = ctx.workspace(workspaceId);
  if (workspace.archivedAt) return { ok: true, value: undefined };
  const config = await workspaceConfig(ctx, workspace);
  const deleteBranches =
    config.deleteBranchOnArchive ??
    ctx.store.state.settings.deleteBranchOnArchive;
  const strays = await removeStrayWorktrees(ctx, workspace, deleteBranches);
  if (!strays.ok) return strays;
  reportKeptWorktrees(ctx, strays.value);
  stopSessions(workspace);
  ctx.terminals.closeMatching(`${workspace.id}:`);
  await runArchiveScript(ctx, workspace, config);
  const repo = ctx.repo(workspace.repoId);
  workspace.archiveSnapshot = await createCheckpoint(
    ctx.git,
    workspace.path,
  ).catch(() => null);
  await removeWorktree(ctx.git, repo.path, workspace.path);
  if (deleteBranches) await deleteBranch(ctx.git, repo.path, workspace.branch);
  workspace.archivedAt = ctx.deps.now().toISOString();
  const runtime = ctx.runtime(workspace.id);
  runtime.status = 'idle';
  runtime.unread = false;
  runtime.stats = null;
  runtime.runUrl = null;
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
  workspace.restoredAt = ctx.deps.now().toISOString();
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
