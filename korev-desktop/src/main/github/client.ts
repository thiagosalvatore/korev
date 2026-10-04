import type { Problem } from '../../shared/inbox';
import type { RepoMergeInfo } from '../../shared/merge';
import type { PullRequest } from '../../shared/pull-request';
import type { RepoOwner, RepoPage } from '../../shared/repos';
import { splitRepoName } from '../repo-names';
import { SSO_HEADER, accessActionUrl, classifyAccess } from './access';
import { SEARCH_RESULT_CAP } from './config';
import { StackFieldRejectedError, redactToken } from './errors';
import { type GraphqlError, type GraphqlPathSegment, graphql } from './graphql';
import { toPullRequest } from './map-pull-request';
import {
  type NotificationsRequest,
  type NotificationsResult,
  fetchNotifications,
} from './notifications';
import {
  type Connection,
  type PullRequestNode,
  type ReviewThreadNode,
  presentNodes,
} from './nodes';
import {
  INBOX_SEARCH,
  type InboxQueryVariables,
  type RepoAccessTarget,
  REVIEW_THREADS_QUERY,
  SUGGESTED_REPOS_QUERY,
  TEAM_MEMBERS_QUERY,
  VIEWER_QUERY,
  VIEWER_TEAMS_QUERY,
  buildInboxQuery,
  repoAccessTargets,
  repoAccessVariables,
  searchString,
} from './queries';
import {
  type RepoRename,
  isRepoAccessError,
  readRepoAccess,
} from './repo-access';
import { RepoPicker } from './repo-picker';
import type { FetchLike, ResponseHeaders } from './request';

export interface GithubClientDeps {
  fetch: FetchLike;
  apiUrl: string;
}

export interface Viewer {
  login: string;
  avatarUrl: string;
  scopes: string[];
}

export interface ViewerTeam {
  org: string;
  slug: string;
  members: string[];
}

export interface InboxResult {
  viewerLogin: string | null;
  viewerTeams: ViewerTeam[];
  mine: PullRequest[];
  reviews: PullRequest[];
  truncated: { mine: boolean; reviews: boolean };
  problems: Problem[];
  renamedRepos: RepoRename[];
  repoMerge: Record<string, RepoMergeInfo>;
  repoAvatars: Record<string, string>;
  stacksUnavailable: boolean;
}

export interface GithubClient {
  fetchViewer(token: string, signal?: AbortSignal): Promise<Viewer>;
  fetchInbox(
    token: string,
    repos: string[],
    signal?: AbortSignal,
  ): Promise<InboxResult>;
  fetchSuggestedRepos(token: string, signal?: AbortSignal): Promise<string[]>;
  checkNotifications(
    token: string,
    request: NotificationsRequest,
  ): Promise<NotificationsResult>;
  fetchRepoOwners(token: string): Promise<RepoOwner[]>;
  fetchRepoPage(
    token: string,
    owner: string,
    cursor: string | null,
  ): Promise<RepoPage>;
  searchRepos(token: string, owner: string, term: string): Promise<string[]>;
  clearSessionCache(): void;
}

type SearchKey = 'mine' | 'reviews';

const SEARCH_KEYS: readonly SearchKey[] = ['mine', 'reviews'];

const SCOPES_HEADER = 'x-oauth-scopes';

interface SearchProgress {
  nodes: PullRequestNode[];
  cursor: string | null;
  done: boolean;
  truncated: boolean;
}

type SearchConnection = Connection<PullRequestNode>;

interface ViewerData {
  viewer: { login: string; avatarUrl: string };
}

type InboxData = ViewerData & Partial<Record<SearchKey, SearchConnection>>;

interface CollectedSearches {
  viewerLogin: string;
  progress: Record<SearchKey, SearchProgress>;
  problems: Problem[];
  renamedRepos: RepoRename[];
  repoMerge: Record<string, RepoMergeInfo>;
  repoAvatars: Record<string, string>;
}

interface TeamLookup {
  teams: ViewerTeam[];
  problems: Problem[];
}

interface InboxPageRequest {
  variables: InboxQueryVariables;
  accessTargets: RepoAccessTarget[];
}

interface ViewerTeamsData {
  viewer: {
    organizations?: Connection<{
      login: string;
      teams?: { totalCount: number } | null;
    }>;
  };
}

interface TeamMembersData {
  organization?: {
    teams?: Connection<{
      slug: string;
      members?: Connection<{ login: string }>;
    }>;
  } | null;
}

interface ReviewThreadsData {
  node?: { reviewThreads?: Connection<ReviewThreadNode> } | null;
}

