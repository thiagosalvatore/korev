import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runProcess } from './command-runner';
import { nodeFileSystem } from './file-system';
import { createKorev, type Korev } from './korev';

const FAKE_AGENT_BIN = path.resolve(__dirname, '../../test-support/bin');
const WAIT_TIMEOUT_MS = 10_000;

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

describe('Korev core', () => {
  let home: string;
  let repoPath: string;
  let korev: Korev;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'korev-core-'));
    repoPath = path.join(home, 'acme');
    execFileSync('git', ['init', '-q', '-b', 'main', repoPath]);
    git(repoPath, 'config', 'user.email', 'dev@example.com');
    git(repoPath, 'config', 'user.name', 'Dev');
    git(repoPath, 'config', 'commit.gpgsign', 'false');
    await writeFile(path.join(repoPath, 'README.md'), '# acme\n');
    await writeFile(path.join(repoPath, '.gitignore'), '.env\n');
    await writeFile(path.join(repoPath, '.env'), 'SECRET=1\n');
    git(repoPath, 'add', 'README.md', '.gitignore');
    git(repoPath, 'commit', '-q', '-m', 'init');
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
      chooseDirectory: async () => repoPath,
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

  async function createWorkspace() {
    const added = await korev.api.addRepo();
    if (!added.ok || !added.value) throw new Error('repo not added');
    const created = await korev.api.createWorkspace(added.value.id);
    if (!created.ok) throw new Error(created.message);
    return created.value;
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

  it('creates a worktree on a city branch with .context ignored and .env copied', async () => {
    const workspace = await createWorkspace();

    expect(workspace.branch).toBe(`dev/${workspace.name}`);
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
