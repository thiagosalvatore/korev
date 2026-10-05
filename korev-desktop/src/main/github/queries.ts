import { type RepoParts, isRepoName, splitRepoName } from '../repo-names';
import {
  CHECK_CONTEXTS_LIMIT,
  FILES_LIMIT,
  LATEST_REVIEWS_LIMIT,
  PR_COMMENTS_LIMIT,
  REPO_AVATAR_SIZE,
  ORGANIZATIONS_LIMIT,
  REVIEW_REQUESTS_LIMIT,
  REPO_PAGE_SIZE,
  REPO_SEARCH_SIZE,
  REVIEW_THREADS_LIMIT,
  SEARCH_PAGE_SIZE,
  STACK_ENTRIES_LIMIT,
  SUGGESTED_REPOS_SEARCH_SIZE,
  TEAMS_LIMIT,
  TEAM_MEMBERS_LIMIT,
  TIMELINE_EVENTS_LIMIT,
} from './config';

export const INBOX_SEARCH = {
  mine: 'is:open is:pr author:@me archived:false',
  reviews: 'is:open is:pr review-requested:@me archived:false',
} as const;

export const SUGGESTED_REPOS_SEARCH = {
  involved: 'is:open is:pr involves:@me archived:false',
  requested: 'is:open is:pr review-requested:@me archived:false',
} as const;

export interface RepoAccessTarget extends RepoParts {
  repo: string;
  alias: string;
  ownerVariable: string;
  nameVariable: string;
}

export interface InboxQueryOptions {
  includeStacks: boolean;
  accessTargets: RepoAccessTarget[];
}

export type OwnerQualifier = 'org' | 'user';

const REPO_ALIAS_PREFIX = 'repo';
const OWNER_VARIABLE_PREFIX = 'owner';
const NAME_VARIABLE_PREFIX = 'name';
const REPO_ACCESS_FIELDS = `nameWithOwner viewerPermission isArchived
    viewerDefaultMergeMethod mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed
    mergeQueue { id }
    owner { avatarUrl(size: ${REPO_AVATAR_SIZE}) }`;
const IN_NAME_QUALIFIER = 'in:name';

export type InboxQueryVariables = {
  mineQuery: string;
  reviewsQuery: string;
  includeMine: boolean;
  includeReviews: boolean;
  mineCursor: string | null;
  reviewsCursor: string | null;
};

export function searchString(base: string, repos: string[]): string {
  return [base, ...repos.map((repo) => `repo:${repo}`)].join(' ');
}

export function repoAccessTargets(repos: string[]): RepoAccessTarget[] {
  return repos.filter(isRepoName).map((repo, index) => ({
    repo,
    ...splitRepoName(repo),
    alias: `${REPO_ALIAS_PREFIX}${index}`,
    ownerVariable: `${OWNER_VARIABLE_PREFIX}${index}`,
    nameVariable: `${NAME_VARIABLE_PREFIX}${index}`,
  }));
}

export function repoAccessVariables(
  targets: RepoAccessTarget[],
): Record<string, string> {
  return Object.fromEntries(
    targets.flatMap((target) => [
      [target.ownerVariable, target.owner],
      [target.nameVariable, target.name],
    ]),
  );
}

function repoAccessDeclarations(targets: RepoAccessTarget[]): string {
  return targets
    .map(
      (target) =>
        `$${target.ownerVariable}: String!\n  $${target.nameVariable}: String!`,
    )
    .join('\n  ');
}

function repoAccessSelections(targets: RepoAccessTarget[]): string {
  return targets
    .map(
      (target) =>
        `${target.alias}: repository(owner: $${target.ownerVariable}, name: $${target.nameVariable}) { ${REPO_ACCESS_FIELDS} }`,
    )
    .join('\n  ');
}

export function repoSearchString(
  qualifier: OwnerQualifier,
  owner: string,
  words: string,
): string {
  return `${qualifier}:${owner} ${words} ${IN_NAME_QUALIFIER}`;
}

const REVIEWER_FIELDS = `
  __typename
  ... on User { login }
  ... on Team { slug organization { login } }
`;

const STACK_FIELDS = `
  stack {
    id
    size
    baseRefName
    entries(first: ${STACK_ENTRIES_LIMIT}) {
      nodes {
        position
        pullRequest { number title url state isDraft author { login } }
      }
    }
  }
  stackEntry { position }
`;

const REVIEW_THREAD_CONNECTION = `
  pageInfo { hasNextPage endCursor }
  nodes { isResolved }
`;

function prCoreFragment({ includeStacks }: InboxQueryOptions): string {
  return `
fragment PrCore on PullRequest {
  id
  number
  title
  url
  state
  isDraft
  createdAt
  updatedAt
  repository { nameWithOwner }
  headRefName
  baseRefName
  headRefOid
  headRepository { url }
  isCrossRepository
  maintainerCanModify
  author { login avatarUrl }
  reviewDecision
  mergeable
  mergeStateStatus
  additions
  deletions
  changedFiles
  statusCheckRollup {
    state
    contexts(first: ${CHECK_CONTEXTS_LIMIT}) {
      nodes {
        __typename
        ... on CheckRun { name status conclusion }
        ... on StatusContext { context state }
      }
    }
  }
  latestReviews(first: ${LATEST_REVIEWS_LIMIT}) {
    nodes { author { __typename login } state }
  }
  ${includeStacks ? STACK_FIELDS : ''}
}`;
}

