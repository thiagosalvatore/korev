import { describe, expect, it } from 'vitest';
import {
  changedFiles,
  hunksForChange,
  parseExplainer,
  parsePrUrl,
  uncoveredFiles,
  type ExplainerContent,
} from './explainer';

const CONTENT: ExplainerContent = {
  headline: 'Invoices now show the tax line.',
  summary: 'Customers see the tax they pay on each invoice.',
  before: 'The invoice showed one total.',
  after: 'The invoice shows the subtotal, the tax and the total.',
  flow: [{ label: 'Checkout', detail: 'Works out the tax.' }],
  tour: [
    {
      title: 'Work out the tax',
      explanation: 'The checkout adds the tax to the order.',
      why: 'Customers asked to see it.',
      changes: [{ file: 'src/tax.ts', startLine: 2, endLine: 2 }],
    },
  ],
  risks: [
    {
      level: 'high',
      title: 'Rounding',
      explanation: 'The tax rounds per line.',
      file: 'src/tax.ts',
    },
  ],
  questions: ['Which countries were tested?'],
  routine: [{ file: 'package-lock.json', reason: 'Lockfile update.' }],
  glossary: [{ term: 'subtotal', meaning: 'The price before tax.' }],
};

function reply(json: unknown) {
  return `Here is the explanation.\n\n\`\`\`korev-explainer\n${JSON.stringify(json)}\n\`\`\``;
}

const PATCH = `diff --git a/src/tax.ts b/src/tax.ts
index 1..2 100644
--- a/src/tax.ts
+++ b/src/tax.ts
@@ -1,2 +1,3 @@
 export const rate = 0.2;
+export const tax = (price: number) => price * rate;
 export const total = 1;
@@ -20,2 +21,2 @@
-const old = 1;
+const updated = 1;
 const end = 2;
diff --git a/src/legacy.ts b/src/legacy.ts
deleted file mode 100644
index 3..0
--- a/src/legacy.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const legacy = 1;
-export const more = 2;
diff --git a/package-lock.json b/package-lock.json
index 4..5 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1 +1 @@
-{}
+{"a":1}
`;

describe('parseExplainer', () => {
  it('reads the block at the end of the reply', () => {
    expect(parseExplainer(reply(CONTENT))).toEqual({
      ok: true,
      value: CONTENT,
    });
  });

  it('reports a reply without the block', () => {
    const parsed = parseExplainer('Done.');
    expect(parsed.ok).toBe(false);
  });

  it('names the field with the wrong shape', () => {
    const parsed = parseExplainer(
      reply({ ...CONTENT, tour: [{ ...CONTENT.tour[0], changes: [{}] }] }),
    );
    expect(parsed).toEqual({
      ok: false,
      message: 'tour[0].changes[0].file must be text',
    });
  });

  it('rejects an explanation without a walkthrough', () => {
    expect(parseExplainer(reply({ ...CONTENT, tour: [] })).ok).toBe(false);
  });
});

describe('changedFiles', () => {
  it('lists every file in the diff, deleted ones included', () => {
    expect(
      changedFiles(PATCH).map((file) => [file.path, file.deleted]),
    ).toEqual([
      ['src/tax.ts', false],
      ['src/legacy.ts', true],
      ['package-lock.json', false],
    ]);
  });
});

describe('uncoveredFiles', () => {
  it('lists the changed files that no step or routine entry names', () => {
    expect(uncoveredFiles(CONTENT, PATCH)).toEqual(['src/legacy.ts']);
  });
});

describe('hunksForChange', () => {
  const [tax, legacy] = changedFiles(PATCH);

  it('keeps only the hunks that touch the cited lines', () => {
    const rows = hunksForChange(tax, { file: tax.path, startLine: 2 });
    expect(rows.map((row) => row.code)).toEqual([
      '@@ -1,2 +1,3 @@',
      'export const rate = 0.2;',
      'export const tax = (price: number) => price * rate;',
      'export const total = 1;',
    ]);
  });

  it('keeps every hunk when no lines are cited', () => {
    const rows = hunksForChange(tax, { file: tax.path });
    expect(rows.filter((row) => row.type === 'hunk')).toHaveLength(2);
  });

  it('cites a deleted file by its old line numbers', () => {
    const rows = hunksForChange(legacy, {
      file: legacy.path,
      startLine: 1,
      endLine: 2,
    });
    expect(rows.filter((row) => row.type === 'del')).toHaveLength(2);
  });
});

describe('parsePrUrl', () => {
  it('reads the repository and number of a pull request URL', () => {
    expect(parsePrUrl('https://github.com/acme/web/pull/42/files?w=1')).toEqual(
      { owner: 'acme', repo: 'web', number: 42 },
    );
  });

  it('ignores other URLs', () => {
    expect(parsePrUrl('https://github.com/acme/web/issues/42')).toBeNull();
  });
});
