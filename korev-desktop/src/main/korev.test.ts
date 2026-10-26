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
import { SIGNING_NUDGE } from './commit-signing';
import type { Notice } from './context';
import { nodeFileSystem } from './file-system';
import {
  DEFAULT_EFFORT,
  type AppState,
  type SendOptions,
  type Workspace,
  type WorkspaceSource,
} from '../shared/model';
import { AUTOMATION_TICK_MS } from './automations';
import { createKorev, PR_POLL_MS, type Korev } from './korev';
import type { RemoteSettings } from './remote-access';
import type { Release } from './updates';

const APP_VERSION = '1.2.0';
const INSTALLED_RELEASE: Release = {
  version: APP_VERSION,
  notes: '- Faster startup',
  url: 'https://github.com/thiagosalvatore/korev/releases/tag/v1.2.0',
};

const FAKE_AGENT_BIN = path.resolve(__dirname, '../../test-support/bin');
const KOREV_CLI_DIR = path.resolve(__dirname, '../../cli');
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
let gitAddGate: Promise<void> | null = null;
let agentVersionGate: Promise<void> | null = null;
let agentVersionsWaiting = 0;
let prViewGate: Promise<void> | null = null;
let prViewsWaiting = 0;
let prDiff = '';
let prsByNumber: Record<string, Record<string, unknown>> = {};
let diffsByNumber: Record<string, string> = {};

const README_PATCH = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
 # acme
