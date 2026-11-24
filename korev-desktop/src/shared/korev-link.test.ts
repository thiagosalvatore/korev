import { describe, expect, it } from 'vitest';
import type { Repo } from './model';
import { linkRepoId, MAX_LINK_PROMPT, parseKorevLink } from './korev-link';

function repo(id: string, name: string): Repo {
  return { id, name } as Repo;
}

describe('parseKorevLink', () => {
  it('reads the prompt and repository of a new workspace link', () => {
    expect(
      parseKorevLink(
        'korev://new-workspace?prompt=Fix%20the%20login%20bug%0Aplease&repo=korev',
      ),
    ).toEqual({ prompt: 'Fix the login bug\nplease', repo: 'korev' });
  });

  it('accepts a trailing slash', () => {
    expect(parseKorevLink('korev://new-workspace/?prompt=Hi')).toEqual({
      prompt: 'Hi',
      repo: null,
    });
  });

  it('opens the page without text when the prompt is missing or empty', () => {
    expect(parseKorevLink('korev://new-workspace')).toEqual({
      prompt: null,
      repo: null,
    });
    expect(parseKorevLink('korev://new-workspace?prompt=&repo=')).toEqual({
      prompt: null,
      repo: null,
    });
  });

  it.each([
    'korev://send?prompt=Hi',
    'korev://new-workspace/start?prompt=Hi',
    'korev://settings',
    'https://new-workspace?prompt=Hi',
    'other://new-workspace?prompt=Hi',
    'not a url',
    '',
  ])('ignores %s', (url) => {
    expect(parseKorevLink(url)).toBeNull();
  });

  it('cuts a long prompt to the limit', () => {
    const long = 'a'.repeat(MAX_LINK_PROMPT + 10);
    expect(
      parseKorevLink(`korev://new-workspace?prompt=${long}`)?.prompt,
    ).toHaveLength(MAX_LINK_PROMPT);
  });
});

describe('linkRepoId', () => {
  const repos = [repo('r1', 'korev'), repo('r2', 'posthog')];

  it('finds the repository with that name, ignoring case', () => {
    expect(linkRepoId(repos, 'posthog')).toBe('r2');
    expect(linkRepoId(repos, 'Korev')).toBe('r1');
  });

  it('returns null for an unknown or missing name', () => {
    expect(linkRepoId(repos, 'missing')).toBeNull();
    expect(linkRepoId(repos, null)).toBeNull();
  });
});
