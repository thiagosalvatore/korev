import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
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
import { createKorev, PR_POLL_MS, type Korev } from './korev';
import type { RemoteSettings } from './remote-access';
import type { Release } from './updates';

const APP_VERSION = '1.2.0';
const INSTALLED_RELEASE: Release = {
  version: APP_VERSION,
  notes: '- Faster startup',
  url: 'https://github.com/thiagosalvatore/korev/releases/tag/v1.2.0',
  zipUrl: null,
};

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
let openPr: Record<string, unknown> | null = null;
let prsByUrl: Record<string, Record<string, unknown>> = {};
let stacksByUrl: Record<string, Record<string, unknown>> = {};
let ghMerges: string[][] = [];

const BRANCH_PR_URL = 'https://github.com/acme/web/pull/7';
const NO_PR = { exitCode: 1, stdout: '', stderr: 'no pull requests found' };

function fakePrView(ref: string) {
  const pr = ref.startsWith('https://') ? prsByUrl[ref] : openPr;
  return pr ? { exitCode: 0, stdout: JSON.stringify(pr), stderr: '' } : NO_PR;
}

function fakePrStack(args: readonly string[]) {
  const url = args.find((arg) => arg.startsWith('url='))?.slice('url='.length);
  const resource = (url && stacksByUrl[url]) ?? {
    stackEntry: null,
    stack: null,
  };
  return {
    exitCode: 0,
    stdout: JSON.stringify({ data: { resource } }),
    stderr: '',
  };
}

function isGhMerge(args: readonly string[]) {
  return ['pr', 'stack'].includes(args[0]) && args[1] === 'merge';
}