+Install it.
`;

const BRANCH_PR_URL = 'https://github.com/acme/web/pull/7';
const NO_PR = { exitCode: 1, stdout: '', stderr: 'no pull requests found' };

function fakePrView(ref: string) {
  const pr = ref.startsWith('https://')
    ? prsByUrl[ref]
    : (prsByNumber[ref] ?? openPr);
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
  if (file === 'gh' && args[0] === 'pr' && args[1] === 'view') {
    if (prViewGate) {
      prViewsWaiting++;
      await prViewGate;
    }
    return fakePrView(args[2]);
  }
  if (file === 'gh' && args[0] === 'pr' && args[1] === 'diff')
    return {
      exitCode: 0,
      stdout: diffsByNumber[args[2]] ?? prDiff,
      stderr: '',
    };
  if (file === 'gh' && args[0] === 'pr' && args.includes('--head')) {
    const head = args[args.indexOf('--head') + 1];
    const found = Object.values(prsByNumber).filter(
      (pr) => pr.headRefName === head,
    );
    return { exitCode: 0, stdout: JSON.stringify(found), stderr: '' };
  }
  if (file === 'gh' && args[0] === 'api' && args[1] === 'graphql')
    return fakePrStack(args);
  if (file === 'gh' && isGhMerge(args)) {
    ghMerges.push([...args]);
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  if (file === 'git' && args[0] === 'add' && gitAddGate) await gitAddGate;
  if (args[0] === '--version' && agentVersionGate) {
    agentVersionsWaiting++;
    await agentVersionGate;
  }
  return runProcess(file, args, options);
};

const noPty = (_file: string, args: string[], options: { cwd: string }) => {
  spawned.push({ args, cwd: options.cwd });
  return fakePty();
};

const ptyExits: ((event: { exitCode: number }) => void)[] = [];

const fakePty = () => ({
  onData: () => undefined,
  onExit: (listener: (event: { exitCode: number }) => void) => {
    ptyExits.push(listener);
  },
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
  let notify: Mock<(notice: Notice) => void>;
  let windowFocused: boolean;
  let keepAwake: Mock<(on: boolean) => void>;
  let showFileMenu: Mock<(file: string) => void>;
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
      signer: path.join(home, 'korev-sign'),
      cliDir: KOREV_CLI_DIR,
      fs: nodeFileSystem,
      spawnPty: noPty,
      emit,
      notify,
      playSound,
      isWindowFocused: () => windowFocused,
      setBadge: () => undefined,
      keepAwake,
      now: () => new Date(),
      newId: () => randomUUID(),
      chooseDirectory: async () => chosenDirectory,
      openPath: async () => undefined,
      showFileMenu,
      openExternal: async () => undefined,
      applyTheme: () => undefined,
      remote: {
        status: () => ({
          address: null,
          devices: [],
          loginUrl: null,
          error: null,
        }),
        pairing: async () => null,
        apply: applyRemote,
        revoke: async () => undefined,
        registerPushToken: async () => undefined,
        unregisterPushToken: async () => undefined,
      },
      dictation: {
        status: () => ({ status: 'missing' }),
        prepare: () => undefined,
        transcribe: async () => '',
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
    notify = vi.fn();
    windowFocused = true;
    keepAwake = vi.fn();
    showFileMenu = vi.fn();
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
    gitAddGate = null;
    agentVersionGate = null;
    agentVersionsWaiting = 0;
    prViewGate = null;
    prViewsWaiting = 0;
    prDiff = '';
    prsByNumber = {};
    diffsByNumber = {};
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

  it('waits for a running PR check before it shuts down', async () => {
    await korev.shutdown();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    korev = await openKorev();
    await createWorkspace();
    let releasePrView!: () => void;
    prViewGate = new Promise((resolve) => (releasePrView = resolve));

    vi.advanceTimersByTime(PR_POLL_MS);
    await waitFor(async () => prViewsWaiting > 0);
    const shutdown = korev.shutdown().then(() => 'shut down');
    const stillWaiting = new Promise((resolve) =>
      setTimeout(() => resolve('waiting'), 100),
    );

    expect(await Promise.race([shutdown, stillWaiting])).toBe('waiting');
    releasePrView();
    await shutdown;
    korev = await openKorev();
  });

  it('waits for agent detection before it shuts down', async () => {
    await korev.shutdown();
    let releaseAgentVersion!: () => void;
    agentVersionGate = new Promise(
      (resolve) => (releaseAgentVersion = resolve),
    );
    korev = await openKorev();

    await waitFor(async () => agentVersionsWaiting > 0);
    const shutdown = korev.shutdown().then(() => 'shut down');
    const stillWaiting = new Promise((resolve) =>
      setTimeout(() => resolve('waiting'), 100),
    );

    expect(await Promise.race([shutdown, stillWaiting])).toBe('waiting');
    releaseAgentVersion();
    await shutdown;
    korev = await openKorev();
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

  it('renames a workspace without moving its worktree', async () => {
    const workspace = await createWorkspace();

    await korev.api.renameWorkspace(workspace.id, '  Billing spike  ');

    const renamed = (await workspaceState(workspace.id)).workspace;
    expect(renamed.label).toBe('Billing spike');
    expect([renamed.name, renamed.path]).toEqual([
      workspace.name,
      workspace.path,
    ]);
  });

  it('goes back to the worktree name when the new name is blank', async () => {
    const workspace = await createWorkspace();
    await korev.api.renameWorkspace(workspace.id, 'Billing spike');

    await korev.api.renameWorkspace(workspace.id, ' ');

    expect((await workspaceState(workspace.id)).workspace.label).toBeNull();
  });

  it('keeps a workspace set to keep after merge when its PR merges', async () => {
    await korev.api.updateSettings({ archiveOnMerge: true });
    const workspace = await createWorkspace();
    await korev.api.setKeepAfterMerge(workspace.id, true);
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
    expect((await workspaceState(workspace.id)).runtime.status).toBe('idle');
  });

  it('shows the workspace as archiving until its worktree is gone', async () => {
    const workspace = await createWorkspace();
    const emitted: { status: string; worktreeExists: boolean }[] = [];
    emit.mockImplementation((event, payload) => {
      if (event !== 'state') return;
      emitted.push({
        status: (payload as AppState).runtime[workspace.id].status,
        worktreeExists: existsSync(workspace.path),
      });
    });

    await korev.api.archiveWorkspace(workspace.id);

    expect(emitted[0]).toEqual({ status: 'archiving', worktreeExists: true });
    expect(emitted.at(-1)).toEqual({ status: 'idle', worktreeExists: false });
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

  it('lets a workspace agent run korev only while its turn lasts', async () => {
    const workspace = await createWorkspace();

    await sendAndWait(workspace.sessions[0].id, 'ask-korev-for-help');

    const contextDir = path.join(workspace.path, '.context');
    expect(await readFile(path.join(contextDir, 'korev-help'), 'utf8')).toMatch(
      'korev worker start',
    );
    const agentUrl = await readFile(path.join(contextDir, 'agent-url'), 'utf8');
    const afterTurn = await fetch(agentUrl.trim(), { method: 'POST' });
    expect(afterTurn.status).toBe(401);
  });

  async function contextFileOnceWritten(workspace: Workspace, name: string) {
    const file = path.join(workspace.path, '.context', name);
    await waitFor(async () => existsSync(file));
    await waitFor(
      async () => (await korev.api.getState()).runningSessions.length === 0,
    );
    return readFile(file, 'utf8');
  }

  it('starts a worker for a ready task and wakes the coordinator with its report', async () => {
    const coordinator = await createWorkspace(task('orchestrate-demo'));

    const woken = await contextFileOnceWritten(
      coordinator,
      'coordinator-woken',
    );

    expect(woken).toContain('notes written');
    expect(woken).toContain('Now ready: t2');
    expect(
      await readFile(
        path.join(coordinator.path, '.context', 't2-start'),
        'utf8',
      ),
    ).toContain('t2 waits for t1');
    const state = await korev.api.getState();
    const [run] = state.runs;
    expect(run.tasks.map((entry) => entry.status)).toEqual([
      'completed',
      'pending',
    ]);
    const worker = state.workspaces.find(
      (ws) => ws.id === run.tasks[0].workspaceId,
    );
    expect(worker?.groupId).toBe(
      state.workspaces.find((ws) => ws.id === coordinator.id)?.groupId,
    );
    expect(worker?.groupId).not.toBeNull();
  });

  it('tells the coordinator when a worker ends its turn without reporting', async () => {
    const coordinator = await createWorkspace(task('orchestrate-quiet'));

    const idle = await contextFileOnceWritten(coordinator, 'coordinator-idle');

    expect(idle).toContain('without running korev done');
    expect(idle).toContain('I added agent-note.txt.');
    const [run] = (await korev.api.getState()).runs;
    expect(run.tasks[0].status).toBe('dispatched');
  });

  it('shows the user message before the checkpoint is taken', async () => {
    const workspace = await createWorkspace();
    let releaseGitAdd!: () => void;
    gitAddGate = new Promise((resolve) => (releaseGitAdd = resolve));
    const userMessageShown = () =>
      emit.mock.calls.some(
        ([event, payload]) =>
          event === 'chat' &&
          (payload as { item: { kind: string } }).item.kind === 'user',
      );

    const sent = sendAndWait(workspace.sessions[0].id, 'Add a note');
    await waitFor(async () => userMessageShown());
    releaseGitAdd();
    await sent;
  });

  it('plays a sound when a turn finishes in a workspace you are not looking at', async () => {
    const workspace = await createWorkspace();

    await sendAndWait(workspace.sessions[0].id, 'Add a note');

    expect(playSound).toHaveBeenCalledOnce();
  });

  it('notifies that the agent finished, naming the workspace, when Korev is not in focus', async () => {
    const workspace = await createWorkspace();
    windowFocused = false;

    await sendAndWait(workspace.sessions[0].id, 'Add a note');

    expect(notify).toHaveBeenCalledWith({
      title: 'Agent finished',
      body: workspace.name,
      workspaceId: workspace.id,
    });
  });

  it('keeps the Mac awake only while a turn is running', async () => {
    const workspace = await createWorkspace();

    await sendAndWait(workspace.sessions[0].id, 'Add a note');

    expect(keepAwake).toHaveBeenCalledWith(true);
    expect(keepAwake).toHaveBeenLastCalledWith(false);
  });

  it('stays quiet when a turn finishes in any workspace you are looking at', async () => {
    const workspace = await createWorkspace();
    await korev.api.focusWorkspaces(['other-workspace', workspace.id]);

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

  it('starts explanations on the explain model, not the review model', async () => {
    await korev.api.updateSettings({
      reviewModel: {
        agent: 'claude',
        model: 'claude-haiku-4-5',
        effort: 'low',
      },
      explainModel: {
        agent: 'claude',
        model: 'claude-sonnet-5-5',
        effort: 'medium',
      },
    });
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace.path, 'NOTES.md'), 'draft\n');

    const started = await korev.api.startExplainer({
      kind: 'workspace',
      workspaceId: workspace.id,
    });

    if (!started.ok) throw new Error(started.message);
    const state = await korev.api.getState();
    expect(
      state.workspaces[0].sessions.find(
        (entry) => entry.id === started.value.sessionId,
      ),
    ).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'medium' });
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

  it('finds a chat by a PR number in its history, also after a restart', async () => {
    const workspace = await createWorkspace();
    await sendAndWait(
      workspace.sessions[0].id,
      'Fix the build of https://github.com/acme/web/pull/292',
    );
    const found = [
      {
        sessionId: workspace.sessions[0].id,
        owner: { kind: 'workspace', id: workspace.id },
        title: expect.any(String),
        snippet: expect.stringContaining('acme/web/pull/292'),
      },
    ];

    expect(await korev.api.searchChats('#292')).toEqual(found);
    await korev.shutdown();
    korev = await openKorev();

    expect(await korev.api.searchChats('WEB/PULL/292')).toEqual(found);
    expect(await korev.api.searchChats('#29')).toEqual([]);
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

  it('creates a failed workspace again in place and sends its task on retry', async () => {
    const repo = await addRepo();
    const settings = (await korev.api.getState()).settings;
    const blocker = path.join(settings.workspacesRoot, 'acme', 'retry-me');
    await mkdir(path.join(blocker, 'x'), { recursive: true });
    const created = await korev.api.createWorkspaces(
      [repo.id],
      task('retry me'),
    );
    if (!created.ok) throw new Error(created.message);
    const id = created.value[0].id;
    expect((await waitUntilCreated(id)).runtime.status).toBe('failed');
    await rm(blocker, { recursive: true });

    expect(await korev.api.retryWorkspace(id)).toEqual({
      ok: true,
      value: undefined,
    });

    const { workspace, runtime } = await waitUntilCreated(id);
    expect(runtime.status).not.toBe('failed');
    expect(workspace.archivedAt).toBeNull();
    await waitForTurn(workspace.sessions[0].id);
    const [prompt] = (
      await korev.api.transcript(workspace.sessions[0].id)
    ).filter((item) => item.kind === 'user');
    expect(prompt.kind === 'user' && prompt.text).toBe('retry me');
  });

  it('keeps a workspace whose post-checkout hook fails, warns with the end of its output, runs setup and sends the task', async () => {
    const hook = path.join(repoPath, '.git', 'hooks', 'post-checkout');
    await writeFile(
      hook,
      '#!/bin/sh\nfor i in $(seq 200); do echo "installing $i"; done\necho "hook broke"\nexit 1\n',
      { mode: 0o755 },
    );
    const repo = await addRepo();
    await korev.api.updateRepoScripts(repo.id, {
      ...repo.scripts,
      setup: 'npm ci',
    });
    spawned.length = 0;

    const workspace = await createWorkspace(task('hooked'));

    const { runtime } = await workspaceState(workspace.id);
    expect(runtime.status).not.toBe('failed');
    expect(git(workspace.path, 'branch', '--show-current')).toBe(
      workspace.branch,
    );
    expect(existsSync(path.join(workspace.path, '.context'))).toBe(true);
    expect(spawned).toContainEqual({
      args: ['-lc', 'npm ci'],
      cwd: workspace.path,
    });
    const [prompt] = (
      await korev.api.transcript(workspace.sessions[0].id)
    ).filter((item) => item.kind === 'user');
    expect(prompt.kind === 'user' && prompt.text).toBe('hooked');
    const warning = emit.mock.calls.find(
      ([event, payload]) =>
        event === 'toast' &&
        (payload as { title: string }).title.includes('hook broke'),
    );
    expect(warning).toBeDefined();
    const { title } = warning![1] as { title: string };
    expect(title).not.toMatch(/installing 1\b/);
    expect(title.split('\n').length).toBeLessThanOrEqual(10);
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

  it('answers an Ask chat without a repository in an empty folder', async () => {
    const askDir = path.join(home, 'korev', 'workspaces', '.ask');
    await mkdir(path.join(askDir, '.context'), { recursive: true });

    const ask = await askAndWait([], 'What is a monad?');

    const args = await readFile(
      path.join(askDir, '.context', 'claude-args'),
      'utf8',
    );
    expect(args).toContain('--disallowedTools Edit Write NotebookEdit');
    expect(await korev.api.startFromAsk(ask.id)).toMatchObject({ ok: false });
  });

  it('keeps an Ask chat without a repository when a repository is removed', async () => {
    const repo = await addRepo();
    const ask = await korev.api.createAskChat([]);

    await korev.api.removeRepo(repo.id);

    expect(
      (await korev.api.getState()).askChats.map((entry) => entry.id),
    ).toEqual([ask.id]);
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

  async function explainerOf(sessionId: string) {
    const explainer = await korev.api.explainer(sessionId);
    if (!explainer) throw new Error('no explainer');
    return explainer;
  }

  async function waitForExplainer(sessionId: string, status: string) {
    await waitFor(
      async () => (await explainerOf(sessionId)).ref.status === status,
    );
    return explainerOf(sessionId);
  }

  it('explains the changes of a workspace and notices when they move on', async () => {
    const workspace = await createWorkspace();
    await writeFile(
      path.join(workspace.path, 'README.md'),
      '# acme\nInstall it.\n',
    );
    git(workspace.path, 'commit', '-qam', 'install steps');
    await writeFile(path.join(workspace.path, 'NOTES.md'), 'draft\n');

    const started = await korev.api.startExplainer({
      kind: 'workspace',
      workspaceId: workspace.id,
    });
    if (!started.ok) throw new Error(started.message);
    const ready = await waitForExplainer(started.value.sessionId, 'ready');

    expect(started.value.askChatId).toBeNull();
    expect(ready.content?.headline).toBe(
      'The README now says how to install the app.',
    );
    expect(ready.patch).toContain('+Install it.');
    expect(ready.patch).toContain('+++ b/NOTES.md');
    expect(ready.latestRevision).toBe(ready.ref.revision);

    await writeFile(
      path.join(workspace.path, 'README.md'),
      '# acme\nInstall it now.\n',
    );
    expect(
      (await explainerOf(started.value.sessionId)).latestRevision,
    ).not.toBe(ready.ref.revision);
    const updated = await korev.api.updateExplainer(started.value.sessionId);
    expect(updated.ok).toBe(true);
    const fresh = await waitForExplainer(started.value.sessionId, 'ready');
    expect(fresh.patch).toContain('+Install it now.');
    expect(fresh.latestRevision).toBe(fresh.ref.revision);
  });

  it('explains a pull request in an Ask chat and reopens it for the same commit', async () => {
    const repo = await addRepo();
    openPr = {
      number: 42,
      url: 'https://github.com/acme/web/pull/42',
      title: 'Add install steps',
      author: { login: 'octo' },
      headRefOid: 'abc123',
      body: 'Adds the steps.',
    };
    prDiff = README_PATCH;

    const started = await korev.api.startExplainer({
      kind: 'pr',
      repoId: repo.id,
      number: 42,
    });
    if (!started.ok) throw new Error(started.message);
    const ready = await waitForExplainer(started.value.sessionId, 'ready');
    const again = await korev.api.startExplainer({
      kind: 'pr',
      repoId: repo.id,
      number: 42,
    });

    const ask = (await korev.api.getState()).askChats.find(
      (entry) => entry.id === started.value.askChatId,
    );
    expect(ask?.session.title).toBe('#42 Add install steps');
    expect(ready.ref).toMatchObject({ author: 'octo', revision: 'abc123' });
    expect(again).toEqual(started);
  });

  it('explains a pull request together with the open ones it builds on', async () => {
    const repo = await addRepo();
    prsByNumber = {
      '41': {
        number: 41,
        url: 'https://github.com/acme/web/pull/41',
        title: 'Add the install section',
        headRefName: 'octo/install',
        baseRefName: 'main',
        headRefOid: 'aaa',
      },
      '42': {
        number: 42,
        url: 'https://github.com/acme/web/pull/42',
        title: 'Mention the CLI',
        headRefName: 'octo/install-cli',
        baseRefName: 'octo/install',
        headRefOid: 'bbb',
      },
    };
    diffsByNumber = {
      '41': README_PATCH,
      '42': README_PATCH.replace('+Install it.', '+Put the CLI on your PATH.'),
    };

    const started = await korev.api.startExplainer({
      kind: 'pr',
      repoId: repo.id,
      number: 42,
    });
    if (!started.ok) throw new Error(started.message);
    const ready = await waitForExplainer(started.value.sessionId, 'ready');
    const [prompt] = (
      await korev.api.transcript(started.value.sessionId)
    ).filter((item) => item.kind === 'user');

    expect(ready.ref.stack?.map((layer) => layer.number)).toEqual([41, 42]);
    expect(ready.ref.revision).toBe('aaa bbb');
    expect(ready.patch).toMatch(
      /### Pull request #41[\s\S]*### Pull request #42/,
    );
    expect(prompt.kind === 'user' && prompt.text).toContain(
      'top of a stack of 2 pull requests',
    );
  });

  it('asks once for a corrected block, then marks the explanation failed', async () => {
    const repo = await addRepo();
    openPr = { number: 9, title: 'broken-explainer', headRefOid: 'def456' };
    prDiff = README_PATCH;

    const started = await korev.api.startExplainer({
      kind: 'pr',
      repoId: repo.id,
      number: 9,
    });
    if (!started.ok) throw new Error(started.message);
    const failed = await waitForExplainer(started.value.sessionId, 'failed');

    const messages = (
      await korev.api.transcript(started.value.sessionId)
    ).filter((item) => item.kind === 'user');
    expect(messages).toHaveLength(2);
    expect(failed.ref.error).toContain('no ```korev-explainer block');
  });

  async function createAutomation(prompt: string) {
    const repo = await addRepo();
    return korev.api.createAutomation({
      name: 'Tickets',
      prompt,
      schedule: {
        kind: 'interval',
        minutes: 10,
        days: [0, 1, 2, 3, 4, 5, 6],
        window: null,
      },
      repoIds: [repo.id],
      enabled: true,
    });
  }

  async function automationRuns(automationId: string) {
    return (await korev.api.getState()).askChats.filter(
      (ask) => ask.automationRun?.automationId === automationId,
    );
  }

  async function runAutomationUntil(automationId: string, note: string) {
    const started = await korev.api.runAutomation(automationId);
    if (!started.ok) throw new Error(started.message);
    const run = async () =>
      (await korev.api.getState()).askChats.find(
        (ask) => ask.id === started.value,
      )!.automationRun!;
    await waitFor(async () =>
      (await run()).notes.some((entry) => entry.includes(note)),
    );
    return run();
  }

  it('opens a workspace for each new key a run asks for, only in its own repositories', async () => {
    const automation = await createAutomation('sweep-tickets');

    const first = await runAutomationUntil(automation.id, 'elsewhere');
    const second = await runAutomationUntil(automation.id, 'T-1');

    const { workspaces } = await korev.api.getState();
    expect(workspaces).toHaveLength(1);
    expect(first.workspaceIds).toEqual([workspaces[0].id]);
    expect(second.workspaceIds).toEqual([]);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: workspaces[0].id }),
    );
  });

  it('opens every workspace a run asks for, on the PR branch when it names an open PR', async () => {
    const elsewhere = path.join(home, 'elsewhere');
    git(repoPath, 'worktree', 'add', elsewhere, '-b', 'feature/login');
    prsByNumber = {
      '7': {
        number: 7,
        state: 'OPEN',
        url: BRANCH_PR_URL,
        headRefName: 'feature/login',
        baseRefName: 'main',
      },
      '8': {
        number: 8,
        state: 'MERGED',
        url: 'https://github.com/acme/web/pull/8',
      },
    };
    const automation = await createAutomation('sweep-prs');

    const run = await runAutomationUntil(automation.id, 'PR-8');

    const { workspace } = await waitUntilCreated(run.workspaceIds[0]);
    expect(run.workspaceIds).toHaveLength(6);
    expect(workspace).toMatchObject({
      branch: 'feature/login',
      path: realpathSync(elsewhere),
    });
    expect(run.notes).toEqual(['Skipped PR-8: pull request #8 is merged.']);
  });

  it('notes a run whose reply has no automation block', async () => {
    const automation = await createAutomation('say hello');

    const run = await runAutomationUntil(automation.id, 'korev-automation');

    expect(run.workspaceIds).toEqual([]);
  });

  it('does not start a run while the last one is still going', async () => {
    const automation = await createAutomation('hold-turn');
    const started = await korev.api.runAutomation(automation.id);
    if (!started.ok) throw new Error(started.message);

    const again = await korev.api.runAutomation(automation.id);

    expect(again.ok).toBe(false);
  });

  it('runs an automation on the timer once it is due', async () => {
    await korev.shutdown();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    korev = await openKorev();
    const automation = await createAutomation('say hello');

    vi.advanceTimersByTime(AUTOMATION_TICK_MS);
    await waitFor(
      async () =>
        (await automationRuns(automation.id))[0]?.automationRun?.notes
          .length === 1,
    );
    vi.advanceTimersByTime(AUTOMATION_TICK_MS);

    expect(await automationRuns(automation.id)).toHaveLength(1);
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

  it('gives agents the Korev signing key once commit signing is on', async () => {
    await korev.api.updateSettings({ signAgentCommits: true });
    const workspace = await createWorkspace();

    await sendAndWait(workspace.sessions[0].id, 'show-signing-key');

    expect(
      await readFile(
        path.join(workspace.path, '.context', 'signing-key'),
        'utf8',
      ),
    ).toBe(`${path.join(home, 'user-data', 'signing-key')}\n`);
  });

  it('suggests the Korev signing key once when an agent cannot sign', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;

    await sendAndWait(session.id, 'signing-fails');
    await sendAndWait(session.id, 'signing-fails');

    const nudges = (await korev.api.transcript(session.id)).filter(
      (item) => item.kind === 'notice' && item.text === SIGNING_NUDGE,
    );
    expect(nudges).toHaveLength(1);
  });

  it('nests a sub-agent tool call under its Task in the transcript', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;

    await sendAndWait(session.id, 'run-subagent');

    const tools = (await korev.api.transcript(session.id)).filter(
      (item) => item.kind === 'tool',
    );
    const task = tools.find((item) => item.name === 'Task');
    const child = tools.find((item) => item.name === 'Bash');
    expect(child).toMatchObject({ output: 'README.md' });
    expect(child?.parentToolId).toBe(task?.id);
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

  it('lists the artifacts agents saved in .context, without attachments', async () => {
    const workspace = await createWorkspace();
    const context = path.join(workspace.path, '.context');
    await mkdir(path.join(context, 'plans'), { recursive: true });
    await mkdir(path.join(context, 'attachments'), { recursive: true });
    await writeFile(path.join(context, 'plans', 'login.md'), '# Login');
    await writeFile(path.join(context, 'shot.png'), 'png');
    await writeFile(path.join(context, 'attachments', 'upload.txt'), 'in');
    await writeFile(path.join(context, '.DS_Store'), '');

    expect(await korev.api.listArtifacts(workspace.id)).toEqual([
      '.context/plans/login.md',
      '.context/shot.png',
    ]);
  });

  it('lists no artifacts when .context is missing', async () => {
    const workspace = await createWorkspace();
    await rm(path.join(workspace.path, '.context'), { recursive: true });

    expect(await korev.api.listArtifacts(workspace.id)).toEqual([]);
  });

  it('shows the file menu for a workspace file at its full path', async () => {
    const workspace = await createWorkspace();

    await korev.api.showFileMenu(workspace.id, '.context/plans/login.md');

    expect(showFileMenu).toHaveBeenCalledWith(
      path.join(workspace.path, '.context', 'plans', 'login.md'),
    );
  });

  it('reads an image from a workspace as a data URL', async () => {
    const workspace = await createWorkspace();
    await writeFile(
      path.join(workspace.path, '.context', 'shot.png'),
      Buffer.from(SCREENSHOT_BASE64, 'base64'),
    );

    expect(
      await korev.api.readWorkspaceImage(workspace.id, '.context/shot.png'),
    ).toBe(`data:image/png;base64,${SCREENSHOT_BASE64}`);
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

  async function createAcrossRepos(text: string) {
    const acme = await addRepo();
    chosenDirectory = await initRepo('api');
    const api = await addRepo();
    const created = await korev.api.createWorkspaces(
      [acme.id, api.id],
      task(text),
    );
    if (!created.ok) throw new Error(created.message);
    const [lead, member] = created.value;
    return { api, lead, member };
  }

  async function waitForPermission(sessionId: string) {
    let permissionId = '';
    await waitFor(async () => {
      const pending = (await korev.api.transcript(sessionId)).find(
        (item) => item.kind === 'permission',
      );
      permissionId = pending?.id ?? '';
      return Boolean(pending);
    });
    return permissionId;
  }

  it('starts only the lead agent, in plan mode, for a task across repositories', async () => {
    await korev.api.updateSettings({ autoRenameBranches: true });
    const { lead, member } = await createAcrossRepos('Add a note');
    const drafts = (await korev.api.getState()).runtime;
    expect([
      drafts[lead.id].pendingPrompt,
      drafts[member.id].pendingPrompt,
    ]).toEqual(['Add a note', null]);

    await waitUntilCreated(member.id);
    await waitUntilCreated(lead.id);
    await waitForTurn(lead.sessions[0].id);

    const front = (await workspaceState(lead.id)).workspace;
    const back = (await workspaceState(member.id)).workspace;
    expect(front.groupId).not.toBeNull();
    expect(back.groupId).toBe(front.groupId);
    expect([front.branch, back.branch]).toEqual([
      'dev/add-agent-note',
      'dev/add-agent-note',
    ]);
    expect(
      await readFile(path.join(front.path, '.context', 'claude-args'), 'utf8'),
    ).toContain(`--add-dir ${back.path}`);
    expect(front.sessions[0].planMode).toBe(true);
    expect(await userMessages(front.sessions[0].id)).toEqual([
      expect.stringContaining('Read all of them to explore and plan'),
    ]);
    expect(await userMessages(back.sessions[0].id)).toEqual([]);
    expect([front.awaitsLane, back.awaitsLane]).toEqual([false, true]);

    await sendAndWait(back.sessions[0].id, 'Start here');
    expect((await workspaceState(member.id)).workspace.awaitsLane).toBe(false);
  });

  it('sends a lane to the linked workspace of its repository', async () => {
    const { api, lead, member } = await createAcrossRepos('make-plan billing');
    await waitUntilCreated(member.id);
    const permissionId = await waitForPermission(lead.sessions[0].id);

    await korev.api.respondPermission(lead.sessions[0].id, permissionId, {
      allow: true,
      lanes: [{ name: 'Billing API', body: 'Add it.', repoId: api.id }],
    });

    await waitFor(
      async () => (await userMessages(member.sessions[0].id)).length === 2,
    );
    const { workspaces } = await korev.api.getState();
    expect(workspaces.map((ws) => ws.id)).toEqual([lead.id, member.id]);
    const lanePrompt = (await userMessages(member.sessions[0].id)).at(-1);
    expect(lanePrompt).toContain('Implement the Billing API lane');
    expect(lanePrompt).toContain('<plan>\n1. Add the login page\n</plan>');
    expect((await workspaceState(member.id)).workspace.awaitsLane).toBe(false);
  });

  it('sends a lane without a repository to the repository its name matches', async () => {
    const { lead, member } = await createAcrossRepos('make-plan billing');
    await waitUntilCreated(member.id);
    const permissionId = await waitForPermission(lead.sessions[0].id);

    await korev.api.respondPermission(lead.sessions[0].id, permissionId, {
      allow: true,
      lanes: [{ name: 'API', body: 'Add it.' }],
    });

    await waitFor(
      async () => (await userMessages(member.sessions[0].id)).length === 2,
    );
    const { workspaces } = await korev.api.getState();
    expect(workspaces.map((ws) => ws.id)).toEqual([lead.id, member.id]);
  });

  it('stops a linked workspace waiting when the approved plan has no lane for it', async () => {
    const { lead, member } = await createAcrossRepos('make-lanes billing');
    await waitUntilCreated(member.id);
    const permissionId = await waitForPermission(lead.sessions[0].id);

    await korev.api.respondPermission(lead.sessions[0].id, permissionId, {
      allow: true,
    });

    await waitFor(
      async () => !(await workspaceState(member.id)).workspace.awaitsLane,
    );
    expect(await userMessages(member.sessions[0].id)).toEqual([]);
  });

  it('keeps linked workspaces waiting when the approved plan has no Lanes section', async () => {
    const { lead, member } = await createAcrossRepos('make-plan billing');
    await waitUntilCreated(member.id);
    const permissionId = await waitForPermission(lead.sessions[0].id);

    await korev.api.respondPermission(lead.sessions[0].id, permissionId, {
      allow: true,
    });

    expect((await workspaceState(member.id)).workspace.awaitsLane).toBe(true);
  });

  it('starts a new workspace for a second lane in the same repository', async () => {
    const { api, lead, member } = await createAcrossRepos('make-plan billing');
    await waitUntilCreated(member.id);
    const permissionId = await waitForPermission(lead.sessions[0].id);

    await korev.api.respondPermission(lead.sessions[0].id, permissionId, {
      allow: true,
      lanes: [
        { name: 'Billing API', body: 'Add it.', repoId: api.id },
        { name: 'Billing jobs', body: 'Add them.', repoId: api.id },
      ],
    });

    const { workspaces } = await korev.api.getState();
    const added = workspaces.filter(
      (ws) => ws.id !== lead.id && ws.id !== member.id,
    );
    expect(added.map((ws) => [ws.repoId, ws.groupId])).toEqual([
      [api.id, lead.groupId],
    ]);
    await waitFor(
      async () => (await userMessages(member.sessions[0].id)).length === 2,
    );
    await waitFor(
      async () => (await userMessages(added[0].sessions[0].id)).length === 2,
    );
    expect((await userMessages(member.sessions[0].id)).at(-1)).toContain(
      'Implement the Billing API lane',
    );
    expect((await userMessages(added[0].sessions[0].id)).at(-1)).toContain(
      'Implement the Billing jobs lane',
    );
  });

  it('starts a new workspace for a lane whose linked workspace is archived', async () => {
    const { api, lead, member } = await createAcrossRepos('make-plan billing');
    await waitUntilCreated(member.id);
    const permissionId = await waitForPermission(lead.sessions[0].id);
    await korev.api.archiveWorkspace(member.id);

    await korev.api.respondPermission(lead.sessions[0].id, permissionId, {
      allow: true,
      lanes: [{ name: 'Billing API', body: 'Add it.', repoId: api.id }],
    });

    const { workspaces } = await korev.api.getState();
    const lane = workspaces.find(
      (ws) => ws.id !== lead.id && ws.id !== member.id,
    );
    expect(lane?.repoId).toBe(api.id);
    expect(lane?.groupId).toBe(lead.groupId);
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

  async function usePool(size: number) {
    const repo = await addRepo();
    await korev.api.updateRepo(repo.id, { worktreePoolSize: size });
    return repo;
  }

  function slot(index: number) {
    return path.join(
      home,
      'korev',
      'workspaces',
      'acme',
      '.pool',
      String(index),
    );
  }

  it('reuses a free pool worktree on a new branch from the latest base, keeping only gitignored files', async () => {
    await writeFile(path.join(repoPath, '.gitignore'), '.env\ncache/\n');
    git(repoPath, 'commit', '-q', '-am', 'ignore cache');
    await usePool(1);
    const first = await createWorkspace();
    expect(realpathSync(first.path)).toBe(realpathSync(slot(1)));
    await writeFile(path.join(first.path, 'README.md'), 'changed\n');
    await writeFile(path.join(first.path, 'draft.txt'), 'wip\n');
    await mkdir(path.join(first.path, 'cache'));
    await writeFile(path.join(first.path, 'cache', 'warm.txt'), 'warm\n');
    await writeFile(path.join(first.path, '.context', 'notes.md'), 'old\n');

    expect((await korev.api.archiveWorkspace(first.id)).ok).toBe(true);

    expect(existsSync(slot(1))).toBe(true);
    expect(git(slot(1), 'branch', '--show-current')).toBe('');
    expect(git(repoPath, 'branch', '--list', first.branch)).toContain(
      first.branch,
    );
    await writeFile(path.join(repoPath, 'NEW.md'), 'new\n');
    git(repoPath, 'add', 'NEW.md');
    git(repoPath, 'commit', '-q', '-m', 'new base');

    const second = await createWorkspace();

    expect(realpathSync(second.path)).toBe(realpathSync(slot(1)));
    expect(second.branch).toBe('dev/workspace-2');
    expect(git(second.path, 'branch', '--show-current')).toBe(second.branch);
    expect(git(second.path, 'rev-parse', 'HEAD')).toBe(
      git(repoPath, 'rev-parse', 'main'),
    );
    expect(git(second.path, 'status', '--porcelain')).toBe('');
    expect(existsSync(path.join(second.path, 'draft.txt'))).toBe(false);
    expect(
      await readFile(path.join(second.path, 'cache', 'warm.txt'), 'utf8'),
    ).toBe('warm\n');
    expect(existsSync(path.join(second.path, '.context'))).toBe(true);
    expect(existsSync(path.join(second.path, '.context', 'notes.md'))).toBe(
      false,
    );
  });

  it('deletes the branch of an archived pool workspace and keeps its worktree when set to', async () => {
    await usePool(1);
    await korev.api.updateSettings({ deleteBranchOnArchive: true });
    const workspace = await createWorkspace();

    await korev.api.archiveWorkspace(workspace.id);

    expect(existsSync(slot(1))).toBe(true);
    expect(git(repoPath, 'branch', '--list', workspace.branch)).toBe('');
  });

  it('leaves a pool worktree with uncommitted changes alone and adds a new one', async () => {
    await usePool(2);
    const first = await createWorkspace();
    await korev.api.archiveWorkspace(first.id);
    await writeFile(path.join(slot(1), 'leftover.txt'), 'mine\n');

    const second = await createWorkspace();

    expect(realpathSync(second.path)).toBe(realpathSync(slot(2)));
    expect(await readFile(path.join(slot(1), 'leftover.txt'), 'utf8')).toBe(
      'mine\n',
    );
  });

  it('grows the pool up to its size, then creates worktrees outside it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await usePool(2);

    const first = await createWorkspace();
    const second = await createWorkspace();
    const third = await createWorkspace();

    expect(realpathSync(first.path)).toBe(realpathSync(slot(1)));
    expect(realpathSync(second.path)).toBe(realpathSync(slot(2)));
    expect(third.path).toBe(
      path.join(home, 'korev', 'workspaces', 'acme', third.name),
    );
    expect(git(third.path, 'branch', '--show-current')).toBe(third.branch);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('full'));
    warn.mockRestore();
  });

  it('gives two workspaces created at once their own pool worktrees', async () => {
    const repo = await usePool(2);

    const created = await Promise.all([
      korev.api.createWorkspaces([repo.id], null),
      korev.api.createWorkspaces([repo.id], null),
    ]);

    const paths = await Promise.all(
      created.map(async (result) => {
        if (!result.ok) throw new Error(result.message);
        return (await waitUntilCreated(result.value[0].id)).workspace.path;
      }),
    );
    expect(paths.map((entry) => realpathSync(entry)).sort()).toEqual(
      [realpathSync(slot(1)), realpathSync(slot(2))].sort(),
    );
  });

  it('restores an archived pool workspace into a free pool worktree', async () => {
    await usePool(1);
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace.path, 'draft.txt'), 'wip\n');
    await korev.api.archiveWorkspace(workspace.id);

    expect((await korev.api.restoreWorkspace(workspace.id)).ok).toBe(true);

    const { workspace: restored } = await workspaceState(workspace.id);
    expect(realpathSync(restored.path)).toBe(realpathSync(slot(1)));
    expect(git(restored.path, 'branch', '--show-current')).toBe(
      workspace.branch,
    );
    expect(await readFile(path.join(restored.path, 'draft.txt'), 'utf8')).toBe(
      'wip\n',
    );
  });

  it('restores an archived pool workspace into a new pool worktree when its own is taken', async () => {
    await usePool(2);
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace.path, 'draft.txt'), 'wip\n');
    await korev.api.archiveWorkspace(workspace.id);
    const other = await createWorkspace();
    expect(realpathSync(other.path)).toBe(realpathSync(slot(1)));

    expect((await korev.api.restoreWorkspace(workspace.id)).ok).toBe(true);

    const { workspace: restored } = await workspaceState(workspace.id);
    expect(realpathSync(restored.path)).toBe(realpathSync(slot(2)));
    expect(git(restored.path, 'branch', '--show-current')).toBe(
      workspace.branch,
    );
    expect(await readFile(path.join(restored.path, 'draft.txt'), 'utf8')).toBe(
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
    ).toEqual({ kind: 'text', text: '# Plan\n' });
    expect(await korev.api.readFile(workspace.id, plan)).toEqual({
      kind: 'text',
      text: '# Plan\n',
    });
    expect((await korev.api.writeFile(workspace.id, plan, 'x')).ok).toBe(false);
  });

  it('tells missing files apart from files it cannot show as text', async () => {
    const workspace = await createWorkspace();
    const contextDir = path.join(workspace.path, '.context');
    await mkdir(contextDir, { recursive: true });
    await writeFile(path.join(contextDir, 'big.log'), 'x'.repeat(2_000_000));
    await writeFile(path.join(contextDir, 'doc.pdf'), Buffer.from([37, 0, 80]));

    const read = (file: string) => korev.api.readFile(workspace.id, file);

    expect(await read('.context/big.log')).toEqual({ kind: 'not-text' });
    expect(await read('.context/doc.pdf')).toEqual({ kind: 'not-text' });
    expect(await read('.context')).toEqual({ kind: 'not-text' });
    expect(await read('.context/gone.md')).toEqual({ kind: 'missing' });
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

  it('adopts the worktree that already has the branch checked out', async () => {
    const elsewhere = path.join(home, 'elsewhere');
    git(repoPath, 'worktree', 'add', elsewhere, '-b', 'feature/login');
    await writeFile(path.join(repoPath, '.gitignore'), '.env\n');
    await writeFile(path.join(repoPath, '.env'), 'FROM=main\n');
    await writeFile(path.join(elsewhere, '.env'), 'FROM=mine\n');
    await writeFile(path.join(elsewhere, 'draft.txt'), 'wip\n');

    const workspace = await createWorkspace(null, {
      kind: 'branch',
      branch: 'feature/login',
    });

    const { runtime } = await workspaceState(workspace.id);
    expect(runtime.status).toBe('idle');
    expect(workspace.path).toBe(realpathSync(elsewhere));
    expect(await readFile(path.join(elsewhere, 'draft.txt'), 'utf8')).toBe(
      'wip\n',
    );
    expect(await readFile(path.join(elsewhere, '.env'), 'utf8')).toBe(
      'FROM=mine\n',
    );
  });

  it('adopts the worktree that already has the PR branch checked out', async () => {
    const elsewhere = path.join(home, 'elsewhere');
    git(repoPath, 'worktree', 'add', elsewhere, '-b', 'feature/login');

    const workspace = await createWorkspace(null, {
      kind: 'pr',
      number: 7,
      branch: 'feature/login',
      baseBranch: 'main',
    });

    const { runtime } = await workspaceState(workspace.id);
    expect(runtime.status).toBe('idle');
    expect(workspace).toMatchObject({
      path: realpathSync(elsewhere),
      branch: 'feature/login',
    });
  });

  it('does not adopt the main checkout', async () => {
    const workspace = await createWorkspace(null, {
      kind: 'branch',
      branch: git(repoPath, 'branch', '--show-current'),
    });

    const { runtime } = await workspaceState(workspace.id);
    expect(runtime.status).toBe('failed');
    expect(workspace.path).not.toBe(repoPath);
  });

  it('creates a workspace in a repo with no commits and pushes its first commit', async () => {
    const origin = path.join(home, 'empty-origin.git');
    const empty = path.join(home, 'empty');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
    execFileSync('git', ['init', '-q', '-b', 'main', empty]);
    git(empty, 'config', 'user.email', 'dev@example.com');
    git(empty, 'config', 'user.name', 'Dev');
    git(empty, 'config', 'commit.gpgsign', 'false');
    git(empty, 'remote', 'add', 'origin', origin);
    chosenDirectory = empty;

    const workspace = await createWorkspace();

    const { runtime } = await workspaceState(workspace.id);
    expect(runtime.status).toBe('idle');
    expect(git(workspace.path, 'rev-parse', 'HEAD')).toBe(
      git(origin, 'rev-parse', 'main'),
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

  it('keeps the workspace working when its setup script finishes during a turn', async () => {
    const repo = await addRepo();
    await korev.api.updateRepoScripts(repo.id, {
      ...repo.scripts,
      setup: 'npm ci',
    });
    ptyExits.length = 0;
    const created = await korev.api.createWorkspaces([repo.id], {
      text: 'hold-turn',
      agent: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      planMode: false,
      fast: false,
    });
    if (!created.ok) throw new Error(created.message);
    const [workspace] = created.value;
    const [session] = workspace.sessions;
    await waitFor(async () =>
      (await korev.api.getState()).runningSessions.includes(session.id),
    );

    ptyExits[0]({ exitCode: 0 });

    await waitFor(
      async () =>
        (await workspaceState(workspace.id)).runtime.status !== 'setting-up',
    );
    expect((await workspaceState(workspace.id)).runtime.status).toBe('working');
    await korev.api.stop(session.id);
  });

  it('keeps the workspace working when its setup script fails during a turn', async () => {
    const repo = await addRepo();
    await korev.api.updateRepoScripts(repo.id, {
      ...repo.scripts,
      setup: 'npm ci',
    });
    ptyExits.length = 0;
    const created = await korev.api.createWorkspaces([repo.id], {
      text: 'hold-turn',
      agent: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      planMode: false,
      fast: false,
    });
    if (!created.ok) throw new Error(created.message);
    const [workspace] = created.value;
    const [session] = workspace.sessions;
    await waitFor(async () =>
      (await korev.api.getState()).runningSessions.includes(session.id),
    );

    ptyExits[0]({ exitCode: 1 });

    await waitFor(
      async () =>
        (await workspaceState(workspace.id)).runtime.status !== 'setting-up',
    );
    const { runtime } = await workspaceState(workspace.id);
    expect(runtime.status).toBe('working');
    expect(runtime.setupError).toBe('Setup script failed (exit 1)');
    await korev.api.stop(session.id);
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
    const waitingState = await korev.api.getState();
    expect(waitingState.runtime[workspace.id].status).toBe('waiting');
    expect(waitingState.waitingSessions).toEqual([session.id]);

    expect(
      await korev.api.respondPermission(session.id, permissionId, {
        allow: true,
      }),
    ).toEqual({ ok: true, value: undefined });
    expect((await korev.api.getState()).waitingSessions).toEqual([]);
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

  it('saves a Claude plan under a name taken from its heading', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await korev.api.send(session.id, {
      ...task('make-lanes billing'),
      planMode: true,
    });

    const saved = path.join(workspace.path, '.context', 'plans', 'billing.md');
    await waitFor(async () => existsSync(saved));
    expect(await readFile(saved, 'utf8')).toContain('### acme-web');
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

  it('sends a message typed while a plan waits as feedback on the plan', async () => {
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
    await mkdir(path.join(workspace.path, '.context'), { recursive: true });

    await korev.api.send(session.id, {
      ...task('Split step 2'),
      planMode: true,
    });

    const answer = path.join(workspace.path, '.context', 'plan-answer');
    await waitFor(async () => existsSync(answer));
    expect(await readFile(answer, 'utf8')).toContain('Split step 2');
    const items = await korev.api.transcript(session.id);
    expect(items.find((item) => item.kind === 'permission')).toMatchObject({
      status: 'denied',
    });
    expect(await userMessages(session.id)).toContain('Split step 2');
    const { workspace: after } = await workspaceState(workspace.id);
    expect(after.sessions[0].planMode).toBe(true);
  });

  it('answers a waiting question with the picks and the typed reply', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await korev.api.send(session.id, task('ask-two-questions'));
    await waitFor(async () =>
      (await korev.api.transcript(session.id)).some(
        (item) => item.kind === 'permission',
      ),
    );
    await mkdir(path.join(workspace.path, '.context'), { recursive: true });

    await korev.api.send(session.id, {
      ...task('Only smoke tests'),
      answers: { 'Which database?': ['Postgres'] },
    });

    const answer = path.join(workspace.path, '.context', 'question-answer');
    await waitFor(async () => existsSync(answer));
    const written = await readFile(answer, 'utf8');
    expect(written).toContain('"Which database?":"Postgres"');
    expect(written).toContain('"Which tests?":"Only smoke tests"');
    expect(await userMessages(session.id)).toContain('Only smoke tests');
  });

  it('answers a waiting question with the picks alone when the message is empty', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await korev.api.send(session.id, task('ask-two-questions'));
    await waitFor(async () =>
      (await korev.api.transcript(session.id)).some(
        (item) => item.kind === 'permission',
      ),
    );
    await mkdir(path.join(workspace.path, '.context'), { recursive: true });

    await korev.api.send(session.id, {
      ...task(''),
      answers: {
        'Which database?': ['SQLite'],
        'Which tests?': ['Unit', 'E2E'],
      },
    });

    const answer = path.join(workspace.path, '.context', 'question-answer');
    await waitFor(async () => existsSync(answer));
    const written = await readFile(answer, 'utf8');
    expect(written).toContain('"Which database?":"SQLite"');
    expect(written).toContain('"Which tests?":"Unit, E2E"');
    expect(await userMessages(session.id)).toEqual(['ask-two-questions']);
  });

  it('announces a waiting question and answers it with the option spoken back', async () => {
    const workspace = await createWorkspace();
    const [session] = workspace.sessions;
    await korev.api.send(session.id, task('ask-two-questions'));
    await waitFor(async () =>
      emit.mock.calls.some(([event]) => event === 'announce'),
    );
    await mkdir(path.join(workspace.path, '.context'), { recursive: true });

    await korev.api.runVoiceCommand('Korev, option two');

    expect(emit).toHaveBeenCalledWith('announce', {
      workspaceId: workspace.id,
      text: expect.stringContaining(
        'asks: Which database? Option 1, Postgres.',
      ),
    });
    const answer = path.join(workspace.path, '.context', 'question-answer');
    await waitFor(async () => existsSync(answer));
    expect(await readFile(answer, 'utf8')).toContain(
      '"Which database?":"SQLite"',
    );
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

    await korev.api.renameWorkspace(origin.id, 'Settings page');
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
    const folderId = workspaces.find((ws) => ws.id === origin.id)!.folderId;
    expect((await korev.api.getState()).workspaceFolders).toEqual([
      { id: folderId, repoId: origin.repoId, name: 'Settings page' },
    ]);
    expect([api.folderId, ui.folderId]).toEqual([folderId, folderId]);
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
    expect(
      await readFile(
        path.join(origin.path, '.context', 'plans', 'settings.md'),
        'utf8',
      ),
    ).toContain('### api');
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

  it('moves a workspace into a folder of its repository and out when the folder goes', async () => {
    const workspace = await createWorkspace();
    const folder = await korev.api.createWorkspaceFolder(
      workspace.repoId,
      ' Wave 1 ',
    );

    await korev.api.moveWorkspace(workspace.id, folder.id);
    await korev.api.renameWorkspaceFolder(folder.id, 'Wave 2');

    let state = await korev.api.getState();
    expect(state.workspaceFolders).toEqual([
      { id: folder.id, repoId: workspace.repoId, name: 'Wave 2' },
    ]);
    expect(state.workspaces[0].folderId).toBe(folder.id);

    await korev.api.deleteWorkspaceFolder(folder.id);

    state = await korev.api.getState();
    expect(state.workspaceFolders).toEqual([]);
    expect(state.workspaces[0].folderId).toBeNull();
  });

  it('keeps a workspace out of a folder of another repository', async () => {
    const workspace = await createWorkspace();
    const [, api] = await addRepos('api');
    const folder = await korev.api.createWorkspaceFolder(api.id, 'API');

    await expect(
      korev.api.moveWorkspace(workspace.id, folder.id),
    ).rejects.toThrow('A workspace can only go in a folder of its repository');
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
