import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTaskState, ReviewDraft } from '../../shared/agent-tasks';
import type { Settings } from '../../shared/settings';
import { installFakeBridge, installMatchMedia } from '../fake-bridge';
import { ReviewInbox } from '../ReviewInbox';
import {
  INVOICE_REVIEW,
  WATCHING_SETTINGS,
  makeSnapshot,
} from '../test-fixtures';

beforeEach(() => installMatchMedia());
afterEach(cleanup);

const { pr } = INVOICE_REVIEW;
const REF = `${pr.repo}#${pr.number}`;
const TARGET = { id: pr.id, repo: pr.repo, number: pr.number };
const WITH_AGENT: Settings = {
  ...WATCHING_SETTINGS,
  agent: { provider: 'claude', models: {} },
};

function comment(id: string, line: number, body: string) {
  return {
    id,
    path: 'billing/retry.ts',
    line,
    body,
    severity: 'high' as const,
    contextStart: line - 1,
    context: ['const a = 1;', 'charge(invoice);', 'const b = 2;'],
    status: 'open' as const,
  };
}

const DRAFT: ReviewDraft = {
  headOid: 'f00d',
  summary: 'Two problems with retries.',
  event: 'COMMENT',
  comments: [
    comment('c1', 12, 'This charges twice on retry.'),
    comment('c2', 30, 'Unused import.'),
  ],
};

function doneWith(review: ReviewDraft): AgentTaskState {
  return {
    status: 'done',
    kind: 'review',
    summary: review.summary,
    commits: [],
    review,
    finishedAt: '2026-10-04T10:00:00.000Z',
  };
}

async function openDraft(review: ReviewDraft) {
  const { bridge } = installFakeBridge({ settings: WITH_AGENT });
  const { rerender } = render(
    <ReviewInbox
      snapshot={makeSnapshot({ agentTasks: { [REF]: doneWith(review) } })}
      onOpenSettings={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('option', { name: new RegExp(pr.title) }));
  const panel = screen.getByRole('complementary', {
    name: 'Pull request details',
  });
  fireEvent.click(
    await within(panel).findByRole('button', { name: 'Open review draft' }),
  );
  return {
    bridge,
    rerender,
    page: screen.getByRole('region', { name: `Korev on #${pr.number}` }),
  };
}

describe('review draft', () => {
  it('submits the kept comments as a comment, never offering Approve', async () => {
    const { bridge, page } = await openDraft(DRAFT);
    const [, second] = within(page).getAllByRole('button', {
      name: 'Dismiss',
    });

    fireEvent.click(second);
    fireEvent.change(within(page).getByLabelText('Summary'), {
      target: { value: 'One problem with retries.' },
    });
    fireEvent.click(
      within(page).getByRole('button', { name: 'Submit as comment' }),
    );

    expect(within(page).queryByRole('button', { name: /Approve/ })).toBeNull();
    expect(within(page).getByText('1 of 2 comments')).toBeTruthy();
    expect(bridge.ai.submitReview).toHaveBeenCalledWith(TARGET, {
      summary: 'One problem with retries.',
      event: 'COMMENT',
      comments: [
        {
          path: 'billing/retry.ts',
          line: 12,
          body: 'This charges twice on retry.',
        },
      ],
    });
  });

  it('says there is nothing to flag when the review found nothing', async () => {
    const { page } = await openDraft({ ...DRAFT, comments: [] });

    expect(within(page).getByText('Nothing to flag.')).toBeTruthy();
    expect(
      within(page).getByRole('button', { name: 'Submit as comment' }),
    ).toBeTruthy();
  });

  it('does not save the draft back once it is submitted', async () => {
    const { bridge, rerender, page } = await openDraft(DRAFT);
    const submitted: AgentTaskState = {
      status: 'done',
      kind: 'review',
      summary: 'Submitted the review',
      commits: [],
      finishedAt: '2026-10-04T10:05:00.000Z',
    };
    vi.mocked(bridge.ai.submitReview).mockImplementation(async () => {
      rerender(
        <ReviewInbox
          snapshot={makeSnapshot({ agentTasks: { [REF]: submitted } })}
          onOpenSettings={vi.fn()}
        />,
      );
      return { ok: true };
    });

    fireEvent.click(
      within(page).getByRole('button', { name: 'Submit as comment' }),
    );

    await waitFor(() =>
      expect(
        within(page).queryByRole('region', { name: 'Review draft' }),
      ).toBeNull(),
    );
    expect(bridge.ai.saveReviewDraft).not.toHaveBeenCalled();
  });

  it('keeps edits when the user leaves the review page', async () => {
    const { bridge, page } = await openDraft(DRAFT);
    fireEvent.click(
      within(page).getByRole('button', {
        name: 'This charges twice on retry.',
      }),
    );
    fireEvent.change(
      within(page).getByLabelText('Comment on billing/retry.ts:12'),
      { target: { value: 'This charges the card twice.' } },
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(bridge.ai.saveReviewDraft).toHaveBeenCalledWith(
      TARGET,
      expect.objectContaining({
        comments: expect.arrayContaining([
          expect.objectContaining({ body: 'This charges the card twice.' }),
        ]),
      }),
    );
  });

  it('lets the user answer the questions a review asks, on a review request', async () => {
    const { bridge } = installFakeBridge({ settings: WITH_AGENT });
    render(
      <ReviewInbox
        snapshot={makeSnapshot({
          agentTasks: {
            [REF]: {
              status: 'needs-input',
              kind: 'review',
              questions: [
                {
                  id: 'finding:1',
                  question: 'Keep this finding?',
                  context: '',
                },
              ],
            },
          },
        })}
        onOpenSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('option', { name: new RegExp(pr.title) }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Answer questions' }),
    );
    const page = screen.getByRole('region', { name: `Korev on #${pr.number}` });

    fireEvent.change(within(page).getByLabelText('Your answer'), {
      target: { value: 'Yes' },
    });
    fireEvent.click(within(page).getByRole('button', { name: /Send answers/ }));

    expect(bridge.ai.answer).toHaveBeenCalledWith(TARGET, {
      'finding:1': 'Yes',
    });
  });
});
