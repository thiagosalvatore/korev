import { describe, expect, it } from 'vitest';
import { githubOwner } from './git';

describe('GitHub owner of a remote url', () => {
  it.each([
    ['git@github.com:posthog/korev.git', 'posthog'],
    ['ssh://git@github.com/posthog/korev', 'posthog'],
    ['https://github.com/posthog/korev.git', 'posthog'],
    ['https://someone@github.com/posthog/korev', 'posthog'],
  ])('reads the owner from %s', (url, owner) => {
    expect(githubOwner(url)).toBe(owner);
  });

  it('ignores remotes that are not on GitHub', () => {
    expect(githubOwner('git@gitlab.com:posthog/korev.git')).toBeNull();
    expect(githubOwner('https://notgithub.com/posthog/korev')).toBeNull();
  });
});
