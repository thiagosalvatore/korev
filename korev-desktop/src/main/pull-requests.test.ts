import { describe, expect, it } from 'vitest';
import {
  findPrUrls,
  parsePrStatus,
  parseReviewComments,
} from './pull-requests';

describe('PR status', () => {
  it('maps check runs and status contexts to check states', () => {
    const status = parsePrStatus(
      JSON.stringify({
        number: 7,
        url: 'https://github.com/acme/web/pull/7',
        title: 'Add login',
        state: 'OPEN',
        isDraft: false,
        mergeable: 'CONFLICTING',
        statusCheckRollup: [
          {
            __typename: 'CheckRun',
            name: 'lint',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            detailsUrl: 'https://ci/1',
          },
          {
            __typename: 'CheckRun',
            name: 'test',
            status: 'COMPLETED',
            conclusion: 'FAILURE',
            detailsUrl: 'https://ci/2',
          },
          {
            __typename: 'CheckRun',
            name: 'e2e',
            status: 'IN_PROGRESS',
            conclusion: '',
            detailsUrl: '',
          },
          {
            __typename: 'StatusContext',
            context: 'deploy',
            state: 'ERROR',
            targetUrl: 'https://ci/3',
          },
        ],
      }),
    );
    expect(status?.mergeable).toBe('CONFLICTING');
    expect(status?.checks.map((check) => [check.name, check.state])).toEqual([
      ['lint', 'success'],
      ['test', 'failure'],
      ['e2e', 'pending'],
      ['deploy', 'failure'],
    ]);
  });

  it.each([
    ['APPROVED', 'APPROVED'],
    ['', null],
  ])('reads review decision %j as %j', (reviewDecision, expected) => {
    const status = parsePrStatus(
      JSON.stringify({ number: 7, state: 'OPEN', reviewDecision }),
    );
    expect(status?.reviewDecision).toBe(expected);
  });

  it('returns null when there is no PR', () => {
    expect(parsePrStatus('no pull requests found')).toBeNull();
  });
});

describe('review comments', () => {
  it('keeps the current line, or null when GitHub marks the comment outdated', () => {
    const comments = parseReviewComments(
      JSON.stringify([
        {
          id: 1,
          path: 'src/a.ts',
          line: 12,
          body: 'Rename this',
          user: { login: 'sakce' },
          html_url: 'https://github.com/x/1',
        },
        {
          id: 2,
          path: 'src/b.ts',
          line: null,
          body: 'Old',
          user: { login: 'sakce' },
          html_url: 'https://github.com/x/2',
        },
      ]),
    );
    expect(
      comments.map((comment) => [comment.path, comment.line, comment.author]),
    ).toEqual([
      ['src/a.ts', 12, 'sakce'],
      ['src/b.ts', null, 'sakce'],
    ]);
  });
});

describe('PR links in agent output', () => {
  it('finds each pull request URL once and skips issues', () => {
    const output = [
      'Creating pull request for dev/login into main in acme/web',
      'https://github.com/acme/web/pull/42',
      'See https://github.com/acme/web/pull/42/files and https://github.com/acme/api/pull/7.',
      'Related: https://github.com/acme/web/issues/3',
    ].join('\n');

    expect(findPrUrls(output)).toEqual([
      'https://github.com/acme/web/pull/42',
      'https://github.com/acme/api/pull/7',
    ]);
  });
});
