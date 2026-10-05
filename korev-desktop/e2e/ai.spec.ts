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
  runPage,
  withSession,
} from './app';
import {
  API_REPO,
  FAILING_PR_NUMBER,
  FAILING_PR_TITLE,
  REVIEW_PR_NUMBER,
  REVIEW_PR_TITLE,
} from './fake-github';
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
        {
          number: REVIEW_PR_NUMBER,
          headRefName: `feature-${REVIEW_PR_NUMBER}`,
          files: { 'ingest.ts': 'export const limit = 200;\n' },
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

          const page = runPage(window, FAILING_PR_NUMBER);
          await expect(
            page.getByText('Which ingestion limit should win?'),
          ).toBeVisible({ timeout: 30_000 });
          await expect(
            page.getByRole('log').getByText('Read ingest.ts'),
          ).toBeVisible();
          await page
            .getByRole('textbox', { name: 'Your answer' })
            .fill('Use 75');
          await page.getByRole('button', { name: /Send answers/ }).click();

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

test('opens a terminal in the worktree of a conflict fix waiting for an answer', async () => {
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
          await runPage(window, FAILING_PR_NUMBER)
            .getByRole('button', { name: 'Open terminal' })
            .click({ timeout: 30_000 });

          const terminal = window.getByRole('region', { name: /Terminal/ });
          await terminal.locator('.xterm').click();
          await window.keyboard.type('git rev-parse --abbrev-ref HEAD\n');

          await expect(terminal).toContainText(`korev/${FAILING_PR_NUMBER}`);
        } finally {
          await app.close();
        }
      },
      { headOids: remote.headOids, conflicting: [FAILING_PR_NUMBER] },
    );
  });
});

test('drafts a review of a teammate PR and submits it as a comment', async () => {
  await withRemote((remote) =>
    withSession(
      async (github, userDataDir) => {
        await chooseClaude(userDataDir);
        const app = await launch(github, userDataDir, aiEnv(remote));
        try {
          const window = await appWindow(app);
          await connectAndOpenMyPrs(window);
          await window.getByRole('button', { name: /Review requests/ }).click();
          await openRow(window, REVIEW_PR_TITLE);
          await panel(window)
            .getByRole('button', { name: /^Review/ })
            .click();

          const draft = runPage(window, REVIEW_PR_NUMBER).getByRole('region', {
            name: 'Review draft',
          });
          await expect(
            draft.getByText(
              'Read the limit from config instead of hard-coding it.',
            ),
          ).toBeVisible({ timeout: 30_000 });
          await expect(
            draft.getByRole('button', { name: /Approve/ }),
          ).toHaveCount(0);
          await draft
            .getByRole('button', { name: 'Submit as comment' })
            .click();

          await expect(draft).toBeHidden();
          expect(github.submittedReviews()).toEqual([
            {
              id: `PR_${REVIEW_PR_NUMBER}`,
              event: 'COMMENT',
              body: 'One change worth making before merge.',
              threads: [
                {
                  path: 'ingest.ts',
                  line: 1,
                  side: 'RIGHT',
                  body: 'Read the limit from config instead of hard-coding it.',
                },
              ],
            },
          ]);
        } finally {
          await app.close();
        }
      },
      { headOids: remote.headOids, reviewRequest: true },
    ),
  );
});