type SuggestedReposData = Record<
  string,
  Connection<{ repository?: { nameWithOwner: string } }>
>;

export function createGithubClient(deps: GithubClientDeps): GithubClient {
  return new GithubApiClient(deps);
}

class GithubApiClient implements GithubClient {
  #stacksUnavailable = false;
  #teamsByLogin = new Map<string, ViewerTeam[]>();
  #repoPicker = new RepoPicker(
    <TData>(token: string, query: string, variables: Record<string, unknown>) =>
      this.#query<TData>(token, query, variables),
  );

  constructor(private readonly deps: GithubClientDeps) {}

  clearSessionCache(): void {
    this.#stacksUnavailable = false;
    this.#teamsByLogin.clear();
    this.#repoPicker.clear();
  }

  fetchRepoOwners(token: string): Promise<RepoOwner[]> {
    return this.#repoPicker.owners(token);
  }

  fetchRepoPage(
    token: string,
    owner: string,
    cursor: string | null,
  ): Promise<RepoPage> {
    return this.#repoPicker.page(token, owner, cursor);
  }

  searchRepos(token: string, owner: string, term: string): Promise<string[]> {
    return this.#repoPicker.search(token, owner, term);
  }

  async fetchViewer(token: string, signal?: AbortSignal): Promise<Viewer> {
    const result = await this.#query<ViewerData>(
      token,
      VIEWER_QUERY,
      {},
      signal,
    );
    return {
      login: result.data.viewer.login,
      avatarUrl: result.data.viewer.avatarUrl,
      scopes: parseScopes(result.headers.get(SCOPES_HEADER)),
    };
  }

  async fetchInbox(
    token: string,
    repos: string[],
    signal?: AbortSignal,
  ): Promise<InboxResult> {
    if (repos.length === 0) return this.#emptyInbox();
    const searches = await this.#collectSearches(token, repos, signal);
    const mineNodes = await Promise.all(
      searches.progress.mine.nodes.map((node) =>
        this.#withAllReviewThreads(token, node, signal),
      ),
    );
    const teamLookup = await this.#viewerTeams(
      token,
      searches.viewerLogin,
      signal,
    );
    return {
      viewerLogin: searches.viewerLogin,
      viewerTeams: teamLookup.teams,
      mine: mineNodes.map((node) => toPullRequest(node)),
      reviews: searches.progress.reviews.nodes.map((node) =>
        toPullRequest(node),
      ),
      truncated: {
        mine: searches.progress.mine.truncated,
        reviews: searches.progress.reviews.truncated,
      },
      problems: uniqueProblems([...searches.problems, ...teamLookup.problems]),
      renamedRepos: searches.renamedRepos,
      repoMerge: searches.repoMerge,
      repoAvatars: searches.repoAvatars,
      stacksUnavailable: this.#stacksUnavailable,
    };
  }

  async fetchSuggestedRepos(
    token: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const result = await this.#query<SuggestedReposData>(
      token,
      SUGGESTED_REPOS_QUERY,
      {},
      signal,
    );
    const repos = Object.values(result.data).flatMap((search) =>
      presentNodes(search).flatMap((node) =>
        node.repository ? [node.repository.nameWithOwner] : [],
      ),
    );
    return byMentionCount(repos);
  }

  checkNotifications(
    token: string,
    request: NotificationsRequest,
  ): Promise<NotificationsResult> {
    return fetchNotifications(
      this.deps.fetch,
      this.deps.apiUrl,
      token,
      request,
    );
  }

  #emptyInbox(): InboxResult {
    return {
      viewerLogin: null,
      viewerTeams: [],
      mine: [],
      reviews: [],
      truncated: { mine: false, reviews: false },
      problems: [],
      renamedRepos: [],
      repoMerge: {},
      repoAvatars: {},
      stacksUnavailable: this.#stacksUnavailable,
    };
  }

  async #collectSearches(
    token: string,
    repos: string[],
    signal?: AbortSignal,
  ): Promise<CollectedSearches> {
    const queries: Record<SearchKey, string> = {
      mine: searchString(INBOX_SEARCH.mine, repos),
      reviews: searchString(INBOX_SEARCH.reviews, repos),
    };
    const collected: CollectedSearches = {
      viewerLogin: '',
      progress: { mine: startProgress(), reviews: startProgress() },
      problems: [],
      renamedRepos: [],
      repoMerge: {},
      repoAvatars: {},
    };
    let accessTargets = repoAccessTargets(repos);
    while (SEARCH_KEYS.some((key) => !collected.progress[key].done)) {
      const variables = inboxVariables(queries, collected.progress);
      const result = await this.#inboxPage(
        token,
        { variables, accessTargets },
        signal,
      );
      collected.viewerLogin = result.data.viewer.login;
      recordRepoAccess(collected, accessTargets, result, token);
      collected.progress = advanceAll(collected.progress, result.data);
      accessTargets = [];
    }
    return collected;
  }

  async #inboxPage(
    token: string,
    request: InboxPageRequest,
    signal?: AbortSignal,
  ) {
    const variables = {
      ...request.variables,
      ...repoAccessVariables(request.accessTargets),
    };
    const query = buildInboxQuery({
      includeStacks: !this.#stacksUnavailable,
      accessTargets: request.accessTargets,
    });
    try {
      return await this.#query<InboxData>(token, query, variables, signal);
    } catch (error) {
      if (!(error instanceof StackFieldRejectedError)) throw error;
      this.#stacksUnavailable = true;
      const withoutStacks = buildInboxQuery({
        includeStacks: false,
        accessTargets: request.accessTargets,
      });
      return this.#query<InboxData>(token, withoutStacks, variables, signal);
    }
  }

  async #withAllReviewThreads(
    token: string,
    node: PullRequestNode,
    signal?: AbortSignal,
  ): Promise<PullRequestNode> {
    const firstPage = node.reviewThreads;
    if (!firstPage?.pageInfo?.hasNextPage) return node;
    const threads = presentNodes(firstPage);
    let cursor = firstPage.pageInfo.endCursor ?? null;
    while (cursor) {
      const page = await this.#reviewThreadsPage(
        token,
        node.id,
        cursor,
        signal,
      );
      threads.push(...presentNodes(page));
      cursor = page?.pageInfo?.hasNextPage
        ? (page.pageInfo.endCursor ?? null)
        : null;
    }
    return {
      ...node,
      reviewThreads: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: threads,
      },
    };
  }

  async #reviewThreadsPage(
    token: string,
    id: string,
    cursor: string,
    signal?: AbortSignal,
  ): Promise<Connection<ReviewThreadNode> | undefined> {
    const result = await this.#query<ReviewThreadsData>(
      token,
      REVIEW_THREADS_QUERY,
      { id, cursor },
      signal,
    );
    return result.data.node?.reviewThreads;
  }

  async #viewerTeams(
    token: string,
    login: string,
    signal?: AbortSignal,
  ): Promise<TeamLookup> {
    const cached = this.#teamsByLogin.get(login);
    if (cached) return { teams: cached, problems: [] };
    const result = await this.#query<ViewerTeamsData>(
      token,
      VIEWER_TEAMS_QUERY,
      { login },
      signal,
    );
    const perOrg = await Promise.all(
      orgsWithViewerTeams(result.data).map((org) =>
        this.#orgTeams(token, org, login, signal),
      ),
    );
    const lookup: TeamLookup = {
      teams: perOrg.flatMap((org) => org.teams),
      problems: [
        ...resultProblems(result, token),
        ...perOrg.flatMap((org) => org.problems),
      ],
    };
    if (lookup.problems.length === 0) {
      this.#teamsByLogin.set(login, lookup.teams);
    }
    return lookup;
  }

  async #orgTeams(
    token: string,
    org: string,
    login: string,
    signal?: AbortSignal,
  ): Promise<TeamLookup> {
    const result = await this.#query<TeamMembersData>(
      token,
      TEAM_MEMBERS_QUERY,
      { org, login },
      signal,
    );
    return {
      teams: toViewerTeams(org, result.data),
      problems: resultProblems(result, token),
    };
  }

  #query<TData>(
    token: string,
    query: string,
    variables: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    return graphql<TData>(this.deps.fetch, {
      apiUrl: this.deps.apiUrl,
      token,
      query,
      variables,
      signal,
    });
  }
}

