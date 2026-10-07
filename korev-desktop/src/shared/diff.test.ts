import { describe, expect, it } from 'vitest';
import { isBinaryDiff, parseUnifiedDiff } from './diff';

const PATCH = `diff --git a/src/a.ts b/src/a.ts
index 1..2 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@ export
 const a = 1;
-const b = 2;
+const b = 3;
 const c = 4;
\\ No newline at end of file
`;

describe('parseUnifiedDiff', () => {
  it('numbers new-side lines and skips file headers', () => {
    expect(parseUnifiedDiff(PATCH)).toEqual([
      { type: 'hunk', code: '@@ -1,3 +1,3 @@ export', newLine: null },
      { type: 'ctx', code: 'const a = 1;', newLine: 1 },
      { type: 'del', code: 'const b = 2;', newLine: null },
      { type: 'add', code: 'const b = 3;', newLine: 2 },
      { type: 'ctx', code: 'const c = 4;', newLine: 3 },
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
