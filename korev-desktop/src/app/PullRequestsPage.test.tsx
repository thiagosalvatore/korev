import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, InboxPullRequest } from '../shared/model';
import { PullRequestsPage } from './PullRequestsPage';
import { getUi, resetUiForTests } from './ui-store';

const REVIEW_URL = 'https://github.com/acme/web/pull/42';
const MINE_URL = 'https://github.com/acme/web/pull/7';

function inboxPr(overrides: Partial<InboxPullRequest>): InboxPullRequest {
  return {
    repoId: 'r1',
    reason: 'review-requested',
    number: 42,
    title: 'Add install steps',
    url: REVIEW_URL,
    author: 'octo',
    isDraft: false,
    headRefName: 'octo/install',
    baseRefName: 'main',
    updatedAt: '2026-11-04T10:00:00Z',
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    checks: 'success',
    ...overrides,
  };
}

const inbox = [
  inboxPr({}),
  inboxPr({
    reason: 'authored',
    number: 7,
    title: 'Fix login',
    url: MINE_URL,
    author: 'me',
    checks: 'failure',
  }),
];

const state = {
  repos: [{ id: 'r1', name: 'web' }],
  workspaces: [],
  askChats: [],
} as unknown as AppState;

let call: ReturnType<typeof vi.fn>;

beforeEach(() => {
  call = vi.fn(async (method: string) => {
    if (method === 'pullRequestInbox') return { ok: true, value: inbox };
    if (method === 'reviewPullRequest')
      return { ok: true, value: { askChatId: 'a1' } };
    return null;
  });
  window.korev = { call, on: () => () => {} } as unknown as Window['korev'];
});

afterEach(() => {
  cleanup();
  resetUiForTests();
});

async function rowOf(title: RegExp) {
  return screen.findByRole('listitem', { name: title });
}

describe('PullRequestsPage', () => {
  it('starts a review of a pull request waiting for you in one click', async () => {
    render(<PullRequestsPage state={state} />);

    const waiting = await screen.findByRole('region', {
      name: 'Waiting for your review',
    });
    const row = await within(waiting).findByRole('listitem', {
      name: /#42 Add install steps/,
    });
    expect(
      within(screen.getByRole('region', { name: 'Opened by you' })).getByText(
        'Checks failing',
      ),
    ).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Review' }));

    await waitFor(() =>
      expect(getUi().page).toMatchObject({ kind: 'ask', askChatId: 'a1' }),
    );
    expect(call).toHaveBeenCalledWith('reviewPullRequest', ['r1', 42]);
  });

  it('reopens the review and the workspace that already exist for a pull request', async () => {
    render(
      <PullRequestsPage
        state={
          {
            ...state,
            askChats: [{ id: 'a9', reviewOf: REVIEW_URL }],
            workspaces: [{ id: 'w1', repoId: 'r1', prs: [{ url: MINE_URL }] }],
          } as unknown as AppState
        }
      />,
    );

    fireEvent.click(
      within(await rowOf(/#42 Add install steps/)).getByRole('button', {
        name: 'Open review',
      }),
    );
    expect(getUi().page).toMatchObject({ kind: 'ask', askChatId: 'a9' });
    fireEvent.click(
      within(await rowOf(/#7 Fix login/)).getByRole('button', {
        name: 'Open workspace',
      }),
    );

    expect(getUi()).toMatchObject({
      workspaceId: 'w1',
      page: { kind: 'workspace' },
    });
    expect(call).not.toHaveBeenCalledWith('reviewPullRequest', ['r1', 42]);
  });
});