function startProgress(): SearchProgress {
  return { nodes: [], cursor: null, done: false, truncated: false };
}

function inboxVariables(
  queries: Record<SearchKey, string>,
  progress: Record<SearchKey, SearchProgress>,
): InboxQueryVariables {
  return {
    mineQuery: queries.mine,
    reviewsQuery: queries.reviews,
    includeMine: !progress.mine.done,
    includeReviews: !progress.reviews.done,
    mineCursor: progress.mine.cursor,
    reviewsCursor: progress.reviews.cursor,
  };
}

function advanceAll(
  progress: Record<SearchKey, SearchProgress>,
  data: InboxData,
): Record<SearchKey, SearchProgress> {
  return {
    mine: advance(progress.mine, data.mine),
    reviews: advance(progress.reviews, data.reviews),
  };
}

function advance(
  progress: SearchProgress,
  connection: SearchConnection | undefined,
): SearchProgress {
  if (progress.done) return progress;
  if (!connection) return { ...progress, done: true };
  const nodes = uniqueById([
    ...progress.nodes,
    ...pullRequestNodes(connection),
  ]);
  const nextCursor = connection.pageInfo?.hasNextPage
    ? (connection.pageInfo.endCursor ?? null)
    : null;
  if (nodes.length >= SEARCH_RESULT_CAP) {
    return {
      nodes: nodes.slice(0, SEARCH_RESULT_CAP),
      cursor: null,
      done: true,
      truncated: nextCursor !== null || nodes.length > SEARCH_RESULT_CAP,
    };
  }
  return {
    nodes,
    cursor: nextCursor,
    done: nextCursor === null,
    truncated: false,
  };
}

