import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxSnapshot } from '../shared/inbox';
import { installFakeBridge, installMatchMedia } from './fake-bridge';
import { MyPrs } from './MyPrs';
import {
  KEPT_PR,
  OLD_SPLIT_PR,
  WATCHING_SETTINGS,
  makeSnapshot,
  withKeptPr,
  withStaleStack,
} from './test-fixtures';

let bridge: ReturnType<typeof installFakeBridge>['bridge'];

beforeEach(() => {
  installMatchMedia();
  bridge = installFakeBridge().bridge;
});
afterEach(cleanup);

function renderMyPrs(snapshot: InboxSnapshot = makeSnapshot()) {
  return render(<MyPrs snapshot={snapshot} onOpenSettings={vi.fn()} />);
}

function rowTitled(title: string): HTMLElement {
  return screen.getByRole('option', { name: new RegExp(title) });
}

function pressFrom(row: HTMLElement, key: string): Element | null {
  row.focus();
  fireEvent.keyDown(row, { key });
  return document.activeElement;
}

function sectionHeader(name: string): HTMLElement {
  return screen.getByRole('option', { name: new RegExp(`^${name}`) });
}

function withoutNeedsYou(): InboxSnapshot {
  const snapshot = makeSnapshot();
  return {
    ...snapshot,
    mine: snapshot.mine.filter((section) => section.bucket !== 'needs-you'),
  };
}

