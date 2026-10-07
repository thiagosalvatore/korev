import { describe, expect, it } from 'vitest';
import {
  isBinaryDiff,
  parseUnifiedDiff,
  patchSignature,
  splitRows,
} from './diff';

const PATCH = `diff --git a/src/a.ts b/src/a.ts
index 1..2 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@ export
 const a = 1;
-const b = 2;
+const b = 3;
+const d = 5;
 const c = 4;
\\ No newline at end of file
`;

describe('parseUnifiedDiff', () => {
  it('numbers both sides and skips file headers', () => {
    expect(parseUnifiedDiff(PATCH)).toEqual([
      {
        type: 'hunk',
        code: '@@ -1,3 +1,4 @@ export',
        oldLine: null,
        newLine: null,
      },
      { type: 'ctx', code: 'const a = 1;', oldLine: 1, newLine: 1 },
      { type: 'del', code: 'const b = 2;', oldLine: 2, newLine: null },
      { type: 'add', code: 'const b = 3;', oldLine: null, newLine: 2 },
      { type: 'add', code: 'const d = 5;', oldLine: null, newLine: 3 },
      { type: 'ctx', code: 'const c = 4;', oldLine: 3, newLine: 4 },
    ]);
  });

  it('detects binary patches', () => {
    expect(
      isBinaryDiff(
        'diff --git a/x.png b/x.png\nBinary files /dev/null and b/x.png differ',
      ),
    ).toBe(true);
    expect(isBinaryDiff(PATCH)).toBe(false);
  });
});

describe('splitRows', () => {
  it('pairs removed lines with the added lines that replace them', () => {
    const pairs = splitRows(parseUnifiedDiff(PATCH)).map(({ left, right }) => [
      left?.code ?? null,
      right?.code ?? null,
    ]);
    expect(pairs).toEqual([
      ['@@ -1,3 +1,4 @@ export', null],
      ['const a = 1;', 'const a = 1;'],
      ['const b = 2;', 'const b = 3;'],
      [null, 'const d = 5;'],
      ['const c = 4;', 'const c = 4;'],
    ]);
  });
});

describe('patchSignature', () => {
  it('changes when the patch changes', () => {
    expect(patchSignature(PATCH)).toBe(patchSignature(PATCH));
    expect(patchSignature(PATCH)).not.toBe(patchSignature(`${PATCH} `));
  });
});
