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
import { AppShell } from '../AppShell';
import { MyPrs } from '../MyPrs';
import {
  CONNECTED_AUTH,
  WATCHING_SETTINGS,
  makePr,
  makeSnapshot,
} from '../test-fixtures';

beforeEach(() => installMatchMedia());
afterEach(cleanup);

const WITH_AGENT: Settings = {
  ...WATCHING_SETTINGS,
  agent: { provider: 'claude', models: {} },
};

function conflicted(overrides: Partial<MyPr['pr']> = {}): MyPr {
  return {
    pr: makePr(320, 'Move ingestion to the new queue', overrides),
    bucket: 'needs-you',
    reasons: [
      { code: 'conflicts', label: 'Merge conflicts', severity: 'danger' },
    ],
    queue: null,
  };
}

const ITEM = conflicted();
const REF = 'acme/api#320';
const TARGET = { id: ITEM.pr.id, repo: 'acme/api', number: 320 };

const WAITING: AgentTaskState = {
  status: 'needs-input',
  kind: 'fix-conflicts',
  questions: [
    {
      id: 'q1',
      question: 'Which timeout wins?',
      context: 'worker.ts: 30s (this PR) or 60s (main)',
    },
    {
      id: 'q2',
      question: 'Keep the old retry helper?',
      context: 'retry.ts was deleted on main',
    },
  ],
};

function renderMine(
  item: MyPr = ITEM,
  agentTasks: Record<string, AgentTaskState> = {},
) {
  const fake = installFakeBridge({ settings: WITH_AGENT });
  render(
    <MyPrs
      snapshot={makeSnapshot({
        mine: [
          {
            bucket: 'needs-you',
            count: 1,
            entries: [{ kind: 'pr', item }],
          },
        ],
        agentTasks,
      })}
      onOpenSettings={vi.fn()}
    />,
  );
  return fake;
}

function openPanel() {
  fireEvent.click(
    screen.getByRole('option', { name: /Move ingestion to the new queue/ }),
  );
  return screen.getByRole('complementary', { name: 'Pull request details' });
}

describe('fixes in the Korev AI section', () => {
  it('offers the fix that matches each reason', async () => {
    const { bridge } = renderMine();
    const panel = openPanel();

    const fix = await within(panel).findByRole('button', {
      name: 'Fix conflicts',
    });
    expect(within(panel).getAllByText('Merge conflicts')).toHaveLength(2);
    fireEvent.click(fix);

    expect(bridge.ai.start).toHaveBeenCalledWith(TARGET, 'fix-conflicts');
  });

  it('disables fixes on a fork that does not allow maintainer edits, and says why', async () => {
    renderMine(
      conflicted({ isCrossRepository: true, maintainerCanModify: false }),
    );
    const panel = openPanel();

    const button = (await within(panel).findByRole('button', {
      name: 'Fix conflicts',
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(
      within(panel).getByText(/didn't allow edits from maintainers/),
    ).toBeTruthy();
  });
});

describe('Fix CI', () => {
  const failing: MyPr = {
    ...ITEM,
    reasons: [
      { code: 'checks-failing', label: 'Lint failing', severity: 'danger' },
    ],
  };

  it('offers Fix CI for failing checks', async () => {
    const { bridge } = renderMine(failing);

    fireEvent.click(
      await within(openPanel()).findByRole('button', { name: 'Fix CI' }),
    );

    expect(bridge.ai.start).toHaveBeenCalledWith(TARGET, 'fix-ci');
  });

  it('offers to re-run the failed jobs when the agent found nothing to fix', async () => {
    const { bridge } = renderMine(failing, {
      [REF]: {
        status: 'done',
        kind: 'fix-ci',
        summary: 'The runner timed out',
        commits: [],
        rerunRunIds: [9],
        finishedAt: '2026-10-04T10:00:00.000Z',
      },
    });
    const panel = openPanel();

    expect(
      await within(panel).findByText('Last Korev run · The runner timed out'),
    ).toBeTruthy();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Re-run failed jobs' }),
    );

    expect(bridge.ai.rerunFailedJobs).toHaveBeenCalledWith(TARGET);
  });
});

describe('questions from Korev', () => {
  it('sends the answers only once every question has one', async () => {
    const { bridge } = renderMine(ITEM, { [REF]: WAITING });
    const panel = openPanel();
    const send = within(panel).getByRole('button', {
      name: /Send answers/,
    }) as HTMLButtonElement;
    const [first, second] = within(panel).getAllByLabelText('Your answer');

    expect(within(panel).getByText(WAITING.questions[0].context)).toBeTruthy();
    fireEvent.change(first, { target: { value: '60s' } });
    expect(send.disabled).toBe(true);

    fireEvent.change(second, { target: { value: 'No, drop it' } });
    fireEvent.click(send);

    expect(bridge.ai.answer).toHaveBeenCalledWith(TARGET, {
      q1: '60s',
      q2: 'No, drop it',
    });
  });

  it("drops the task when the user says they'll do it", () => {
    const { bridge } = renderMine(ITEM, { [REF]: WAITING });

    fireEvent.click(
      within(openPanel()).getByRole('button', { name: "I'll do it myself" }),
    );

    expect(bridge.ai.dismiss).toHaveBeenCalledWith(TARGET);
  });

  it('opens the PR a notification points at, in its view', async () => {
    const { emitFocusPr } = installFakeBridge({
      settings: { ...WITH_AGENT, lastView: 'review' },
      snapshot: makeSnapshot({
        mine: [
          {
            bucket: 'needs-you',
            count: 1,
            entries: [{ kind: 'pr', item: ITEM }],
          },
        ],
        agentTasks: { [REF]: WAITING },
      }),
    });
    render(
      <AppShell
        auth={CONNECTED_AUTH}
        settings={{ ...WITH_AGENT, lastView: 'review' }}
      />,
    );
    await screen.findByText('Review requests', { selector: 'h1' });

    act(() => emitFocusPr(REF));

    const panel = await screen.findByRole('complementary', {
      name: 'Pull request details',
    });
    expect(within(panel).getByText('Korev needs your answer')).toBeTruthy();
  });
});