function pullRequestNodes(connection: SearchConnection): PullRequestNode[] {
  return presentNodes(connection).filter(
    (node) => typeof node.id === 'string' && Boolean(node.repository),
  );
}

function uniqueById(nodes: PullRequestNode[]): PullRequestNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

function recordRepoAccess(
  collected: CollectedSearches,
  accessTargets: RepoAccessTarget[],
  result: { data: InboxData; errors: GraphqlError[]; headers: ResponseHeaders },
  token: string,
): void {
  const ssoHeader = result.headers.get(SSO_HEADER);
  const access = readRepoAccess(accessTargets, {
    data: result.data,
    errors: result.errors,
    ssoHeader,
    token,
  });
  const otherErrors = result.errors.filter(
    (error) => !isRepoAccessError(error, accessTargets),
  );
  collected.problems.push(
    ...access.problems,
    ...toProblems(otherErrors, result.data, ssoHeader, token),
  );
  collected.renamedRepos.push(...access.renames);
  Object.assign(collected.repoMerge, access.merge);
  Object.assign(collected.repoAvatars, access.avatars);
}

function toProblems(
  errors: GraphqlError[],
  data: unknown,
  ssoHeader: string | null,
  token: string,
): Problem[] {
  return errors.map((error) => {
    const repo = repoAtPath(data, error.path ?? []);
    const kind = classifyAccess(error, ssoHeader);
    const owner = repo ? splitRepoName(repo).owner : null;
    return {
      kind,
      repo,
      message: redactToken(error.message, token),
      actionUrl: accessActionUrl(kind, owner, ssoHeader),
    };
  });
}

function repoAtPath(root: unknown, path: GraphqlPathSegment[]): string | null {
  let current = root;
  let repo: string | null = null;
  for (const segment of path) {
    current = childAt(current, segment);
    repo = repositoryName(current) ?? repo;
  }
  return repo;
}

function childAt(parent: unknown, segment: GraphqlPathSegment): unknown {
  if (typeof parent !== 'object' || parent === null) return undefined;
  return (parent as Record<GraphqlPathSegment, unknown>)[segment];
}

function repositoryName(value: unknown): string | null {
  const repository = childAt(value, 'repository');
  const name = childAt(repository, 'nameWithOwner');
  return typeof name === 'string' ? name : null;
}

function resultProblems(
  result: { data: unknown; errors: GraphqlError[]; headers: ResponseHeaders },
  token: string,
): Problem[] {
  return toProblems(
    result.errors,
    result.data,
    result.headers.get(SSO_HEADER),
    token,
  );
}

function uniqueProblems(problems: Problem[]): Problem[] {
  const byKey = new Map(
    problems.map((problem) => [`${problem.repo}\n${problem.message}`, problem]),
  );
  return [...byKey.values()];
}

function orgsWithViewerTeams(data: ViewerTeamsData): string[] {
  return presentNodes(data.viewer.organizations)
    .filter((organization) => (organization.teams?.totalCount ?? 0) > 0)
    .map((organization) => organization.login);
}

function toViewerTeams(org: string, data: TeamMembersData): ViewerTeam[] {
  return presentNodes(data.organization?.teams).map((team) => ({
    org,
    slug: team.slug,
    members: presentNodes(team.members).map((member) => member.login),
  }));
}

function parseScopes(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope !== '');
}

function byMentionCount(repos: string[]): string[] {
  const counts = new Map<string, number>();
  repos.forEach((repo) => counts.set(repo, (counts.get(repo) ?? 0) + 1));
  return [...counts.entries()]
    .sort(
      ([firstRepo, firstCount], [secondRepo, secondCount]) =>
        secondCount - firstCount || firstRepo.localeCompare(secondRepo),
    )
    .map(([repo]) => repo);
}
