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

function myPrsWith(item: MyPr, agentTasks: Record<string, AgentTaskState>) {
  return (
    <MyPrs
      view="open"
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
    />
  );
}

function renderMine(
  item: MyPr = ITEM,
  agentTasks: Record<string, AgentTaskState> = {},
) {
  const fake = installFakeBridge({ settings: WITH_AGENT });
  const { rerender } = render(myPrsWith(item, agentTasks));
  return {
    ...fake,
    settle: (settled: Record<string, AgentTaskState>) =>
      rerender(myPrsWith(item, settled)),
  };
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

  const NOTHING_TO_FIX: Record<string, AgentTaskState> = {
    [REF]: {
      status: 'done',
      kind: 'fix-ci',
      summary: 'The runner timed out',
      commits: [],
      rerunRunIds: [9],
      finishedAt: '2026-10-04T10:00:00.000Z',
    },
  };

  async function clickRerun() {
    const panel = openPanel();
    expect(
      await within(panel).findByText('Last Korev run · The runner timed out'),
    ).toBeTruthy();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Re-run failed jobs' }),
    );
  }

  it('offers to re-run the failed jobs when the agent found nothing to fix', async () => {
    const { bridge } = renderMine(failing, NOTHING_TO_FIX);

    await clickRerun();

    expect(bridge.ai.rerunFailedJobs).toHaveBeenCalledWith(TARGET);
    expect(
      await screen.findByText('Re-running failed jobs on #320'),
    ).toBeTruthy();
  });

  it('shows why GitHub refused to re-run the failed jobs', async () => {
    const { bridge } = renderMine(failing, NOTHING_TO_FIX);
    vi.mocked(bridge.ai.rerunFailedJobs).mockResolvedValue({
      ok: false,
      message: 'Resource not accessible by integration',
    });

    await clickRerun();

    expect(
      await screen.findByText('Resource not accessible by integration'),
    ).toBeTruthy();
  });
  it('says plainly that there was nothing to fix when no check was failing', async () => {
    const { settle } = renderMine(failing, {
      [REF]: {
        status: 'running',
        kind: 'fix-ci',
        step: 'preparing',
        startedAt: '2026-10-04T10:00:00.000Z',
      },
    });

    settle({
      [REF]: {
        status: 'done',
        kind: 'fix-ci',
        summary: 'No checks are failing on this PR right now.',
        commits: [],
        nothingToDo: true,
        finishedAt: '2026-10-04T10:00:05.000Z',
      },
    });

    expect(
      await screen.findByText(
        'Fix CI on #320 · No checks are failing on this PR right now.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Fixed CI on/)).toBeNull();
  });
});

describe('Korev activity', () => {
  it('lists what Korev did on the PR, with links to its commits', async () => {
    installFakeBridge({ settings: WITH_AGENT });
    render(
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
          agentHistory: {
            [REF]: [
              {
                kind: 'fix-conflicts',
                outcome: 'done',
                summary: 'Kept both timeouts',
                commits: ['abc1234def'],
                finishedAt: '2026-10-03T13:00:00.000Z',
              },
            ],
          },
        })}
        onOpenSettings={vi.fn()}
      />,
    );
    const panel = openPanel();
    fireEvent.click(
      await within(panel).findByRole('tab', { name: /Activity/ }),
    );

    expect(within(panel).queryByText('Checks')).toBeNull();
    expect(await within(panel).findByText('Kept both timeouts')).toBeTruthy();
    expect(
      within(panel).getByRole('link', { name: 'abc1234' }).getAttribute('href'),
    ).toBe('https://github.com/acme/api/commit/abc1234def');
  });
});

function runPage() {
  return screen.getByRole('region', { name: 'Korev on #320' });
}

function answerQuestions() {
  fireEvent.click(
    within(openPanel()).getByRole('button', { name: 'Answer questions' }),
  );
  return runPage();
}

describe('the Korev run page', () => {
  it('opens when a fix starts and shows what the agent does as it happens', async () => {
    const { emitActivity } = renderMine();
    fireEvent.click(
      await within(openPanel()).findByRole('button', { name: 'Fix conflicts' }),
    );

    act(() =>
      emitActivity({
        ref: REF,
        entry: {
          at: '2026-10-04T10:00:00.000Z',
          kind: 'step',
          text: 'Read worker.ts',
        },
      }),
    );

    const log = within(runPage()).getByRole('log');
    expect(within(log).getByText('Read worker.ts')).toBeTruthy();
  });

  it('goes back to the list on Esc', () => {
    renderMine(ITEM, { [REF]: WAITING });
    answerQuestions();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('region', { name: 'Korev on #320' })).toBeNull();
    expect(
      screen.getByRole('option', { name: /Move ingestion to the new queue/ }),
    ).toBeTruthy();
  });
});

describe('questions from Korev', () => {
  it('asks one question at a time and sends the answers once every question has one', () => {
    const { bridge } = renderMine(ITEM, { [REF]: WAITING });
    const page = answerQuestions();
    const next = () => within(page).getByRole('button', { name: /Next/ });

    expect(within(page).getByText('Question 1 of 2')).toBeTruthy();
    expect(within(page).getByText(WAITING.questions[0].context)).toBeTruthy();
    expect((next() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(page).getByLabelText('Your answer'), {
      target: { value: '60s' },
    });
    fireEvent.click(next());

    expect(within(page).getByText('Keep the old retry helper?')).toBeTruthy();
    const send = within(page).getByRole('button', {
      name: /Send answers/,
    }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(within(page).getByRole('button', { name: 'Back' }));
    expect(
      (within(page).getByLabelText('Your answer') as HTMLTextAreaElement).value,
    ).toBe('60s');
    fireEvent.click(next());
    fireEvent.change(within(page).getByLabelText('Your answer'), {
      target: { value: 'No, drop it' },
    });
    fireEvent.click(within(page).getByRole('button', { name: /Send answers/ }));

    expect(bridge.ai.answer).toHaveBeenCalledWith(TARGET, {
      q1: '60s',
      q2: 'No, drop it',
    });
  });

  it("drops the task when the user says they'll do it", () => {
    const { bridge } = renderMine(ITEM, { [REF]: WAITING });

    fireEvent.click(
      within(answerQuestions()).getByRole('button', {
        name: "I'll do it myself",
      }),
    );

    expect(bridge.ai.dismiss).toHaveBeenCalledWith(TARGET);
  });

  it('opens the questions a notification points at, in its view', async () => {
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

    const page = await screen.findByRole('region', { name: 'Korev on #320' });
    expect(within(page).getByText('Which timeout wins?')).toBeTruthy();
  });
});
