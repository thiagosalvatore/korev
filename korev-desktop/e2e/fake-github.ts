import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

export const VIEWER_LOGIN = 'maria';
export const API_REPO = 'acme/api';
export const WEB_REPO = 'acme/web';
export const FAILING_PR_TITLE = 'Rate-limit per tenant on ingestion endpoints';
export const NEW_PR_TITLE = 'Bump OpenTelemetry to 1.31';
export const WEB_PR_TITLE = 'Settings: org access states';
export const STALE_PR_TITLE = 'Old experiment with the exporter';

const GRANTED_SCOPES = 'repo, read:org';
const POLL_INTERVAL_SECONDS = '1';
const LOCAL_HOST = '127.0.0.1';
const ACCESS_ALIAS =
  /(repo\d+): repository\(owner: \$(owner\d+), name: \$(name\d+)\)/g;
const SEARCH_ALIAS = /(\w+): search\(/g;
const MERGE_ASYNC =
  /^\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)\/merge-async(?:\/([^/]+))?$/;
const HTTP_OK = 200;
const HTTP_ACCEPTED = 202;
const MS_PER_DAY = 86_400_000;

interface GraphqlRequest {
  query: string;
  variables?: Record<string, unknown>;
}

interface FakeComment {
  author: { __typename: string; login: string };
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface PrSpec {
  repo: string;
  number: number;
  title: string;
  mergeStateStatus: string;
  rollup: string;
  conclusion: string;
  quietDays?: number;
}

export const FAILING_PR_NUMBER = 491;

const FAILING_PR: PrSpec = {
  repo: API_REPO,
  number: FAILING_PR_NUMBER,
  title: FAILING_PR_TITLE,
  mergeStateStatus: 'BLOCKED',
  rollup: 'FAILURE',
  conclusion: 'FAILURE',
};

const NEW_PR: PrSpec = {
  repo: API_REPO,
  number: 480,
  title: NEW_PR_TITLE,
  mergeStateStatus: 'CLEAN',
  rollup: 'SUCCESS',
  conclusion: 'SUCCESS',
};

const STALE_PR: PrSpec = {
  repo: WEB_REPO,
  number: 290,
  title: STALE_PR_TITLE,
  mergeStateStatus: 'BLOCKED',
  rollup: 'FAILURE',
  conclusion: 'FAILURE',
  quietDays: 30,
};

function daysAgo(days: number): string {
  return new Date(Date.now() - days * MS_PER_DAY).toISOString();
}

function botComment(spec: PrSpec): FakeComment {
  const createdAt = daysAgo(1);
  return {
    author: { __typename: 'Bot', login: 'github-actions' },
    body: 'This PR has had no activity.',
    createdAt,
    updatedAt: createdAt,
    url: `https://github.com/${spec.repo}/pull/${spec.number}#issuecomment-2`,
  };
}

const WEB_PR: PrSpec = {
  repo: WEB_REPO,
  number: 304,
  title: WEB_PR_TITLE,
  mergeStateStatus: 'CLEAN',
  rollup: 'SUCCESS',
  conclusion: 'SUCCESS',
};

interface PrState {
  inMergeQueue: boolean;
  comments: FakeComment[];
}

function prNode(
  spec: PrSpec,
  state: PrState,
  headOid: string,
  conflicting: boolean,
) {
  return {
    id: `PR_${spec.number}`,
    number: spec.number,
    title: spec.title,
    url: `https://github.com/${spec.repo}/pull/${spec.number}`,
    state: 'OPEN',
    isDraft: false,
    createdAt: spec.quietDays
      ? daysAgo(spec.quietDays)
      : '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-03T10:00:00Z',
    repository: { nameWithOwner: spec.repo },
    headRefName: `feature-${spec.number}`,
    baseRefName: 'main',
    headRefOid: headOid,
    headRepository: { url: `https://github.com/${spec.repo}` },
    isCrossRepository: false,
    maintainerCanModify: false,
    author: { login: VIEWER_LOGIN, avatarUrl: null },
    reviewDecision: null,
    mergeable: conflicting ? 'CONFLICTING' : 'MERGEABLE',
    mergeStateStatus: conflicting ? 'DIRTY' : spec.mergeStateStatus,
    additions: 12,
    deletions: 3,
    changedFiles: 2,
    statusCheckRollup: {
      state: spec.rollup,
      contexts: {
        nodes: [
          {
            __typename: 'CheckRun',
            name: 'test',
            status: 'COMPLETED',
            conclusion: spec.conclusion,
          },
        ],
      },
    },
    latestReviews: { nodes: [] },
    isInMergeQueue: state.inMergeQueue,
    comments: { nodes: state.comments },
    commits: {
      nodes: [{ commit: { committedDate: daysAgo(spec.quietDays ?? 0) } }],
    },
    stack: null,
    stackEntry: null,
    reviewThreads: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [],
    },
  };
}

