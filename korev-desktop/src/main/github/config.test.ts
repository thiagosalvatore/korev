import { describe, expect, it } from 'vitest';
import { githubEndpoints } from './config';

describe('githubEndpoints', () => {
  it('ignores the GitHub URL overrides in a packaged build', () => {
    const overrides = {
      KOREV_GITHUB_API_URL: 'http://127.0.0.1:9000',
      KOREV_GITHUB_WEB_URL: 'http://127.0.0.1:9001',
      KOREV_GIT_URL: 'file:///tmp/remotes',
    };

    expect(githubEndpoints(true, overrides)).toEqual({
      apiUrl: 'https://api.github.com',
      webUrl: 'https://github.com',
      gitUrl: 'https://github.com',
    });
    expect(githubEndpoints(false, overrides)).toEqual({
      apiUrl: 'http://127.0.0.1:9000',
      webUrl: 'http://127.0.0.1:9001',
      gitUrl: 'file:///tmp/remotes',
    });
  });
});
