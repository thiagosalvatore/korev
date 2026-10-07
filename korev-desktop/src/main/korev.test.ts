import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { runProcess, type CommandRunner } from './command-runner';
import { nodeFileSystem } from './file-system';
import {
  DEFAULT_EFFORT,
  type SendOptions,
  type Workspace,
  type WorkspaceSource,
} from '../shared/model';
import { createKorev, type Korev } from './korev';

const FAKE_AGENT_BIN = path.resolve(__dirname, '../../test-support/bin');
const WAIT_TIMEOUT_MS = 10_000;
const TEST_TIMEOUT_MS = 30_000;

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function waitFor(check: () => Promise<boolean>) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const spawned: { args: string[]; cwd: string }[] = [];

const CONDUCTOR_SETTINGS = `
[git]
archive_on_merge = true
branch_prefix_type = "custom"
branch_prefix = "agent"
delete_branch_on_archive = true
[models]
default = "opus-5-1m"
default_plan_mode = true
[models.codex]
default_thinking_level = "high"
`;

let conductorRepos: Record<string, string | null>[] = [];

const runWithFakeSqlite: CommandRunner = async (file, args, options) =>
  file === 'sqlite3'
    ? { exitCode: 0, stdout: JSON.stringify(conductorRepos), stderr: '' }
    : runProcess(file, args, options);

const noPty = (_file: string, args: string[], options: { cwd: string }) => {
  spawned.push({ args, cwd: options.cwd });
  return fakePty();
};

const fakePty = () => ({
  onData: () => undefined,
  onExit: () => undefined,
  write: () => undefined,
  resize: () => undefined,
  kill: () => undefined,
});

