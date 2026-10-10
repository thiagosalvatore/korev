import { describe, expect, it } from 'vitest';
import {
  CANCEL_SLIDE,
  LOCK_SLIDE,
  MIN_HOLD_MS,
  releaseAction,
  slideAction,
} from './holdToRecord';

describe('slideAction', () => {
  it('ignores small finger movement', () => {
    expect(slideAction(-CANCEL_SLIDE + 1, -LOCK_SLIDE + 1)).toBeNull();
  });

  it('cancels when the finger slides far enough left', () => {
    expect(slideAction(-CANCEL_SLIDE, 0)).toBe('cancel');
  });

  it('locks when the finger slides far enough up', () => {
    expect(slideAction(0, -LOCK_SLIDE)).toBe('lock');
  });

  it('does not react to sliding right or down', () => {
    expect(slideAction(CANCEL_SLIDE * 2, LOCK_SLIDE * 2)).toBeNull();
  });
});

describe('releaseAction', () => {
  it('shows the hint after a quick tap', () => {
    expect(releaseAction(MIN_HOLD_MS - 1)).toBe('hint');
  });

  it('inserts the text after a real hold', () => {
    expect(releaseAction(MIN_HOLD_MS)).toBe('done');
  });
});