const MY_PR_FRAGMENT = `
fragment MyPrFields on PullRequest {
  ...PrCore
  isInMergeQueue
  reviewThreads(first: ${REVIEW_THREADS_LIMIT}) { ${REVIEW_THREAD_CONNECTION} }
  comments(last: ${PR_COMMENTS_LIMIT}) {
    nodes { author { __typename login } body createdAt updatedAt url }
  }
  commits(last: 1) { nodes { commit { committedDate } } }
}`;

const REVIEW_REQUEST_FRAGMENT = `
fragment ReviewRequestFields on PullRequest {
  ...PrCore
  files(first: ${FILES_LIMIT}) {
    pageInfo { hasNextPage }
    nodes { path additions deletions }
  }
  reviewRequests(first: ${REVIEW_REQUESTS_LIMIT}) {
    nodes { requestedReviewer { ${REVIEWER_FIELDS} } }
  }
  timelineItems(
    itemTypes: [REVIEW_REQUESTED_EVENT]
    last: ${TIMELINE_EVENTS_LIMIT}
  ) {
    nodes {
      ... on ReviewRequestedEvent {
        createdAt
        requestedReviewer { ${REVIEWER_FIELDS} }
      }
    }
  }
}`;

export function buildInboxQuery(options: InboxQueryOptions): string {
  return `
query Inbox(
  $mineQuery: String!
  $reviewsQuery: String!
  $includeMine: Boolean!
  $includeReviews: Boolean!
  $mineCursor: String
  $reviewsCursor: String
  ${repoAccessDeclarations(options.accessTargets)}
) {
  viewer { login avatarUrl }
  ${repoAccessSelections(options.accessTargets)}
  mine: search(
    type: ISSUE
    first: ${SEARCH_PAGE_SIZE}
    after: $mineCursor
    query: $mineQuery
  ) @include(if: $includeMine) {
    pageInfo { hasNextPage endCursor }
    nodes { ...MyPrFields }
  }
  reviews: search(
    type: ISSUE
    first: ${SEARCH_PAGE_SIZE}
    after: $reviewsCursor
    query: $reviewsQuery
  ) @include(if: $includeReviews) {
    pageInfo { hasNextPage endCursor }
    nodes { ...ReviewRequestFields }
  }
}
${prCoreFragment(options)}
${MY_PR_FRAGMENT}
${REVIEW_REQUEST_FRAGMENT}`;
}

export const VIEWER_QUERY = `
query Viewer {
  viewer { login avatarUrl }
}`;

export const VIEWER_TEAMS_QUERY = `
query ViewerTeams($login: String!) {
  viewer {
    organizations(first: ${ORGANIZATIONS_LIMIT}) {
      nodes {
        login
        teams(first: 1, userLogins: [$login]) { totalCount }
      }
    }
  }
}`;

export const TEAM_MEMBERS_QUERY = `
query TeamMembers($org: String!, $login: String!) {
  organization(login: $org) {
    teams(first: ${TEAMS_LIMIT}, userLogins: [$login]) {
      nodes {
        slug
        members(first: ${TEAM_MEMBERS_LIMIT}) { nodes { login } }
      }
    }
  }
}`;

export const REVIEW_THREADS_QUERY = `
query ReviewThreads($id: ID!, $cursor: String) {
  node(id: $id) {
    ... on PullRequest {
      reviewThreads(first: ${REVIEW_THREADS_LIMIT}, after: $cursor) {
        ${REVIEW_THREAD_CONNECTION}
      }
    }
  }
}`;

function repositorySearch(alias: string, query: string): string {
  return `
  ${alias}: search(
    type: ISSUE
    first: ${SUGGESTED_REPOS_SEARCH_SIZE}
    query: "${query}"
  ) {
    nodes { ... on PullRequest { repository { nameWithOwner } } }
  }`;
}

export const SUGGESTED_REPOS_QUERY = `
query SuggestedRepos {
  ${Object.entries(SUGGESTED_REPOS_SEARCH)
    .map(([alias, query]) => repositorySearch(alias, query))
    .join('\n')}
}`;

export const REPO_OWNERS_QUERY = `
query RepoOwners {
  viewer {
    login
    organizations(first: ${ORGANIZATIONS_LIMIT}) { nodes { login } }
  }
}`;

export const REPO_PAGE_QUERY = `
query RepoPage($owner: String!, $cursor: String) {
  repositoryOwner(login: $owner) {
    repositories(
      first: ${REPO_PAGE_SIZE}
      after: $cursor
      ownerAffiliations: [OWNER]
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner }
    }
  }
}`;

export const REPO_SEARCH_QUERY = `
query RepoSearch($query: String!) {
  search(type: REPOSITORY, query: $query, first: ${REPO_SEARCH_SIZE}) {
    nodes { ... on Repository { nameWithOwner } }
  }
}`;