describe('Korev core', { timeout: TEST_TIMEOUT_MS }, () => {
  let home: string;
  let repoPath: string;
  let chosenDirectory: string;
  let korev: Korev;
  let playSound: Mock<() => void>;

  async function initRepo(name: string) {
    const dir = path.join(home, name);
    execFileSync('git', ['init', '-q', '-b', 'main', dir]);
    git(dir, 'config', 'user.email', 'dev@example.com');
    git(dir, 'config', 'user.name', 'Dev');
    git(dir, 'config', 'commit.gpgsign', 'false');
    await writeFile(path.join(dir, 'README.md'), `# ${name}\n`);
    await writeFile(path.join(dir, '.gitignore'), '.env\n');
    await writeFile(path.join(dir, '.env'), 'SECRET=1\n');
    git(dir, 'add', 'README.md', '.gitignore');
    git(dir, 'commit', '-q', '-m', 'init');
    return dir;
  }

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'korev-core-'));
    repoPath = await initRepo('acme');
    chosenDirectory = repoPath;
    playSound = vi.fn();
    korev = await createKorev({
      run: runWithFakeSqlite,
      env: { ...process.env, PATH: `${FAKE_AGENT_BIN}:${process.env.PATH}` },
      shell: '/bin/sh',
      home,
      userDataPath: path.join(home, 'user-data'),
      fs: nodeFileSystem,
      spawnPty: noPty,
      emit: () => undefined,
      notify: () => undefined,
      playSound,
      isWindowFocused: () => true,
      setBadge: () => undefined,
      now: () => new Date(),
      newId: () => randomUUID(),
      chooseDirectory: async () => chosenDirectory,
      openPath: async () => undefined,
      openExternal: async () => undefined,
      applyTheme: () => undefined,
    });
    await korev.api.updateSettings({
      branchPrefix: 'dev',
      autoRenameBranches: false,
    });
  });

  afterEach(async () => {
    await korev.shutdown();
    await rm(home, { recursive: true, force: true });
  });

  async function addRepo() {
    const added = await korev.api.addRepo();
    if (!added.ok || !added.value) throw new Error('repo not added');
    return added.value;
  }

  async function workspaceState(workspaceId: string) {
    const state = await korev.api.getState();
    return {
      workspace: state.workspaces.find((ws) => ws.id === workspaceId)!,
      runtime: state.runtime[workspaceId],
    };
  }

  async function waitUntilCreated(workspaceId: string) {
    await waitFor(
      async () =>
        (await workspaceState(workspaceId)).runtime.status !== 'creating',
    );
    return workspaceState(workspaceId);
  }

  async function waitForTurn(sessionId: string) {
    await waitFor(async () =>
      (await korev.api.transcript(sessionId)).some(
        (item) => item.kind === 'result',
      ),
    );
  }

  async function createWorkspace(
    task: SendOptions | null = null,
    source?: WorkspaceSource,
  ) {
    const repo = await addRepo();
    const created = await korev.api.createWorkspaces([repo.id], task, source);
    if (!created.ok) throw new Error(created.message);
    const { workspace } = await waitUntilCreated(created.value[0].id);
    if (task) await waitForTurn(workspace.sessions[0].id);
    return workspace;
  }

  function task(text: string): SendOptions {
    return {
      text,
      agent: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      planMode: false,
      fast: false,
    };
  }

  async function sendAndWait(sessionId: string, text: string) {
    const sent = await korev.api.send(sessionId, {
      text,
      agent: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      planMode: false,
      fast: false,
    });
    expect(sent.ok).toBe(true);
    await waitFor(
      async () => (await korev.api.getState()).runningSessions.length === 0,
    );
  }

  it('creates an empty workspace with .context ignored and .env copied', async () => {
    const workspace = await createWorkspace();

    expect(workspace.name).toBe('workspace');
    expect(workspace.branch).toBe('dev/workspace');
    expect(git(workspace.path, 'branch', '--show-current')).toBe(
      workspace.branch,
    );
    expect(existsSync(path.join(workspace.path, '.context'))).toBe(true);
    expect(await readFile(path.join(workspace.path, '.env'), 'utf8')).toBe(
      'SECRET=1\n',
    );
    expect(await korev.api.changes(workspace.id)).toEqual([]);
  });

  it('runs an agent turn, shows its changes and reverts them from a checkpoint', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;

    await sendAndWait(session.id, 'Add a note');

    const transcript = await korev.api.transcript(session.id);
    expect(transcript.map((item) => item.kind)).toEqual([
      'user',
      'assistant',
      'tool',
      'result',
    ]);
    expect(transcript[3]).toMatchObject({
      kind: 'result',
      turn: {
        files: [
          { path: 'agent-note.txt', status: 'A', additions: 1, deletions: 0 },
        ],
      },
    });
    expect(await korev.api.changes(workspace.id)).toEqual([
      { path: 'agent-note.txt', status: 'A', additions: 1, deletions: 0 },
    ]);
    const state = await korev.api.getState();
    expect(state.workspaces[0].sessions[0]).toMatchObject({
      title: 'Add a note',
      agentSessionId: 'fake-session',
    });

    const reverted = await korev.api.revert(session.id, transcript[0].id);

    expect(reverted).toEqual({ ok: true, value: 'Add a note' });
    expect(existsSync(path.join(workspace.path, 'agent-note.txt'))).toBe(false);
    expect(await korev.api.transcript(session.id)).toEqual([]);
  });

  it('plays a sound when a turn finishes in a workspace you are not looking at', async () => {
    const workspace = await createWorkspace();

    await sendAndWait(workspace.sessions[0].id, 'Add a note');

    expect(playSound).toHaveBeenCalledOnce();
  });

  it('stays quiet when a turn finishes in the workspace you are looking at', async () => {
    const workspace = await createWorkspace();
    await korev.api.focusWorkspace(workspace.id);

    await sendAndWait(workspace.sessions[0].id, 'Add a note');

    expect(playSound).not.toHaveBeenCalled();
  });

  it('keeps the turn in a chat that is read while its first message is sent', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;

    await Promise.all([
      sendAndWait(session.id, 'Add a note'),
      korev.api.transcript(session.id),
    ]);

    expect(
      (await korev.api.transcript(session.id)).map((item) => item.kind),
    ).toEqual(['user', 'assistant', 'tool', 'result']);
  });

  it('switches a chat to another agent and starts a fresh agent session', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await sendAndWait(session.id, 'Add a note');

    await korev.api.updateSession(session.id, {
      agent: 'codex',
      model: 'gpt-6.1-sol',
    });

    const state = await korev.api.getState();
    expect(state.workspaces[0].sessions[0]).toMatchObject({
      agent: 'codex',
      model: 'gpt-6.1-sol',
      effort: DEFAULT_EFFORT.codex,
      agentSessionId: null,
    });
  });

  it('starts reviews on the review model when one is set', async () => {
    await korev.api.updateSettings({
      reviewModel: {
        agent: 'claude',
        model: 'claude-haiku-4-5',
        effort: 'low',
      },
    });
    const workspace = await createWorkspace();

    const review = await korev.api.startReview(workspace.id);

    if (!review.ok) throw new Error(review.message);
    const state = await korev.api.getState();
    expect(
      state.workspaces[0].sessions.find((entry) => entry.id === review.value),
    ).toMatchObject({ model: 'claude-haiku-4-5', effort: 'low' });
  });

  it('renames the placeholder branch after the first message', async () => {
    await korev.api.updateSettings({ autoRenameBranches: true });
    const workspace = await createWorkspace();

    await sendAndWait(workspace.sessions[0].id, 'Add a note');
    await waitFor(
      async () =>
        (await korev.api.getState()).workspaces[0].branch ===
        'dev/add-agent-note',
    );

    expect(git(workspace.path, 'branch', '--show-current')).toBe(
      'dev/add-agent-note',
    );
  });

  it('returns before the worktree exists, then names it from the task and sends the task', async () => {
    await korev.api.updateSettings({ autoRenameBranches: true });
    const repo = await addRepo();

    const created = await korev.api.createWorkspaces(
      [repo.id],
      task('Add a note'),
    );

    if (!created.ok) throw new Error(created.message);
    const pending = await workspaceState(created.value[0].id);
    expect(pending.runtime).toMatchObject({
      status: 'creating',
      pendingPrompt: 'Add a note',
    });
    const { workspace, runtime } = await waitUntilCreated(created.value[0].id);
    expect(runtime.pendingPrompt).toBeNull();
    expect(workspace).toMatchObject({
      name: 'add-agent-note',
      branch: 'dev/add-agent-note',
    });
    expect(path.basename(workspace.path)).toBe('add-agent-note');
    expect(git(workspace.path, 'branch', '--show-current')).toBe(
      'dev/add-agent-note',
    );
    await waitForTurn(workspace.sessions[0].id);
  });

  it('names the workspace from the first words of the task when AI naming is off', async () => {
    const workspace = await createWorkspace(
      task('Fix the login redirect loop on Safari please'),
    );

    expect(workspace.name).toBe('fix-the-login-redirect-loop');
    expect(workspace.branch).toBe('dev/fix-the-login-redirect-loop');
  });

  it('skips names whose branch already exists', async () => {
    const repo = await addRepo();
    git(repoPath, 'branch', 'dev/workspace');

    const created = await korev.api.createWorkspaces([repo.id], null);

    if (!created.ok) throw new Error(created.message);
    const { workspace } = await waitUntilCreated(created.value[0].id);
    expect(workspace).toMatchObject({
      name: 'workspace-2',
      branch: 'dev/workspace-2',
    });
  });

  it('reports a worktree that cannot be created', async () => {
    const repo = await addRepo();
    const settings = (await korev.api.getState()).settings;
    await mkdir(path.join(settings.workspacesRoot, 'acme', 'workspace', 'x'), {
      recursive: true,
    });

    const created = await korev.api.createWorkspaces([repo.id], null);

    if (!created.ok) throw new Error(created.message);
    const { runtime } = await waitUntilCreated(created.value[0].id);
    expect(runtime.status).toBe('failed');
    expect(runtime.message).toMatch(/Could not create the worktree/);
  });

  async function askAndWait(repoIds: string[], text: string) {
    const ask = await korev.api.createAskChat(repoIds);
    await sendAndWait(ask.session.id, text);
    return ask;
  }

  it('answers questions in a read-only checkout of the default branch without a workspace', async () => {
    const repo = await addRepo();
    const askDir = path.join(home, 'korev', 'workspaces', 'acme', '.ask');

    const ask = await askAndWait([repo.id], 'Where is the README?');

    const state = await korev.api.getState();
    expect(state.workspaces).toEqual([]);
    expect(state.askChats.map((entry) => entry.id)).toEqual([ask.id]);
    expect(git(askDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
    expect(
      await readFile(path.join(askDir, '.context', 'claude-args'), 'utf8'),
    ).toContain('--permission-mode plan');
    expect(
      (await korev.api.transcript(ask.session.id)).map((item) => item.kind),
    ).toEqual(['user', 'assistant', 'tool', 'result']);
  });

  it('moves the read-only checkout to the latest default branch before each question', async () => {
    const repo = await addRepo();
    const askDir = path.join(home, 'korev', 'workspaces', 'acme', '.ask');
    const ask = await askAndWait([repo.id], 'First question');
    await writeFile(path.join(repoPath, 'NEW.md'), 'new\n');
    git(repoPath, 'add', 'NEW.md');
    git(repoPath, 'commit', '-q', '-m', 'new');

    await sendAndWait(ask.session.id, 'Second question');

    expect(existsSync(path.join(askDir, 'NEW.md'))).toBe(true);
  });

  it('lets one question read several repositories', async () => {
    const acme = await addRepo();
    chosenDirectory = await initRepo('api');
    const api = await addRepo();

    await askAndWait([acme.id, api.id], 'How do these talk?');

    const root = path.join(home, 'korev', 'workspaces');
    expect(
      await readFile(
        path.join(root, 'acme', '.ask', '.context', 'claude-args'),
        'utf8',
      ),
    ).toContain(`--add-dir ${path.join(root, 'api', '.ask')}`);
  });

  async function userMessages(sessionId: string) {
    return (await korev.api.transcript(sessionId)).flatMap((item) =>
      item.kind === 'user' ? [item.text] : [],
    );
  }

  async function waitForLinkedTurns(workspaces: Workspace[]) {
    for (const workspace of workspaces) {
      await waitUntilCreated(workspace.id);
      await waitForTurn(workspace.sessions[0].id);
    }
    const state = await korev.api.getState();
    return workspaces.map(
      (workspace) => state.workspaces.find((ws) => ws.id === workspace.id)!,
    );
  }

  it('creates linked workspaces with one branch name across repositories', async () => {
    await korev.api.updateSettings({ autoRenameBranches: true });
    const acme = await addRepo();
    chosenDirectory = await initRepo('api');
    const api = await addRepo();

    const created = await korev.api.createWorkspaces(
      [acme.id, api.id],
      task('Add a note'),
    );

    if (!created.ok) throw new Error(created.message);
    const [front, back] = await waitForLinkedTurns(created.value);
    expect(front.groupId).not.toBeNull();
    expect(back.groupId).toBe(front.groupId);
    expect([front.branch, back.branch]).toEqual([
      'dev/add-agent-note',
      'dev/add-agent-note',
    ]);
    expect(
      await readFile(path.join(front.path, '.context', 'claude-args'), 'utf8'),
    ).toContain(`--add-dir ${back.path}`);
    expect(await userMessages(front.sessions[0].id)).toEqual([
      expect.stringContaining('You own the acme part'),
    ]);
  });

  it('starts linked workspaces from the plan in an Ask chat', async () => {
    const acme = await addRepo();
    chosenDirectory = await initRepo('api');
    const api = await addRepo();
    const ask = await askAndWait([acme.id, api.id], 'Plan the change');

    const started = await korev.api.startFromAsk(ask.id);

    if (!started.ok) throw new Error(started.message);
    const [front, back] = await waitForLinkedTurns(started.value);
    expect(back.groupId).toBe(front.groupId);
    expect((await userMessages(back.sessions[0].id))[0]).toContain(
      '<plan>\nI added agent-note.txt.\n</plan>',
    );
  });

  it('archives a workspace and restores its uncommitted work', async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace.path, 'draft.txt'), 'wip\n');

    const archived = await korev.api.archiveWorkspace(workspace.id);

    expect(archived.ok).toBe(true);
    expect(existsSync(workspace.path)).toBe(false);
    expect(git(repoPath, 'branch', '--list', workspace.branch)).toContain(
      workspace.branch,
    );

    const restored = await korev.api.restoreWorkspace(workspace.id);

    expect(restored.ok).toBe(true);
    expect(await readFile(path.join(workspace.path, 'draft.txt'), 'utf8')).toBe(
      'wip\n',
    );
  });
  it('copies only the gitignored files that .worktreeinclude names', async () => {
    await mkdir(path.join(repoPath, 'config'));
    await writeFile(path.join(repoPath, 'config', 'app.local.json'), '{}');
    await writeFile(
      path.join(repoPath, '.gitignore'),
      '.env\nconfig/*.local.json\n',
    );
    await writeFile(
      path.join(repoPath, '.worktreeinclude'),
      'config/*.local.json\n',
    );

    const workspace = await createWorkspace();

    expect(
      existsSync(path.join(workspace.path, 'config', 'app.local.json')),
    ).toBe(true);
    expect(existsSync(path.join(workspace.path, '.env'))).toBe(false);
  });

  it('checks out an existing branch instead of creating one', async () => {
    git(repoPath, 'branch', 'feature/login');

    const workspace = await createWorkspace(null, {
      kind: 'branch',
      branch: 'feature/login',
    });

    expect(workspace).toMatchObject({ name: 'login', branch: 'feature/login' });
    expect(git(workspace.path, 'branch', '--show-current')).toBe(
      'feature/login',
    );
  });

  it('names the workspace and branch after the issue it starts from', async () => {
    const workspace = await createWorkspace(null, {
      kind: 'issue',
      number: 12,
      title: 'Fix the login bug!',
    });

    expect(workspace).toMatchObject({
      name: '12-fix-the-login-bug',
      branch: 'dev/12-fix-the-login-bug',
    });
  });

  it('refuses a branch, PR or issue source for several repositories', async () => {
    const repo = await addRepo();
    chosenDirectory = await initRepo('web');
    const other = await addRepo();

    const created = await korev.api.createWorkspaces(
      [repo.id, other.id],
      null,
      {
        kind: 'branch',
        branch: 'main',
      },
    );

    expect(created.ok).toBe(false);
  });

  it('starts the default run script from .korev/settings.toml in its cwd', async () => {
    await mkdir(path.join(repoPath, '.korev'));
    await writeFile(
      path.join(repoPath, '.korev', 'settings.toml'),
      '[scripts.run.web]\ncommand = "pnpm dev"\noptions = { cwd = "apps/web" }\n[scripts.run.api]\ncommand = "pnpm api"\ndefault = true\n',
    );
    git(repoPath, 'add', '.korev');
    git(repoPath, 'commit', '-q', '-m', 'settings');
    const workspace = await createWorkspace();
    spawned.length = 0;

    expect((await korev.api.startScript(workspace.id, 'run')).ok).toBe(true);
    expect((await korev.api.startScript(workspace.id, 'run', 'web')).ok).toBe(
      true,
    );

    expect(spawned).toEqual([
      { args: ['-lc', 'pnpm api'], cwd: workspace.path },
      {
        args: ['-lc', 'pnpm dev'],
        cwd: path.join(workspace.path, 'apps/web'),
      },
    ]);
  });

  it('answers a plan in an Ask chat itself, so the chat ends and the plan can start workspaces', async () => {
    const repo = await addRepo();
    const askDir = path.join(home, 'korev', 'workspaces', 'acme', '.ask');

    const ask = await askAndWait([repo.id], 'make-plan for the login page');

    const items = await korev.api.transcript(ask.session.id);
    expect(items.some((item) => item.kind === 'permission')).toBe(false);
    expect(
      await readFile(path.join(askDir, '.context', 'plan-answer'), 'utf8'),
    ).toContain('"behavior":"deny"');
    const started = await korev.api.startFromAsk(ask.id);
    expect(started.ok).toBe(true);
  });

  it('waits for the user to approve a tool call when approvals are on', async () => {
    await korev.api.updateSettings({ toolApprovals: true });
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await korev.api.send(session.id, {
      text: 'needs-approval',
      agent: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      planMode: false,
      fast: false,
    });
    let permissionId = '';
    await waitFor(async () => {
      const pending = (await korev.api.transcript(session.id)).find(
        (item) => item.kind === 'permission',
      );
      permissionId = pending?.id ?? '';
      return Boolean(pending);
    });
    expect((await korev.api.getState()).runtime[workspace.id].status).toBe(
      'waiting',
    );

    expect(
      await korev.api.respondPermission(session.id, permissionId, {
        allow: true,
      }),
    ).toEqual({ ok: true, value: undefined });
    await waitFor(
      async () => (await korev.api.getState()).runningSessions.length === 0,
    );

    expect(existsSync(path.join(workspace.path, 'approved.txt'))).toBe(true);
    expect(
      (await korev.api.transcript(session.id)).find(
        (item) => item.id === permissionId,
      ),
    ).toMatchObject({
      kind: 'permission',
      tool: 'Bash',
      summary: 'touch approved.txt',
      status: 'allowed',
    });
  });

  it('leaves plan mode once the user approves the plan', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await korev.api.send(session.id, {
      text: 'make-plan for the login page',
      agent: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      planMode: true,
      fast: false,
    });
    let permissionId = '';
    await waitFor(async () => {
      const pending = (await korev.api.transcript(session.id)).find(
        (item) => item.kind === 'permission',
      );
      permissionId = pending?.id ?? '';
      return Boolean(pending);
    });
    const planning = await workspaceState(workspace.id);
    expect(planning.workspace.sessions[0].planMode).toBe(true);

    await korev.api.respondPermission(session.id, permissionId, {
      allow: true,
    });

    const approved = await workspaceState(workspace.id);
    expect(approved.workspace.sessions[0].planMode).toBe(false);
  });

  it('offers skills as slash commands', async () => {
    const workspace = await createWorkspace();
    const skillDir = path.join(home, '.claude', 'skills', 'browse');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '# browse\n');

    expect(await korev.api.slashCommands(workspace.id)).toContain('browse');
  });

  it('mirrors tracked workspace changes into the root checkout with spotlight, then restores it', async () => {
    const workspace = await createWorkspace();
    await writeFile(
      path.join(workspace.path, 'README.md'),
      '# changed in the workspace\n',
    );

    expect(await korev.api.toggleSpotlight(workspace.id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await readFile(path.join(repoPath, 'README.md'), 'utf8')).toBe(
      '# changed in the workspace\n',
    );
    expect((await korev.api.getState()).spotlights).toEqual({
      [workspace.repoId]: workspace.id,
    });

    expect(await korev.api.toggleSpotlight(workspace.id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await readFile(path.join(repoPath, 'README.md'), 'utf8')).toBe(
      '# acme\n',
    );
    expect(git(repoPath, 'branch', '--show-current')).toBe('main');
  });

  it('refuses spotlight while the root checkout has uncommitted changes', async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(repoPath, 'README.md'), '# local edit\n');

    const result = await korev.api.toggleSpotlight(workspace.id);

    expect(result.ok).toBe(false);
    expect(await readFile(path.join(repoPath, 'README.md'), 'utf8')).toBe(
      '# local edit\n',
    );
  });

  it('imports Conductor repositories and preferences', async () => {
    await addRepo();
    const widgets = await initRepo('widgets');
    const conductorRepo = (root_path: string) => ({
      root_path,
      setup_script: 'npm ci',
      run_script: 'npm start',
      archive_script: null,
      run_script_mode: 'nonconcurrent',
    });
    conductorRepos = [
      conductorRepo(widgets),
      conductorRepo(path.join(home, 'deleted')),
      conductorRepo(repoPath),
    ];
    const dbDir = path.join(
      home,
      'Library/Application Support/com.conductor.app',
    );
    await mkdir(dbDir, { recursive: true });
    await writeFile(path.join(dbDir, 'conductor.db'), '');
    await mkdir(path.join(home, '.conductor'));
    await writeFile(
      path.join(home, '.conductor', 'settings.toml'),
      CONDUCTOR_SETTINGS,
    );

    expect(await korev.api.importFromConductor()).toEqual({
      repos: 1,
      settings: 5,
    });

    const { repos, settings } = await korev.api.getState();
    expect(repos.map((repo) => [repo.name, repo.scripts])).toEqual([
      ['acme', { setup: '', run: '', archive: '', runMode: 'concurrent' }],
      [
        'widgets',
        {
          setup: 'npm ci',
          run: 'npm start',
          archive: '',
          runMode: 'nonconcurrent',
        },
      ],
    ]);
    expect(settings).toMatchObject({
      archiveOnMerge: true,
      deleteBranchOnArchive: true,
      defaultPlanMode: true,
      branchPrefix: 'agent',
      defaultEffort: { claude: 'high', codex: 'high' },
    });
  });
});
