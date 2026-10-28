import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  presetLaneRepo,
  type AgentKind,
  type ChatSession,
  type ModelSetting,
  type GitWorktree,
  type LaneRepo,
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
import { planBlock } from '../shared/message';
import { workspaceLabel, WORKTREE_FAILED } from '../shared/workspaces';
import {
  addBranchWorktree,
  addDetachedWorktree,
  addWorktree,
  branchExists,
  changedFiles,
  cleanWorktree,
  createCheckpoint,
  currentBranch,
  deleteBranch,
  detachWorktree,
  isClean,
  listWorktrees,
  prepareWorktree,
  removeCleanWorktree,
  removeWorktree,
  restoreCheckpoint,
  restoreWorktree,
  slugify,
  startPoint,
  switchToBranch,
  switchToNewBranch,
  userSlug,
} from './git';
import { askWorktreePath } from './ask-worktrees';
import { signingEnv, signingKey } from './commit-signing';
import { DEFAULT_SHELL } from './login-path';
import { loadRepoConfig, withPrompt } from './repo-config';
import {
  allocatePort,
  copyIncludedFiles,
  firstWords,
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
const SUGGESTED_NAME_WORDS = 3;
const NAMING_SYSTEM_PROMPT =
  'You name git branches. Given a task, reply with a 1 to 3 word lowercase kebab-case branch name and nothing else. Use short words and skip filler such as "the", "fix-the" or "update".';
const TITLE_SYSTEM_PROMPT =
  "You title chat conversations. Given the user's first message, reply with a 2 to 4 word title in sentence case, without quotes or trailing punctuation, and nothing else.";
const SURROUNDING_QUOTES = /^["'`]+|["'`]+$/g;
const QUICK_MODEL_ARGS = [
  '-p',
  '--model',
  NAMING_MODEL,
  '--no-session-persistence',
  '--tools',
  '',
  '--setting-sources',
  '',
  '--disable-slash-commands',
  '--strict-mcp-config',
];
const TEXT_REPLY_ARGS = ['--output-format', 'text', '--system-prompt'];
const NEW_SOURCE: WorkspaceSource = { kind: 'new', baseBranch: null };
const POOL_DIR = '.pool';

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
    model: settings.defaultModels[agent],
    effort: settings.defaultEffort[agent],
    fast: false,
    planMode: settings.defaultPlanMode,
    agentSessionId: null,
    forkOnNextTurn: false,
    createdAt: ctx.deps.now().toISOString(),
  };
}

export function defaultTask(
  ctx: Context,
  prompt: string,
  planMode: boolean,
): SendOptions {
  const { defaultAgent, defaultModels, defaultEffort } =
    ctx.store.state.settings;
  return {
    text: prompt,
    agent: defaultAgent,
    model: defaultModels[defaultAgent],
    effort: defaultEffort[defaultAgent],
    planMode,
    fast: false,
  };
}