function connection(nodes: unknown[]) {
  return { pageInfo: { hasNextPage: false, endCursor: null }, nodes };
}

function accessAliases(
  request: GraphqlRequest,
  mergeQueueRepos: string[],
  ownerAvatarUrl: string | null,
) {
  const variables = request.variables ?? {};
  return Object.fromEntries(
    [...request.query.matchAll(ACCESS_ALIAS)].map(([, alias, owner, name]) => [
      alias,
      {
        nameWithOwner: `${variables[owner]}/${variables[name]}`,
        viewerPermission: 'WRITE',
        isArchived: false,
        viewerDefaultMergeMethod: 'SQUASH',
        mergeCommitAllowed: false,
        squashMergeAllowed: true,
        rebaseMergeAllowed: false,
        mergeQueue: mergeQueueRepos.includes(
          `${variables[owner]}/${variables[name]}`,
        )
          ? { id: 'MQ_1' }
          : null,
        owner: { avatarUrl: ownerAvatarUrl },
      },
    ]),
  );
}

function suggestedRepos(request: GraphqlRequest) {
  const nodes = [API_REPO, WEB_REPO].map((nameWithOwner) => ({
    repository: { nameWithOwner },
  }));
  return Object.fromEntries(
    [...request.query.matchAll(SEARCH_ALIAS)].map(([, alias]) => [
      alias,
      { nodes },
    ]),
  );
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(
  response: ServerResponse,
  body: unknown,
  headers = {},
  status = HTTP_OK,
) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'x-oauth-scopes': GRANTED_SCOPES,
    ...headers,
  });
  response.end(JSON.stringify(body));
}

export const PR_BODY =
  'Limits ingestion per tenant so one tenant cannot starve the rest.';

export interface FakeGithubOptions {
  headOids?: Record<number, string>;
  conflicting?: number[];
  mergeQueueRepos?: string[];
  ownerAvatarUrl?: string;
  includeNewPr?: boolean;
  includeStalePr?: boolean;
}

export interface FakeGithub {
  url: string;
  comments(repo: string, number: number): string[];
  publishNewPr(): void;
  holdInbox(): void;
  releaseInbox(): void;
  close(): Promise<void>;
}

