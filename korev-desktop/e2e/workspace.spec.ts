import {
  _electron as electron,
  expect,
  test,
  type Page,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { KorevBridge } from '../src/shared/api';
import type { AppState } from '../src/shared/model';

const APP_ENTRY = '.vite/build/main.cjs';
const FAKE_AGENT_BIN = path.resolve('test-support/bin');
const SCREENSHOT_DIR = process.env.KOREV_SCREENSHOT_DIR;
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test.setTimeout(120_000);

function git(cwd: string, ...args: string[]) {
  execFileSync('git', args, { cwd });
}

async function createRepo(home: string, name = 'acme-web'): Promise<string> {
  const repo = path.join(home, name);
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  git(repo, 'config', 'user.email', 'dev@example.com');
  git(repo, 'config', 'user.name', 'Dev Person');
  git(repo, 'config', 'commit.gpgsign', 'false');
  await writeFile(path.join(repo, 'README.md'), '# acme\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

async function snap(window: Page, name: string) {
  if (SCREENSHOT_DIR)
    await window.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) });
}

async function runningAgents(window: Page): Promise<number> {
  const state = (await window.evaluate(() =>
    (globalThis as unknown as { korev: KorevBridge }).korev.call(
      'getState',
      [],
    ),
  )) as AppState;
  return state.runningSessions.length;
}

async function waitForAgentsToFinish(window: Page) {
  await expect.poll(() => runningAgents(window)).toBe(0);
}

async function pickRepositories(window: Page, names: string[]) {
  const first = window.getByRole('checkbox', { name: names[0] });
  if (!(await first.isVisible()))
    await window.getByRole('button', { name: 'Repositories' }).click();
  for (const name of names)
    await window.getByRole('checkbox', { name }).check();
}

function launchApp(home: string, env: NodeJS.ProcessEnv = {}) {
  return electron.launch({
    args: [
      APP_ENTRY,
      '--use-mock-keychain',
      `--user-data-dir=${path.join(home, 'user-data')}`,
    ],
    env: {
      ...process.env,
      HOME: home,
      SHELL: '/bin/sh',
      PATH: `${FAKE_AGENT_BIN}:${process.env.PATH}`,
      ...env,
    },
  });
}

async function launch(home: string, repo: string, env: NodeJS.ProcessEnv = {}) {
  const app = await launchApp(home, env);
  await app.evaluate(({ dialog }, repoPath) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [repoPath],
    })) as typeof dialog.showOpenDialog;
  }, repo);
  const window = await app.firstWindow();
  await window.setViewportSize({ width: 1440, height: 900 });
  return { app, window };
}