export function chatSessionOn(
  ctx: Context,
  setting: ModelSetting | null,
): ChatSession {
  const { defaultAgent } = ctx.store.state.settings;
  return {
    ...newChatSession(ctx, setting?.agent ?? defaultAgent),
    ...setting,
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

function agentSigningEnv(ctx: Context): NodeJS.ProcessEnv {
  if (!ctx.store.state.settings.signAgentCommits) return {};
  return signingEnv(signingKey(ctx.deps.userDataPath, ctx.deps.signer));
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
    ...agentSigningEnv(ctx),
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

export async function askQuickModel(
  ctx: Context,
  args: string[],
  stdin: string,
): Promise<string | null> {
  const result = await ctx.deps
    .run('claude', [...QUICK_MODEL_ARGS, ...args], {
      cwd: tmpdir(),
      env: ctx.deps.env,
      stdin,
      timeoutMs: NAMING_TIMEOUT_MS,
    })
    .catch(() => null);
  return result?.exitCode === 0 ? result.stdout : null;
}

async function askNamingModel(
  ctx: Context,
  systemPrompt: string,
  task: string,
): Promise<string | null> {
  const reply = await askQuickModel(
    ctx,
    [...TEXT_REPLY_ARGS, systemPrompt],
    `Task:\n${task.slice(0, NAMING_TASK_CHARS)}`,
  );
  return reply?.trim().split('\n').at(-1)?.trim() || null;
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
  return (
    truncateName(firstWords(slugify(answer ?? ''), SUGGESTED_NAME_WORDS)) ||
    null
  );
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

function repoDir(ctx: Context, repo: Repo) {
  return path.join(
    ctx.store.state.settings.workspacesRoot,
    slugify(repo.name) || repo.id,
  );
}

function worktreePath(ctx: Context, repo: Repo, name: string) {
  return path.join(repoDir(ctx, repo), name);
}

function isPoolSlot(worktree: string): boolean {
  return path.basename(path.dirname(worktree)) === POOL_DIR;
}

const poolClaims = new Map<string, Promise<unknown>>();
// Archived until restored, but its slot is no longer free.
const restoring = new Set<string>();

// One claim at a time per repository, so two new workspaces never take the same slot.
function claimInTurn<T>(repo: Repo, claim: () => Promise<T>): Promise<T> {
  const next = (poolClaims.get(repo.id) ?? Promise.resolve()).then(claim);
  poolClaims.set(
    repo.id,
    next.catch(() => undefined),
  );
  return next;
}

function nextSlotPath(poolDir: string, taken: Set<string>): string {
  for (let index = 1; ; index += 1) {
    const slot = path.join(poolDir, String(index));
    if (!taken.has(String(index)) && !existsSync(slot)) return slot;
  }
}

type SlotClaim = 'free' | 'new' | null;

async function claimSlot(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
): Promise<SlotClaim> {
  const size = (await loadRepoConfig(repo, repo.path)).worktreePoolSize;
  if (!size) return null;
  return claimInTurn(repo, async () => {
    const poolDir = path.join(repoDir(ctx, repo), POOL_DIR);
    const others = ctx.store.state.workspaces.filter(
      (ws) => ws !== workspace && (!ws.archivedAt || restoring.has(ws.id)),
    );
    const used = new Set(others.map((ws) => realPath(ws.path)));
    const slots = (await listWorktrees(ctx.git, repo.path).catch(() => []))
      .map((worktree) => realPath(worktree.path))
      .filter((worktree) => isInside(poolDir, worktree));
    for (const slot of slots) {
      if (used.has(slot) || !(await isClean(ctx.git, slot))) continue;
      workspace.path = slot;
      return 'free';
    }
    const pending = others.filter(
      (ws) =>
        ws.repoId === repo.id &&
        isPoolSlot(ws.path) &&
        !slots.includes(realPath(ws.path)),
    );
    if (slots.length + pending.length >= size) {
      console.warn(
        `The worktree pool of ${repo.name} is full (${size}): ${workspace.name} gets a worktree outside it`,
      );
      return null;
    }
    workspace.path = nextSlotPath(
      poolDir,
      new Set(pending.map((ws) => path.basename(ws.path))),
    );
    return 'new';
  });
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
  if (kind === 'setup') {
    ctx.setStatus(workspace.id, 'setting-up');
    ctx.runtime(workspace.id).setupError = null;
  }
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
  refreshStatus: (workspace: Workspace) => void,
) {
  const [workspaceId, kind] = ref.split(':');
  const runtime = ctx.runtime(workspaceId);
  if (kind === 'run') runtime.runUrl = null;
  if (kind !== 'setup' || runtime.status !== 'setting-up') {
    ctx.emitState();
    return;
  }
  const workspace = ctx.store.state.workspaces.find(
    (ws) => ws.id === workspaceId,
  );
  if (exitCode !== 0)
    runtime.setupError = `Setup script failed (exit ${exitCode})`;
  ctx.setStatus(workspaceId, 'idle');
  if (workspace) refreshStatus(workspace);
  ctx.emitState();
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

function ownPartNote(repo: Repo): string {
  return `This task spans several repositories. Each one has its own linked workspace and agent. You own the ${repo.name} part: change files in this workspace only. Your system prompt lists the linked workspaces, which you can read.`;
}

function leadNote(repo: Repo): string {
  return `This task spans several repositories. Your system prompt lists their linked workspaces. Read all of them to explore and plan, and change files in this workspace only. End the plan with a "## Lanes" section that has one lane per repository that needs changes, each headed with the repository name. Leave out any repository that needs no changes. If ${repo.name} needs changes, put its lane first: this workspace builds only the ${repo.name} lane. The agent in each repository's linked workspace builds that repository's lane once the user approves the plan. If the lanes need results from work that must run first, such as queries or research, leave the Lanes section out and plan only that work. The linked workspaces keep waiting until the user approves a plan with lanes.`;
}

function leadsAlone(repos: Repo[], plan: string | null): boolean {
  return repos.length > 1 && !plan;
}

export function firstPrompt(
  task: string,
  plan: string | null,
  repo: Repo,
  linked: boolean,
): string {
  const acrossRepos = plan ? ownPartNote(repo) : leadNote(repo);
  return [task, plan ? planBlock(plan) : null, linked ? acrossRepos : null]
    .filter(Boolean)
    .join('\n\n');
}

type Retry = () => Promise<void>;

function failCreation(
  ctx: Context,
  workspace: Workspace,
  error: unknown,
  retry: Retry,
) {
  ctx.setStatus(
    workspace.id,
    'failed',
    `${WORKTREE_FAILED}: ${errorMessage(error)}`,
  );
  ctx.creationRetries.set(workspace.id, retry);
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

// A failing hook such as post-checkout fails the git command after the checkout is done.
async function checkOut(
  ctx: Context,
  workspace: Workspace,
  attempt: () => Promise<void>,
) {
  try {
    await attempt();
  } catch (error) {
    if ((await currentBranch(ctx.git, workspace.path)) !== workspace.branch)
      throw error;
    await prepareWorktree(ctx.git, workspace.path);
    ctx.deps.emit('toast', {
      title: `A git hook failed in ${workspaceLabel(workspace)}: ${errorMessage(error)}`,
      tone: 'neutral',
    });
  }
}

async function checkOutInPool(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  inFreeSlot: () => Promise<void>,
  inNewWorktree: () => Promise<void>,
) {
  if ((await claimSlot(ctx, repo, workspace)) !== 'free') {
    await checkOut(ctx, workspace, inNewWorktree);
    return;
  }
  await checkOut(ctx, workspace, inFreeSlot);
  await cleanWorktree(ctx.git, workspace.path);
}

function addNewWorktree(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  from: string,
) {
  return checkOutInPool(
    ctx,
    repo,
    workspace,
    () => switchToNewBranch(ctx.git, workspace.path, workspace.branch, from),
    () =>
      addWorktree(ctx.git, repo.path, workspace.path, workspace.branch, from),
  );
}

async function addWorkspaceWorktree(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  from: string,
  retry: Retry,
): Promise<boolean> {
  try {
    await addNewWorktree(ctx, repo, workspace, from);
  } catch (error) {
    failCreation(ctx, workspace, error, retry);
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
    planMode: task.planMode || (acrossRepos && !plan),
    model: task.model || session.model,
    effort: task.effort || session.effort,
  };
}

async function startWorkspace(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  task: SendOptions | null,
  plan: string | null,
  acrossRepos: boolean,
  send: SendTask,
) {
  void startScript(ctx, workspace, 'setup');
  if (task && !workspace.awaitsLane)
    await send(
      workspace.sessions[0].id,
      firstMessage(task, plan, repo, workspace, acrossRepos),
    );
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
      await startWorkspace(
        ctx,
        repos[index],
        workspace,
        task,
        plan,
        repos.length > 1,
        send,
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
  const retryAt = (index: number) => () =>
    retryCreationOf(
      ctx,
      repos[index],
      workspaces[index],
      NEW_SOURCE,
      task,
      plan,
      repos.length > 1,
      send,
    );
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
    workspaces.forEach((workspace, index) =>
      failCreation(ctx, workspace, error, retryAt(index)),
    );
    ctx.emitState();
    return;
  }
  const created = await Promise.all(
    workspaces.map((workspace, index) =>
      addWorkspaceWorktree(
        ctx,
        repos[index],
        workspace,
        startPoints[index],
        retryAt(index),
      ),
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
  const result = await ctx.deps.run(
    'gh',
    ['pr', 'checkout', String(number), '--force'],
    { cwd: workspace.path, env: ctx.deps.env, timeoutMs: GH_TIMEOUT_MS },
  );
  const branch = await currentBranch(ctx.git, workspace.path);
  if (result.exitCode !== 0 || !branch) {
    await removeWorktree(ctx.git, repo.path, workspace.path);
    throw new Error(
      result.stderr.trim() || `Could not check out PR #${number}`,
    );
  }
  return branch;
}

async function adoptWorktree(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  branch: string,
): Promise<boolean> {
  const existing = (await untrackedWorktrees(ctx, repo)).find(
    (worktree) => worktree.branch === branch,
  );
  if (!existing) return false;
  workspace.path = existing.path;
  workspace.branch = branch;
  await prepareWorktree(ctx.git, workspace.path);
  return true;
}

async function checkOutSource(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  source: WorkspaceSource,
) {
  if (source.kind === 'branch') {
    if (await adoptWorktree(ctx, repo, workspace, source.branch)) return;
    await checkOut(ctx, workspace, () =>
      addBranchWorktree(ctx.git, repo.path, workspace.path, source.branch),
    );
    return;
  }
  if (source.kind === 'worktree') {
    await prepareWorktree(ctx.git, workspace.path);
    return;
  }
  if (source.kind === 'pr') {
    if (await adoptWorktree(ctx, repo, workspace, source.branch)) return;
    workspace.branch = await checkOutPullRequest(
      ctx,
      repo,
      workspace,
      source.number,
    );
    return;
  }
  await claimName(ctx, [repo], [workspace], workspace.name);
  await addNewWorktree(
    ctx,
    repo,
    workspace,
    await startPoint(ctx.git, repo.path, workspace.baseBranch),
  );
}

async function prepareSourceWorkspace(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  source: WorkspaceSource,
  task: SendOptions | null,
  plan: string | null,
  acrossRepos: boolean,
  send: SendTask,
) {
  try {
    await checkOutSource(ctx, repo, workspace, source);
  } catch (error) {
    failCreation(ctx, workspace, error, () =>
      retryCreationOf(
        ctx,
        repo,
        workspace,
        source,
        task,
        plan,
        acrossRepos,
        send,
      ),
    );
    ctx.emitState();
    return;
  }
  await finishWorktree(ctx, repo, workspace);
  ctx.store.save();
  ctx.emitState();
  await startWorkspace(ctx, repo, workspace, task, plan, acrossRepos, send);
}

function ownsWorktreePath(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  source: WorkspaceSource,
): boolean {
  return (
    source.kind !== 'worktree' &&
    workspace.path === worktreePath(ctx, repo, workspace.name)
  );
}

async function retryCreationOf(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
  source: WorkspaceSource,
  task: SendOptions | null,
  plan: string | null,
  acrossRepos: boolean,
  send: SendTask,
) {
  if (ownsWorktreePath(ctx, repo, workspace, source))
    await removeCleanWorktree(ctx.git, repo.path, workspace.path);
  await prepareSourceWorkspace(
    ctx,
    repo,
    workspace,
    source,
    task,
    plan,
    acrossRepos,
    send,
  );
}

export function retryCreation(ctx: Context, workspaceId: string): Result {
  const retry = ctx.creationRetries.get(workspaceId);
  if (!retry)
    return { ok: false, message: 'Archive this workspace and create it again' };
  ctx.creationRetries.delete(workspaceId);
  ctx.setStatus(workspaceId, 'creating');
  ctx.emitState();
  ctx.background(retry());
  return { ok: true, value: undefined };
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
    label: null,
    keepAfterMerge: false,
    awaitsLane: false,
    folderId: null,
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
  const membersAwaitLane = leadsAlone(repos, plan);
  const workspaces = repos.map((repo, index) => {
    const awaitsLane = membersAwaitLane && index > 0;
    const draftTask = awaitsLane ? null : task;
    const workspace = addDraftWorkspace(
      ctx,
      repo,
      name,
      groupId,
      draftTask,
      source,
    );
    workspace.awaitsLane = awaitsLane;
    return workspace;
  });
  ctx.store.save();
  ctx.emitState();
  if (source.kind === 'new') {
    ctx.background(
      prepareNewWorkspaces(ctx, repos, workspaces, task, plan, send),
    );
  } else {
    ctx.background(
      prepareSourceWorkspace(
        ctx,
        repos[0],
        workspaces[0],
        source,
        task,
        null,
        false,
        send,
      ),
    );
  }
  return { ok: true, value: workspaces };
}

function laneTask(lane: PlanLane): string {
  return `Implement the ${lane.name} lane of the plan below. The other lanes are built at the same time in linked workspaces, which your system prompt lists. Build only your lane.`;
}

function awaitingMember(ctx: Context, groupId: string, repoId: string) {
  return ctx.store.state.workspaces.find(
    (ws) =>
      ws.groupId === groupId &&
      ws.repoId === repoId &&
      ws.awaitsLane &&
      !ws.archivedAt &&
      ctx.runtime(ws.id).status !== 'failed',
  );
}

function sendLane(
  ctx: Context,
  member: Workspace,
  laneOptions: SendOptions,
  plan: string,
  send: SendTask,
) {
  member.awaitsLane = false;
  const repo = ctx.repo(member.repoId);
  const message = firstMessage(laneOptions, plan, repo, member, false);
  ctx.background(send(member.sessions[0].id, message));
}

function addLaneWorkspace(
  ctx: Context,
  origin: Workspace,
  lane: PlanLane,
  laneOptions: SendOptions,
): Workspace {
  const repo = ctx.repo(lane.repoId ?? origin.repoId);
  const baseBranch =
    repo.id === origin.repoId ? origin.baseBranch : repo.defaultBranch;
  const name = uniqueName(
    nameFromTask(lane.name),
    workspaceNames(ctx, repo.id),
  );
  const workspace = addDraftWorkspace(
    ctx,
    repo,
    name,
    origin.groupId,
    laneOptions,
    { kind: 'new', baseBranch },
  );
  if (repo.id === origin.repoId) workspace.folderId = laneFolderId(ctx, origin);
  return workspace;
}

function laneFolderId(ctx: Context, origin: Workspace): string {
  if (origin.folderId) return origin.folderId;
  const folder = {
    id: ctx.deps.newId(),
    repoId: origin.repoId,
    name: workspaceLabel(origin),
  };
  ctx.store.state.workspaceFolders.push(folder);
  origin.folderId = folder.id;
  return folder.id;
}

function leadsGroup(ctx: Context, workspace: Workspace): boolean {
  const lead = ctx.store.state.workspaces.find(
    (ws) =>
      ws.groupId === workspace.groupId &&
      !ws.archivedAt &&
      ctx.runtime(ws.id).status !== 'failed',
  );
  return lead === workspace;
}

export function stopWaitingForLanes(ctx: Context, origin: Workspace) {
  if (!origin.groupId || !leadsGroup(ctx, origin)) return;
  const waiting = ctx.store.state.workspaces.filter(
    (ws) => ws.groupId === origin.groupId && ws.awaitsLane,
  );
  for (const ws of waiting) ws.awaitsLane = false;
  ctx.store.save();
  ctx.emitState();
}

function groupRepos(ctx: Context, origin: Workspace): LaneRepo[] {
  const repoIds = new Set([
    origin.repoId,
    ...ctx.store.state.workspaces
      .filter((ws) => ws.groupId === origin.groupId && !ws.archivedAt)
      .map((ws) => ws.repoId),
  ]);
  return [...repoIds].map((repoId) => {
    const { id, name } = ctx.repo(repoId);
    return { id, name };
  });
}

function withLaneRepo(
  ctx: Context,
  origin: Workspace,
  lane: PlanLane,
): PlanLane {
  if (lane.repoId) return lane;
  const repos = groupRepos(ctx, origin);
  if (repos.length < 2) return lane;
  return { ...lane, repoId: presetLaneRepo(lane.name, repos) };
}

export function addLinkedWorkspace(
  ctx: Context,
  origin: Workspace,
  lane: PlanLane,
  task: SendOptions,
  plan: string | null,
  send: SendTask,
): Workspace {
  origin.groupId ??= ctx.deps.newId();
  const workspace = addLaneWorkspace(ctx, origin, lane, task);
  ctx.background(
    prepareNamedWorkspaces(
      ctx,
      [ctx.repo(workspace.repoId)],
      [workspace],
      Promise.resolve(workspace.name),
      task,
      plan,
      send,
    ),
  );
  return workspace;
}

export function createLaneWorkspaces(
  ctx: Context,
  origin: Workspace,
  lanes: PlanLane[],
  options: Omit<SendOptions, 'text'>,
  plan: string,
  send: SendTask,
) {
  const groupId = (origin.groupId ??= ctx.deps.newId());
  for (const lane of lanes.map((entry) => withLaneRepo(ctx, origin, entry))) {
    const laneOptions = { ...options, text: laneTask(lane) };
    const member = lane.repoId && awaitingMember(ctx, groupId, lane.repoId);
    if (member) sendLane(ctx, member, laneOptions, plan, send);
    else addLinkedWorkspace(ctx, origin, lane, laneOptions, plan, send);
  }
  ctx.store.save();
  ctx.emitState();
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
  const absolute = path.resolve(target);
  try {
    return realpathSync(absolute);
  } catch {
    const parent = path.dirname(absolute);
    if (parent === absolute) return absolute;
    return path.join(realPath(parent), path.basename(absolute));
  }
}

function isInside(root: string, target: string): boolean {
  return realPath(target).startsWith(`${realPath(root)}${path.sep}`);
}

async function untrackedWorktrees(
  ctx: Context,
  repo: Repo,
): Promise<GitWorktree[]> {
  const known = new Set(
    [
      repo.path,
      askWorktreePath(ctx.store.state.settings.workspacesRoot, repo),
      ...ctx.store.state.workspaces.map((other) => other.path),
    ].map(realPath),
  );
  const worktrees = await listWorktrees(ctx.git, repo.path).catch(() => []);
  return worktrees.filter(
    (worktree) =>
      !known.has(realPath(worktree.path)) && !isPoolSlot(worktree.path),
  );
}

export async function strayWorktrees(
  ctx: Context,
  workspace: Workspace,
): Promise<GitWorktree[]> {
  const prBranches = new Set(
    ctx.runtime(workspace.id).prs.map((pr) => pr.headRefName),
  );
  const worktrees = await untrackedWorktrees(ctx, ctx.repo(workspace.repoId));
  return worktrees.filter(
    (worktree) =>
      (worktree.branch !== null && prBranches.has(worktree.branch)) ||
      isInside(workspace.path, worktree.path),
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
  const runtime = ctx.runtime(workspace.id);
  if (workspace.archivedAt || runtime.status === 'archiving')
    return { ok: true, value: undefined };
  const { status, message } = runtime;
  ctx.setStatus(workspace.id, 'archiving');
  ctx.emitState();
  const config = await workspaceConfig(ctx, workspace);
  const deleteBranches =
    config.deleteBranchOnArchive ??
    ctx.store.state.settings.deleteBranchOnArchive;
  const strays = await removeStrayWorktrees(ctx, workspace, deleteBranches);
  if (!strays.ok) {
    ctx.setStatus(workspace.id, status, message);
    ctx.emitState();
    return strays;
  }
  reportKeptWorktrees(ctx, strays.value);
  stopSessions(workspace);
  ctx.terminals.closeMatching(`${workspace.id}:`);
  await runArchiveScript(ctx, workspace, config);
  const repo = ctx.repo(workspace.repoId);
  workspace.archiveSnapshot = await createCheckpoint(
    ctx.git,
    workspace.path,
  ).catch(() => null);
  if (isPoolSlot(workspace.path)) await detachWorktree(ctx.git, workspace.path);
  else await removeWorktree(ctx.git, repo.path, workspace.path);
  if (deleteBranches) await deleteBranch(ctx.git, repo.path, workspace.branch);
  workspace.archivedAt = ctx.deps.now().toISOString();
  ctx.creationRetries.delete(workspace.id);
  runtime.status = 'idle';
  runtime.unread = false;
  runtime.stats = null;
  runtime.runUrl = null;
  ctx.store.save();
  ctx.emitState();
  return { ok: true, value: undefined };
}

async function restoreWorkspaceWorktree(
  ctx: Context,
  repo: Repo,
  workspace: Workspace,
) {
  const restore = () =>
    restoreWorktree(ctx.git, repo.path, workspace.path, workspace.branch);
  if (!isPoolSlot(workspace.path)) {
    await checkOut(ctx, workspace, restore);
    return;
  }
  // Another workspace may use the old slot by now.
  workspace.path = worktreePath(ctx, repo, workspace.name);
  await checkOutInPool(
    ctx,
    repo,
    workspace,
    () => switchToBranch(ctx.git, workspace.path, workspace.branch),
    restore,
  );
}

export async function restoreWorkspace(
  ctx: Context,
  workspaceId: string,
): Promise<Result> {
  const workspace = ctx.workspace(workspaceId);
  const repo = ctx.repo(workspace.repoId);
  restoring.add(workspace.id);
  try {
    await restoreWorkspaceWorktree(ctx, repo, workspace);
    const snapshot = workspace.archiveSnapshot;
    const head = (
      await ctx.git.tryRun(workspace.path, ['rev-parse', 'HEAD'])
    )?.trim();
    if (snapshot && head === snapshot.head) {
      await restoreCheckpoint(ctx.git, workspace.path, snapshot);
    }
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  } finally {
    restoring.delete(workspace.id);
  }
  workspace.archivedAt = null;
  workspace.restoredAt = ctx.deps.now().toISOString();
  workspace.archiveSnapshot = null;
  workspace.port = allocatePort(activeWorkspaces(ctx).map((ws) => ws.port));
  ctx.store.save();
  ctx.emitState();
  void startScript(ctx, workspace, 'setup');
  ctx.background(refreshStats(ctx, workspace));
  return { ok: true, value: undefined };
}

export async function deleteWorkspace(ctx: Context, workspaceId: string) {
  const { state } = ctx.store;
  const workspace = ctx.workspace(workspaceId);
  if (!workspace.archivedAt) return;
  state.workspaces = state.workspaces.filter((ws) => ws.id !== workspaceId);
  await Promise.all(
    workspace.sessions.map((session) => ctx.store.removeSession(session.id)),
  );
  ctx.store.save();
  ctx.emitState();
}
