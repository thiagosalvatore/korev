import {
  act,
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
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-04T10:00:00Z',
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    checks: 'success',
    unresolvedThreads: 0,
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
  settings: { keepPrsReady: false },
} as unknown as AppState;

let call: ReturnType<typeof vi.fn>;

beforeEach(() => {
  call = vi.fn(async (method: string) => {
    if (method === 'pullRequestInbox') return { ok: true, value: inbox };
    if (method === 'reviewPullRequest')
      return { ok: true, value: { askChatId: 'a1' } };
    if (method === 'createWorkspaces')
      return { ok: true, value: [{ id: 'w2' }] };
    return null;
  });
  window.korev = { call, on: () => () => {} } as unknown as Window['korev'];
  localStorage.clear();
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

    const row = await rowOf(/#42 Add install steps/);
    expect(
      within(await rowOf(/#7 Fix login/)).getByText('Checks failing'),
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

  it('checks out a pull request and keeps it ready in its new workspace', async () => {
    render(<PullRequestsPage state={state} />);

    fireEvent.click(
      within(await rowOf(/#42 Add install steps/)).getByRole('button', {
        name: 'Keep ready',
      }),
    );

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setKeepPrReady', ['w2', true]),
    );
    expect(call).toHaveBeenCalledWith('createWorkspaces', [
      ['r1'],
      null,
      { kind: 'pr', number: 42, branch: 'octo/install', baseBranch: 'main' },
    ]);
    expect(getUi()).toMatchObject({
      workspaceId: 'w2',
      page: { kind: 'workspace' },
    });
  });

  it.each([
    ['turns on', false, true],
    ['turns off', true, false],
  ])(
    '%s keeping a pull request ready in the workspace it already has',
    async (_case, keepPrReady, keep) => {
      render(
        <PullRequestsPage
          state={
            {
              ...state,
              workspaces: [
                {
                  id: 'w1',
                  repoId: 'r1',
                  prs: [{ url: MINE_URL }],
                  pausePrReady: false,
                  keepPrReady,
                },
              ],
            } as unknown as AppState
          }
        />,
      );

      const button = within(await rowOf(/#7 Fix login/)).getByRole('button', {
        name: 'Keep ready',
      });
      expect(button.getAttribute('aria-pressed')).toBe(String(keepPrReady));
      fireEvent.click(button);

      await waitFor(() =>
        expect(call).toHaveBeenCalledWith('setKeepPrReady', ['w1', keep]),
      );
      expect(call).not.toHaveBeenCalledWith(
        'createWorkspaces',
        expect.anything(),
      );
    },
  );

  it('finds a pull request by its number', async () => {
    render(<PullRequestsPage state={state} />);
    await rowOf(/#42 Add install steps/);

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter' }), {
      target: { value: '#7' },
    });

    expect(screen.getByRole('listitem', { name: /#7 Fix login/ })).toBeTruthy();
    expect(screen.queryByRole('listitem', { name: /#42/ })).toBeNull();
  });

  it('narrows the list to the chosen view', async () => {
    render(<PullRequestsPage state={state} />);
    await rowOf(/#42 Add install steps/);

    fireEvent.click(screen.getByRole('tab', { name: /Needs review/ }));

    expect(screen.getByRole('listitem', { name: /#42/ })).toBeTruthy();
    expect(screen.queryByRole('listitem', { name: /#7 Fix login/ })).toBeNull();
  });

  it('narrows the list to the statuses chosen in Filters', async () => {
    render(<PullRequestsPage state={state} />);
    await rowOf(/#42 Add install steps/);

    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Checks failing' }),
    );

    expect(screen.queryByRole('listitem', { name: /#42/ })).toBeNull();
    expect(screen.getByRole('listitem', { name: /#7 Fix login/ })).toBeTruthy();
  });

  it('shows a stacked pull request under the one it is based on', async () => {
    call.mockResolvedValueOnce({
      ok: true,
      value: [
        inboxPr({
          reason: 'authored',
          number: 8,
          title: 'Use the new login',
          url: 'https://github.com/acme/web/pull/8',
          headRefName: 'me/login-2',
          baseRefName: 'me/login',
        }),
        inboxPr({
          reason: 'authored',
          number: 7,
          title: 'Fix login',
          url: MINE_URL,
          headRefName: 'me/login',
        }),
      ],
    });
    render(<PullRequestsPage state={state} />);

    const root = await rowOf(/#7 Fix login/);
    expect(within(root).getByText('Stack of 2')).toBeTruthy();
    expect(
      screen
        .getAllByRole('listitem')
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual(['#7 Fix login', '#8 Use the new login']);
  });

  it('clears filters that hide every pull request', async () => {
    render(<PullRequestsPage state={state} />);
    await rowOf(/#42 Add install steps/);

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter' }), {
      target: { value: 'nothing like this' },
    });
    expect(
      screen.getByText('No pull requests match these filters.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(await rowOf(/#42 Add install steps/)).toBeTruthy();
    expect(screen.getByRole('listitem', { name: /#7 Fix login/ })).toBeTruthy();
  });

  it('shows a loading skeleton first and keeps the list on screen while it refreshes', async () => {
    let finishRefresh = () => {};
    render(<PullRequestsPage state={state} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
    await rowOf(/#42 Add install steps/);

    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = () => resolve({ ok: true, value: inbox });
        }),
    );
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    fireEvent.click(refresh);

    expect(refresh.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      screen.getByRole('listitem', { name: /#42 Add install steps/ }),
    ).toBeTruthy();
    await act(async () => finishRefresh());
    expect(refresh.getAttribute('aria-busy')).toBeNull();
  });

  it('shows the last loaded list right away on the next visit and refreshes it', async () => {
    const { unmount } = render(<PullRequestsPage state={state} />);
    await rowOf(/#42 Add install steps/);
    unmount();

    let finishRefresh = () => {};
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = () => resolve({ ok: true, value: [inbox[1]] });
        }),
    );
    render(<PullRequestsPage state={state} />);

    expect(
      screen.getByRole('listitem', { name: /#42 Add install steps/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(refresh.getAttribute('aria-busy')).toBe('true');

    await act(async () => finishRefresh());
    expect(screen.queryByRole('listitem', { name: /#42/ })).toBeNull();
    expect(screen.getByRole('listitem', { name: /#7 Fix login/ })).toBeTruthy();
    expect(refresh.getAttribute('aria-busy')).toBeNull();
  });

  it('keeps the last loaded list when a refresh fails', async () => {
    const { unmount } = render(<PullRequestsPage state={state} />);
    await rowOf(/#42 Add install steps/);
    unmount();

    call.mockResolvedValueOnce({ ok: false, message: 'gh: HTTP 502' });
    render(<PullRequestsPage state={state} />);

    expect(await screen.findByText("Couldn't refresh")).toBeTruthy();
    expect(
      screen.getByRole('listitem', { name: /#42 Add install steps/ }),
    ).toBeTruthy();
    expect(screen.queryByText("Couldn't load pull requests")).toBeNull();
  });

  it('shows why the inbox failed and loads it again on Try again', async () => {
    call.mockResolvedValueOnce({ ok: false, message: 'gh: HTTP 502' });
    render(<PullRequestsPage state={state} />);

    expect(await screen.findByText("Couldn't load pull requests")).toBeTruthy();
    expect(screen.getByText('gh: HTTP 502')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await rowOf(/#42 Add install steps/)).toBeTruthy();
    expect(screen.queryByText('gh: HTTP 502')).toBeNull();
  });
});
