import { describe, expect, it } from 'vitest';
import {
  applySuggestion,
  createSuggestionLoader,
  snippetSuggestions,
  type Suggestions,
} from './suggestions';

describe('applySuggestion', () => {
  it('replaces the typed mention and leaves a space after it', () => {
    const open: Suggestions = {
      trigger: '#',
      start: 4,
      end: 7,
      options: [],
      selected: 0,
    };
    expect(
      applySuggestion('fix #12 now', open, {
        label: '123 Login',
        insert: '#123',
      }),
    ).toEqual({
      text: 'fix #123  now',
      caret: 9,
    });
  });

  it('inserts a snippet at the caret without extra spacing', () => {
    const open = snippetSuggestions(
      [{ name: 'tests', text: 'Run the tests.' }],
      3,
    );
    if (!open) throw new Error('expected snippets');
    expect(applySuggestion('ok ', open, open.options[0])).toEqual({
      text: 'ok Run the tests.',
      caret: 17,
    });
  });
});

describe('createSuggestionLoader', () => {
  it('suggests the artifacts in .context alongside the tracked files', async () => {
    const files: Record<string, string[]> = {
      listFiles: ['src/login.ts'],
      listArtifacts: ['.context/plans/login-page.md'],
    };
    window.korev = {
      call: async (method: string) => files[method],
      on: () => () => {},
    } as unknown as Window['korev'];
    const loader = createSuggestionLoader({ workspaceId: 'w1', repoId: null });

    const suggested = await loader.suggest('@login', 6);

    expect(suggested?.options.map((option) => option.insert)).toEqual(
      expect.arrayContaining([
        '@src/login.ts',
        '@.context/plans/login-page.md',
      ]),
    );
  });
});
