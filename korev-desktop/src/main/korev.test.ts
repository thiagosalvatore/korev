import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runProcess } from './command-runner';
import { nodeFileSystem } from './file-system';
import type { SendOptions } from '../shared/model';
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

const noPty = () => ({
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
    korev = await createKorev({
      run: runProcess,
      env: { ...process.env, PATH: `${FAKE_AGENT_BIN}:${process.env.PATH}` },
      shell: '/bin/sh',
      home,
      userDataPath: path.join(home, 'user-data'),
      fs: nodeFileSystem,
      spawnPty: noPty,
      emit: () => undefined,
      notify: () => undefined,
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

  async function createWorkspace(task: SendOptions | null = null) {
    const repo = await addRepo();
    const created = await korev.api.createWorkspace(repo.id, task);
    if (!created.ok) throw new Error(created.message);
    const { workspace } = await waitUntilCreated(created.value.id);
    if (task) await waitForTurn(workspace.sessions[0].id);
    return workspace;
  }

  function task(text: string): SendOptions {
    return {
      text,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      planMode: false,
    };
  }

  async function sendAndWait(sessionId: string, text: string) {
    const sent = await korev.api.send(sessionId, {
      text,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      planMode: false,
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

    const created = await korev.api.createWorkspace(
      repo.id,
      task('Add a note'),
    );

    if (!created.ok) throw new Error(created.message);
    const pending = await workspaceState(created.value.id);
    expect(pending.runtime).toMatchObject({
      status: 'creating',
      pendingPrompt: 'Add a note',
    });
    const { workspace, runtime } = await waitUntilCreated(created.value.id);
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

    const created = await korev.api.createWorkspace(repo.id, null);

    if (!created.ok) throw new Error(created.message);
    const { workspace } = await waitUntilCreated(created.value.id);
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

    const created = await korev.api.createWorkspace(repo.id, null);

    if (!created.ok) throw new Error(created.message);
    const { runtime } = await waitUntilCreated(created.value.id);
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
});