const runWithFakeSqlite: CommandRunner = async (file, args, options) => {
  if (file === 'sqlite3')
    return { exitCode: 0, stdout: JSON.stringify(conductorRepos), stderr: '' };
  if (file === 'gh' && args[0] === 'pr' && args[1] === 'view')
    return fakePrView(args[2]);
  if (file === 'gh' && args[0] === 'api' && args[1] === 'graphql')
    return fakePrStack(args);
  if (file === 'gh' && isGhMerge(args)) {
    ghMerges.push([...args]);
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  return runProcess(file, args, options);
};

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
  let keepAwake: Mock<(on: boolean) => void>;
  let applyRemote: Mock<(settings: RemoteSettings) => Promise<void>>;
  let emit: Mock<(event: string, payload: unknown) => void>;
  let fetchRelease: Mock<(which: string) => Promise<Release | null>>;

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

  function openKorev() {
    return createKorev({
      run: runWithFakeSqlite,
      env: { ...process.env, PATH: `${FAKE_AGENT_BIN}:${process.env.PATH}` },
      shell: '/bin/sh',
      home,
      userDataPath: path.join(home, 'user-data'),
      fs: nodeFileSystem,
      spawnPty: noPty,
      emit,
      notify: () => undefined,
      playSound,
      isWindowFocused: () => true,
      setBadge: () => undefined,
      keepAwake,
      now: () => new Date(),
      newId: () => randomUUID(),
      chooseDirectory: async () => chosenDirectory,
      openPath: async () => undefined,
      openExternal: async () => undefined,
      applyTheme: () => undefined,
      remote: {
        status: () => ({
          address: null,
          devices: [],
          onTailnet: false,
          error: null,
        }),
        pairing: async () => null,
        apply: applyRemote,
        revoke: async () => undefined,
      },
      appVersion: APP_VERSION,
      fetchRelease,
      installUpdate: async () => ({ ok: true, value: undefined }),
    });
  }

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'korev-core-'));
    repoPath = await initRepo('acme');
    chosenDirectory = repoPath;
    playSound = vi.fn();
    keepAwake = vi.fn();
    applyRemote = vi.fn(async () => undefined);
    emit = vi.fn();
    fetchRelease = vi.fn(async () => INSTALLED_RELEASE);
    korev = await openKorev();
    await korev.api.updateSettings({
      branchPrefix: 'dev',
      autoRenameBranches: false,
    });
  });

  afterEach(async () => {
    openPr = null;
    prsByUrl = {};
    stacksByUrl = {};
    ghMerges = [];
    await korev.shutdown();
    vi.useRealTimers();
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
    await waitFor(async () => {
      const items = await korev.api.transcript(sessionId);
      return items
        .slice(items.findLastIndex((item) => item.kind === 'user'))
        .some((item) => item.kind === 'result');
    });
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

  it('restarts remote access only when a remote setting changes', async () => {
    applyRemote.mockClear();
    await korev.api.updateSettings({ theme: 'dark' });
    expect(applyRemote).not.toHaveBeenCalled();
    await korev.api.updateSettings({ remoteAccess: true });
    expect(applyRemote).toHaveBeenCalledWith(
      expect.objectContaining({ remoteAccess: true }),
    );
  });

  it('shows the notes of the installed version once', async () => {
    await korev.showWhatsNew();
    expect(fetchRelease).toHaveBeenCalledWith(APP_VERSION);
    expect((await korev.api.getState()).whatsNew?.notes).toBe(
      '- Faster startup',
    );

    await korev.api.dismissWhatsNew();
    const state = await korev.api.getState();
    expect(state.whatsNew).toBeNull();
    expect(state.settings.lastSeenVersion).toBe(APP_VERSION);

    fetchRelease.mockClear();
    await korev.showWhatsNew();
    expect(fetchRelease).not.toHaveBeenCalled();
  });

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

  it('picks up the PR an agent opened as soon as its turn finishes', async () => {
    const workspace = await createWorkspace();
    expect((await workspaceState(workspace.id)).runtime.prs).toEqual([]);
    openPr = { number: 7, state: 'OPEN', url: BRANCH_PR_URL };

    await sendAndWait(workspace.sessions[0].id, 'Open a PR');

    await waitFor(
      async () =>
        (await workspaceState(workspace.id)).runtime.prs[0]?.number === 7,
    );
  });

  it('archives a workspace whose PR merged during an agent turn once the turn finishes', async () => {
    await korev.api.updateSettings({ archiveOnMerge: true });
    const workspace = await createWorkspace();
    openPr = {
      number: 7,
      url: BRANCH_PR_URL,
      state: 'MERGED',
      mergedAt: '2020-01-01T00:00:00Z',
    };

    await sendAndWait(workspace.sessions[0].id, 'Keep going');

    await waitFor(
      async () =>
        (await workspaceState(workspace.id)).workspace.archivedAt !== null,
    );
    expect(emit).toHaveBeenCalledWith(
      'toast',
      expect.objectContaining({ tone: 'success' }),
    );
  });

  it('checks the PR of every workspace on a timer', async () => {
    await korev.shutdown();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    korev = await openKorev();
    const workspace = await createWorkspace();
    openPr = { number: 7, url: BRANCH_PR_URL, state: 'OPEN' };

    vi.advanceTimersByTime(PR_POLL_MS);

    await waitFor(
      async () =>
        (await workspaceState(workspace.id)).runtime.prs[0]?.number === 7,
    );
  });

  it('keeps a restored workspace whose PR merged before the restore', async () => {
    await korev.api.updateSettings({ archiveOnMerge: true });
    const workspace = await createWorkspace();
    openPr = {
      number: 7,
      url: BRANCH_PR_URL,
      state: 'MERGED',
      mergedAt: '2020-01-01T00:00:00Z',
    };
    await korev.api.prStatuses(workspace.id);
    expect(
      (await workspaceState(workspace.id)).workspace.archivedAt,
    ).not.toBeNull();

    await korev.api.restoreWorkspace(workspace.id);
    await korev.api.prStatuses(workspace.id);

    expect(
      (await workspaceState(workspace.id)).workspace.archivedAt,
    ).toBeNull();
  });

  function fakePr(number: number, state: string, createdAt: string) {
    const url = `https://github.com/acme/web/pull/${number}`;
    prsByUrl[url] = { number, url, state, createdAt, mergedAt: null };
    return url;
  }

  async function trackedUrls(workspaceId: string) {
    return (await workspaceState(workspaceId)).workspace.prs.map(
      (pr) => pr.url,
    );
  }

  it('tracks a PR the agent opened during the turn, not one it only looked at', async () => {
    const workspace = await createWorkspace();
    const opened = fakePr(8, 'OPEN', new Date().toISOString());
    const old = fakePr(3, 'MERGED', '2020-01-01T00:00:00Z');

    await sendAndWait(workspace.sessions[0].id, `open-pr ${opened} ${old}`);

    await waitFor(async () => (await trackedUrls(workspace.id)).length > 0);
    expect(await trackedUrls(workspace.id)).toEqual([opened]);
    await waitFor(
      async () => (await workspaceState(workspace.id)).runtime.prs.length > 0,
    );
    expect(
      (await workspaceState(workspace.id)).runtime.prs.map((pr) => pr.number),
    ).toEqual([8]);
  });

  it('archives only once every tracked PR has merged', async () => {
    await korev.api.updateSettings({ archiveOnMerge: true });
    const workspace = await createWorkspace();
    const second = fakePr(8, 'OPEN', new Date().toISOString());
    await sendAndWait(workspace.sessions[0].id, `open-pr ${second}`);
    await waitFor(async () => (await trackedUrls(workspace.id)).length > 0);
    openPr = {
      number: 7,
      url: BRANCH_PR_URL,
      state: 'MERGED',
      mergedAt: '2020-01-01T00:00:00Z',
    };

    await korev.api.prStatuses(workspace.id);
    expect(
      (await workspaceState(workspace.id)).workspace.archivedAt,
    ).toBeNull();

    prsByUrl[second] = { ...prsByUrl[second], state: 'MERGED' };
    await korev.api.prStatuses(workspace.id);
    expect(
      (await workspaceState(workspace.id)).workspace.archivedAt,
    ).not.toBeNull();
  });

  it('merges a PR in the middle of a stack together with the PRs below it', async () => {
    const workspace = await createWorkspace();
    const middle = fakePr(8, 'OPEN', new Date().toISOString());
    stacksByUrl[middle] = {
      stackEntry: { position: 2 },
      stack: {
        entries: {
          nodes: [1, 2, 3].map((position) => ({
            position,
            pullRequest: { number: position + 6, state: 'OPEN' },
          })),
        },
      },
    };
    await sendAndWait(workspace.sessions[0].id, `open-pr ${middle}`);
    await waitFor(async () => (await trackedUrls(workspace.id)).length > 0);
    await korev.api.prStatuses(workspace.id);

    const merged = await korev.api.mergePr(workspace.id, 8);

    expect(merged.ok).toBe(true);
    expect(ghMerges).toEqual([['stack', 'merge', '8', '--yes', '--squash']]);
  });

  async function workspaceWithStrayPr(strayPath: string, state = 'MERGED') {
    await korev.api.updateSettings({ archiveOnMerge: false });
    const workspace = await createWorkspace();
    git(repoPath, 'worktree', 'add', '-q', '-b', 'dev/extra', strayPath);
    const url = fakePr(8, state, new Date().toISOString());
    prsByUrl[url] = { ...prsByUrl[url], headRefName: 'dev/extra' };
    await sendAndWait(workspace.sessions[0].id, `open-pr ${url}`);
    await waitFor(async () => (await trackedUrls(workspace.id)).length > 0);
    await korev.api.prStatuses(workspace.id);
    return workspace;
  }

  it('removes the worktree an agent made for a tracked PR on archive and leaves others alone', async () => {
    const stray = path.join(home, 'stray');
    const unrelated = path.join(home, 'unrelated');
    const workspace = await workspaceWithStrayPr(stray);
    git(repoPath, 'worktree', 'add', '-q', '-b', 'dev/other', unrelated);

    const archived = await korev.api.archiveWorkspace(workspace.id);

    expect(archived.ok).toBe(true);
    expect(existsSync(stray)).toBe(false);
    expect(existsSync(unrelated)).toBe(true);
  });

  it('keeps a stray worktree with uncommitted work and says so', async () => {
    const stray = path.join(home, 'stray');
    const workspace = await workspaceWithStrayPr(stray);
    await writeFile(path.join(stray, 'wip.txt'), 'unsaved\n');

    await korev.api.archiveWorkspace(workspace.id);

    expect(existsSync(path.join(stray, 'wip.txt'))).toBe(true);
    expect(emit).toHaveBeenCalledWith(
      'toast',
      expect.objectContaining({ title: expect.stringContaining(stray) }),
    );
  });

  it('refuses to archive while a worktree inside it has uncommitted work', async () => {
    const workspace = await createWorkspace();
    const nested = path.join(workspace.path, '.claude', 'worktrees', 'side');
    git(repoPath, 'worktree', 'add', '-q', '-b', 'dev/side', nested);
    await writeFile(path.join(nested, 'wip.txt'), 'unsaved\n');

    const archived = await korev.api.archiveWorkspace(workspace.id);

    expect(archived.ok).toBe(false);
    expect(existsSync(path.join(nested, 'wip.txt'))).toBe(true);
  });

  it('opens the worktree an agent made for a PR as its own workspace, forking the chat', async () => {
    const stray = path.join(home, 'stray');
    const origin = await workspaceWithStrayPr(stray, 'OPEN');
    const originChat = await korev.api.transcript(origin.sessions[0].id);

    const opened = await korev.api.openPrAsWorkspace(origin.id, 8);

    if (!opened.ok) throw new Error(opened.message);
    const { workspace, runtime } = await waitUntilCreated(opened.value.id);
    expect(runtime.prs.map((pr) => pr.number)).toEqual([8]);
    expect(workspace.path).toBe(realpathSync(stray));
    expect(workspace.branch).toBe('dev/extra');
    expect(workspace.prs.map((pr) => pr.url)).toEqual([
      'https://github.com/acme/web/pull/8',
    ]);
    expect((await workspaceState(origin.id)).workspace.prs).toEqual([]);
    const [chat] = workspace.sessions;
    expect(chat.id).not.toBe(origin.sessions[0].id);
    expect(await korev.api.transcript(chat.id)).toEqual(originChat);

    await sendAndWait(chat.id, 'Keep going');
    const argsFile = path.join(stray, '.context', 'claude-args');
    expect(await readFile(argsFile, 'utf8')).toContain(
      '--resume fake-session --fork-session',
    );
    await sendAndWait(chat.id, 'And again');
    expect(await readFile(argsFile, 'utf8')).not.toContain('--fork-session');
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

  it('keeps the Mac awake only while a turn is running', async () => {
    const workspace = await createWorkspace();

    await sendAndWait(workspace.sessions[0].id, 'Add a note');

    expect(keepAwake).toHaveBeenCalledWith(true);
    expect(keepAwake).toHaveBeenLastCalledWith(false);
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

  it('titles a workspace chat tab from its first message', async () => {
    await korev.api.updateSettings({ autoRenameBranches: true });
    const workspace = await createWorkspace();

    await sendAndWait(workspace.sessions[0].id, 'Add a note');

    await waitFor(
      async () =>
        (await korev.api.getState()).workspaces[0].sessions[0].title ===
        'Finding the README',
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
    const args = await readFile(
      path.join(askDir, '.context', 'claude-args'),
      'utf8',
    );
    expect(args).toContain('--permission-mode default');
    expect(args).toContain('--disallowedTools Edit Write NotebookEdit');
    expect(
      (await korev.api.transcript(ask.session.id)).map((item) => item.kind),
    ).toEqual(['user', 'assistant', 'tool', 'result']);
  });

  it('titles an Ask chat from its first question', async () => {
    const repo = await addRepo();

    const ask = await askAndWait([repo.id], 'Where is the README?');

    await waitFor(
      async () =>
        (await korev.api.getState()).askChats.find(
          (entry) => entry.id === ask.id,
        )?.session.title === 'Finding the README',
    );
  });

  it('stamps an Ask chat with the time of its last message', async () => {
    const repo = await addRepo();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    const older = await korev.api.createAskChat([repo.id]);
    vi.setSystemTime(new Date('2026-01-01T11:00:00Z'));
    const newer = await korev.api.createAskChat([repo.id]);
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));

    await sendAndWait(older.session.id, 'Where is the README?');

    const lastMessageAt = new Map(
      (await korev.api.getState()).askChats.map((ask) => [
        ask.id,
        ask.lastMessageAt,
      ]),
    );
    expect(lastMessageAt.get(older.id)).toBe('2026-01-01T12:00:00.000Z');
    expect(lastMessageAt.get(newer.id)).toBe('2026-01-01T11:00:00.000Z');
  });

  it('asks the user before an Ask chat runs a command, even with tool approvals off', async () => {
    const repo = await addRepo();
    const askDir = path.join(home, 'korev', 'workspaces', 'acme', '.ask');
    const ask = await korev.api.createAskChat([repo.id]);
    await korev.api.send(ask.session.id, {
      text: 'needs-approval',
      agent: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      planMode: false,
      fast: false,
    });
    let permissionId = '';
    await waitFor(async () => {
      const pending = (await korev.api.transcript(ask.session.id)).find(
        (item) => item.kind === 'permission',
      );
      permissionId = pending?.id ?? '';
      return Boolean(pending);
    });

    await korev.api.respondPermission(ask.session.id, permissionId, {
      allow: true,
    });
    await waitFor(
      async () => (await korev.api.getState()).runningSessions.length === 0,
    );

    expect(existsSync(path.join(askDir, 'approved.txt'))).toBe(true);
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

  const SCREENSHOT_BASE64 = Buffer.from('png bytes').toString('base64');

  it('saves attachments outside any workspace and lets a question read them', async () => {
    const repo = await addRepo();
    const attachments = path.join(home, 'user-data', 'attachments');

    const saved = await korev.api.saveAttachment(
      null,
      'my shot.png',
      SCREENSHOT_BASE64,
    );
    await askAndWait([repo.id], 'What is in this screenshot?');

    expect(saved.ok && path.dirname(saved.value)).toBe(attachments);
    expect(saved.ok && (await readFile(saved.value, 'utf8'))).toBe('png bytes');
    expect(
      await readFile(
        path.join(
          home,
          'korev',
          'workspaces',
          'acme',
          '.ask',
          '.context',
          'claude-args',
        ),
        'utf8',
      ),
    ).toContain(`--add-dir ${attachments}`);
  });

  it('lets a new workspace read attachments picked before it existed', async () => {
    const workspace = await createWorkspace(task('Fix the screenshot'));

    const saved = await korev.api.saveAttachment(
      workspace.id,
      'shot.png',
      SCREENSHOT_BASE64,
    );

    expect(saved.ok && path.dirname(saved.value)).toBe(
      path.join('.context', 'attachments'),
    );
    expect(
      await readFile(
        path.join(workspace.path, '.context', 'claude-args'),
        'utf8',
      ),
    ).toContain(`--add-dir ${path.join(home, 'user-data', 'attachments')}`);
  });

  it('reads an image the agent saved as a data URL', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await writeFile(
      path.join(workspace.path, 'shot.png'),
      Buffer.from(SCREENSHOT_BASE64, 'base64'),
    );
    await writeFile(path.join(workspace.path, 'notes.txt'), 'hello');

    expect(await korev.api.readImage(session.id, 'shot.png')).toBe(
      `data:image/png;base64,${SCREENSHOT_BASE64}`,
    );
    expect(await korev.api.readImage(session.id, 'notes.txt')).toBeNull();
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
    for (const workspace of started.value) {
      await waitFor(
        async () => (await userMessages(workspace.sessions[0].id)).length === 2,
      );
    }
    const [front, back] = await waitForLinkedTurns(started.value);
    expect(back.groupId).toBe(front.groupId);
    const [question, firstPrompt] = await userMessages(back.sessions[0].id);
    expect(question).toBe('Plan the change');
    expect(firstPrompt).toContain('<plan>\nI added agent-note.txt.\n</plan>');
    expect(
      await readFile(path.join(back.path, '.context', 'claude-args'), 'utf8'),
    ).not.toContain('--resume');
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

  it('reads files outside the workspace but only writes inside it', async () => {
    const workspace = await createWorkspace();
    await mkdir(path.join(home, '.claude', 'plans'), { recursive: true });
    const plan = path.join(home, '.claude', 'plans', 'crab.md');
    await writeFile(plan, '# Plan\n');

    expect(
      await korev.api.readFile(workspace.id, '~/.claude/plans/crab.md'),
    ).toBe('# Plan\n');
    expect(await korev.api.readFile(workspace.id, plan)).toBe('# Plan\n');
    expect((await korev.api.writeFile(workspace.id, plan, 'x')).ok).toBe(false);
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

  it('copies the gitignored files listed in the repository settings', async () => {
    await mkdir(path.join(repoPath, 'config'));
    await writeFile(path.join(repoPath, 'config', 'app.local.json'), '{}');
    await writeFile(
      path.join(repoPath, '.gitignore'),
      '.env\nconfig/*.local.json\n',
    );
    await korev.api.updateRepo((await addRepo()).id, {
      fileIncludeGlobs: 'config/*.local.json',
    });

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

  it('still takes approvals after a background task ends the first result', async () => {
    await korev.api.updateSettings({ toolApprovals: true });
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await korev.api.send(session.id, {
      text: 'background-approval',
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

    await korev.api.respondPermission(session.id, permissionId, {
      allow: true,
    });
    await waitFor(
      async () => (await korev.api.getState()).runningSessions.length === 0,
    );

    expect(existsSync(path.join(workspace.path, 'approved.txt'))).toBe(true);
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

  it('splits the approved plan into a linked workspace for each lane', async () => {
    const origin = await createWorkspace();
    const [session] = origin.sessions;
    await korev.api.send(session.id, {
      ...task('make-plan for the settings page'),
      planMode: true,
    });
    let permissionId = '';
    await waitFor(async () => {
      const pending = (await korev.api.transcript(session.id)).find(
        (item) => item.kind === 'permission',
      );
      permissionId = pending?.id ?? '';
      return Boolean(pending);
    });

    await korev.api.respondPermission(session.id, permissionId, {
      allow: true,
      lanes: [
        { name: 'Settings API', body: 'Add the endpoint.' },
        { name: 'ui', body: 'Build the page.' },
      ],
    });

    const created = (await korev.api.getState()).workspaces;
    for (const lane of created.filter((ws) => ws.id !== origin.id)) {
      await waitFor(
        async () => (await userMessages(lane.sessions[0].id)).length === 2,
      );
    }
    const { workspaces } = await korev.api.getState();
    const [api, ui] = workspaces.filter((ws) => ws.id !== origin.id);
    const groupId = workspaces.find((ws) => ws.id === origin.id)!.groupId;
    expect(groupId).not.toBeNull();
    expect([api.groupId, ui.groupId]).toEqual([groupId, groupId]);
    expect([api.branch, ui.branch]).toEqual(['dev/settings-api', 'dev/ui']);
    expect([api.repoId, api.baseBranch]).toEqual([origin.repoId, 'main']);
    const apiPrompt = (await userMessages(api.sessions[0].id)).at(-1);
    expect(apiPrompt).toContain('Implement the Settings API lane');
    expect(apiPrompt).toContain('<plan>\n1. Add the login page\n</plan>');
    expect(
      await readFile(path.join(origin.path, '.context', 'plan-answer'), 'utf8'),
    ).toContain('Do not build them here: Settings API, ui');
  });

  it('approves a Codex plan and splits off its lanes', async () => {
    const origin = await createWorkspace();
    const [session] = origin.sessions;
    const codex = {
      ...task('make-plan for the settings page'),
      agent: 'codex' as const,
      model: 'gpt-6.1-sol',
      planMode: true,
    };
    await korev.api.updateSession(session.id, codex);
    await korev.api.send(session.id, codex);
    await waitFor(
      async () => (await korev.api.getState()).runningSessions.length === 0,
    );

    const approved = await korev.api.approvePlan(session.id, [
      { name: 'ui', body: 'Build the page.' },
    ]);

    expect(approved).toEqual({ ok: true, value: undefined });
    await waitFor(async () => (await userMessages(session.id)).length === 2);
    await waitForTurn(session.id);
    const { workspaces } = await korev.api.getState();
    const lane = workspaces.find((ws) => ws.id !== origin.id)!;
    const updated = workspaces.find((ws) => ws.id === origin.id)!;
    expect(lane.branch).toBe('dev/ui');
    expect(lane.groupId).toBe(updated.groupId);
    expect(updated.sessions[0].planMode).toBe(false);
    const prompt = await readFile(
      path.join(origin.path, '.context', 'codex-prompt'),
      'utf8',
    );
    expect(prompt).toContain('Implement the plan.');
    expect(prompt).toContain('Do not build them here: ui.');
  });

  it('hands a Claude plan off to a new tab that implements it', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await korev.api.send(session.id, {
      ...task('make-plan for the login page'),
      planMode: true,
    });
    await waitFor(async () =>
      (await korev.api.transcript(session.id)).some(
        (item) => item.kind === 'permission',
      ),
    );

    const handoff = await korev.api.handoffPlan(session.id);

    if (!handoff.ok) throw new Error(handoff.message);
    const { workspace: after } = await workspaceState(workspace.id);
    expect(after.sessions.map((entry) => entry.id)).toEqual([
      session.id,
      handoff.value,
    ]);
    expect(after.sessions[1]).toMatchObject({
      planMode: false,
      pendingPlan: { plan: '1. Add the login page', from: session.title },
    });
    expect(await userMessages(handoff.value)).toEqual([]);
    const card = (await korev.api.transcript(session.id)).find(
      (item) => item.kind === 'permission',
    );
    expect(card).toMatchObject({ status: 'handed-off' });
    const answerFile = path.join(workspace.path, '.context', 'plan-answer');
    await waitFor(async () => existsSync(answerFile));
    expect(await readFile(answerFile, 'utf8')).toContain('"behavior":"deny"');
  });

  it('hands a finished Codex plan off to a new tab', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    const codex = {
      ...task('make-plan for the settings page'),
      agent: 'codex' as const,
      model: 'gpt-6.1-sol',
      planMode: true,
    };
    await korev.api.updateSession(session.id, codex);
    await korev.api.send(session.id, codex);
    await waitFor(
      async () => (await korev.api.getState()).runningSessions.length === 0,
    );

    const handoff = await korev.api.handoffPlan(session.id);

    if (!handoff.ok) throw new Error(handoff.message);
    const { workspace: after } = await workspaceState(workspace.id);
    expect(after.sessions[0].planMode).toBe(false);
    expect(after.sessions[1]).toMatchObject({
      id: handoff.value,
      agent: 'codex',
      model: 'gpt-6.1-sol',
    });
    expect(after.sessions[1].pendingPlan?.plan).toContain('# Settings');
  });

  it('sends a handed-off plan with the first message of the new tab', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await korev.api.send(session.id, {
      ...task('make-plan for the login page'),
      planMode: true,
    });
    await waitFor(async () =>
      (await korev.api.transcript(session.id)).some(
        (item) => item.kind === 'permission',
      ),
    );
    const handoff = await korev.api.handoffPlan(session.id);
    if (!handoff.ok) throw new Error(handoff.message);

    await korev.api.send(handoff.value, task(''));

    expect((await userMessages(handoff.value))[0]).toBe(
      `Implement the plan below.\n\n<plan from="${session.title}">\n1. Add the login page\n</plan>`,
    );
    const { workspace: after } = await workspaceState(workspace.id);
    expect(after.sessions[1].pendingPlan).toBeUndefined();
  });

  it('offers skills as slash commands', async () => {
    const workspace = await createWorkspace();
    const skillDir = path.join(home, '.claude', 'skills', 'browse');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '# browse\n');

    expect(await korev.api.slashCommands(workspace.id)).toContain('browse');
  });

  it('offers skills as slash commands for a repo without a workspace', async () => {
    const repo = await addRepo();
    const skillDir = path.join(home, '.claude', 'skills', 'pr-review');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '# pr-review\n');

    expect(await korev.api.repoSlashCommands(repo.id)).toContain('pr-review');
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
      ['acme', { setup: '', run: [], archive: '', runMode: 'concurrent' }],
      [
        'widgets',
        {
          setup: 'npm ci',
          run: [{ name: 'run', command: 'npm start' }],
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

  async function addRepos(...names: string[]) {
    const repos = [await addRepo()];
    for (const name of names) {
      chosenDirectory = await initRepo(name);
      repos.push(await addRepo());
    }
    return repos;
  }

  async function sidebarLayout() {
    const { repos, folders, rootOrder } = await korev.api.getState();
    const names = new Map(
      [...repos, ...folders].map((item) => [item.id, item.name]),
    );
    return {
      root: rootOrder.map((id) => names.get(id)),
      folders: folders.map((folder) => folder.name),
      repos: repos.map((repo) => [
        repo.name,
        folders.find((folder) => folder.id === repo.folderId)?.name ?? null,
      ]),
    };
  }

  it('moves a repository into a folder, before another repository', async () => {
    const [acme, , web] = await addRepos('api', 'web');
    const work = await korev.api.createFolder(' Work ');

    await korev.api.moveRepo(acme.id, {
      folderId: work.id,
      beforeId: null,
    });
    await korev.api.moveRepo(web.id, {
      folderId: work.id,
      beforeId: acme.id,
    });

    expect(await sidebarLayout()).toEqual({
      root: ['api', 'Work'],
      folders: ['Work'],
      repos: [
        ['api', null],
        ['web', 'Work'],
        ['acme', 'Work'],
      ],
    });
  });

  it('reorders, renames and deletes folders without removing their repositories', async () => {
    const [acme, api] = await addRepos('api');
    const work = await korev.api.createFolder('Work');
    const personal = await korev.api.createFolder('Personal');
    await korev.api.moveRepo(acme.id, {
      folderId: work.id,
      beforeId: null,
    });
    await korev.api.moveRepo(api.id, {
      folderId: personal.id,
      beforeId: null,
    });

    await korev.api.moveFolder(personal.id, work.id);
    await korev.api.renameFolder(personal.id, 'Side projects');
    expect((await sidebarLayout()).root).toEqual(['Side projects', 'Work']);
    await korev.api.deleteFolder(work.id);

    expect(await sidebarLayout()).toEqual({
      root: ['Side projects', 'acme'],
      folders: ['Side projects'],
      repos: [
        ['acme', null],
        ['api', 'Side projects'],
      ],
    });
  });

  it('orders folders and repositories without a folder together at the root', async () => {
    const [acme, api] = await addRepos('api', 'web');
    const work = await korev.api.createFolder('Work');
    expect((await sidebarLayout()).root).toEqual([
      'acme',
      'api',
      'web',
      'Work',
    ]);

    await korev.api.moveFolder(work.id, acme.id);
    await korev.api.moveRepo(api.id, { folderId: null, beforeId: work.id });
    await korev.api.moveRepo(acme.id, { folderId: null, beforeId: null });

    expect((await sidebarLayout()).root).toEqual([
      'api',
      'Work',
      'web',
      'acme',
    ]);
  });

  it('keeps folders and repository order after a restart', async () => {
    const [acme, api] = await addRepos('api');
    const work = await korev.api.createFolder('Work');
    await korev.api.moveRepo(acme.id, {
      folderId: work.id,
      beforeId: null,
    });
    await korev.api.moveFolder(work.id, api.id);
    const before = await sidebarLayout();

    await korev.shutdown();
    korev = await openKorev();

    expect(await sidebarLayout()).toEqual(before);
  });
});
