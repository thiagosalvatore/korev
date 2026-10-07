import { useEffect, useMemo, useState } from 'react';
import { cn, Icon } from '../design-system';
import type { SearchMatch, SearchOptions, Workspace } from '../shared/model';
import { openFile } from './actions';
import { api } from './bridge';

const SEARCH_DELAY_MS = 250;
const TOGGLES: { key: keyof SearchOptions; label: string; title: string }[] = [
  { key: 'caseSensitive', label: 'Aa', title: 'Match case' },
  { key: 'wholeWord', label: 'ab', title: 'Whole word' },
  { key: 'regex', label: '.*', title: 'Regular expression' },
];

function groupByFile(matches: SearchMatch[]): [string, SearchMatch[]][] {
  const groups = new Map<string, SearchMatch[]>();
  for (const match of matches)
    groups.set(match.file, [...(groups.get(match.file) ?? []), match]);
  return [...groups];
}

export function SearchView({ workspace }: { workspace: Workspace }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setMatches(null);
      return undefined;
    }
    let current = true;
    const timer = setTimeout(() => {
      void api.searchFiles(workspace.id, query, options).then((found) => {
        if (current) setMatches(found);
      });
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [workspace.id, query, options]);

  const groups = useMemo(() => groupByFile(matches ?? []), [matches]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2 border-b border-border-1 px-3 py-2">
        <Icon name="search" size={14} className="text-fg-3" />
        <input
          autoFocus
          aria-label="Search in files"
          value={query}
          placeholder="Search in files"
          className="h-8 flex-1 border-0 bg-transparent text-sm text-fg-1 outline-none placeholder:text-fg-4"
          onChange={(event) => setQuery(event.target.value)}
        />
        {TOGGLES.map((toggle) => (
          <button
            key={toggle.key}
            type="button"
            title={toggle.title}
            aria-pressed={options[toggle.key]}
            className={cn(
              'h-7 w-8 cursor-pointer rounded-sm border-0 bg-transparent font-mono text-xs text-fg-3 hover:text-fg-1',
              options[toggle.key] && 'bg-accent-subtle text-accent-text',
            )}
            onClick={() =>
              setOptions((current) => ({
                ...current,
                [toggle.key]: !current[toggle.key],
              }))
            }
          >
            {toggle.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {matches !== null && !matches.length ? (
          <p className="m-0 px-4 py-6 text-sm text-fg-3">No results</p>
        ) : null}
        {matches?.length ? (
          <p className="m-0 px-4 py-1 text-xs text-fg-4">
            {matches.length} results in {groups.length} files
          </p>
        ) : null}
        {groups.map(([file, fileMatches]) => (
          <section key={file} aria-label={file} className="mb-1">
            <div className="flex h-7 items-center gap-2 px-4 font-mono text-xs text-fg-1">
              <Icon name="file" size={12} className="text-fg-4" />
              {file}
              <span className="text-fg-4">{fileMatches.length}</span>
            </div>
            {fileMatches.map((match) => (
              <button
                key={`${match.line}:${match.column}`}
                type="button"
                className="flex h-6 w-full cursor-pointer items-center gap-3 border-0 bg-transparent pr-4 pl-9 text-left font-mono text-xs text-fg-2 hover:bg-hover"
                onClick={() =>
                  openFile(workspace.id, file, { line: match.line })
                }
              >
                <span className="w-8 flex-none text-right text-fg-4">
                  {match.line}
                </span>
                <span className="truncate">{match.text.trim()}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
