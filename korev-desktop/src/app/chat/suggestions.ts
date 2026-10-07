import type { Snippet } from '../../shared/model';
import { api } from '../bridge';
import { fuzzyRank } from '../fuzzy';

export type SuggestionTrigger = '@' | '/' | '#' | 'snippet';

export interface SuggestionOption {
  label: string;
  insert: string;
}

export interface Suggestions {
  trigger: SuggestionTrigger;
  start: number;
  end: number;
  options: SuggestionOption[];
  selected: number;
}

const TOKEN_BEFORE_CARET = /(^|\s)([@/#])([^\s@#]*)$/;

export interface SuggestionSource {
  workspaceId: string | null;
  repoId: string | null;
}

async function slashCommands({
  workspaceId,
  repoId,
}: SuggestionSource): Promise<string[]> {
  if (workspaceId) return api.slashCommands(workspaceId);
  if (repoId) return api.repoSlashCommands(repoId);
  return [];
}

export function createSuggestionLoader(source: SuggestionSource) {
  const cache = new Map<SuggestionTrigger, SuggestionOption[]>();

  async function load(trigger: SuggestionTrigger): Promise<SuggestionOption[]> {
    const { workspaceId, repoId } = source;
    if (trigger === '@' && workspaceId) {
      return (await api.listFiles(workspaceId).catch(() => [])).map((file) => ({
        label: file,
        insert: `@${file}`,
      }));
    }
    if (trigger === '/') {
      return (await slashCommands(source).catch(() => [])).map((name) => ({
        label: name,
        insert: `/${name}`,
      }));
    }
    if (trigger === '#' && repoId) {
      return (await api.listPullRequests(repoId).catch(() => [])).map((pr) => ({
        label: `${pr.number} ${pr.title}`,
        insert: `#${pr.number}`,
      }));
    }
    return [];
  }

  async function options(
    trigger: SuggestionTrigger,
  ): Promise<SuggestionOption[]> {
    const cached = cache.get(trigger);
    if (cached) return cached;
    const loaded = await load(trigger);
    cache.set(trigger, loaded);
    return loaded;
  }

  return {
    async suggest(text: string, caret: number): Promise<Suggestions | null> {
      const match = TOKEN_BEFORE_CARET.exec(text.slice(0, caret));
      if (!match) return null;
      const trigger = match[2] as SuggestionTrigger;
      const query = match[3];
      const all = await options(trigger);
      const byLabel = new Map(all.map((option) => [option.label, option]));
      const ranked = fuzzyRank(query, [...byLabel.keys()]).flatMap(
        (label) => byLabel.get(label) ?? [],
      );
      if (!ranked.length) return null;
      return {
        trigger,
        start: caret - query.length - 1,
        end: caret,
        options: ranked,
        selected: 0,
      };
    },
  };
}

export function snippetSuggestions(
  snippets: Snippet[],
  caret: number,
): Suggestions | null {
  if (!snippets.length) return null;
  return {
    trigger: 'snippet',
    start: caret,
    end: caret,
    options: snippets.map((snippet) => ({
      label: snippet.name,
      insert: snippet.text,
    })),
    selected: 0,
  };
}

export function applySuggestion(
  text: string,
  suggestions: Suggestions,
  option: SuggestionOption,
) {
  const separator = suggestions.trigger === 'snippet' ? '' : ' ';
  const inserted = `${option.insert}${separator}`;
  return {
    text:
      text.slice(0, suggestions.start) + inserted + text.slice(suggestions.end),
    caret: suggestions.start + inserted.length,
  };
}
