const NAME_SEGMENT = '[\\w.-]+';
const OWNER_PATTERN = new RegExp(`^${NAME_SEGMENT}$`);
const REPO_PATTERN = new RegExp(`^${NAME_SEGMENT}/${NAME_SEGMENT}$`);
const OWNER_SEPARATOR = '/';
const PR_NUMBER_SEPARATOR = '#';
const PR_NUMBER_PATTERN = /^\d+$/;

export interface RepoParts {
  owner: string;
  name: string;
}

export function isRepoName(value: unknown): value is string {
  return typeof value === 'string' && REPO_PATTERN.test(value);
}

export function isPrRef(value: string): boolean {
  const [repo, number, ...rest] = value.split(PR_NUMBER_SEPARATOR);
  return (
    rest.length === 0 &&
    isRepoName(repo) &&
    PR_NUMBER_PATTERN.test(number ?? '')
  );
}

export function isOwnerLogin(value: unknown): value is string {
  return typeof value === 'string' && OWNER_PATTERN.test(value);
}

export function splitRepoName(repo: string): RepoParts {
  const [owner, name] = repo.split(OWNER_SEPARATOR);
  return { owner, name };
}

export function isOwnedBy(repo: string, owner: string): boolean {
  return splitRepoName(repo).owner.toLowerCase() === owner.toLowerCase();
}
