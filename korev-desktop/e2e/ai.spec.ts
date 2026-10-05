import { expect, test } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  appWindow,
  connectAndOpenMyPrs,
  launch,
  openRow,
  panel,
  withSession,
} from './app';
import { API_REPO, FAILING_PR_NUMBER, FAILING_PR_TITLE } from './fake-github';
import { createGitRemote, type GitRemote } from '../src/main/test-git-remote';

const STUBS = resolve('e2e/stubs');

test.setTimeout(120_000);

function aiEnv(remote: GitRemote): Record<string, string> {
  return {
    PATH: `${STUBS}:${process.env.PATH ?? ''}`,
    SHELL: join(STUBS, 'login-shell'),
    HOME: remote.home,
    KOREV_GIT_URL: remote.gitUrl,
  };
}

async function withRemote(run: (remote: GitRemote) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'korev-e2e-git-'));
  try {
    await run(
      createGitRemote(root, API_REPO, { 'ingest.ts': 'export {};\n' }, [
        {
          number: FAILING_PR_NUMBER,
          headRefName: `feature-${FAILING_PR_NUMBER}`,
          files: { 'ingest.ts': 'export const limit = 100;\n' },
        },
      ]),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function chooseClaude(userDataDir: string) {
  await writeFile(
    join(userDataDir, 'settings.json'),
    JSON.stringify({ agent: { provider: 'claude', models: {} } }),
  );
}

test('explains a PR in the reader with the agent running in a Korev checkout', async () => {
  await withRemote((remote) =>
    withSession(
      async (github, userDataDir) => {
        await chooseClaude(userDataDir);
        const app = await launch(github, userDataDir, aiEnv(remote));
        try {
          const window = await appWindow(app);
          await connectAndOpenMyPrs(window);
          await openRow(window, FAILING_PR_TITLE);
          await panel(window)
            .getByRole('button', { name: /Explain/ })
            .click();

          const reader = window.getByRole('dialog');
          await expect(reader).toContainText(`Explain #${FAILING_PR_NUMBER}`);
          await expect(
            reader
              .frameLocator(
                `iframe[title="Explanation of #${FAILING_PR_NUMBER}"]`,
              )
              .getByRole('heading', { name: 'What changes' }),
          ).toBeVisible({ timeout: 30_000 });
          await expect(
            reader.getByText(remote.headOids[FAILING_PR_NUMBER].slice(0, 7)),
          ).toBeVisible();
        } finally {
          await app.close();
        }
      },
      { headOids: remote.headOids },
    ),
  );
});

test('fixes a merge conflict after asking one question, and pushes the merge', async () => {
  await withRemote(async (remote) => {
    remote.commit(
      'main',
      { 'ingest.ts': 'export const limit = 50;\n' },
      'Lower the limit',
    );
    await withSession(
      async (github, userDataDir) => {
        await chooseClaude(userDataDir);
        const app = await launch(github, userDataDir, aiEnv(remote));
        try {
          const window = await appWindow(app);
          await connectAndOpenMyPrs(window);
          await openRow(window, FAILING_PR_TITLE);
          await panel(window)
            .getByRole('button', { name: 'Fix conflicts' })
            .click();

          await expect(
            panel(window).getByText('Which ingestion limit should win?'),
          ).toBeVisible({ timeout: 30_000 });
          await panel(window).getByLabel('Your answer').fill('Use 75');
          await panel(window)
            .getByRole('button', { name: /Send answers/ })
            .click();

          await expect(
            window.getByText(/Fixed conflicts on #491 · pushed/).first(),
          ).toBeVisible({
            timeout: 30_000,
          });
          expect(
            remote.git('show', `feature-${FAILING_PR_NUMBER}:ingest.ts`),
          ).toBe('export const limit = 75;');
          expect(
            remote.git(
              'log',
              '-1',
              '--format=%s',
              `feature-${FAILING_PR_NUMBER}`,
            ),
          ).toBe(`Merge main into feature-${FAILING_PR_NUMBER}`);
        } finally {
          await app.close();
        }
      },
      { headOids: remote.headOids, conflicting: [FAILING_PR_NUMBER] },
    );
  });
});
