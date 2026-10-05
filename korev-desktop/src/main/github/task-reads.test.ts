import { describe, expect, it } from 'vitest';
import { createTaskReads } from './task-reads';
import { createFakeFetch } from './test-fetch';

const API = 'https://api.github.com';
const PR = { repo: 'acme/api', number: 77 };

describe('task reads', () => {
  it('reads only the failing checks of one PR, and which are Actions jobs', async () => {
    const fake = createFakeFetch({
      body: {
        data: {
          repository: {
            pullRequest: {
              statusCheckRollup: {
                contexts: {
                  nodes: [
                    {
                      __typename: 'CheckRun',
                      databaseId: 31,
                      name: 'lint',
                      status: 'COMPLETED',
                      conclusion: 'FAILURE',
                      detailsUrl:
                        'https://github.com/acme/api/actions/runs/9/job/31',
                      title: 'ESLint',
                      summary: '1 problem',
                      checkSuite: {
                        app: { slug: 'github-actions' },
                        workflowRun: { databaseId: 9 },
                      },
                    },
                    {
                      __typename: 'CheckRun',
                      databaseId: 32,
                      name: 'test',
                      status: 'COMPLETED',
                      conclusion: 'SUCCESS',
                    },
                    {
                      __typename: 'StatusContext',
                      context: 'ci/circleci',
                      state: 'FAILURE',
                      description: 'Build failed',
                      targetUrl: 'https://circleci.com/x',
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const checks = await createTaskReads({
      fetch: fake.fetch,
      apiUrl: API,
    }).failingChecks('tok', PR);

    expect(checks).toEqual([
      {
        name: 'lint',
        summary: 'ESLint\n1 problem',
        url: 'https://github.com/acme/api/actions/runs/9/job/31',
        checkRunId: 31,
        workflowRunId: 9,
        isActionsJob: true,
      },
      {
        name: 'ci/circleci',
        summary: 'Build failed',
        url: 'https://circleci.com/x',
        checkRunId: null,
        workflowRunId: null,
        isActionsJob: false,
      },
    ]);
    expect(fake.requests[0].body).toMatchObject({
      variables: { owner: 'acme', name: 'api', number: 77 },
    });
  });

  it('reads the annotations of a check run', async () => {
    const fake = createFakeFetch({
      body: [
        {
          path: 'src/limits.ts',
          start_line: 4,
          annotation_level: 'failure',
          message: "'x' is unused",
        },
      ],
    });

    const annotations = await createTaskReads({
      fetch: fake.fetch,
      apiUrl: API,
    }).annotations('tok', 'acme/api', 31);

    expect(fake.requests[0].url).toBe(
      `${API}/repos/acme/api/check-runs/31/annotations?per_page=50`,
    );
    expect(annotations).toEqual([
      {
        path: 'src/limits.ts',
        line: 4,
        level: 'failure',
        message: "'x' is unused",
      },
    ]);
  });

  it('reads unresolved review threads with who wrote each comment', async () => {
    const fake = createFakeFetch({
      body: {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    id: 'T_1',
                    isResolved: false,
                    path: 'src/cache.ts',
                    line: 12,
                    comments: {
                      nodes: [
                        {
                          author: { login: 'li' },
                          authorAssociation: 'MEMBER',
                          body: 'Name this.',
                          diffHunk: '@@ -1 +1 @@',
                        },
                      ],
                    },
                  },
                  {
                    id: 'T_2',
                    isResolved: true,
                    path: 'a.ts',
                    line: 1,
                    comments: { nodes: [{ body: 'old' }] },
                  },
                ],
              },
            },
          },
        },
      },
    });

    const threads = await createTaskReads({
      fetch: fake.fetch,
      apiUrl: API,
    }).unresolvedThreads('tok', PR);

    expect(threads).toEqual([
      {
        id: 'T_1',
        path: 'src/cache.ts',
        line: 12,
        diffHunk: '@@ -1 +1 @@',
        comments: [
          { authorLogin: 'li', association: 'MEMBER', body: 'Name this.' },
        ],
      },
    ]);
  });
});
