import { describe, expect, it } from 'vitest';
import { buildInboxQuery } from './queries';
import { createGithubClient } from './client';
import { GITHUB_OAUTH_CLIENT_ID } from './config';
import { GraphqlQueryError } from './errors';
import {
  ORG_RESTRICTION_MESSAGE,
  SAML_MESSAGE,
} from './fixtures/access-errors';
import inboxPage from './fixtures/inbox-page.json';
import type { GraphqlError } from './graphql';
import type { PullRequestNode } from './nodes';
import {
  type CannedReply,
  type CannedResponse,
  type FakeFetch,
  type RecordedRequest,
  createFakeFetch,
  graphqlBody,
} from './test-fetch';

const TOKEN = 'gho_token';
const API_URL = 'https://api.github.com';
const [stackedNode, singleNode] = inboxPage.data.mine
  .nodes as PullRequestNode[];
const [reviewNode] = inboxPage.data.reviews.nodes as PullRequestNode[];

interface PageOptions {
  mine?: PullRequestNode[] | null;
  mineCursor?: string | null;
  reviews?: (PullRequestNode | null)[] | null;
  reviewsCursor?: string | null;
  errors?: GraphqlError[];
  access?: Record<string, unknown>;
  headers?: Record<string, string>;
}

function readableRepo(nameWithOwner: string, isArchived = false) {
  return { nameWithOwner, viewerPermission: 'WRITE', isArchived };
}

function searchPage(
  nodes: (PullRequestNode | null)[] | null | undefined,
  cursor: string | null | undefined,
) {
  if (nodes === undefined) return undefined;
  if (nodes === null) return null;
  return {
    pageInfo: { hasNextPage: Boolean(cursor), endCursor: cursor ?? null },
    nodes,
  };
}

type SearchKey = 'mine' | 'reviews';

function searchKeyOf(request: RecordedRequest): SearchKey {
  return graphqlBody(request).variables.includeMine ? 'mine' : 'reviews';
}

function errorsFor(key: SearchKey, errors: GraphqlError[] | undefined) {
  const belongsTo = (error: GraphqlError): SearchKey =>
    error.path?.[0] === 'reviews' ? 'reviews' : 'mine';
  return errors?.filter((error) => belongsTo(error) === key);
}

function searchResponse(key: SearchKey, options: PageOptions): CannedResponse {
  const isMine = key === 'mine';
  return {
    headers: options.headers,
    body: {
      data: {
        ...(isMine ? options.access : {}),
        viewer: inboxPage.data.viewer,
        [key]: isMine
          ? searchPage(options.mine, options.mineCursor)
          : searchPage(options.reviews, options.reviewsCursor),
      },
      errors: errorsFor(key, options.errors),
    },
  };
}

function inboxReply(options: PageOptions): CannedReply {
  return async (request) => searchResponse(searchKeyOf(request), options);
}

function inboxReplies(options: PageOptions): CannedReply[] {
  return [inboxReply(options), inboxReply(options)];
}

function teamOrgsResponse(
  orgs: { login: string; teamCount: number }[],
): CannedResponse {
  return {
    body: {
      data: {
        viewer: {
          organizations: {
            nodes: orgs.map(({ login, teamCount }) => ({
              login,
              teams: { totalCount: teamCount },
            })),
          },
        },
      },
    },
  };
}

const teamMembersResponse: CannedResponse = {
  body: {
    data: {
      organization: {
        teams: {
          nodes: [
            {
              slug: 'backend',
              members: { nodes: [{ login: 'maria' }, { login: 'li' }] },
            },
          ],
        },
      },
    },
  },
};

const restrictedTeamOrgsResponse: CannedResponse = {
  body: {
    data: {
      viewer: { organizations: { nodes: [{ login: 'acme', teams: null }] } },
    },
    errors: [
      {
        type: 'FORBIDDEN',
        path: ['viewer', 'organizations', 'nodes', 0, 'teams'],
        message: ORG_RESTRICTION_MESSAGE,
      },
    ],
  },
};

