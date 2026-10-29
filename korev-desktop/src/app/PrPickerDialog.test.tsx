import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/model';
import { NEW_ASK_DRAFT_KEY } from './actions';
import { loadDraft } from './chat/Composer';
import { PrPickerDialog } from './PrPickerDialog';
import { getUi, resetUiForTests, setUi } from './ui-store';

const pullRequest = {
  number: 42,
  title: 'Add install steps',
  headRefName: 'octo/install',
  baseRefName: 'main',
  author: 'octo',
  isDraft: false,
};

const state = {
  repos: [{ id: 'r1', name: 'web' }],
  workspaces: [],
} as unknown as AppState;

afterEach(() => {
  cleanup();
  resetUiForTests();
  localStorage.clear();
});

function mockKorev(prompts: Record<string, string>) {
  window.korev = {
    call: vi.fn(async (method: string) => {
      if (method === 'listPullRequests') return [pullRequest];
      if (method === 'repoConfig') return { prompts };
      return null;
    }),
    on: () => () => {},
  } as unknown as Window['korev'];
}

beforeEach(() => mockKorev({}));

function openReviewPicker() {
  act(() => setUi({ prPicker: 'review' }));
  render(<PrPickerDialog state={state} />);
}

async function pickPullRequest() {
  const [option] = await screen.findAllByRole('option', {
    name: /#42 Add install steps/,
  });
  fireEvent.click(option);
  await waitFor(() => expect(getUi().prPicker).toBeNull());
}

describe('PrPickerDialog', () => {
  it('opens a new Ask about the picked pull request to review it', async () => {
    openReviewPicker();

    expect(
      screen.getByRole('dialog', { name: 'Review a pull request' }),
    ).toBeTruthy();
    await pickPullRequest();

    expect(getUi().page).toMatchObject({
      kind: 'ask',
      askChatId: null,
      repoIds: ['r1'],
    });
    expect(loadDraft(NEW_ASK_DRAFT_KEY)).toBe(
      'Review pull request #42 Add install steps. ',
    );
  });

  it('adds the code review prompt of the repository to the review', async () => {
    mockKorev({
      code_review: 'Use the /review skill to review these changes.',
    });
    openReviewPicker();
    await pickPullRequest();

    expect(loadDraft(NEW_ASK_DRAFT_KEY)).toBe(
      'Review pull request #42 Add install steps. Use the /review skill to review these changes. ',
    );
  });
});
