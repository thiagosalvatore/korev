import type { ISearchResultChangeEvent } from '@xterm/addon-search';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TerminalFind } from './TerminalFind';

function fakeSearch() {
  let emit: (results: ISearchResultChangeEvent) => void = () => {};
  const search = {
    findNext: vi.fn(() => true),
    findPrevious: vi.fn(() => true),
    clearDecorations: vi.fn(),
    onDidChangeResults: (listener: typeof emit) => {
      emit = listener;
      return { dispose() {} };
    },
  };
  return { search, emit: (results: ISearchResultChangeEvent) => emit(results) };
}

function renderFind() {
  const fake = fakeSearch();
  const onClose = vi.fn();
  render(
    <TerminalFind
      search={fake.search}
      inputRef={createRef<HTMLInputElement>()}
      onClose={onClose}
    />,
  );
  return { ...fake, onClose, input: screen.getByLabelText('Find in terminal') };
}

afterEach(cleanup);

describe('TerminalFind', () => {
  it('steps through matches with Enter and Shift+Enter and shows the position', () => {
    const { search, emit, input } = renderFind();

    fireEvent.change(input, { target: { value: 'korev' } });
    act(() => emit({ resultIndex: 2, resultCount: 12 }));
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(screen.getByText('3 of 12')).toBeTruthy();
    expect(search.findNext).toHaveBeenLastCalledWith(
      'korev',
      expect.objectContaining({ incremental: false }),
    );
    expect(search.findPrevious).toHaveBeenCalledWith(
      'korev',
      expect.anything(),
    );
  });

  it('says when nothing matches and closes on Escape', () => {
    const { emit, input, onClose } = renderFind();

    fireEvent.change(input, { target: { value: 'missing' } });
    act(() => emit({ resultIndex: -1, resultCount: 0 }));
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.getByText('No results')).toBeTruthy();
    expect(onClose).toHaveBeenCalled();
  });
});
