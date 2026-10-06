import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxSnapshot } from '../shared/inbox';
import type { MyPrsView } from '../shared/settings';
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
import { renderList } from './test-render';

let bridge: ReturnType<typeof installFakeBridge>['bridge'];

beforeEach(() => {
  installMatchMedia();
  bridge = installFakeBridge().bridge;
});
afterEach(cleanup);

function renderMyPrs(
  snapshot: InboxSnapshot = makeSnapshot(),
  view: MyPrsView = 'open',
) {
  return renderList(
    <MyPrs view={view} snapshot={snapshot} onOpenSettings={vi.fn()} />,
  );
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

function withoutReady(): InboxSnapshot {
  const snapshot = makeSnapshot();
  return {
    ...snapshot,
    mine: snapshot.mine.filter((section) => section.bucket !== 'ready'),
  };
}

function withoutNeedsYou(): InboxSnapshot {
  const snapshot = makeSnapshot();
  return {
    ...snapshot,
    mine: snapshot.mine.filter((section) => section.bucket !== 'needs-you'),
  };
}

describe('MyPrs', () => {
  it('shows the open sections in display order and leaves ready and stale PRs out', () => {
    renderMyPrs(withStaleStack());
    const groups = screen
      .getAllByRole('group')
      .map((group) => group.getAttribute('aria-label'))
      .filter((label) => !label?.startsWith('Stack'));
    expect(groups).toEqual(['Needs you', 'In progress']);
    expect(
      screen.getByRole('heading', { name: 'Needs you, 3 pull requests' }),
    ).toBeTruthy();
    expect(sectionHeader('In progress, 1 pull request')).toBeTruthy();
    expect(screen.queryByText('Bump OpenTelemetry to 1.31')).toBeNull();
    expect(screen.queryByText(OLD_SPLIT_PR.pr.title)).toBeNull();
  });

  it('lists only ready PRs in Ready to merge, without a section header', () => {
    renderMyPrs(withStaleStack(), 'ready');
    expect(rowTitled('Bump OpenTelemetry')).toBeTruthy();
    expect(screen.queryByText('Retry flaky exporter on 502')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Ready to merge' })).toBeNull();
  });

  it('says nothing is ready to merge when no PR is ready', () => {
    renderMyPrs(withoutReady(), 'ready');
    expect(screen.getByText('Nothing ready to merge.')).toBeTruthy();
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

  it('collapses In progress with ArrowLeft, keeps its count and saves the choice', async () => {
    renderMyPrs();
    const header = sectionHeader('In progress');
    header.focus();
    fireEvent.keyDown(header, { key: 'ArrowLeft' });

    expect(bridge.settings.setCollapsedSection).toHaveBeenCalledWith(
      'in-progress',
      true,
    );
    await waitFor(() =>
      expect(screen.queryByText('Retry flaky exporter on 502')).toBeNull(),
    );
    expect(within(sectionHeader('In progress')).getByText('1')).toBeTruthy();
  });

  it('says nothing needs you when only other sections have PRs', () => {
    renderMyPrs(withoutNeedsYou());
    expect(screen.getByText('Nothing needs you.')).toBeTruthy();
    expect(rowTitled('Retry flaky exporter')).toBeTruthy();
  });

  it('shows the stale chip on a stale row even when CI fails, without "updated"', () => {
    renderMyPrs(withStaleStack(), 'stale');
    const row = rowTitled(OLD_SPLIT_PR.pr.title);

    expect(within(row).getByText('No activity for 23d')).toBeTruthy();
    expect(within(row).getByText('+1')).toBeTruthy();
    expect(row.textContent).not.toContain('updated');
  });

  it('puts kept PRs behind a collapsed Kept toggle below the stale PRs', () => {
    renderMyPrs(withKeptPr(withStaleStack()), 'stale');
    const toggle = screen.getByRole('option', { name: /^Kept/ });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(KEPT_PR.pr.title)).toBeNull();
    expect(
      rowTitled(OLD_SPLIT_PR.pr.title).compareDocumentPosition(toggle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows the Kept toggle in Stale even when no PR is stale', () => {
    renderMyPrs(withKeptPr(), 'stale');
    expect(screen.getByRole('option', { name: /^Kept/ })).toBeTruthy();
    expect(screen.queryByText('No stale PRs.')).toBeNull();
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
    expect(screen.getByText('4 open PRs are in other repos.')).toBeTruthy();
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
    ).toContain('In progress');
    expect(pressFrom(sectionHeader('In progress'), 'j')?.textContent).toContain(
      'Retry flaky exporter',
    );
    expect(
      pressFrom(rowTitled('Retry flaky exporter'), 'k')?.textContent,
    ).toContain('In progress');
  });

  it('keeps the list under an offline banner', () => {
    renderMyPrs(makeSnapshot({ status: 'offline' }));
    expect(screen.getByText(/^Offline · showing data from/)).toBeTruthy();
    expect(rowTitled('Retry flaky exporter')).toBeTruthy();
  });
});
