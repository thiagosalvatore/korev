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
