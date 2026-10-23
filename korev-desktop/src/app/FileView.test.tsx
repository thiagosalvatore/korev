import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { FileContents, Workspace } from '../shared/model';
import { FileView } from './FileView';

const workspace = { id: 'w1' } as unknown as Workspace;
let call: Mock<(method: string, args: unknown[]) => Promise<unknown>>;

function readsAs(contents: FileContents) {
  call.mockImplementation(async (method) =>
    method === 'readFile' ? contents : undefined,
  );
}

function renderFile(file: string) {
  render(
    <FileView workspace={workspace} file={file} line={null} editing={false} />,
  );
}

beforeEach(() => {
  call = vi.fn();
  readsAs({ kind: 'text', text: 'first line\nsecond line' });
  window.korev = { call, on: () => () => {} } as unknown as Window['korev'];
});

afterEach(cleanup);

describe('FileView', () => {
  it('selects only the file contents on Cmd+A', async () => {
    renderFile('notes.txt');
    const contents = await screen.findByRole('region', { name: 'notes.txt' });

    fireEvent.keyDown(contents, { key: 'a', metaKey: true });

    const selected = window.getSelection()?.toString() ?? '';
    expect(selected).toContain('second line');
    expect(selected).not.toContain('Edit');
  });

  it('offers to open a file it cannot preview outside Korev', async () => {
    readsAs({ kind: 'not-text' });
    renderFile('.context/demo.mp4');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open outside Korev' }),
    );

    expect(call).toHaveBeenCalledWith('showFileMenu', [
      'w1',
      '.context/demo.mp4',
    ]);
  });

  it('says when the linked file does not exist', async () => {
    readsAs({ kind: 'missing' });
    renderFile('.context/gone.md');

    expect(await screen.findByText(/doesn't exist/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open outside Korev' })).toBe(
      null,
    );
  });
});
