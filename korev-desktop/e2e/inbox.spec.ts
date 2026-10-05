import { expect, test } from '@playwright/test';
import {
  appWindow,
  confirmDialog,
  connectAndOpenMyPrs,
  launch,
  openRow,
  panel,
  sectionRows,
  withSession,
} from './app';
import {
  API_REPO,
  FAILING_PR_TITLE,
  NEW_PR_TITLE,
  STALE_PR_TITLE,
  WEB_PR_TITLE,
  WEB_REPO,
} from './fake-github';

const NOTIFICATION_REFRESH_TIMEOUT_MS = 90_000;

test.setTimeout(150_000);

test('connects with a token, shows My PRs and picks up a change from notifications', async () => {
  await withSession(async (github, userDataDir) => {
    const app = await launch(github, userDataDir);
    try {
      const window = await appWindow(app);
      await connectAndOpenMyPrs(window);
      await expect(
        window.getByText('Needs you', { exact: false }).first(),
      ).toBeVisible();

      github.publishNewPr();
      await expect(window.getByText(NEW_PR_TITLE)).toBeVisible({
        timeout: NOTIFICATION_REFRESH_TIMEOUT_MS,
      });
      await expect(
        window.getByText('Ready to merge', { exact: false }).first(),
      ).toBeVisible();
    } finally {
      await app.close();
    }
  });
});

test('keeps the sign-in across a relaunch and shows the cached inbox before the first sync', async () => {
  await withSession(async (github, userDataDir) => {
    const firstRun = await launch(github, userDataDir);
    try {
      await connectAndOpenMyPrs(await appWindow(firstRun));
    } finally {
      await firstRun.close();
    }

    github.holdInbox();
    const relaunched = await launch(github, userDataDir);
    try {
      const window = await appWindow(relaunched);
      await expect(window.getByText(/Syncing… · data from/)).toBeVisible();
      await expect(window.getByText(FAILING_PR_TITLE)).toBeVisible();

      github.releaseInbox();
      await expect(window.getByText(/Synced/)).toBeVisible();
    } finally {
      await relaunched.close();
    }
  });
});

test('shows each section once and sorts repos inside it in the order chosen in Settings, with keyboard collapse', async () => {
  await withSession(
    async (github, userDataDir) => {
      const app = await launch(github, userDataDir);
      try {
        const window = await appWindow(app);
        await connectAndOpenMyPrs(window);
        const ready = window.getByRole('group', {
          name: 'Ready to merge',
          exact: true,
        });
        await expect(ready).toHaveCount(1);
        await expect(
          sectionRows(window, 'Ready to merge').first(),
        ).toContainText(NEW_PR_TITLE);

        await window
          .getByRole('button', { name: 'Settings', exact: true })
          .click();
        await window.getByRole('button', { name: 'Repositories' }).click();
        await window
          .getByRole('button', { name: `Reorder ${API_REPO}, 1 of 2` })
          .press('Alt+ArrowDown');
        await window.getByRole('button', { name: /My PRs/ }).click();

        const readyRows = sectionRows(window, 'Ready to merge');
        await expect(readyRows.first()).toContainText(WEB_PR_TITLE);
        await expect(readyRows.nth(1)).toContainText(NEW_PR_TITLE);

        const readyHeader = window.getByRole('option', {
          name: /^Ready to merge/,
        });
        await window.keyboard.press('j');
        await window.keyboard.press('j');
        await expect(readyHeader).toBeFocused();
        await window.keyboard.press('ArrowLeft');
        await expect(window.getByText(WEB_PR_TITLE)).toBeHidden();
        await window.keyboard.press('ArrowRight');
        await window.keyboard.press('j');
        await expect(
          window.getByRole('option', { name: new RegExp(WEB_PR_TITLE) }),
        ).toBeFocused();
      } finally {
        await app.close();
      }
    },
    { includeNewPr: true },
  );
});

test('shows a PR whose only recent activity is a bot comment as stale, and keeps it with ⇧K', async () => {
  await withSession(
    async (github, userDataDir) => {
      const app = await launch(github, userDataDir);
      try {
        const window = await appWindow(app);
        await connectAndOpenMyPrs(window);

        await window
          .getByRole('option', { name: 'Stale, 1 pull request' })
          .click();
        const row = window.getByRole('option', {
          name: new RegExp(STALE_PR_TITLE),
        });
        await expect(row).toContainText('No activity for 30d');

        await row.click();
        await window.keyboard.press('Shift+K');
        await expect(window.getByText('Kept #290 for 30 days')).toBeVisible();
        await expect(row).toContainText('Kept · 30d left');
      } finally {
        await app.close();
      }
    },
    { includeStalePr: true },
  );
});