test('creates a workspace, runs an agent turn, shows the diff and archives it', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const { app, window } = await launch(home, repo);
  try {
    await expect(window.getByText('Run a team of coding agents')).toBeVisible();
    await snap(window, '01-welcome');
    await window.getByRole('button', { name: 'Open project' }).click();

    await expect(
      window.getByRole('heading', { name: 'New workspace' }),
    ).toBeVisible();
    await window.getByRole('textbox', { name: 'Message' }).fill('Add a note');
    await snap(window, '02-new-workspace');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');

    await expect(window.getByText('I added agent-note.txt.')).toBeVisible();
    const workspaces = window.getByRole('navigation', { name: 'Workspaces' });
    await expect(
      workspaces.getByText('dev-person/add-agent-note'),
    ).toBeVisible();
    await workspaces.getByText('dev-person/add-agent-note').hover();
    await workspaces.getByRole('button', { name: 'Workspace actions' }).click();
    await window.mouse.move(600, 600);
    await expect(
      window.getByRole('menuitem', { name: 'Archive' }),
    ).toBeVisible();
    await window.keyboard.press('Escape');
    const panel = window.getByRole('complementary', {
      name: 'Workspace panel',
    });
    await expect(panel.getByText('agent-note.txt')).toBeVisible();
    await snap(window, '03-chat');

    await panel.getByText('agent-note.txt').click();
    await expect(
      window.getByRole('main').getByText('written by the fake agent'),
    ).toBeVisible();
    await snap(window, '04-diff');

    await workspaces.getByRole('button', { name: 'Search' }).click();
    await window.getByRole('textbox', { name: 'Search' }).fill('Archive');
    await window.getByRole('textbox', { name: 'Search' }).press('Enter');
    await expect(
      window.getByRole('heading', { name: 'New workspace' }),
    ).toBeVisible();
    await expect(window.getByRole('region', { name: 'History' })).toBeVisible();
    await waitForAgentsToFinish(window);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('plans a task across two repositories once and hands each its lane', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const web = await createRepo(home);
  const api = await createRepo(home, 'acme-api');
  const { app, window } = await launch(home, web);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    await expect(
      window.getByRole('heading', { name: 'New workspace' }),
    ).toBeVisible();
    await app.evaluate(({ dialog }, repoPath) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [repoPath],
      })) as typeof dialog.showOpenDialog;
    }, api);
    await window.evaluate(() =>
      (globalThis as unknown as { korev: KorevBridge }).korev.call(
        'addRepo',
        [],
      ),
    );
    const sidebar = window.getByRole('navigation', { name: 'Workspaces' });
    await expect(
      sidebar.getByRole('region', { name: 'acme-api' }),
    ).toBeVisible();
    await pickRepositories(window, ['acme-web', 'acme-api']);
    await expect(
      window.getByRole('button', { name: 'Plan mode' }),
    ).toBeVisible();
    await window
      .getByRole('textbox', { name: 'Message' })
      .fill('make-lanes for billing');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');

    const group = sidebar.getByRole('group', { name: /^Linked workspace / });
    const member = group.getByRole('button', { name: /in acme-api$/ });
    await expect(member).toContainText('Waits for the plan in acme-web');
    await member.click();
    await expect(
      window.getByText(/starts when you approve the plan in acme-web/),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Open acme-web' }).click();
    await expect(
      window.getByRole('combobox', { name: 'Repository for acme-api' }),
    ).toBeVisible();
    await snap(window, '07-lanes-across-repositories');
    await window
      .getByRole('button', { name: 'Approve and split off 1 lane' })
      .click();

    await expect(member).not.toContainText('Waits for the plan');
    await member.click();
    await expect(
      window.getByRole('main').getByText('I added agent-note.txt.'),
    ).toBeVisible();
    await expect(
      sidebar.getByRole('button', { name: /^Workspace .+ in acme-/ }),
    ).toHaveCount(2);
    await waitForAgentsToFinish(window);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

async function appState(window: Page): Promise<AppState> {
  return (await window.evaluate(() =>
    (globalThis as unknown as { korev: KorevBridge }).korev.call(
      'getState',
      [],
    ),
  )) as AppState;
}

test('lets an agent start a worker and wakes it with the worker report', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    await window
      .getByRole('textbox', { name: 'Message' })
      .fill('orchestrate-demo');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');

    await expect(
      window.getByRole('main').getByText(/notes written/),
    ).toBeVisible();
    const [run] = (await appState(window)).runs;
    expect(run.tasks.map((task) => task.status)).toEqual([
      'completed',
      'pending',
    ]);
    const sidebar = window.getByRole('navigation', { name: 'Workspaces' });
    await expect(
      sidebar.getByRole('button', { name: 'Workspace notes' }),
    ).toBeVisible();
    await expect(
      window.getByRole('region', { name: 'Message from worker of t1' }),
    ).toBeVisible();
    await waitForAgentsToFinish(window);
    await sidebar.getByRole('button', { name: 'Runs' }).click();
    const runCard = window.getByRole('region', { name: 'Write notes' });
    await expect(runCard.getByText('Done')).toBeVisible();
    await expect(runCard.getByText('Ready')).toBeVisible();
    await snap(window, '08-orchestration-runs');
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('asks the user to decide in the coordinator chat and passes the choice on', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    await window.getByRole('textbox', { name: 'Message' }).fill('gate-demo');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');

    await expect(window.getByText('Drop the old table?')).toBeVisible();
    await waitForAgentsToFinish(window);
    await snap(window, '09-decision-gate');
    await window.getByRole('button', { name: 'no', exact: true }).click();

    await expect(
      window.getByRole('region', { name: 'Message from user' }),
    ).toContainText('The user chose: no');
    await waitForAgentsToFinish(window);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('asks a question about a repository without creating a workspace', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    const sidebar = window.getByRole('navigation', { name: 'Workspaces' });
    await sidebar.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(window.getByRole('heading', { name: 'Ask' })).toBeVisible();
    await window
      .getByRole('textbox', { name: 'Message' })
      .fill('Where is the README?');
    await snap(window, '05-ask');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');

    await expect(window.getByText('I added agent-note.txt.')).toBeVisible();
    await expect(
      sidebar.getByRole('button', { name: 'Ask Finding the README' }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole('button', { name: /^Workspace / }),
    ).toHaveCount(0);
    await snap(window, '06-ask-answer');

    const shared = path.join(home, 'chat.html');
    await app.evaluate(({ session }, savePath) => {
      session.defaultSession.once('will-download', (_event, item) =>
        item.setSavePath(savePath),
      );
    }, shared);
    await window.getByRole('button', { name: 'Share chat' }).click();
    await expect.poll(() => existsSync(shared)).toBe(true);
    await expect
      .poll(async () => readFile(shared, 'utf8'))
      .toContain('Where is the README?');

    await window.getByRole('button', { name: 'Start workspace' }).click();
    await expect(
      sidebar.getByRole('button', { name: /^Workspace / }),
    ).toHaveCount(1);
    const chat = window.getByRole('main');
    await expect(
      chat.getByText('Implement your part of the plan below.'),
    ).toBeVisible();
    await expect(chat.getByText('Where is the README?')).toBeVisible();
    await expect(chat.getByText('I added agent-note.txt.')).toHaveCount(2);
    await snap(window, '06b-ask-moved-to-workspace');
    await waitForAgentsToFinish(window);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('creates a workspace from an existing branch with the create-from picker', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  git(repo, 'branch', 'feature/login');
  const { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();

    await window.getByRole('button', { name: /Create from/ }).click();
    const picker = window.getByRole('dialog', { name: 'Create from' });
    await picker.getByRole('option', { name: 'feature/login' }).click();
    await snap(window, '07-create-from');
    await window
      .getByRole('button', { name: 'Create empty workspace' })
      .click();

    const workspaces = window.getByRole('navigation', { name: 'Workspaces' });
    await expect(workspaces.getByText('feature/login')).toBeVisible();
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('renames a workspace and keeps the name after a restart', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  let { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    await window.getByRole('textbox', { name: 'Message' }).fill('Add a note');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');
    await expect(window.getByText('I added agent-note.txt.')).toBeVisible();
    await waitForAgentsToFinish(window);
    const before = (await window.evaluate(() =>
      (globalThis as unknown as { korev: KorevBridge }).korev.call(
        'getState',
        [],
      ),
    )) as AppState;

    const sidebar = window.getByRole('navigation', { name: 'Workspaces' });
    await sidebar.getByText('dev-person/add-agent-note').hover();
    await sidebar.getByRole('button', { name: 'Workspace actions' }).click();
    await window.getByRole('menuitem', { name: 'Rename' }).click();
    const dialog = window.getByRole('dialog', { name: 'Rename workspace' });
    await dialog.getByLabel('Name').fill('Billing spike');
    await dialog.getByRole('button', { name: 'Rename' }).click();

    const row = sidebar.getByRole('button', {
      name: 'Workspace Billing spike',
    });
    await expect(row).toContainText('dev-person/add-agent-note');
    await expect(
      window.getByRole('banner').getByText('Billing spike'),
    ).toBeVisible();

    await app.close();
    ({ app, window } = await launch(home, repo));
    await expect(
      window
        .getByRole('navigation', { name: 'Workspaces' })
        .getByRole('button', { name: 'Workspace Billing spike' }),
    ).toBeVisible();
    const after = (await window.evaluate(() =>
      (globalThis as unknown as { korev: KorevBridge }).korev.call(
        'getState',
        [],
      ),
    )) as AppState;
    const [was, now] = [before.workspaces[0], after.workspaces[0]];
    expect([now.name, now.branch, now.path]).toEqual([
      was.name,
      was.branch,
      was.path,
    ]);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('asks before a tool call when approvals are on and continues after Allow', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const app = await launchApp(home);
  try {
    await app.evaluate(({ dialog }, repoPath) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [repoPath],
      })) as typeof dialog.showOpenDialog;
    }, repo);
    const window = await app.firstWindow();
    await window.setViewportSize({ width: 1440, height: 900 });
    await window.evaluate(() =>
      (globalThis as unknown as { korev: KorevBridge }).korev.call(
        'updateSettings',
        [{ toolApprovals: true }],
      ),
    );
    await window.getByRole('button', { name: 'Open project' }).click();
    await window
      .getByRole('textbox', { name: 'Message' })
      .fill('needs-approval');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');

    const card = window.getByRole('group', { name: 'Allow Bash?' });
    await expect(card.getByText('touch approved.txt')).toBeVisible();
    await snap(window, '06-approval');
    await card.getByRole('button', { name: 'Allow' }).click();

    await expect(window.getByText('· Approved')).toBeVisible();
    await expect(window.getByText('I added agent-note.txt.')).toBeVisible();
    await waitForAgentsToFinish(window);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('reviews a turn, searches the workspace and edits a file', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const app = await launchApp(home);
  try {
    await app.evaluate(({ dialog }, repoPath) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [repoPath],
      })) as typeof dialog.showOpenDialog;
    }, repo);
    const window = await app.firstWindow();
    await window.setViewportSize({ width: 1440, height: 900 });
    await window.getByRole('button', { name: 'Open project' }).click();
    await window.getByRole('textbox', { name: 'Message' }).fill('Add a note');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');

    await window.getByRole('button', { name: '1 file changed' }).click();
    await window
      .getByRole('main')
      .getByRole('button', { name: /^A\s*agent-note\.txt/ })
      .click();
    await expect(
      window.getByRole('tab', { name: /Turn changes/ }),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Split' }).click();
    await expect(
      window.getByRole('main').getByText('written by the fake agent'),
    ).toBeVisible();
    await snap(window, '07-turn-split');

    await window
      .getByRole('navigation', { name: 'Workspaces' })
      .getByRole('button', { name: 'Search' })
      .click();
    await window
      .getByRole('textbox', { name: 'Search' })
      .fill('Search in files');
    await window.getByRole('textbox', { name: 'Search' }).press('Enter');
    await window
      .getByRole('textbox', { name: 'Search in files' })
      .fill('fake agent');
    await window
      .getByRole('main')
      .getByRole('button', { name: /written by the fake agent/ })
      .click();

    await window.getByRole('button', { name: 'Edit' }).click();
    await window
      .getByRole('textbox', { name: 'File contents' })
      .fill('edited by hand\n');
    await window.getByRole('button', { name: 'Save' }).click();
    await expect(window.getByText('Saved agent-note.txt')).toBeVisible();
    await snap(window, '08-edited');
    await waitForAgentsToFinish(window);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('opens a file the agent mentions from outside the workspace', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  await mkdir(path.join(home, '.claude', 'plans'), { recursive: true });
  await writeFile(
    path.join(home, '.claude', 'plans', 'crab.md'),
    '# The plan\n\nShip it.\n',
  );
  const { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    await window.getByRole('textbox', { name: 'Message' }).fill('share-plan');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');

    await window.getByRole('link', { name: '~/.claude/plans/crab.md' }).click();

    await expect(
      window.getByRole('main').getByRole('heading', { name: 'The plan' }),
    ).toBeVisible();
    await expect(window.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await snap(window, '09-mentioned-file');
    await waitForAgentsToFinish(window);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('browses the artifacts in .context and drags one into the message', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    await window.getByRole('textbox', { name: 'Message' }).fill('Add a note');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');
    await expect(window.getByText('I added agent-note.txt.')).toBeVisible();
    await waitForAgentsToFinish(window);

    const state = (await window.evaluate(() =>
      (globalThis as unknown as { korev: KorevBridge }).korev.call(
        'getState',
        [],
      ),
    )) as AppState;
    const plans = path.join(state.workspaces[0].path, '.context', 'plans');
    await mkdir(plans, { recursive: true });
    await writeFile(
      path.join(plans, 'login-page.md'),
      '# Login page\n\nAdd it.\n',
    );

    const panel = window.getByRole('complementary', {
      name: 'Workspace panel',
    });
    await panel.getByRole('tab', { name: 'Artifacts' }).click();
    await panel.getByRole('button', { name: 'plans' }).click();
    const artifact = panel.getByRole('button', { name: 'login-page.md' });
    const message = window.getByRole('textbox', { name: 'Message' });
    await artifact.hover();
    await window.mouse.down();
    await message.hover();
    await message.hover({ position: { x: 20, y: 20 } });
    await window.mouse.up();
    await expect(message).toHaveValue('@.context/plans/login-page.md');
    await snap(window, '10-artifacts');

    await artifact.click();
    await expect(
      window.getByRole('main').getByRole('heading', { name: 'Login page' }),
    ).toBeVisible();

    await app.evaluate(({ Menu, shell }) => {
      const revealed: string[] = [];
      Object.assign(globalThis, { revealed });
      shell.showItemInFolder = (file) => void revealed.push(file);
      Menu.prototype.popup = function clickFirstItem(this: Electron.Menu) {
        this.items[0].click();
      };
    });
    await artifact.click({ button: 'right' });
    await expect
      .poll(() =>
        app.evaluate(
          () => (globalThis as unknown as { revealed: string[] }).revealed,
        ),
      )
      .toEqual([path.join(plans, 'login-page.md')]);

    await writeFile(
      path.join(plans, '..', 'shot.png'),
      Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    );
    await panel.getByRole('button', { name: 'shot.png' }).click();
    await expect(
      window.getByRole('main').getByRole('img', { name: 'shot.png' }),
    ).toBeVisible();
    await expect(panel.getByRole('tab', { name: /Changes\s*1/ })).toBeVisible();
    await snap(window, '11-image-artifact');
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('opens a terminal tab and an in-app browser tab', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const server = createServer((_request, response) =>
    response.end('<h1>hello from the dev server</h1>'),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const app = await launchApp(home);
  try {
    await app.evaluate(({ dialog }, repoPath) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [repoPath],
      })) as typeof dialog.showOpenDialog;
    }, repo);
    const window = await app.firstWindow();
    await window.setViewportSize({ width: 1440, height: 900 });
    await window.getByRole('button', { name: 'Open project' }).click();
    await window
      .getByRole('button', { name: 'Create empty workspace' })
      .click();

    await window.getByRole('button', { name: 'New tab' }).click();
    await expect(
      window.getByRole('menuitem', { name: 'New terminal' }),
    ).toBeInViewport();
    await window.getByRole('menuitem', { name: 'New terminal' }).click();
    const main = window.getByRole('main');
    await main.locator('.xterm').click();
    await window.keyboard.type('echo korev-big-terminal');
    await window.keyboard.press('Enter');
    await expect(main.locator('.xterm-rows')).toContainText(
      'korev-big-terminal',
    );

    await window.getByRole('button', { name: 'New tab' }).click();
    await window.getByRole('menuitem', { name: 'New browser tab' }).click();
    const address = window.getByRole('textbox', { name: 'Address' });
    await address.fill(`127.0.0.1:${port}`);
    await address.press('Enter');
    await expect(address).toHaveValue(`http://127.0.0.1:${port}/`);
    await snap(window, '09-browser');
  } finally {
    await app.close();
    server.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('shows chats from two workspaces side by side in the grid', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    await window
      .getByRole('button', { name: 'Create empty workspace' })
      .click();
    const sidebar = window.getByRole('navigation', { name: 'Workspaces' });
    await sidebar.getByRole('button', { name: /^New workspace/ }).click();
    await window
      .getByRole('button', { name: 'Create empty workspace' })
      .click();
    const rows = sidebar.getByRole('button', { name: /^Workspace / });
    await expect(rows).toHaveCount(2);

    await sidebar.getByRole('button', { name: /^Grid/ }).click();
    const first = window.getByRole('region', { name: 'Pane 1' });
    const second = window.getByRole('region', { name: 'Pane 2' });
    await rows.first().hover();
    await window.mouse.down();
    await first.hover();
    await first.hover({ position: { x: 20, y: 20 } });
    await window.mouse.up();
    await expect(
      first.getByRole('button', { name: 'Open in full view' }),
    ).toBeVisible();
    await second.getByRole('button', { name: 'Choose workspace' }).click();
    await window.getByRole('menuitem').nth(1).click();

    await second.getByRole('textbox', { name: 'Message' }).fill('Add a note');
    await second.getByRole('textbox', { name: 'Message' }).press('Enter');
    await expect(second.getByText('I added agent-note.txt.')).toBeVisible();
    await expect(first.getByText('I added agent-note.txt.')).toHaveCount(0);
    await snap(window, '10-grid');
    await waitForAgentsToFinish(window);

    await second.getByRole('button', { name: 'Open in full view' }).click();
    await expect(
      window.getByRole('main').getByText('I added agent-note.txt.'),
    ).toBeVisible();
    await sidebar.getByRole('button', { name: /^Grid/ }).click();
    await expect(second.getByText('I added agent-note.txt.')).toBeVisible();

    const third = window.getByRole('region', { name: 'Pane 3' });
    await third.getByRole('button', { name: 'Ask', exact: true }).click();
    await window.getByRole('menuitem', { name: 'New ask' }).click();
    await third
      .getByRole('textbox', { name: 'Message' })
      .fill('Where is the README?');
    await snap(window, '10b-grid-new-ask');
    await third.getByRole('textbox', { name: 'Message' }).press('Enter');
    await expect(third.getByText('I added agent-note.txt.')).toBeVisible();
    await expect(third.getByText('Finding the README')).toBeVisible();
    await snap(window, '10c-grid-ask');
    await waitForAgentsToFinish(window);

    const fourth = window.getByRole('region', { name: 'Pane 4' });
    await sidebar
      .getByRole('button', { name: 'Ask Finding the README' })
      .hover();
    await window.mouse.down();
    await fourth.hover();
    await fourth.hover({ position: { x: 20, y: 20 } });
    await window.mouse.up();
    await expect(fourth.getByText('I added agent-note.txt.')).toBeVisible();
    await expect(
      third.getByRole('button', { name: 'Choose workspace' }),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('runs a terminal in a grid pane and keeps it in the full view', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    await window
      .getByRole('button', { name: 'Create empty workspace' })
      .click();
    const sidebar = window.getByRole('navigation', { name: 'Workspaces' });
    await sidebar.getByRole('button', { name: /^Grid/ }).click();
    const pane = window.getByRole('region', { name: 'Pane 1' });
    await pane.getByRole('button', { name: 'Choose workspace' }).click();
    await window.getByRole('menuitem').first().click();

    await pane.getByRole('button', { name: 'New chat' }).click();
    await window.getByRole('menuitem', { name: 'New terminal' }).click();
    await pane.locator('.xterm').click();
    await window.keyboard.type('echo korev-grid-terminal');
    await window.keyboard.press('Enter');
    await expect(pane.locator('.xterm-rows')).toContainText(
      'korev-grid-terminal',
    );
    await snap(window, '11-grid-terminal');

    const second = window.getByRole('region', { name: 'Pane 2' });
    await second.getByRole('button', { name: 'Choose workspace' }).click();
    await window.getByRole('menuitem').first().click();
    await expect(
      second.getByRole('textbox', { name: 'Message' }),
    ).toBeVisible();
    await expect(pane.locator('.xterm-rows')).toContainText(
      'korev-grid-terminal',
    );

    await pane.getByRole('button', { name: 'Open in full view' }).click();
    await expect(window.getByRole('main').locator('.xterm-rows')).toContainText(
      'korev-grid-terminal',
    );
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('moves a workspace from Working to Done on the board', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    await window.getByRole('textbox', { name: 'Message' }).fill('hold-turn');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');
    await expect.poll(() => runningAgents(window)).toBe(1);
    const state = (await window.evaluate(() =>
      (globalThis as unknown as { korev: KorevBridge }).korev.call(
        'getState',
        [],
      ),
    )) as AppState;
    const [workspace] = state.workspaces;
    await expect
      .poll(() => existsSync(path.join(workspace.path, '.context/claude-args')))
      .toBe(true);

    const sidebar = window.getByRole('navigation', { name: 'Workspaces' });
    await sidebar.getByRole('button', { name: /^Board/ }).click();
    const working = window.getByRole('region', { name: 'Working' });
    const done = window.getByRole('region', { name: 'Done' });
    await expect(
      working.getByRole('button', { name: /^Workspace / }),
    ).toHaveCount(1);
    await snap(window, '12-board-working');

    await window.evaluate(
      (sessionId) =>
        (globalThis as unknown as { korev: KorevBridge }).korev.call('send', [
          sessionId,
          { text: 'finish' },
        ]),
      workspace.sessions[0].id,
    );
    await expect(done.getByText('I added agent-note.txt.')).toBeVisible();
    await waitForAgentsToFinish(window);
    await expect(working.getByRole('button')).toHaveCount(0);
    await snap(window, '13-board-done');

    await done.getByRole('button', { name: /^Workspace / }).click();
    await expect(
      window.getByRole('main').getByText('I added agent-note.txt.'),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('explains the changes of a workspace step by step', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const { app, window } = await launch(home, repo);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    await window.getByRole('textbox', { name: 'Message' }).fill('Add a note');
    await window.getByRole('textbox', { name: 'Message' }).press('Enter');
    await expect(window.getByText('I added agent-note.txt.')).toBeVisible();
    await waitForAgentsToFinish(window);

    const panel = window.getByRole('complementary', {
      name: 'Workspace panel',
    });
    await panel.getByRole('button', { name: 'Explain', exact: true }).click();
    const main = window.getByRole('main');
    await expect(
      main.getByText('The README now says how to install the app.'),
    ).toBeVisible();
    await expect(
      main.getByRole('article', { name: 'Step 1: Add the install steps' }),
    ).toBeVisible();
    await expect(main.getByText('Not explained')).toBeVisible();
    await snap(window, '14-explainer');
    await main
      .getByRole('region', { name: 'Look closely' })
      .scrollIntoViewIfNeeded();
    await snap(window, '14b-explainer-walkthrough');

    await main.getByRole('button', { name: 'Got it, next step' }).click();
    await expect(main.getByText('1 of 2 understood')).toBeVisible();
    await main.getByRole('button', { name: 'Ask about this step' }).click();
    await expect(window.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'About step 2, "Mention the CLI": ',
    );

    await main.getByRole('tab', { name: 'Chat' }).click();
    await main.getByRole('button', { name: /Explanation ready/ }).click();
    await expect(
      main.getByRole('article', { name: 'Step 2: Mention the CLI' }),
    ).toBeVisible();
    await waitForAgentsToFinish(window);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

const FAKE_GH = `#!/bin/sh
case "$1 $2" in
  "pr list")
    case "$*" in
      *review-requested*) echo '[{"number":42,"title":"Add install steps","headRefName":"octo/install","baseRefName":"main","author":{"login":"octo"},"isDraft":false}]' ;;
      *) echo '[]' ;;
    esac ;;
  "pr view") echo '{"number":42,"url":"https://github.com/acme/web/pull/42","title":"Add install steps","author":{"login":"octo"},"headRefOid":"abc123","body":"Adds the steps."}' ;;
  "pr diff") printf 'diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,2 @@\n # acme\n+Install it.\n' ;;
  *) exit 1 ;;
esac
`;

async function launchWithFakeGh(home: string) {
  const repo = await createRepo(home);
  const fakeBin = path.join(home, 'fake-gh');
  await mkdir(fakeBin);
  await writeFile(path.join(fakeBin, 'gh'), FAKE_GH);
  await chmod(path.join(fakeBin, 'gh'), 0o755);
  await writeFile(path.join(home, '.shrc'), `export PATH=${fakeBin}:$PATH\n`);
  return launch(home, repo, { ENV: path.join(home, '.shrc') });
}

test("explains a teammate's pull request in a read-only Ask chat", async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const { app, window } = await launchWithFakeGh(home);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    const sidebar = window.getByRole('navigation', { name: 'Workspaces' });
    await sidebar.getByRole('button', { name: 'Ask', exact: true }).click();
    await window
      .getByRole('button', { name: /^Explain a pull request/ })
      .click();
    const picker = window.getByRole('dialog', {
      name: 'Explain a pull request',
    });
    await expect(
      picker.getByRole('group', { name: 'Waiting for your review' }),
    ).toBeVisible();
    await snap(window, '15-explain-picker');
    await picker.getByRole('option', { name: /#42 Add install steps/ }).click();

    await expect(
      window.getByText('The README now says how to install the app.'),
    ).toBeVisible();
    await expect(
      sidebar.getByRole('button', { name: 'Ask #42 Add install steps' }),
    ).toBeVisible();
    await snap(window, '16-explainer-pr');

    const exported = path.join(home, 'explanation.html');
    await app.evaluate(({ session }, savePath) => {
      session.defaultSession.once('will-download', (_event, item) =>
        item.setSavePath(savePath),
      );
    }, exported);
    await window.getByRole('button', { name: 'Export HTML' }).click();
    await expect.poll(() => existsSync(exported)).toBe(true);
    await expect
      .poll(async () => readFile(exported, 'utf8'))
      .toContain('The README now says how to install the app.');
    await waitForAgentsToFinish(window);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("starts an Ask to review a teammate's pull request", async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const { app, window } = await launchWithFakeGh(home);
  try {
    await window.getByRole('button', { name: 'Open project' }).click();
    const picker = window.getByRole('dialog', {
      name: 'Review a pull request',
    });
    const accelerator = await app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Review Pull Request…');
      item?.click();
      return item?.accelerator;
    });
    expect(accelerator).toBe('CmdOrCtrl+Shift+R');
    await expect(picker).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(picker).toBeHidden();

    const sidebar = window.getByRole('navigation', { name: 'Workspaces' });
    await sidebar.getByRole('button', { name: 'Ask', exact: true }).click();
    await window
      .getByRole('button', { name: /^Review a pull request/ })
      .click();
    await picker.getByRole('option', { name: /#42 Add install steps/ }).click();

    await expect(picker).toBeHidden();
    const message = window.getByRole('textbox', { name: 'Message' });
    await expect(message).toBeFocused();
    await message.pressSequentially('Check the wording.');
    await expect(message).toHaveValue(
      'Review pull request #42 Add install steps. Check the wording.',
    );
    await snap(window, '17-review-pr');
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});
