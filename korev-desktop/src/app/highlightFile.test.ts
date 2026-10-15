import { describe, expect, it } from 'vitest';
import { highlightFile } from './highlightFile';

describe('highlightFile', () => {
  it('colours SQL keywords and comments', async () => {
    const lines = await highlightFile('SELECT 1 -- note', 'queries/report.sql');

    const tokens = lines?.[0] ?? [];
    const colourOf = (text: string) =>
      tokens.find((token) => token.content.includes(text))?.color;
    expect(colourOf('SELECT')).toBe('var(--shiki-token-keyword)');
    expect(colourOf('note')).toBe('var(--shiki-token-comment)');
  });

  it('highlights files known by name, like a Dockerfile', async () => {
    expect(await highlightFile('FROM node', 'app/Dockerfile')).not.toBeNull();
  });

  it('leaves files in an unknown language plain', async () => {
    expect(await highlightFile('hello', 'notes.txt')).toBeNull();
  });
});
