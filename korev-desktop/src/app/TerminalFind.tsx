import type {
  ISearchResultChangeEvent,
  SearchAddon,
} from '@xterm/addon-search';
import { useEffect, useState, type KeyboardEvent, type RefObject } from 'react';
import { IconButton, Input } from '../design-system';
import { findDecorations } from './terminal-theme';

export type TerminalSearch = Pick<
  SearchAddon,
  'findNext' | 'findPrevious' | 'clearDecorations' | 'onDidChangeResults'
>;

type Direction = 'next' | 'previous';

export interface TerminalFindProps {
  search: TerminalSearch;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}

function resultLabel({ resultIndex, resultCount }: ISearchResultChangeEvent) {
  if (resultCount === 0) return 'No results';
  if (resultIndex < 0) return `${resultCount} results`;
  return `${resultIndex + 1} of ${resultCount}`;
}

function useSearchResults(search: TerminalSearch) {
  const [results, setResults] = useState<ISearchResultChangeEvent | null>(null);
  useEffect(() => {
    const subscription = search.onDidChangeResults(setResults);
    return () => subscription.dispose();
  }, [search]);
  return [results, setResults] as const;
}

export function TerminalFind({ search, inputRef, onClose }: TerminalFindProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useSearchResults(search);

  const find = (direction: Direction, value: string, incremental = false) => {
    const options = { decorations: findDecorations(), incremental };
    if (direction === 'next') search.findNext(value, options);
    else search.findPrevious(value, options);
  };

  const changeTerm = (value: string) => {
    setTerm(value);
    if (value) return find('next', value, true);
    search.clearDecorations();
    setResults(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Enter' || !term) return;
    event.preventDefault();
    find(event.shiftKey ? 'previous' : 'next', term);
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  return (
    <div className="absolute top-2 right-3 z-10 flex w-80 items-center gap-1 rounded-md border border-border-2 bg-raised p-1 shadow-pop">
      <Input
        ref={inputRef}
        aria-label="Find in terminal"
        placeholder="Find"
        className="min-w-0 flex-1"
        value={term}
        onChange={(event) => changeTerm(event.target.value)}
        onKeyDown={onKeyDown}
        suffix={
          term && results ? (
            <span className="shrink-0 text-xs whitespace-nowrap text-fg-3">
              {resultLabel(results)}
            </span>
          ) : null
        }
      />
      <IconButton
        icon="chevron-up"
        label="Previous match"
        size="sm"
        disabled={!term}
        onClick={() => find('previous', term)}
      />
      <IconButton
        icon="chevron-down"
        label="Next match"
        size="sm"
        disabled={!term}
        onClick={() => find('next', term)}
      />
      <IconButton icon="x" label="Close find" size="sm" onClick={onClose} />
    </div>
  );
}
