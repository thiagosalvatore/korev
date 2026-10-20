import { describe, expect, it } from 'vitest';
import type { ExplainerContent, ExplainerRef } from '../../shared/explainer';
import { explainerHtml } from './exportHtml';

const REF: ExplainerRef = {
  target: { kind: 'pr', repoId: 'repo', number: 42 },
  title: 'Add <install> steps',
  url: 'https://github.com/acme/web/pull/42',
  author: 'octo',
  revision: 'abc123',
  status: 'ready',
};

const CONTENT: ExplainerContent = {
  headline: 'The README says how to install the CLI.',
  summary: 'New people can start alone.',
  before: 'No steps.',
  after: 'Three steps.',
  flow: [],
  tour: [
    {
      title: 'Add the steps',
      explanation: 'Adds an `Install` section.',
      why: '',
      changes: [{ file: 'README.md', startLine: 2 }],
    },
  ],
  risks: [],
  questions: [],
  routine: [],
  glossary: [{ term: 'CLI', meaning: 'A program you type in a terminal.' }],
};

const PATCH = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
 # acme
+Run <script>alert(1)</script>.
`;

describe('explainerHtml', () => {
  it('writes one page with the cited code, glossary hints and no scripts to run', () => {
    const html = explainerHtml(REF, CONTENT, PATCH);

    expect(html).toContain('<title>Add &lt;install&gt; steps</title>');
    expect(html).toContain(
      '<abbr title="A program you type in a terminal.">CLI</abbr>',
    );
    expect(html).toContain('Run &lt;script&gt;alert(1)&lt;/script&gt;.');
    expect(html).not.toContain('<script');
  });
});