const teamsResponses = [
  teamOrgsResponse([{ login: 'acme', teamCount: 1 }]),
  teamMembersResponse,
];

function pr(
  base: PullRequestNode,
  number: number,
  repo = 'acme/api',
): PullRequestNode {
  return {
    ...base,
    id: `PR_${repo}_${number}`,
    number,
    repository: { nameWithOwner: repo },
  };
}

function prs(count: number, offset = 0): PullRequestNode[] {
  return Array.from({ length: count }, (_, index) =>
    pr(singleNode, offset + index + 1),
  );
}

function setup(...replies: CannedReply[]) {
  const fake = createFakeFetch(...replies);
  const client = createGithubClient({ fetch: fake.fetch, apiUrl: API_URL });
  return { fake, client };
}

function variablesOf(fake: FakeFetch, index: number) {
  return graphqlBody(fake.requests[index]).variables;
}

function queryOf(fake: FakeFetch, index: number) {
  return graphqlBody(fake.requests[index]).query;
}

describe('createGithubClient', () => {
  describe('fetchInbox', () => {
    it('sends nothing when no repos are selected', async () => {
      const { fake, client } = setup();

      const inbox = await client.fetchInbox(TOKEN, []);

      expect(fake.requests).toHaveLength(0);
      expect(inbox.mine).toEqual([]);
      expect(inbox.reviews).toEqual([]);
    });

    it('adds one repo qualifier to both searches', async () => {
      const { fake, client } = setup(
        ...inboxReplies({ mine: [], reviews: [] }),
        ...teamsResponses,
      );

      await client.fetchInbox(TOKEN, ['acme/api']);

      expect(variablesOf(fake, 0)).toMatchObject({
        mineQuery: 'is:open is:pr author:@me archived:false repo:acme/api',
        reviewsQuery:
          'is:open is:pr review-requested:@me archived:false repo:acme/api',
      });
    });

    it('adds a qualifier for each of 40 repos', async () => {
      const repos = Array.from(
        { length: 40 },
        (_, index) => `acme/svc-${index}`,
      );
      const { fake, client } = setup(
        ...inboxReplies({ mine: [], reviews: [] }),
        ...teamsResponses,
      );

      await client.fetchInbox(TOKEN, repos);

      const { mineQuery, reviewsQuery } = variablesOf(fake, 0);
      for (const repo of repos) {
        expect(String(mineQuery).split(' ')).toContain(`repo:${repo}`);
        expect(String(reviewsQuery).split(' ')).toContain(`repo:${repo}`);
      }
    });

    it('sends each search as its own request so neither waits on the other', async () => {
      const { fake, client } = setup(
        ...inboxReplies({ mine: [pr(singleNode, 1)], reviews: [reviewNode] }),
        ...teamsResponses,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(variablesOf(fake, 0)).toMatchObject({
        includeMine: true,
        includeReviews: false,
      });
      expect(variablesOf(fake, 1)).toMatchObject({
        includeMine: false,
        includeReviews: true,
      });
      expect(queryOf(fake, 0)).toContain('repository(');
      expect(queryOf(fake, 1)).not.toContain('repository(');
      expect(inbox.mine.map((item) => item.number)).toEqual([1]);
      expect(inbox.reviews.map((item) => item.number)).toEqual([530]);
    });

    it('follows the cursor of the search that still has pages and merges them', async () => {
      const { fake, client } = setup(
        ...inboxReplies({
          mine: [pr(singleNode, 1)],
          mineCursor: 'cursor-1',
          reviews: [reviewNode],
        }),
        inboxReply({ mine: [pr(singleNode, 2)] }),
        ...teamsResponses,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(variablesOf(fake, 2)).toMatchObject({
        includeMine: true,
        includeReviews: false,
        mineCursor: 'cursor-1',
      });
      expect(queryOf(fake, 2)).not.toContain('repository(');
      expect(inbox.mine.map((item) => item.number)).toEqual([1, 2]);
      expect(inbox.reviews.map((item) => item.number)).toEqual([530]);
      expect(inbox.viewerTeams).toEqual([
        { org: 'acme', slug: 'backend', members: ['maria', 'li'] },
      ]);
      expect(inbox.truncated).toEqual({ mine: false, reviews: false });
    });

    it('stops at 300 PRs and marks the search truncated', async () => {
      const pages = Array.from({ length: 12 }, (_, page) =>
        inboxReply({
          mine: prs(25, page * 25),
          mineCursor: `cursor-${page + 1}`,
          reviews: [],
        }),
      );
      const { fake, client } = setup(
        pages[0],
        inboxReply({ reviews: [] }),
        ...pages.slice(1),
        ...teamsResponses,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(inbox.mine).toHaveLength(300);
      expect(inbox.truncated.mine).toBe(true);
      expect(fake.requests).toHaveLength(15);
    });

    it('keeps the good PRs and names the repo when part of the query fails', async () => {
      const { client } = setup(
        ...inboxReplies({
          mine: [pr(singleNode, 7, 'acme/web')],
          reviews: [reviewNode, null],
          errors: [
            {
              message: 'Resource not accessible by integration',
              path: ['reviews', 'nodes', 0, 'files'],
            },
            {
              message: 'Resource protected by organization SAML enforcement.',
              path: ['reviews', 'nodes', 1],
            },
          ],
        }),
        ...teamsResponses,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api', 'acme/web']);

      expect(inbox.mine.map((item) => item.number)).toEqual([7]);
      expect(inbox.reviews.map((item) => item.number)).toEqual([530]);
      expect(inbox.problems).toEqual([
        {
          kind: 'other',
          repo: 'acme/api',
          message: 'Resource not accessible by integration',
          actionUrl: null,
        },
        {
          kind: 'sso',
          repo: null,
          message: 'Resource protected by organization SAML enforcement.',
          actionUrl: null,
        },
      ]);
    });

    it('reports an unreadable repo and keeps the PRs of the other repos', async () => {
      const { fake, client } = setup(
        ...inboxReplies({
          access: { repo0: readableRepo('acme/api'), repo1: null },
          errors: [
            {
              type: 'NOT_FOUND',
              path: ['repo1'],
              message:
                "Could not resolve to a Repository with the name 'acme/gone'.",
            },
          ],
          mine: [pr(singleNode, 1, 'acme/api')],
          reviews: [],
        }),
        ...teamsResponses,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api', 'acme/gone']);

      expect(inbox.mine.map((item) => item.number)).toEqual([1]);
      expect(inbox.problems).toEqual([
        expect.objectContaining({
          kind: 'not_found',
          repo: 'acme/gone',
          actionUrl: null,
        }),
      ]);
      expect(variablesOf(fake, 0)).toMatchObject({
        owner1: 'acme',
        name1: 'gone',
      });
      expect(queryOf(fake, 0)).not.toContain('gone');
    });

    it('links a repo blocked by OAuth App restrictions to the Korev grant page', async () => {
      const { client } = setup(
        ...inboxReplies({
          access: { repo0: null },
          errors: [
            {
              type: 'FORBIDDEN',
              path: ['repo0'],
              message: ORG_RESTRICTION_MESSAGE,
            },
          ],
          mine: [],
          reviews: [],
        }),
        ...teamsResponses,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(inbox.problems).toEqual([
        expect.objectContaining({
          kind: 'restricted',
          repo: 'acme/api',
          actionUrl: `https://github.com/settings/connections/applications/${GITHUB_OAUTH_CLIENT_ID}`,
        }),
      ]);
    });

    it.each([
      {
        header: 'partial-results; organizations=1234',
        actionUrl: 'https://github.com/orgs/acme/sso',
      },
      {
        header:
          'required; url=https://github.com/orgs/acme/sso?authorization_request=abc',
        actionUrl: 'https://github.com/orgs/acme/sso?authorization_request=abc',
      },
    ])(
      'links a repo behind SAML to the SSO page for header "$header"',
      async ({ header, actionUrl }) => {
        const { client } = setup(
          ...inboxReplies({
            access: { repo0: null },
            errors: [
              { type: 'FORBIDDEN', path: ['repo0'], message: SAML_MESSAGE },
            ],
            headers: { 'X-GitHub-SSO': header },
            mine: [],
            reviews: [],
          }),
          ...teamsResponses,
        );

        const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

        expect(inbox.problems).toEqual([
          expect.objectContaining({ kind: 'sso', actionUrl }),
        ]);
      },
    );

    it('reports a renamed repo with its new name', async () => {
      const { client } = setup(
        ...inboxReplies({
          access: { repo0: readableRepo('acme/api-v2') },
          mine: [],
          reviews: [],
        }),
        ...teamsResponses,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(inbox.renamedRepos).toEqual([
        { from: 'acme/api', to: 'acme/api-v2' },
      ]);
      expect(inbox.problems).toEqual([]);
    });

    it("reads each watched repo's owner avatar", async () => {
      const avatarUrl = 'https://avatars.githubusercontent.com/u/1?s=32';
      const { client } = setup(
        ...inboxReplies({
          access: {
            repo0: { ...readableRepo('acme/api'), owner: { avatarUrl } },
          },
          mine: [],
          reviews: [],
        }),
        ...teamsResponses,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(inbox.repoAvatars).toEqual({ 'acme/api': avatarUrl });
    });

    it('notes an archived repo', async () => {
      const { client } = setup(
        ...inboxReplies({
          access: { repo0: readableRepo('acme/api', true) },
          mine: [],
          reviews: [],
        }),
        ...teamsResponses,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(inbox.problems).toEqual([
        expect.objectContaining({ kind: 'archived', repo: 'acme/api' }),
      ]);
    });

    it('resends without stacks when GitHub rejects the stack field and stays off for the session', async () => {
      const stackRejected: CannedResponse = {
        body: {
          errors: [
            {
              message: "Field 'stack' doesn't exist on type 'PullRequest'",
              extensions: { code: 'undefinedField', fieldName: 'stack' },
            },
          ],
        },
      };
      const { fake, client } = setup(
        stackRejected,
        stackRejected,
        ...inboxReplies({ mine: [pr(singleNode, 1)], reviews: [] }),
        ...teamsResponses,
        ...inboxReplies({ mine: [], reviews: [] }),
      );

      const first = await client.fetchInbox(TOKEN, ['acme/api']);
      const second = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(queryOf(fake, 0)).toContain('stackEntry');
      expect(queryOf(fake, 2)).not.toContain('stackEntry');
      expect(queryOf(fake, 3)).not.toContain('stackEntry');
      expect(queryOf(fake, 6)).not.toContain('stackEntry');
      expect(first.mine).toHaveLength(1);
      expect(first.stacksUnavailable).toBe(true);
      expect(second.stacksUnavailable).toBe(true);
      expect(fake.requests).toHaveLength(8);
    });

    it('throws when GitHub rejects the query for any other reason', async () => {
      const filesRejected: CannedResponse = {
        body: {
          errors: [
            {
              message: "Field 'files' doesn't exist on type 'PullRequest'",
              extensions: { code: 'undefinedField', fieldName: 'files' },
            },
          ],
        },
      };
      const { client } = setup(filesRejected, filesRejected);

      await expect(
        client.fetchInbox(TOKEN, ['acme/api']),
      ).rejects.toBeInstanceOf(GraphqlQueryError);
    });

    it('reads only whether each review thread is resolved, never its comments', () => {
      const query = buildInboxQuery({ includeStacks: true, accessTargets: [] });
      const threads = /reviewThreads\([^)]*\) \{([^}]*\}[^}]*)\}/.exec(
        query,
      )?.[1];

      expect(threads).toContain('isResolved');
      expect(threads).not.toMatch(/comments|body|authorAssociation/);
    });

    it('fetches the remaining review threads so thread #101 counts', async () => {
      const busyNode: PullRequestNode = {
        ...pr(stackedNode, 9),
        reviewThreads: {
          pageInfo: { hasNextPage: true, endCursor: 'threads-100' },
          nodes: Array.from({ length: 100 }, () => ({ isResolved: true })),
        },
      };
      const { fake, client } = setup(
        ...inboxReplies({ mine: [busyNode], reviews: [] }),
        {
          body: {
            data: {
              node: {
                reviewThreads: {
                  pageInfo: { hasNextPage: false, endCursor: 'threads-101' },
                  nodes: [{ isResolved: false }],
                },
              },
            },
          },
        },
        ...teamsResponses,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(variablesOf(fake, 2)).toEqual({
        id: busyNode.id,
        cursor: 'threads-100',
      });
      expect(inbox.mine[0].unresolvedThreads).toBe(1);
    });

    it('fetches the viewer teams once per session', async () => {
      const { fake, client } = setup(
        ...inboxReplies({ mine: [], reviews: [] }),
        ...teamsResponses,
        ...inboxReplies({ mine: [], reviews: [] }),
        ...inboxReplies({ mine: [], reviews: [] }),
        ...teamsResponses,
      );

      await client.fetchInbox(TOKEN, ['acme/api']);
      const cached = await client.fetchInbox(TOKEN, ['acme/api']);
      client.clearSessionCache();
      await client.fetchInbox(TOKEN, ['acme/api']);

      expect(cached.viewerTeams).toEqual([
        { org: 'acme', slug: 'backend', members: ['maria', 'li'] },
      ]);
      expect(fake.requests).toHaveLength(10);
    });

    it('reports a team lookup blocked by OAuth App restrictions', async () => {
      const { client } = setup(
        ...inboxReplies({ mine: [], reviews: [] }),
        restrictedTeamOrgsResponse,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(inbox.problems).toEqual([
        expect.objectContaining({
          kind: 'restricted',
          actionUrl: `https://github.com/settings/connections/applications/${GITHUB_OAUTH_CLIENT_ID}`,
        }),
      ]);
    });

    it('looks the viewer teams up again after a failed lookup', async () => {
      const { fake, client } = setup(
        ...inboxReplies({ mine: [], reviews: [] }),
        restrictedTeamOrgsResponse,
        ...inboxReplies({ mine: [], reviews: [] }),
        ...teamsResponses,
      );

      await client.fetchInbox(TOKEN, ['acme/api']);
      const retried = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(retried.viewerTeams).toEqual([
        { org: 'acme', slug: 'backend', members: ['maria', 'li'] },
      ]);
      expect(fake.requests).toHaveLength(7);
    });

    it('reads team members only in orgs where the viewer is on a team', async () => {
      const { fake, client } = setup(
        ...inboxReplies({ mine: [], reviews: [] }),
        teamOrgsResponse([
          { login: 'solo', teamCount: 0 },
          { login: 'acme', teamCount: 1 },
        ]),
        teamMembersResponse,
      );

      const inbox = await client.fetchInbox(TOKEN, ['acme/api']);

      expect(variablesOf(fake, 3)).toEqual({ org: 'acme', login: 'maria' });
      expect(inbox.viewerTeams).toEqual([
        { org: 'acme', slug: 'backend', members: ['maria', 'li'] },
      ]);
      expect(fake.requests).toHaveLength(4);
    });
  });

  it('reads the viewer and the granted scopes', async () => {
    const { client } = setup({
      headers: { 'X-OAuth-Scopes': 'read:org, repo' },
      body: { data: { viewer: inboxPage.data.viewer } },
    });

    expect(await client.fetchViewer(TOKEN)).toEqual({
      login: 'maria',
      avatarUrl: inboxPage.data.viewer.avatarUrl,
      scopes: ['read:org', 'repo'],
    });
  });

  it('suggests repos ordered by how many PRs mention them', async () => {
    const mention = (repo: string) => ({ repository: { nameWithOwner: repo } });
    const { client } = setup({
      body: {
        data: {
          involved: {
            nodes: [mention('acme/web'), mention('acme/api'), {}],
          },
          requested: {
            nodes: [mention('acme/api'), mention('acme/infra')],
          },
        },
      },
    });

    expect(await client.fetchSuggestedRepos(TOKEN)).toEqual([
      'acme/api',
      'acme/infra',
      'acme/web',
    ]);
  });
});
