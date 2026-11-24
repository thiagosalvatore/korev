import type { Repo } from './model';

export const KOREV_PROTOCOL = 'korev:';
export const MAX_LINK_PROMPT = 20_000;
const NEW_WORKSPACE_HOST = 'new-workspace';
const ROOT_PATHS = ['', '/'];

export interface NewWorkspaceLink {
  prompt: string | null;
  repo: string | null;
}

export function parseKorevLink(url: string): NewWorkspaceLink | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (
    parsed.protocol !== KOREV_PROTOCOL ||
    parsed.hostname !== NEW_WORKSPACE_HOST ||
    !ROOT_PATHS.includes(parsed.pathname)
  )
    return null;
  const prompt = parsed.searchParams.get('prompt');
  return {
    prompt: prompt ? prompt.slice(0, MAX_LINK_PROMPT) : null,
    repo: parsed.searchParams.get('repo') || null,
  };
}

export function linkRepoId(
  repos: Pick<Repo, 'id' | 'name'>[],
  name: string | null,
): string | null {
  if (!name) return null;
  const wanted = name.toLowerCase();
  return repos.find((repo) => repo.name.toLowerCase() === wanted)?.id ?? null;
}