export async function startFakeGithub(
  options: FakeGithubOptions = {},
): Promise<FakeGithub> {
  const mergeQueueRepos = options.mergeQueueRepos ?? [];
  const myPrs: PrSpec[] = [
    FAILING_PR,
    WEB_PR,
    ...(options.includeNewPr ? [NEW_PR] : []),
    ...(options.includeStalePr ? [STALE_PR] : []),
  ];
  const states = new Map<number, PrState>(
    [FAILING_PR, WEB_PR, NEW_PR, STALE_PR].map((spec) => [
      spec.number,
      {
        inMergeQueue: false,
        comments: spec.quietDays ? [botComment(spec)] : [],
      },
    ]),
  );
  const stateOf = (spec: PrSpec) => states.get(spec.number)!;
  const removePr = (number: number) => {
    const index = myPrs.findIndex((spec) => spec.number === number);
    if (index >= 0) myPrs.splice(index, 1);
  };
  const specById = (id: unknown) =>
    myPrs.find((spec) => `PR_${spec.number}` === id);

  function mutate(request: GraphqlRequest) {
    const { query, variables = {} } = request;
    const spec = specById(variables.id);
    if (query.includes('mutation ClosePullRequest') && spec) {
      removePr(spec.number);
      return { closePullRequest: { pullRequest: { id: variables.id } } };
    }
    if (query.includes('mutation AddComment') && spec) {
      const now = new Date().toISOString();
      stateOf(spec).comments.push({
        author: { __typename: 'User', login: VIEWER_LOGIN },
        body: String(variables.body),
        createdAt: now,
        updatedAt: now,
        url: `https://github.com/${spec.repo}/pull/${spec.number}#issuecomment-1`,
      });
      return { addComment: { clientMutationId: null } };
    }
    return null;
  }

  function mergeAsync(request: IncomingMessage, response: ServerResponse) {
    const [, repo, number, uuid] = MERGE_ASYNC.exec(request.url ?? '') ?? [];
    const spec = myPrs.find((candidate) => candidate.number === Number(number));
    if (!spec) return sendJson(response, { message: 'Not Found' }, {}, 404);
    if (uuid) {
      removePr(spec.number);
      return sendJson(response, {
        status: 'merged',
        details: { message: 'Pull request was merged.', sha: 'abc123' },
      });
    }
    if (mergeQueueRepos.includes(repo)) {
      stateOf(spec).inMergeQueue = true;
      return sendJson(response, {
        status: 'enqueued',
        details: { message: 'Pull request was added to the merge queue.' },
      });
    }
    return sendJson(
      response,
      { status: 'pending', details: { uuid: `merge-${number}` } },
      {},
      HTTP_ACCEPTED,
    );
  }

  let pendingThreadAt: string | null = null;
  let inboxGate: Promise<void> = Promise.resolve();
  let openInboxGate = () => undefined as void;

  function graphqlData(request: GraphqlRequest) {
    const { query } = request;
    if (query.includes('query SuggestedRepos')) return suggestedRepos(request);
    if (query.includes('query ViewerTeams')) {
      return { viewer: { organizations: { nodes: [] } } };
    }
    if (query.includes('query RepoOwners')) {
      return { viewer: { login: VIEWER_LOGIN, organizations: { nodes: [] } } };
    }
    if (query.includes('query PullRequestText')) {
      return {
        repository: { pullRequest: { body: PR_BODY, state: 'OPEN' } },
      };
    }
    const mutation = mutate(request);
    if (mutation) return mutation;
    if (query.includes('query Inbox')) {
      return {
        viewer: { login: VIEWER_LOGIN, avatarUrl: null },
        ...accessAliases(
          request,
          mergeQueueRepos,
          options.ownerAvatarUrl ?? null,
        ),
        mine: connection(
          myPrs.map((spec) =>
            prNode(
              spec,
              stateOf(spec),
              options.headOids?.[spec.number] ?? `head${spec.number}`,
              options.conflicting?.includes(spec.number) ?? false,
            ),
          ),
        ),
        reviews: connection([]),
      };
    }
    return { viewer: { login: VIEWER_LOGIN, avatarUrl: null } };
  }

  function notifications(response: ServerResponse) {
    const threads = pendingThreadAt
      ? [
          {
            repository: { full_name: API_REPO },
            subject: { type: 'PullRequest' },
            updated_at: pendingThreadAt,
          },
        ]
      : [];
    response.writeHead(200, {
      'content-type': 'application/json',
      'x-poll-interval': POLL_INTERVAL_SECONDS,
    });
    response.end(JSON.stringify(threads));
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (request.url?.startsWith('/notifications'))
      return notifications(response);
    if (MERGE_ASYNC.test(request.url ?? ''))
      return mergeAsync(request, response);
    if (request.method === 'POST' && request.url === '/graphql') {
      const body = JSON.parse(await readBody(request)) as GraphqlRequest;
      if (body.query.includes('query Inbox')) await inboxGate;
      return sendJson(response, { data: graphqlData(body) });
    }
    response.writeHead(404).end();
  }

  const server = createServer((request, response) => {
    void handle(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, LOCAL_HOST, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://${LOCAL_HOST}:${port}`,
    comments: (_repo, number) =>
      states.get(number)?.comments.map((comment) => comment.body) ?? [],
    publishNewPr() {
      myPrs.push(NEW_PR);
      pendingThreadAt = new Date().toISOString();
    },
    holdInbox() {
      inboxGate = new Promise((resolve) => {
        openInboxGate = resolve;
      });
    },
    releaseInbox() {
      openInboxGate();
    },
    close: () => {
      openInboxGate();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
