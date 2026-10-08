import { describe, expect, it } from 'vitest';
import { insertDictation } from './dictation';

describe('insertDictation', () => {
  it('fills an empty field', () => {
    expect(insertDictation('', 0, 'faz o deploy')).toEqual({
      text: 'faz o deploy',
      caret: 12,
    });
  });

  it('adds a space after earlier text', () => {
    expect(insertDictation('Fix the bug.', 12, 'Then open a PR.')).toEqual({
      text: 'Fix the bug. Then open a PR.',
      caret: 28,
    });
  });

  it('separates the dictation from words on both sides', () => {
    expect(insertDictation('abcdef', 3, 'X').text).toBe('abc X def');
  });

  it('adds no space where whitespace already is', () => {
    expect(insertDictation('first\n', 6, 'second').text).toBe('first\nsecond');
    expect(insertDictation('a  b', 2, 'X').text).toBe('a X b');
  });
});
