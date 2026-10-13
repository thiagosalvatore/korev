import { describe, expect, it } from 'vitest';
import { highlightMarkdown } from './markdownHighlight';

describe('highlightMarkdown', () => {
  it('styles markdown without changing the text', () => {
    const input = [
      '# Plan',
      '- run **tests** with `npm test`',
      '> see [docs](https://x.dev) and *why*',
      '```ts',
      'const tag = "<script>";',
      '```',
      'snake_case_name stays plain',
    ].join('\n');
    const html = highlightMarkdown(input);
    const mirror = document.createElement('div');
    mirror.innerHTML = html;

    expect(mirror.textContent).toBe(input);
    for (const className of [
      'md-heading',
      'md-marker',
      'md-bold',
      'md-code',
      'md-link',
      'md-italic',
    ])
      expect(html).toContain(`class="${className}"`);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('snake<span');
  });
});
