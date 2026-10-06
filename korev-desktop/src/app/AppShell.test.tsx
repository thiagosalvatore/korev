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
import type { AgentTaskState, ExplanationView } from '../shared/agent-tasks';
import {
  CONNECTED_AUTH,
  INVOICE_REVIEW,
  OTEL_PR,
  SYNCED_AT,
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

const OTEL_REF = prRef(OTEL_PR.pr);

const FIXING_CI: AgentTaskState = {
  status: 'running',
  kind: 'fix-ci',
  step: 'running',
  startedAt: SYNCED_AT,
};

const ASKING: AgentTaskState = {
  status: 'needs-input',
  kind: 'fix-ci',
  questions: [{ id: 'q1', question: 'Pin the version?', context: '' }],
};

const FIXED: AgentTaskState = {
  status: 'done',
  kind: 'fix-ci',
  summary: 'Fixed the lint step',
  commits: ['abc1234'],
  finishedAt: SYNCED_AT,
};

async function openKorevTask(name: RegExp) {
  const nav = await screen.findByRole('navigation', { name: 'Korev' });
  fireEvent.click(within(nav).getByRole('button', { name }));
}

const WITH_AGENT = {
  ...WATCHING_SETTINGS,
  agent: { provider: 'claude' as const, models: {} },
};

const OTEL_TARGET = { id: OTEL_PR.pr.id, repo: 'acme/api', number: 480 };

async function openOtelPage(explanation: ExplanationView | null = null) {
  const fake = installFakeBridge({ settings: WITH_AGENT, explanation });
  render(<AppShell auth={CONNECTED_AUTH} settings={WITH_AGENT} />);
  await screen.findByLabelText('1 ready to merge');
  act(() => fake.emitCommand('show-ready'));
  fireEvent.click(
    screen.getByRole('option', { name: /Bump OpenTelemetry to 1\.31/ }),
  );
  fireEvent.keyDown(document.body, { key: 'o' });
  return fake.bridge;
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

  it('lists what Korev is working on in the sidebar and opens the run from it', async () => {
    renderShell(
      makeSnapshot({
        agentTasks: {
          [OTEL_REF]: FIXING_CI,
          [prRef(INVOICE_REVIEW.pr)]: FIXED,
        },
      }),
    );

    await openKorevTask(/#480 Bump OpenTelemetry to 1\.31.*Fixing CI/);

    expect(screen.getByRole('region', { name: 'Korev on #480' })).toBeTruthy();
    expect(viewTitle()).toBe('Ready to merge');
    expect(
      within(screen.getByRole('navigation', { name: 'Korev' })).queryByText(
        /#91/,
      ),
    ).toBeNull();
  });

  it('comes back to the open panel when Esc leaves the run page', async () => {
    renderShell(makeSnapshot({ agentTasks: { [OTEL_REF]: FIXING_CI } }));
    await openKorevTask(/#480/);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(screen.queryByRole('region', { name: 'Korev on #480' })).toBeNull();
    expect(
      screen.getByRole('complementary', { name: 'Pull request details' }),
    ).toBeTruthy();
  });

  it('opens the PR page with o and keeps the PR details beside it', async () => {
    await openOtelPage();

    expect(screen.getByRole('region', { name: 'Korev on #480' })).toBeTruthy();
    expect(
      screen.getByRole('complementary', { name: 'Pull request details' }),
    ).toBeTruthy();
  });

  it('shows a saved explanation in the Explain tab without starting a new one', async () => {
    const bridge = await openOtelPage({
      headOid: 'abc1234def5678',
      body: '<h2>What changes</h2>',
      stale: false,
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Explain' }));

    expect(await screen.findByTitle('Explanation of #480')).toBeTruthy();
    expect(bridge.ai.explain).not.toHaveBeenCalled();
  });

  it('starts an explanation from the Explain tab when none is saved', async () => {
    const bridge = await openOtelPage();

    fireEvent.click(screen.getByRole('tab', { name: 'Explain' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Explain this PR' }),
    );

    expect(bridge.ai.explain).toHaveBeenCalledWith(OTEL_TARGET, false);
  });

  it('keeps typed answers when the user leaves the run page for another view', async () => {
    const { emitCommand } = renderShell(
      makeSnapshot({ agentTasks: { [OTEL_REF]: ASKING } }),
    );
    await openKorevTask(/#480.*Needs your answer/);
    fireEvent.change(screen.getByLabelText('Your answer'), {
      target: { value: 'Yes, pin 1.31' },
    });

    act(() => emitCommand('show-review'));
    expect(screen.queryByRole('region', { name: 'Korev on #480' })).toBeNull();
    await openKorevTask(/#480/);

    expect(
      (screen.getByLabelText('Your answer') as HTMLTextAreaElement).value,
    ).toBe('Yes, pin 1.31');
  });

  it('puts the Settings sections in the sidebar and goes back to the last view', () => {
    const { emitCommand } = renderShell();
    act(() => emitCommand('show-ready'));
    act(() => emitCommand('show-settings'));

    expect(screen.queryByRole('navigation', { name: 'My PRs' })).toBeNull();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Settings' })).getByRole(
        'button',
        { name: 'AI agents' },
      ),
    );
    expect(screen.getByText(/Korev runs AI tasks/)).toBeTruthy();
    expect(screen.queryByLabelText('acme/api')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to inbox' }));
    expect(viewTitle()).toBe('Ready to merge');
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
