import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTaskState } from '../../shared/agent-tasks';
import type { Settings } from '../../shared/settings';
import { installFakeBridge, installMatchMedia } from '../fake-bridge';
import { MyPrs } from '../MyPrs';
import { SettingsPage } from '../Settings';
import {
  CONNECTED_AUTH,
  LINT_PR,
  WATCHING_SETTINGS,
  makeSnapshot,
} from '../test-fixtures';

beforeEach(() => installMatchMedia());
afterEach(cleanup);

const LINT_REF = `${LINT_PR.pr.repo}#${LINT_PR.pr.number}`;
const LINT_TARGET = {
  id: LINT_PR.pr.id,
  repo: LINT_PR.pr.repo,
  number: LINT_PR.pr.number,
};
const WITH_AGENT: Settings = {
  ...WATCHING_SETTINGS,
  agent: { provider: 'claude', models: {} },
};
const EXPLAINING: AgentTaskState = {
  status: 'running',
  kind: 'explain',
  step: 'running',
  startedAt: '2026-10-03T14:00:00.000Z',
};

function renderMine(
  options: Parameters<typeof installFakeBridge>[0] = {},
  agentTasks: Record<string, AgentTaskState> = {},
) {
  const fake = installFakeBridge({ settings: WITH_AGENT, ...options });
  render(
    <MyPrs snapshot={makeSnapshot({ agentTasks })} onOpenSettings={vi.fn()} />,
  );
  return fake.bridge;
}

function openLintPr() {
  fireEvent.click(
    screen.getByRole('option', { name: new RegExp(LINT_PR.pr.title) }),
  );
  return screen.getByRole('complementary', { name: 'Pull request details' });
}

describe('Korev AI in the panel', () => {
  it('asks to set up an agent before offering AI actions', async () => {
    renderMine({ settings: WATCHING_SETTINGS });

    const panel = openLintPr();

    expect(
      await within(panel).findByText(
        'Set up Claude Code or Codex to use Korev AI',
      ),
    ).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: /Explain/ })).toBeNull();
  });

  it('opens the explanation in a sandboxed reader', async () => {
    const bridge = renderMine({
      explanation: {
        headOid: 'abc1234def',
        body: '<h1>Why this PR</h1>',
        stale: false,
      },
    });
    const panel = openLintPr();

    fireEvent.click(
      await within(panel).findByRole('button', { name: /Explain/ }),
    );

    expect(bridge.ai.explain).toHaveBeenCalledWith(LINT_TARGET, false);
    const reader = await screen.findByRole('dialog');
    const frame = await within(reader).findByTitle(
      `Explanation of #${LINT_PR.pr.number}`,
    );
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<h1>Why this PR</h1>');
  });

  it('warns when the PR changed since the explanation and regenerates it', async () => {
    const bridge = renderMine({
      explanation: { headOid: '0ldhead00', body: '<p>Old</p>', stale: true },
    });
    fireEvent.click(
      await within(openLintPr()).findByRole('button', { name: /Explain/ }),
    );

    const reader = await screen.findByRole('dialog');
    fireEvent.click(
      await within(reader).findByRole('button', { name: 'Regenerate' }),
    );

    expect(
      within(reader).getByText(/This PR changed since this explanation/),
    ).toBeTruthy();
    expect(bridge.ai.explain).toHaveBeenLastCalledWith(LINT_TARGET, true);
  });

  it('shows the running task on the row and lets the panel stop it', async () => {
    const bridge = renderMine({}, { [LINT_REF]: EXPLAINING });

    expect(screen.getByText('Explaining…')).toBeTruthy();
    const panel = openLintPr();
    expect(
      (
        (await within(panel).findByRole('button', {
          name: /Explain/,
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(within(panel).getByRole('button', { name: 'Stop' }));

    expect(bridge.ai.cancel).toHaveBeenCalledWith(LINT_TARGET);
  });
});

describe('Settings → AI tasks', () => {
  function openAiTasks(settings: Settings = WITH_AGENT) {
    const { bridge } = installFakeBridge({ settings, checkoutsSize: 3 << 20 });
    render(
      <SettingsPage
        auth={CONNECTED_AUTH}
        settings={settings}
        snapshot={makeSnapshot()}
      />,
    );
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Settings' })).getByRole(
        'button',
        { name: 'AI tasks' },
      ),
    );
    return bridge;
  }

  it('saves the explain format', () => {
    const bridge = openAiTasks();

    fireEvent.click(screen.getByLabelText('Text (Markdown)'));

    expect(bridge.settings.setAiTasks).toHaveBeenCalledWith({
      explainFormat: 'markdown',
    });
  });

  it('saves edited instructions and drops a custom one on reset', () => {
    const bridge = openAiTasks({
      ...WITH_AGENT,
      aiTasks: {
        ...WITH_AGENT.aiTasks,
        notify: true,
        explainFormat: 'html',
        instructions: { explain: '/pr-review' },
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Explain' }));
    const box = screen.getByLabelText(/Instructions for Explain/);
    expect((box as HTMLTextAreaElement).value).toBe('/pr-review');

    fireEvent.change(box, { target: { value: '/pr-review --short' } });
    fireEvent.blur(box);

    expect(bridge.settings.setAiTasks).toHaveBeenLastCalledWith({
      instructions: { explain: '/pr-review --short' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    expect(bridge.settings.setAiTasks).toHaveBeenLastCalledWith({
      instructions: {},
    });
  });

  it('shows how much disk the checkouts use and removes them', async () => {
    const bridge = openAiTasks();

    expect(await screen.findByText(/3\.0 MB/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove checkouts' }));

    expect(bridge.ai.removeCheckouts).toHaveBeenCalled();
  });
});
