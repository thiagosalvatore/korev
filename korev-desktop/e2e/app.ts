import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FAILING_PR_TITLE,
  VIEWER_LOGIN,
  startFakeGithub,
  type FakeGithub,
  type FakeGithubOptions,
} from './fake-github';

const APP_ENTRY = '.vite/build/main.cjs';
const APP_PAGE_PROTOCOL = 'file:';
const FAKE_TOKEN = 'ghp_e2e_fake_token';

export async function appWindow(app: ElectronApplication): Promise<Page> {
  const isAppPage = (page: Page) => page.url().startsWith(APP_PAGE_PROTOCOL);
  const existing = app.windows().find(isAppPage);
  if (existing) return existing;
  return app.waitForEvent('window', { predicate: isAppPage });
}

export function launch(
  github: FakeGithub,
  userDataDir: string,
  env: Record<string, string> = {},
) {
  return electron.launch({
    args: [APP_ENTRY, '--use-mock-keychain', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      KOREV_GITHUB_API_URL: github.url,
      KOREV_GITHUB_WEB_URL: github.url,
      ...env,
    },
  });
}

export async function connectAndOpenMyPrs(window: Page) {
  await window.getByText('Use a personal access token instead').click();
  await window.getByLabel('Personal access token').fill(FAKE_TOKEN);
  await window.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(window.getByText(`Connected as @${VIEWER_LOGIN}`)).toBeVisible();
  await window.getByRole('button', { name: /Open inbox/ }).click();

  await window.getByRole('button', { name: /My PRs/ }).click();
  await expect(window.getByText(FAILING_PR_TITLE)).toBeVisible();
}

export function panel(window: Page) {
  return window.getByRole('complementary', { name: 'Pull request details' });
}

export function runPage(window: Page, number: number) {
  return window.getByRole('region', { name: `Korev on #${number}` });
}

export function confirmDialog(window: Page) {
  return window.getByRole('dialog');
}

export async function openRow(window: Page, title: string) {
  await window.getByRole('option', { name: new RegExp(title) }).click();
}

export function sectionRows(window: Page, section: string) {
  return window
    .getByRole('group', { name: section, exact: true })
    .locator('[role="option"]:not([aria-expanded])');
}

export async function withSession(
  run: (github: FakeGithub, userDataDir: string) => Promise<void>,
  options: FakeGithubOptions = {},
) {
  const github = await startFakeGithub(options);
  const userDataDir = await mkdtemp(join(tmpdir(), 'korev-e2e-'));
  try {
    await run(github, userDataDir);
  } finally {
    await github.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
}
