import {
  _electron as electron,
  expect,
  test,
  type Page,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { KorevBridge } from '../src/shared/api';
import type { AppState } from '../src/shared/model';

const APP_ENTRY = '.vite/build/main.cjs';
const FAKE_AGENT_BIN = path.resolve('test-support/bin');
const SCREENSHOT_DIR = process.env.KOREV_SCREENSHOT_DIR;

test.setTimeout(120_000);

function git(cwd: string, ...args: string[]) {
  execFileSync('git', args, { cwd });
}

async function createRepo(home: string): Promise<string> {
  const repo = path.join(home, 'acme-web');
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

function launchApp(home: string) {
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
    },
  });
}

async function launch(home: string, repo: string) {
  const app = await launchApp(home);
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
