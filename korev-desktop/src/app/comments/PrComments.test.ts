import { describe, expect, it } from 'vitest';
import { readableBody } from './PrComments';

describe('readableBody', () => {
  it('drops HTML comments and keeps the text inside HTML tags', () => {
    expect(
      readableBody(
        '<!-- walkthrough_start -->\n<details><summary>Summary</summary>\n\nFix **this**\n</details>',
      ),
    ).toBe('\nSummary\n\nFix **this**\n');
  });

  it('leaves comparisons and type parameters alone', () => {
    expect(readableBody('use a < b and `Array<string>`')).toBe(
      'use a < b and `Array<string>`',
    );
  });
});
