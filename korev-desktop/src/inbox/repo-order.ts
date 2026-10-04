export type RepoComparator = (left: string, right: string) => number;

export function compareReposIn(repoOrder: string[]): RepoComparator {
  const ranks = new Map(repoOrder.map((repo, index) => [repo, index]));
  const rank = (repo: string) => ranks.get(repo) ?? repoOrder.length;
  return (left, right) => rank(left) - rank(right) || left.localeCompare(right);
}
