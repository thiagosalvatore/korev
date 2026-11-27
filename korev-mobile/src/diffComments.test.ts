import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../../korev-desktop/src/shared/diff';
import {
  addComment,
  clearComments,
  commentsOf,
  removeComment,
  withNotes,
} from './diffComments';

const PATCH = `@@ -1,2 +1,2 @@
 keep();
-old();
+new();
`;

describe('comment drafts', () => {
  it('collects comments per workspace until they are cleared', () => {
    addComment('ws-1', { file: 'a.ts', line: 2, code: 'new();', body: 'Hm' });
    addComment('ws-1', { file: 'b.ts', line: 1, code: 'x', body: 'Ok' });
    addComment('ws-2', { file: 'a.ts', line: 1, code: 'y', body: 'No' });
    const [first, second] = commentsOf('ws-1');

    removeComment('ws-1', first.id);
    expect(commentsOf('ws-1')).toEqual([second]);
    expect(commentsOf('ws-2')).toHaveLength(1);

    clearComments('ws-1');
    expect(commentsOf('ws-1')).toEqual([]);
  });
});

describe('withNotes', () => {
  it('puts each comment under its new line, in this file only', () => {
    const rows = parseUnifiedDiff(PATCH);
    const comment = {
      id: 'c',
      file: 'a.ts',
      line: 2,
      code: 'new();',
      body: 'Why?',
    };
    const other = { ...comment, id: 'd', file: 'b.ts' };

    const items = withNotes(rows, 'a.ts', [comment, other]);

    expect(items.map((item) => item.kind)).toEqual([
      'row',
      'row',
      'row',
      'row',
      'note',
    ]);
    expect(items.at(-1)).toEqual({ kind: 'note', comment });
  });
});