describe('MyPrs', () => {
  it('shows each section once across repos, in display order', () => {
    renderMyPrs();
    const groups = screen
      .getAllByRole('group')
      .map((group) => group.getAttribute('aria-label'))
      .filter((label) => !label?.startsWith('Stack'));
    expect(groups).toEqual(['Needs you', 'Ready to merge', 'In progress']);
    expect(
      screen.getByRole('heading', { name: 'Needs you, 3 pull requests' }),
    ).toBeTruthy();
    expect(sectionHeader('Ready to merge, 1 pull request')).toBeTruthy();
  });

  it('shows the repo and its owner avatar on each row', () => {
    const avatarUrl = 'https://avatars.githubusercontent.com/u/1?s=32';
    renderMyPrs(makeSnapshot({ repoAvatars: { 'acme/api': avatarUrl } }));

    const row = rowTitled('Rate-limit per tenant');
    expect(row.textContent).toContain('acme/api');
    expect(row.querySelector('img')?.src).toBe(avatarUrl);
    expect(rowTitled('Settings: org access states').textContent).not.toContain(
      'acme/web',
    );
  });

  it('never makes Needs you collapsible', () => {
    renderMyPrs();
    expect(screen.queryByRole('option', { name: /^Needs you/ })).toBeNull();
  });

  it('collapses Ready to merge with ArrowLeft, keeps its count and saves the choice', async () => {
    renderMyPrs();
    const header = sectionHeader('Ready to merge');
    header.focus();
    fireEvent.keyDown(header, { key: 'ArrowLeft' });

    expect(bridge.settings.setCollapsedSection).toHaveBeenCalledWith(
      'ready',
      true,
    );
    await waitFor(() =>
      expect(screen.queryByText('Bump OpenTelemetry to 1.31')).toBeNull(),
    );
    expect(within(sectionHeader('Ready to merge')).getByText('1')).toBeTruthy();
  });

  it('says nothing needs you when only other sections have PRs', () => {
    renderMyPrs(withoutNeedsYou());
    expect(screen.getByText('Nothing needs you.')).toBeTruthy();
    expect(rowTitled('Bump OpenTelemetry')).toBeTruthy();
  });

  it('starts Stale collapsed when there is no saved choice', () => {
    renderMyPrs(withStaleStack());
    const header = sectionHeader('Stale');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(OLD_SPLIT_PR.pr.title)).toBeNull();
  });

  it('shows the stale chip on a stale row even when CI fails, without "updated"', async () => {
    installFakeBridge({
      settings: { ...WATCHING_SETTINGS, collapsedSections: { stale: false } },
    });
    renderMyPrs(withStaleStack());
    const row = await screen.findByRole('option', {
      name: new RegExp(OLD_SPLIT_PR.pr.title),
    });

    expect(within(row).getByText('No activity for 23d')).toBeTruthy();
    expect(within(row).getByText('+1')).toBeTruthy();
    expect(row.textContent).not.toContain('updated');
  });

  it('puts kept PRs behind a collapsed Kept toggle at the bottom of Stale', async () => {
    installFakeBridge({
      settings: { ...WATCHING_SETTINGS, collapsedSections: { stale: false } },
    });
    renderMyPrs(withKeptPr(withStaleStack()));
    const toggle = await screen.findByRole('option', { name: /^Kept/ });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(KEPT_PR.pr.title)).toBeNull();
    expect(within(sectionHeader('Stale')).getByText('2')).toBeTruthy();
  });

  it('drops the selection and closes the panel when the filter hides the selected PR', async () => {
    const fake = installFakeBridge();
    renderMyPrs();
    fireEvent.click(rowTitled('Rate-limit per tenant'));
    expect(screen.getByRole('complementary')).toBeTruthy();

    act(() =>
      fake.emitSettings({
        ...WATCHING_SETTINGS,
        repoFilter: { mine: ['acme/web'], review: [] },
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText('Rate-limit per tenant on ingestion endpoints'),
      ).toBeNull(),
    );
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText(/gone on next refresh/)).toBeNull();
  });

  it('says every PR is in another repo when the filter hides them all, and shows all again', async () => {
    const { bridge: filtered } = installFakeBridge({
      settings: {
        ...WATCHING_SETTINGS,
        repos: ['acme/api', 'acme/web', 'acme/billing'],
        repoFilter: { mine: ['acme/billing'], review: [] },
      },
    });
    renderMyPrs();

    expect(
      await screen.findByText('No PRs in the selected repos.'),
    ).toBeTruthy();
    expect(screen.getByText('5 open PRs are in other repos.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show all repos' }));
    expect(filtered.settings.setRepoFilter).toHaveBeenCalledWith('mine', []);
  });

  it('renders stack layers bottom-first and labels the teammate layer', () => {
    renderMyPrs();
    const layerTitles = [
      'App shell',
      'IPC bridge and token store',
      'Settings: org access states',
      'Settings: repo picker UI',
    ].map((title) => screen.getByText(title));
    const followsPrevious = layerTitles
      .slice(1)
      .map((title, index) =>
        Boolean(
          layerTitles[index].compareDocumentPosition(title) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      );
    expect(followsPrevious).toEqual([true, true, true]);
    expect(screen.getByText('1 of 4')).toBeTruthy();
    expect(screen.getByText('Waiting on @alex')).toBeTruthy();
    expect(screen.getByText('Merged')).toBeTruthy();
  });

  it('moves with j/k across section headers and into stack layers, skipping Needs you', () => {
    renderMyPrs();
    const firstRow = rowTitled('Rate-limit per tenant');
    expect(pressFrom(firstRow, 'ArrowUp')).toBe(firstRow);
    expect(pressFrom(firstRow, 'j')?.textContent).toContain('App shell');
    expect(
      pressFrom(rowTitled('Settings: repo picker UI'), 'j')?.textContent,
    ).toContain('Ready to merge');
    expect(
      pressFrom(sectionHeader('Ready to merge'), 'j')?.textContent,
    ).toContain('Bump OpenTelemetry');
    expect(
      pressFrom(rowTitled('Bump OpenTelemetry'), 'k')?.textContent,
    ).toContain('Ready to merge');
  });

  it('keeps the list under an offline banner', () => {
    renderMyPrs(makeSnapshot({ status: 'offline' }));
    expect(screen.getByText(/^Offline · showing data from/)).toBeTruthy();
    expect(rowTitled('Bump OpenTelemetry')).toBeTruthy();
  });
});
