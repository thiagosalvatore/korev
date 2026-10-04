import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxSnapshot } from '../shared/inbox';
import type { Settings } from '../shared/settings';
import { installFakeBridge, installMatchMedia } from './fake-bridge';
import { MyPrs } from './MyPrs';
import {
  LINT_PR,
  OLD_RETRIES_PR,
  OLD_SPLIT_PR,
  OTEL_PR,
  PICKER_PR,
  WATCHING_SETTINGS,
  makeSnapshot,
  withStaleStack,
} from './test-fixtures';

beforeEach(() => installMatchMedia());
afterEach(cleanup);

function setup(
  snapshot: InboxSnapshot = makeSnapshot(),
  settings: Settings = WATCHING_SETTINGS,
) {
  const { bridge } = installFakeBridge({ settings });
  render(<MyPrs snapshot={snapshot} onOpenSettings={vi.fn()} />);
  return bridge;
}

const STALE_OPEN: Settings = {
  ...WATCHING_SETTINGS,
  collapsedSections: { stale: false },
};

const OLD_REFS = ['acme/web#401', 'acme/web#402'];

function targetOf(item: typeof OLD_SPLIT_PR) {
  return { id: item.pr.id, repo: item.pr.repo, number: item.pr.number };
}

async function selectStale(title: string) {
  fireEvent.click(
    await screen.findByRole('option', { name: new RegExp(title) }),
  );
}

function select(title: string) {
  fireEvent.click(screen.getByRole('option', { name: new RegExp(title) }));
}

function press(key: string) {
  fireEvent.keyDown(window, { key, shiftKey: true });
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog');
}

describe('My PR actions', () => {
  it('names every layer a stack merge includes and blocks on one that is not ready', () => {
    setup();
    select(PICKER_PR.pr.title);
    press('M');

    expect(
      within(dialog()).getByText('Merges #303, #304 and #305'),
    ).toBeTruthy();
    expect(within(dialog()).getByText("Includes @alex's #303")).toBeTruthy();
    expect(
      within(dialog()).getByText("#304 isn't ready: lint failing"),
    ).toBeTruthy();
    expect(
      (
        within(dialog()).getByRole('button', {
          name: /^Merge/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('cancels the confirm on Escape and keeps the panel open', () => {
    setup();
    select(OTEL_PR.pr.title);
    press('M');
    fireEvent.keyDown(
      within(dialog()).getByRole('button', { name: /^Merge/ }),
      {
        key: 'Escape',
      },
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('complementary')).toBeTruthy();
  });

  it('merges a ready PR from the panel after the confirm', () => {
    const bridge = setup();
    select(OTEL_PR.pr.title);
    fireEvent.click(screen.getByRole('button', { name: /^Merge/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: /^Merge/ }));

    expect(bridge.pr.merge).toHaveBeenCalledWith({
      target: { id: OTEL_PR.pr.id, repo: 'acme/api', number: 480 },
      numbers: [480],
      method: null,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the comment a third-party queue receives before sending it', async () => {
    setup(makeSnapshot(), {
      ...WATCHING_SETTINGS,
      mergeWith: { 'acme/api': 'trunk' },
    });
    select(OTEL_PR.pr.title);
    press('M');

    expect(
      await within(dialog()).findByText(
        'Posts `/trunk merge` on #480. Your team sees this comment.',
      ),
    ).toBeTruthy();
    expect(
      within(dialog()).getByRole('button', { name: /Send to Trunk/ }),
    ).toBeTruthy();
  });

  it('warns that layers built on a closed PR lose their base', () => {
    const bridge = setup();
    select(LINT_PR.pr.title);
    press('X');

    expect(
      within(dialog()).getByText(
        '#305 is built on this and will lose its base.',
      ),
    ).toBeTruthy();
    fireEvent.click(
      within(dialog()).getByRole('button', { name: /^Close\s*⌘↵/ }),
    );
    expect(bridge.pr.close).toHaveBeenCalledWith([
      { id: LINT_PR.pr.id, repo: 'acme/web', number: 304 },
    ]);
  });

  it('keeps Merge and Close disabled until the first live sync', () => {
    setup(makeSnapshot({ fromCache: true, status: 'syncing' }));
    select(OTEL_PR.pr.title);

    const merge = screen.getByRole('button', { name: /^Merge/ });
    expect((merge as HTMLButtonElement).disabled).toBe(true);
    expect(merge.title).toBe('Waiting for GitHub sync');
    press('M');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("shows a failed merge on the row and GitHub's reason in the panel", () => {
    setup(
      makeSnapshot({
        actions: {
          'acme/api#480': {
            kind: 'merge-failed',
            message: 'Required status check "lint" is failing.',
          },
        },
      }),
    );
    const row = screen.getByRole('option', {
      name: new RegExp(OTEL_PR.pr.title),
    });
    expect(within(row).getByText('Merge failed')).toBeTruthy();
    select(OTEL_PR.pr.title);

    expect(
      within(screen.getByRole('complementary')).getByText(
        'Required status check "lint" is failing.',
      ),
    ).toBeTruthy();
  });

  it("closes every one of the viewer's layers of a stale stack and names the teammate's layer", async () => {
    const bridge = setup(withStaleStack(), STALE_OPEN);
    await selectStale(OLD_RETRIES_PR.pr.title);
    press('X');

    expect(within(dialog()).getByText('Closes #401 and #402.')).toBeTruthy();
    expect(
      within(dialog()).getByText(
        "Leaves @alex's #403 open; it will lose its base.",
      ),
    ).toBeTruthy();
    fireEvent.click(
      within(dialog()).getByRole('button', { name: /^Close\s*⌘↵/ }),
    );
    expect(bridge.pr.close).toHaveBeenCalledWith([
      targetOf(OLD_SPLIT_PR),
      targetOf(OLD_RETRIES_PR),
    ]);
  });

  it('names only the closed PRs after a partial failure and reopens only those', async () => {
    const { bridge } = installFakeBridge({ settings: STALE_OPEN });
    const snapshot = withStaleStack();
    const view = render(<MyPrs snapshot={snapshot} onOpenSettings={vi.fn()} />);
    await selectStale(OLD_SPLIT_PR.pr.title);

    view.rerender(
      <MyPrs
        snapshot={{
          ...snapshot,
          actions: {
            'acme/web#401': { kind: 'closed' },
            'acme/web#402': { kind: 'close-failed', message: 'Locked' },
          },
        }}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('Closed #401')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(bridge.pr.reopen).toHaveBeenCalledTimes(1);
    expect(bridge.pr.reopen).toHaveBeenCalledWith(targetOf(OLD_SPLIT_PR));
  });

  it('keeps a stale stack with ⇧K and undoes it from the toast', async () => {
    const bridge = setup(withStaleStack(), STALE_OPEN);
    await selectStale(OLD_SPLIT_PR.pr.title);
    press('K');

    expect(bridge.settings.setKept).toHaveBeenCalledWith(OLD_REFS, true);
    expect(
      await screen.findByText('Kept #401 and #402 for 30 days'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(bridge.settings.setKept).toHaveBeenLastCalledWith(OLD_REFS, false);
  });

  it("says it couldn't save a keep and shows no toast when the save fails", async () => {
    const bridge = setup(withStaleStack(), STALE_OPEN);
    vi.mocked(bridge.settings.setKept).mockRejectedValueOnce(new Error('disk'));
    await selectStale(OLD_SPLIT_PR.pr.title);
    press('K');

    expect(await screen.findByText(/Couldn't save/)).toBeTruthy();
    expect(screen.queryByText(/Kept #401/)).toBeNull();
  });
});
