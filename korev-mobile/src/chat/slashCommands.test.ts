import { describe, expect, it } from 'vitest';
import { slashSuggestions } from './slashCommands';

const COMMANDS = ['review', 'release', 'init', 'compact', 'Resume'];

describe('slashSuggestions', () => {
  it('suggests nothing unless the message is a lone slash command', () => {
    expect(slashSuggestions('fix the bug', COMMANDS)).toBeNull();
    expect(slashSuggestions('/review now', COMMANDS)).toBeNull();
    expect(slashSuggestions('see /review', COMMANDS)).toBeNull();
  });

  it('lists every command after a bare slash', () => {
    expect(slashSuggestions('/', COMMANDS)).toEqual(COMMANDS);
  });

  it('keeps the commands that start with what was typed, ignoring case', () => {
    expect(slashSuggestions('/re', COMMANDS)).toEqual([
      'review',
      'release',
      'Resume',
    ]);
  });
});
