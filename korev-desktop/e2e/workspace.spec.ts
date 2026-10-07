import {
  _electron as electron,
  expect,
  test,
  type Page,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { KorevBridge } from '../src/shared/api';

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

async function launch(home: string, repo: string) {
  const app = await electron.launch({
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
      sidebar.getByRole('button', { name: 'Ask Where is the README?' }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole('button', { name: /^Workspace / }),
    ).toHaveCount(0);
    await snap(window, '06-ask-answer');
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
  const app = await electron.launch({
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
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('reviews a turn, searches the workspace and edits a file', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-e2e-'));
  const repo = await createRepo(home);
  const app = await electron.launch({
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
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});
