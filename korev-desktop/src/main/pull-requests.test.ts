import { describe, expect, it } from 'vitest';
import {
  findPrUrls,
  parsePrStack,
  fetchPrStatus,
  parsePrStatus,
  parseReviewComments,
} from './pull-requests';
import type { CommandResult, CommandRunner } from './command-runner';

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

type StackPr = Record<string, unknown>;

function stackPr(number: number, fields: StackPr = {}): StackPr {
  return {
    number,
    url: `https://github.com/acme/web/pull/${number}`,
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    reviewDecision: 'APPROVED',
    commits: {
      nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }],
    },
    ...fields,
  };
}

function stackResponse(position: number | null, prs: StackPr[]) {
  return JSON.stringify({
    data: {
      resource: {
        stackEntry: position === null ? null : { position },
        stack:
          position === null
            ? null
            : {
                entries: {
                  nodes: prs.map((pullRequest, index) => ({
                    position: index + 1,
                    pullRequest,
                  })),
                },
              },
      },
    },
  });
}

describe('PR stack', () => {
  it('counts only the open PRs below and above this one', () => {
    const json = stackResponse(3, [
      stackPr(5, { state: 'MERGED' }),
      stackPr(6),
      stackPr(7),
      stackPr(8),
    ]);
    expect(parsePrStack(json)).toEqual({
      openBelow: 1,
      openAbove: 1,
      belowReady: true,
    });
  });

  it('marks the PRs below as not ready when one of them is still running checks', () => {
    const json = stackResponse(2, [
      stackPr(5, {
        commits: {
          nodes: [{ commit: { statusCheckRollup: { state: 'PENDING' } } }],
        },
      }),
      stackPr(6),
    ]);
    expect(parsePrStack(json)?.belowReady).toBe(false);
  });

  it('returns null for a PR outside any stack', () => {
    expect(parsePrStack(stackResponse(null, []))).toBeNull();
  });
});

describe('required checks', () => {
  const view = JSON.stringify({
    number: 7,
    url: 'https://github.com/acme/web/pull/7',
    state: 'OPEN',
    statusCheckRollup: [
      { __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS' },
      { __typename: 'CheckRun', name: 'preview', status: 'IN_PROGRESS' },
    ],
  });

  function runner(requiredChecks: CommandResult): CommandRunner {
    return async (_file, args) => {
      if (args[0] === 'pr') return { exitCode: 0, stdout: view, stderr: '' };
      if (args.includes('--paginate')) return requiredChecks;
      return { exitCode: 1, stdout: '', stderr: '' };
    };
  }

  async function requiredFlags(requiredChecks: CommandResult) {
    const status = await fetchPrStatus(
      runner(requiredChecks),
      {},
      '/repo',
      '7',
    );
    return status?.checks.map((check) => [check.name, check.required]);
  }

  it('marks only the checks GitHub reports as required', async () => {
    expect(
      await requiredFlags({ exitCode: 0, stdout: 'test\n', stderr: '' }),
    ).toEqual([
      ['test', true],
      ['preview', false],
    ]);
  });

  it('treats every check as required when the lookup fails', async () => {
    expect(
      await requiredFlags({ exitCode: 1, stdout: '', stderr: 'offline' }),
    ).toEqual([
      ['test', true],
      ['preview', true],
    ]);
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
