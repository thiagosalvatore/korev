import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Markdown } from './Markdown';

afterEach(cleanup);

describe('Markdown', () => {
  it('opens a file path written as inline code at its line', () => {
    const onOpenFile = vi.fn();
    render(
      <Markdown text="See `src/foo.ts:12` for it." onOpenFile={onOpenFile} />,
    );

    fireEvent.click(screen.getByRole('link', { name: 'src/foo.ts:12' }));

    expect(onOpenFile).toHaveBeenCalledWith('src/foo.ts', 12);
  });

  it('opens a bare home path written in prose', () => {
    const onOpenFile = vi.fn();
    render(
      <Markdown
        text="The plan is in ~/.claude/plans/crab.md. Nothing changed."
        onOpenFile={onOpenFile}
      />,
    );

    fireEvent.click(
      screen.getByRole('link', { name: '~/.claude/plans/crab.md' }),
    );

    expect(onOpenFile).toHaveBeenCalledWith('~/.claude/plans/crab.md', null);
  });

  it('leaves inline code that is not a path alone', () => {
    render(<Markdown text="Run `npm test` now." onOpenFile={vi.fn()} />);

    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not link paths when nothing can open them', () => {
    render(<Markdown text="See `src/foo.ts`." />);

    expect(screen.queryByRole('link')).toBeNull();
  });
});
