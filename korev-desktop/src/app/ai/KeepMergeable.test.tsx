import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { renderList } from '../test-render';

beforeEach(() => installMatchMedia());
afterEach(cleanup);

const LINT_REF = `${LINT_PR.pr.repo}#${LINT_PR.pr.number}`;

function withAi(aiTasks: Partial<Settings['aiTasks']> = {}): Settings {
  return {
    ...WATCHING_SETTINGS,
    agent: { provider: 'claude', models: {} },
    aiTasks: { ...WATCHING_SETTINGS.aiTasks, ...aiTasks },
  };
}

function renderMine(settings: Settings) {
  const { bridge } = installFakeBridge({ settings });
  renderList(
    <MyPrs view="open" snapshot={makeSnapshot()} onOpenSettings={vi.fn()} />,
  );
  return bridge;
}

function openLintPr() {
  fireEvent.click(
    screen.getByRole('option', { name: new RegExp(LINT_PR.pr.title) }),
  );
  return screen.getByRole('complementary', { name: 'Pull request details' });
}

describe('Keep mergeable', () => {
  it('explains what Korev will do the first time it is turned on', async () => {
    const bridge = renderMine(withAi());
    const panel = openLintPr();

    fireEvent.click(
      await within(panel).findByRole('switch', { name: 'Keep mergeable' }),
    );
    const intro = screen.getByRole('dialog', {
      name: `Keep #${LINT_PR.pr.number} mergeable?`,
    });
    expect(within(intro).getByText('Never force-pushes')).toBeTruthy();
    fireEvent.click(within(intro).getByRole('button', { name: 'Turn on' }));

    expect(bridge.settings.setAiTasks).toHaveBeenCalledWith({
      keepMergeableIntroSeen: true,
      keepMergeable: { allMine: false, prs: { [LINT_REF]: true } },
    });
  });

  it('turns one PR off with ⇧A while all PRs are kept mergeable', async () => {
    const bridge = renderMine(
      withAi({
        keepMergeableIntroSeen: true,
        keepMergeable: { allMine: true, prs: {} },
      }),
    );
    expect(
      (await screen.findAllByText(/Keep mergeable/)).length,
    ).toBeGreaterThan(0);
    openLintPr();

    fireEvent.keyDown(window, { key: 'A', shiftKey: true });

    expect(bridge.settings.setAiTasks).toHaveBeenCalledWith({
      keepMergeableIntroSeen: true,
      keepMergeable: { allMine: true, prs: { [LINT_REF]: false } },
    });
  });

  it('keeps every PR mergeable from Settings', () => {
    const settings = withAi({ keepMergeableIntroSeen: true });
    const { bridge } = installFakeBridge({ settings });
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

    fireEvent.click(
      screen.getByRole('switch', { name: 'Keep all my PRs mergeable' }),
    );

    expect(bridge.settings.setAiTasks).toHaveBeenCalledWith({
      keepMergeableIntroSeen: true,
      keepMergeable: { allMine: true, prs: {} },
    });
  });
});
