import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTaskState } from '../../shared/agent-tasks';
import type { MyPr } from '../../shared/inbox';
import type { Settings } from '../../shared/settings';
import { installFakeBridge, installMatchMedia } from '../fake-bridge';
import { MyPrs } from '../MyPrs';
import { WATCHING_SETTINGS, makePr, makeSnapshot } from '../test-fixtures';
import { renderList } from '../test-render';

const written = vi.hoisted(() => [] as string[]);

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    loadAddon() {}
    open() {}
    focus() {}
    dispose() {}
    onData() {
      return { dispose() {} };
    }
    write(data: string) {
      written.push(data);
    }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));

beforeEach(() => {
  installMatchMedia();
  written.length = 0;
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const WITH_AGENT: Settings = {
  ...WATCHING_SETTINGS,
  agent: { provider: 'claude', models: {} },
};

const ITEM: MyPr = {
  pr: makePr(320, 'Move ingestion to the new queue'),
  bucket: 'needs-you',
  reasons: [],
  queue: null,
};
const REF = 'acme/api#320';
const TARGET = { id: ITEM.pr.id, repo: 'acme/api', number: 320 };

const UNPUSHED: AgentTaskState = {
  status: 'failed',
  kind: 'fix-ci',
  message: "Korev's GitHub sign-in can't push workflow files.",
  unpushed: 'abc1234',
};

function renderMine(state: AgentTaskState) {
  const fake = installFakeBridge({ settings: WITH_AGENT });
  renderList(
    <MyPrs
      view="open"
      snapshot={makeSnapshot({
        mine: [
          {
            bucket: 'needs-you',
            count: 1,
            entries: [{ kind: 'pr', item: ITEM }],
          },
        ],
        agentTasks: { [REF]: state },
      })}
      onOpenSettings={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole('option', { name: /Move ingestion to the new queue/ }),
  );
  return fake;
}

function openRunPage() {
  const panel = screen.getByRole('complementary', {
    name: 'Pull request details',
  });
  fireEvent.click(within(panel).getByRole('button', { name: 'Open' }));
  return screen.getByRole('region', { name: 'Korev on #320' });
}

describe('terminal on a kept checkout', () => {
  it('opens a terminal in the worktree of a commit Korev could not push', async () => {
    const { bridge, emitTerminalOutput } = renderMine(UNPUSHED);

    fireEvent.click(
      within(openRunPage()).getByRole('button', { name: 'Open terminal' }),
    );

    const drawer = await screen.findByRole('region', { name: /Terminal/ });
    expect(bridge.terminal.open).toHaveBeenCalledWith(TARGET, {
      cols: 80,
      rows: 24,
    });
    await act(async () => undefined);
    act(() => emitTerminalOutput({ ref: REF, data: 'pushed\r\n' }));
    expect(written).toContain('pushed\r\n');

    fireEvent.click(
      within(drawer).getByRole('button', { name: 'End session' }),
    );
    expect(bridge.terminal.close).toHaveBeenCalledWith(TARGET);
    expect(screen.queryByRole('region', { name: /Terminal/ })).toBeNull();
  });

  it('offers no terminal after a failure that left no checkout', () => {
    renderMine({ status: 'failed', kind: 'fix-ci', message: 'Timed out' });

    expect(
      within(openRunPage()).queryByRole('button', { name: 'Open terminal' }),
    ).toBeNull();
  });
});