test('filters to one repo from the topbar without moving the menu, and Esc closes only the menu', async () => {
  await withSession(async (github, userDataDir) => {
    const app = await launch(github, userDataDir);
    try {
      const window = await appWindow(app);
      await connectAndOpenMyPrs(window);
      const trigger = window.getByRole('button', { name: /^Repo filter/ });
      const menu = window.getByRole('dialog', { name: /^Repo filter/ });

      await trigger.click();
      await expect(
        window.getByRole('checkbox', { name: 'acme' }),
      ).toBeFocused();
      const menuBeforeFilter = await menu.boundingBox();
      await window.keyboard.press('ArrowDown');
      await window.keyboard.press('Space');
      await expect(window.getByText(/· filtered/)).toBeVisible();
      expect(await menu.boundingBox()).toEqual(menuBeforeFilter);
      await expect(window.getByText(FAILING_PR_TITLE)).toBeHidden();
      await expect(window.getByLabel('1 need you')).toBeVisible();
      await window.keyboard.press('Escape');
      await expect(trigger).toBeFocused();

      await openRow(window, WEB_PR_TITLE);
      await trigger.click();
      await window.keyboard.press('Escape');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(panel(window)).toBeVisible();
    } finally {
      await app.close();
    }
  });
});

test('merges a ready PR and closes another after confirming', async () => {
  await withSession(async (github, userDataDir) => {
    const app = await launch(github, userDataDir);
    try {
      const window = await appWindow(app);
      await connectAndOpenMyPrs(window);

      await openRow(window, WEB_PR_TITLE);
      await panel(window)
        .getByRole('button', { name: /^Merge/ })
        .click();
      await expect(confirmDialog(window)).toContainText('Merges #304');
      await confirmDialog(window)
        .getByRole('button', { name: /^Merge/ })
        .click();
      await expect(window.getByText('Merged #304')).toBeVisible();

      await openRow(window, FAILING_PR_TITLE);
      await window.keyboard.press('Shift+X');
      await confirmDialog(window)
        .getByRole('button', { name: /^Close\s*⌘↵/ })
        .click();
      await expect(window.getByText('Closed #491')).toBeVisible();
      await expect(
        window.getByRole('button', { name: 'Reopen' }),
      ).toBeVisible();
    } finally {
      await app.close();
    }
  });
});

test("sends PRs to GitHub's merge queue and to Trunk", async () => {
  await withSession(
    async (github, userDataDir) => {
      const app = await launch(github, userDataDir);
      try {
        const window = await appWindow(app);
        await connectAndOpenMyPrs(window);

        await openRow(window, NEW_PR_TITLE);
        await panel(window)
          .getByRole('button', { name: /^Add to merge queue/ })
          .click();
        await confirmDialog(window)
          .getByRole('button', { name: /^Add to merge queue/ })
          .click();
        await expect(
          window
            .getByRole('option', { name: new RegExp(NEW_PR_TITLE) })
            .getByText('In merge queue'),
        ).toBeVisible();

        await window
          .getByRole('button', { name: 'Settings', exact: true })
          .click();
        await window.getByRole('button', { name: 'Repositories' }).click();
        await window.getByLabel(`Merge ${WEB_REPO} with`).selectOption('trunk');
        await window.getByRole('button', { name: /My PRs/ }).click();
        await openRow(window, WEB_PR_TITLE);
        await panel(window)
          .getByRole('button', { name: /^Send to Trunk/ })
          .click();
        await expect(confirmDialog(window)).toContainText(
          'Posts `/trunk merge` on #304.',
        );
        await confirmDialog(window)
          .getByRole('button', { name: /^Send to Trunk/ })
          .click();
        await expect(
          window
            .getByRole('option', { name: new RegExp(WEB_PR_TITLE) })
            .getByText('In Trunk queue'),
        ).toBeVisible();
        expect(github.comments(WEB_REPO, 304)).toEqual(['/trunk merge']);
      } finally {
        await app.close();
      }
    },
    { mergeQueueRepos: [API_REPO], includeNewPr: true },
  );
});
