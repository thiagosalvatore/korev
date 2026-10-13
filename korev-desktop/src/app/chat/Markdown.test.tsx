import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyMarkdown, Markdown } from './Markdown';

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

  it('keeps single newlines as line breaks when breaks is on', () => {
    const { container } = render(<Markdown text={'a\nb'} breaks />);

    expect(container.querySelector('br')).not.toBeNull();
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

  it('links a PR number to the repo', () => {
    render(
      <Markdown
        text="Merged #239 and [#12](https://example.com/12)."
        onOpenFile={vi.fn()}
        repoUrl="https://github.com/posthog/korev"
      />,
    );

    expect(
      screen.getByRole('link', { name: '#239' }).getAttribute('href'),
    ).toBe('https://github.com/posthog/korev/pull/239');
    expect(screen.getByRole('link', { name: '#12' }).getAttribute('href')).toBe(
      'https://example.com/12',
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('links a PR url written as inline code', () => {
    const url = 'https://github.com/posthog/korev/pull/239';
    render(<Markdown text={`Opened \`${url}\`.`} onOpenFile={vi.fn()} />);

    expect(screen.getByRole('link', { name: url }).getAttribute('href')).toBe(
      url,
    );
  });

  it('copies the markdown as plain text and the rendered html as rich text', async () => {
    const write = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(readonly items: Record<string, Blob>) {}
      },
    );

    await copyMarkdown('# Title\n\n- item');

    const [[[{ items }]]] = write.mock.calls;
    expect(await items['text/plain'].text()).toBe('# Title\n\n- item');
    const html = await items['text/html'].text();
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<li>item</li>');
    vi.unstubAllGlobals();
  });
});
