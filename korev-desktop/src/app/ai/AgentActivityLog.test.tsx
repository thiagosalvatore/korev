import {
  act,
  cleanup,
  fireEvent,
  render,
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

beforeEach(() => installMatchMedia());
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

const RUNNING: AgentTaskState = {
  status: 'running',
  kind: 'fix-ci',
  step: 'running',
  startedAt: '2026-10-05T10:00:00Z',
};

function renderMine(activityLog: string[]) {
  const fake = installFakeBridge({ settings: WITH_AGENT, activityLog });
  render(
    <MyPrs
      snapshot={makeSnapshot({
        mine: [
          {
            bucket: 'needs-you',
            count: 1,
            entries: [{ kind: 'pr', item: ITEM }],
          },
        ],
        agentTasks: { [REF]: RUNNING },
      })}
      onOpenSettings={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole('option', { name: /Move ingestion to the new queue/ }),
  );
  return {
    ...fake,
    panel: screen.getByRole('complementary', {
      name: 'Pull request details',
    }),
  };
}

describe('agent activity', () => {
  it('shows what the agent did so far, then each new step as it happens', async () => {
    const { bridge, panel, emitActivity } = renderMine(['$ npm test']);

    fireEvent.click(
      await within(panel).findByRole('button', { name: 'Show activity' }),
    );
    act(() => emitActivity({ ref: REF, line: 'Edit src/limits.ts' }));
    act(() => emitActivity({ ref: 'acme/api#999', line: 'Other PR' }));

    const log = within(panel).getByRole('list', { name: 'Agent activity' });
    expect(
      within(log)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['$ npm test', 'Edit src/limits.ts']);
    expect(bridge.ai.activityLog).toHaveBeenCalledWith(TARGET);
  });

  it('offers no activity before the agent has done anything', async () => {
    const { panel } = renderMine([]);
    await act(async () => undefined);

    expect(
      within(panel).queryByRole('button', { name: 'Show activity' }),
    ).toBeNull();
  });
});
