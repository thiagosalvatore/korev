import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workspace } from '../shared/model';
import { FileView } from './FileView';

const workspace = { id: 'w1' } as unknown as Workspace;

beforeEach(() => {
  window.korev = {
    call: vi.fn(async () => 'first line\nsecond line'),
    on: () => () => {},
  } as unknown as Window['korev'];
});

afterEach(cleanup);

describe('FileView', () => {
  it('selects only the file contents on Cmd+A', async () => {
    render(
      <FileView
        workspace={workspace}
        file="notes.txt"
        line={null}
        editing={false}
      />,
    );
    const contents = await screen.findByRole('region', { name: 'notes.txt' });

    fireEvent.keyDown(contents, { key: 'a', metaKey: true });

    const selected = window.getSelection()?.toString() ?? '';
    expect(selected).toContain('second line');
    expect(selected).not.toContain('Edit');
  });
});
