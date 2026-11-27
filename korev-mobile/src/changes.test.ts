import { describe, expect, it } from 'vitest';
import { rangeOf, rangeParams } from './changes';

describe('turn range params', () => {
  it('round-trips a range and treats a missing end as no range', () => {
    const range = { from: 'abc', to: 'def' };
    expect(rangeOf(rangeParams(range))).toEqual(range);
    expect(rangeOf(rangeParams(null))).toBeNull();
    expect(rangeOf({ from: 'abc' })).toBeNull();
  });
});
