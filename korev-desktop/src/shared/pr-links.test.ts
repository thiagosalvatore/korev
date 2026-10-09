import { describe, expect, it } from 'vitest';
import { isPrUrl, splitPrRefs } from './pr-links';

const REPO_URL = 'https://github.com/posthog/korev';

describe('splitPrRefs', () => {
  it('links a PR number to the repo', () => {
    expect(splitPrRefs('Merged #239 today', REPO_URL)).toEqual([
      'Merged ',
      { label: '#239', url: `${REPO_URL}/pull/239` },
      ' today',
    ]);
  });

  it('leaves a PR number as text when the repo is unknown', () => {
    expect(splitPrRefs('Merged #239', null)).toEqual(['Merged #239']);
  });

  it('links a PR in another repo', () => {
    expect(splitPrRefs('(PostHog/posthog#5)', null)).toEqual([
      '(',
      {
        label: 'PostHog/posthog#5',
        url: 'https://github.com/PostHog/posthog/pull/5',
      },
      ')',
    ]);
  });

  it.each(['it&#39;s', 'abc#12', '#12abc', 'color: #333-'])(
    'does not link %s',
    (text) => {
      expect(splitPrRefs(text, REPO_URL)).toEqual([text]);
    },
  );
});

describe('isPrUrl', () => {
  it('accepts only a whole PR url', () => {
    expect(isPrUrl(`${REPO_URL}/pull/239`)).toBe(true);
    expect(isPrUrl(`see ${REPO_URL}/pull/239`)).toBe(false);
    expect(isPrUrl(`${REPO_URL}/issues/239`)).toBe(false);
  });
});
