import { describe, expect, it } from 'vitest';
import { repoInitials } from './format';

describe('repoInitials', () => {
  it('takes the first letter of up to two parts of the name', () => {
    expect(repoInitials('posthog')).toBe('p');
    expect(repoInitials('posthog-js')).toBe('pj');
    expect(repoInitials('acme_web.app-v2')).toBe('aw');
    expect(repoInitials('-scratch')).toBe('s');
  });
});
