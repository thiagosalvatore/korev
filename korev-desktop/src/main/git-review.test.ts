import { describe, expect, it } from 'vitest';
import { parseGrepOutput } from './git-review';

describe('git grep output', () => {
  it('reads file, line, column and text, keeping colons in the text', () => {
    const output =
      'src/a.ts\u000012\u00005\u0000const url = "http://x:1";\nREADME.md\u00003\u00001\u0000# Title\n';
    expect(parseGrepOutput(output)).toEqual([
      {
        file: 'src/a.ts',
        line: 12,
        column: 5,
        text: 'const url = "http://x:1";',
      },
      { file: 'README.md', line: 3, column: 1, text: '# Title' },
    ]);
  });
});
