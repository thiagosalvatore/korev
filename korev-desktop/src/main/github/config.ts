export const GITHUB_OAUTH_CLIENT_ID = 'Ov23lipvD2QDKofV3jQh';
export const GITHUB_OAUTH_SCOPES = 'repo read:org';
export const GITHUB_API_URL = 'https://api.github.com';
export const GITHUB_WEB_URL = 'https://github.com';
export const GITHUB_API_VERSION = '2022-11-28';
export const GITHUB_USER_AGENT = 'Korev';

export const SEARCH_PAGE_SIZE = 10;
export const SEARCH_RESULT_CAP = 300;
export const STACK_ENTRIES_LIMIT = 20;
export const FILES_LIMIT = 100;
export const REVIEW_THREADS_LIMIT = 100;
export const TIMELINE_EVENTS_LIMIT = 20;
export const CHECK_CONTEXTS_LIMIT = 100;
export const REVIEW_REQUESTS_LIMIT = 30;
export const LATEST_REVIEWS_LIMIT = 30;
export const ORGANIZATIONS_LIMIT = 100;
export const TEAMS_LIMIT = 100;
export const TEAM_MEMBERS_LIMIT = 100;
export const PR_COMMENTS_LIMIT = 20;
export const THREAD_COMMENTS_LIMIT = 20;
export const REPO_AVATAR_SIZE = 32;
export const SUGGESTED_REPOS_SEARCH_SIZE = 100;
export const NOTIFICATIONS_PAGE_SIZE = 50;
export const NOTIFICATIONS_PAGE_CAP = 5;
export const REPO_PAGE_SIZE = 100;
export const REPO_SEARCH_SIZE = 20;

export interface GithubEndpoints {
  apiUrl: string;
  webUrl: string;
  gitUrl: string;
}

export const DEV_ENDPOINT_OVERRIDES = {
  apiUrl: 'KOREV_GITHUB_API_URL',
  webUrl: 'KOREV_GITHUB_WEB_URL',
  gitUrl: 'KOREV_GIT_URL',
} as const;

export function githubEndpoints(
  isPackaged: boolean,
  env: Record<string, string | undefined>,
): GithubEndpoints {
  const production = {
    apiUrl: GITHUB_API_URL,
    webUrl: GITHUB_WEB_URL,
    gitUrl: GITHUB_WEB_URL,
  };
  if (isPackaged) return production;
  return {
    apiUrl: env[DEV_ENDPOINT_OVERRIDES.apiUrl] || production.apiUrl,
    webUrl: env[DEV_ENDPOINT_OVERRIDES.webUrl] || production.webUrl,
    gitUrl: env[DEV_ENDPOINT_OVERRIDES.gitUrl] || production.gitUrl,
  };
}
