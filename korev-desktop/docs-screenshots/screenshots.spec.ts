import {
  _electron as electron,
  expect,
  test,
  type Page,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Settings, ThemePreference } from '../src/shared/model';
import type { KorevBridge } from '../src/shared/api';

const APP_ENTRY = '.vite/build/main.cjs';
const FAKE_AGENT_BIN = path.resolve('docs-screenshots/bin');
const OUT_DIR = path.resolve('../korev-frontend/public/screenshots');
const THEMES: ThemePreference[] = ['dark', 'light'];
const THEME_SETTLE_MS = 400;
const WINDOW_SIZE = { width: 1440, height: 900 };
const RETINA_SCALE = 2;

const SAMPLE_FILES: Record<string, string> = {
  'README.md': '# acme-web\n\nThe Acme dashboard and its API.\n',
  'package.json': '{\n  "name": "acme-web",\n  "private": true\n}\n',
  'config/limits.json': '{\n  "default": 100,\n  "enterprise": 1000\n}\n',
  'src/app.ts': `import express from 'express';
import { rateLimit } from './middleware/rateLimit';
import { routes } from './routes';

export const app = express();
app.use('/api', rateLimit({ limit: 100, windowMs: 60_000 }), routes);
`,
  'src/lib/bucket.ts': `export const bucket = {
  async take(key: string, opts: { limit: number; windowMs: number }) {
    return { ok: true, remaining: opts.limit - 1, resetAt: Date.now() + opts.windowMs };
  },
};
`,
  'src/middleware/rateLimit.ts': `import type { Request, Response, NextFunction } from 'express';
import { bucket } from '../lib/bucket';

export function rateLimit(opts: { limit: number; windowMs: number }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.tenantKey;
    const { ok } = await bucket.take(key, opts);
    if (!ok) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    next();
  };
}
`,
};

test.setTimeout(300_000);

function git(cwd: string, ...args: string[]) {
  execFileSync('git', args, { cwd });
}

async function createSampleRepo(home: string): Promise<string> {
  const repo = path.join(home, 'acme-web');
  git(home, 'init', '-q', '-b', 'main', repo);
  git(repo, 'config', 'user.email', 'alex@example.com');
  git(repo, 'config', 'user.name', 'Alex Kim');
  git(repo, 'config', 'commit.gpgsign', 'false');
  for (const [file, content] of Object.entries(SAMPLE_FILES)) {
    await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
    await writeFile(path.join(repo, file), content);
  }
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'Initial commit');
  return repo;
}

function updateSettings(window: Page, settings: Partial<Settings>) {
  return window.evaluate(
    (patch) =>
      (globalThis as unknown as { korev: KorevBridge }).korev.call(
        'updateSettings',
        [patch],
      ),
    settings,
  );
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
      ENV: path.join(home, '.shrc'),
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
  await app.evaluate(({ BrowserWindow }) => {
    for (const appWindow of BrowserWindow.getAllWindows()) {
      appWindow.setFocusable(false);
      appWindow.setIgnoreMouseEvents(true);
      appWindow.blur();
    }
  });
  const cdp = await window.context().newCDPSession(window);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    ...WINDOW_SIZE,
    deviceScaleFactor: RETINA_SCALE,
    mobile: false,
  });
  await updateSettings(window, {
    notifications: false,
    notificationSound: false,
    keepAwake: false,
  });
  return { app, window };
}

async function capture(window: Page, name: string) {
  await window.mouse.move(0, 0);
  for (const theme of THEMES) {
    await updateSettings(window, { theme });
    await window.waitForTimeout(THEME_SETTLE_MS);
    await window.screenshot({
      path: path.join(OUT_DIR, `${name}-${theme}.png`),
    });
  }
}

async function startWorkspace(window: Page, task: string) {
  await window
    .getByRole('navigation', { name: 'Workspaces' })
    .getByRole('button', { name: /^New workspace/ })
    .first()
    .click();
  await window.getByRole('textbox', { name: 'Message' }).fill(task);
  await window.getByRole('textbox', { name: 'Message' }).press('Enter');
}

async function captureAll(window: Page) {
  const sidebar = window.getByRole('navigation', { name: 'Workspaces' });
  const main = window.getByRole('main');

  await window.getByRole('button', { name: 'Open project' }).click();
  await window
    .getByRole('textbox', { name: 'Message' })
    .fill('Add rate limit headers to every API response');
  await capture(window, 'new-workspace');
  await window.getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect(main.getByText(/both pass/)).toBeVisible();
  await window.getByRole('button', { name: 'Hide terminal' }).click();

  await startWorkspace(window, 'Add a dark mode setting');
  await expect(
    main.getByText('Done. The change is in the diff.'),
  ).toBeVisible();
  await startWorkspace(window, 'Fix the flaky checkout test');
  await expect(
    main.getByText('Done. The change is in the diff.'),
  ).toBeVisible();

  await startWorkspace(window, 'Add a billing page for admins');
  await expect(main.getByText('Plan ready for review')).toBeVisible();
  await capture(window, 'plan-review');

  await sidebar.getByText('alex-kim/rate-limit-headers').click();
  await expect(main.getByText(/both pass/)).toBeVisible();
  await capture(window, 'main-window');

  const panel = window.getByRole('complementary', { name: 'Workspace panel' });
  await panel.getByText('src/middleware/rateLimit.ts', { exact: true }).click();
  await window.getByRole('button', { name: 'Hide right sidebar' }).click();
  await main
    .getByTitle('Comment on this line')
    .filter({ hasText: /^8$/ })
    .last()
    .click();
  await window
    .getByRole('textbox', { name: 'Comment' })
    .fill('Also log the tenant key when a request is rate limited.');
  await window.getByRole('button', { name: 'Add comment' }).click();
  await capture(window, 'diff-comment');

  await sidebar.getByRole('button', { name: 'Ask', exact: true }).click();
  await window
    .getByRole('textbox', { name: 'Message' })
    .fill('Where are rate limits set?');
  await window.getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect(window.getByText('config/limits.json')).toBeVisible();
  await capture(window, 'ask');
}

test('captures the docs screenshots', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'korev-docs-'));
  const repo = await createSampleRepo(home);
  await writeFile(path.join(home, '.shrc'), "PS1='$ '\n");
  await mkdir(OUT_DIR, { recursive: true });
  const { app, window } = await launch(home, repo);
  try {
    await captureAll(window);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});
