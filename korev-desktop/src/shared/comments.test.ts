import { describe, expect, it } from 'vitest';
import { formatComments } from './comments';

describe('formatComments', () => {
  it('lists each comment under its file, line and code', () => {
    expect(
      formatComments([
        {
          id: '1',
          file: 'src/a.ts',
          line: 4,
          code: '  const b = 3;',
          body: 'Why 3?',
        },
        {
          id: '2',
          file: 'src/b.ts',
          line: 9,
          code: 'run();',
          body: 'Await it.',
        },
      ]),
    ).toBe(
      '\n\nReview comments on the diff:\n- src/a.ts:4 `const b = 3;`\n  Why 3?\n- src/b.ts:9 `run();`\n  Await it.',
    );
  });

  it('adds nothing without comments', () => {
    expect(formatComments([])).toBe('');
  });
});
