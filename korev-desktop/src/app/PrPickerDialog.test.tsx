import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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

beforeEach(() => {
  window.korev = {
    call: vi.fn(async (method: string) =>
      method === 'listPullRequests' ? [pullRequest] : null,
    ),
    on: () => () => {},
  } as unknown as Window['korev'];
});

describe('PrPickerDialog', () => {
  it('opens a new Ask about the picked pull request to review it', async () => {
    act(() => setUi({ prPicker: 'review' }));
    render(<PrPickerDialog state={state} />);

    expect(
      screen.getByRole('dialog', { name: 'Review a pull request' }),
    ).toBeTruthy();
    const [option] = await screen.findAllByRole('option', {
      name: /#42 Add install steps/,
    });
    fireEvent.click(option);

    expect(getUi().prPicker).toBeNull();
    expect(getUi().page).toMatchObject({
      kind: 'ask',
      askChatId: null,
      repoIds: ['r1'],
    });
    expect(loadDraft(NEW_ASK_DRAFT_KEY)).toBe(
      'Review pull request #42 Add install steps. ',
    );
  });
});
