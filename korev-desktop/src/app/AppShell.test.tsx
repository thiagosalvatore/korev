import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import { installFakeBridge, installMatchMedia } from './fake-bridge';
import type { InboxSnapshot } from '../shared/inbox';
import { prRef } from '../shared/pr-ref';
import {
  CONNECTED_AUTH,
  OTEL_PR,
  WATCHING_SETTINGS,
  makeSnapshot,
  withKeptPr,
  withStaleStack,
} from './test-fixtures';

beforeEach(() => installMatchMedia());
afterEach(cleanup);

function renderShell(snapshot?: InboxSnapshot, settings = WATCHING_SETTINGS) {
  const fake = installFakeBridge({ snapshot, settings });
  render(<AppShell auth={CONNECTED_AUTH} settings={WATCHING_SETTINGS} />);
  return fake;
}

function viewTitle(): string {
  return screen.getByRole('heading', { level: 1 }).textContent ?? '';
}

describe('AppShell', () => {
  it('switches view on the show-ready app command', () => {
    const { emitCommand } = renderShell();
    expect(viewTitle()).toBe('Review requests');
    act(() => emitCommand('show-ready'));
    expect(viewTitle()).toBe('Ready to merge');
  });

  it('counts what each of my PR views holds in the sidebar, leaving kept PRs out of Stale', async () => {
    renderShell(withKeptPr(withStaleStack()));
    expect(await screen.findByLabelText('3 need you')).toBeTruthy();
    expect(screen.getByLabelText('1 ready to merge')).toBeTruthy();
    expect(screen.getByLabelText('2 stale')).toBeTruthy();
  });

  it('opens the view that holds the PR a notification points at', async () => {
    const { emitFocusPr } = renderShell();
    await screen.findByLabelText('1 ready to merge');
    act(() => emitFocusPr(prRef(OTEL_PR.pr)));
    expect(viewTitle()).toBe('Ready to merge');
  });

  it('ignores the ? shortcut while a text field has focus', () => {
    const { emitCommand } = renderShell();
    act(() => emitCommand('show-settings'));
    fireEvent.click(screen.getByRole('button', { name: 'Repositories' }));
    const filter = screen.getByLabelText('Filter repos');
    filter.focus();

    fireEvent.keyDown(filter, { key: '?' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.keyDown(document.body, { key: '?' });
    expect(
      screen.getByRole('dialog', { name: 'Keyboard shortcuts' }),
    ).toBeTruthy();
  });

  it('sums up Open by section in display order, leaving out other views', async () => {
    const { emitCommand } = renderShell(withStaleStack());
    act(() => emitCommand('show-open'));

    expect(await screen.findByText('3 need you · 1 in progress')).toBeTruthy();
  });

  it('says nothing is ready to merge when the view is empty', async () => {
    const { emitCommand } = renderShell(makeSnapshot({ mine: [] }));
    act(() => emitCommand('show-ready'));

    expect(await screen.findByText('Nothing ready to merge')).toBeTruthy();
  });

  it('counts stale PRs in the Stale summary but leaves kept PRs out', async () => {
    const { emitCommand } = renderShell(withKeptPr(withStaleStack()));
    act(() => emitCommand('show-stale'));

    expect(await screen.findByText('2 stale')).toBeTruthy();
  });

  it('jumps to a PR found by number in the command palette and opens its details', async () => {
    const { emitCommand } = renderShell();
    await screen.findByLabelText('1 ready to merge');
    act(() => emitCommand('show-palette'));

    const search = screen.getByRole('combobox', { name: 'Go to' });
    fireEvent.change(search, { target: { value: '#480' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(viewTitle()).toBe('Ready to merge');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      within(
        screen.getByRole('complementary', { name: 'Pull request details' }),
      ).getByText('Bump OpenTelemetry to 1.31'),
    ).toBeTruthy();
  });

  it('runs the highlighted command when arrows move through the palette matches', () => {
    const { emitCommand } = renderShell();
    act(() => emitCommand('show-palette'));

    const search = screen.getByRole('combobox', { name: 'Go to' });
    fireEvent.change(search, { target: { value: 're' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const highlighted = screen.getByRole('option', { selected: true });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(highlighted.textContent).toContain(viewTitle());
    expect(viewTitle()).not.toBe('Review requests');
  });

  it('filters the list and the topbar to the chosen repos while the sidebar counts every repo', async () => {
    const { emitCommand } = renderShell(undefined, {
      ...WATCHING_SETTINGS,
      repoFilter: { mine: ['acme/web'], review: [] },
    });
    act(() => emitCommand('show-open'));

    expect(await screen.findByText('2 need you · filtered')).toBeTruthy();
    expect(
      screen.queryByText('Rate-limit per tenant on ingestion endpoints'),
    ).toBeNull();
    expect(screen.getByText('Settings: org access states')).toBeTruthy();
    expect(screen.getByLabelText('3 need you')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Repo filter, 1 of 2 repos' }),
    ).toBeTruthy();
  });
});
