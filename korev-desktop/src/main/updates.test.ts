import { describe, expect, it } from 'vitest';
import { isNewer } from './updates';

describe('isNewer', () => {
  it('compares each part as a number', () => {
    expect(isNewer('1.10.0', '1.9.0')).toBe(true);
    expect(isNewer('1.9.0', '1.10.0')).toBe(false);
  });

  it('is false for the same version', () => {
    expect(isNewer('1.2.3', '1.2.3')).toBe(false);
  });

  it('offers the final release to someone on its release candidate', () => {
    expect(isNewer('1.0.0', '1.0.0-rc.1')).toBe(true);
  });
});
