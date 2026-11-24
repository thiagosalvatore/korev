import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { XTerm } from './XTerm';

const CURSOR_QUERY = '\x1b[6n';
const CURSOR_REPLY = /^.\[\d+;\d+R$/;

type Listener = (payload: { ref: string; data: string }) => void;

let call: ReturnType<typeof vi.fn>;
let emitOutput: Listener;

function writes() {
  return call.mock.calls
    .filter(([method]) => method === 'writeTerminal')
    .map(([, args]) => (args as [string, string])[1]);
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    addListener() {},
    removeListener() {},
  }));
  call = vi.fn(async (method: string) =>
    method === 'openTerminal'
      ? { ok: true, value: `prompt ${CURSOR_QUERY}` }
      : null,
  );
  window.korev = {
    call,
    on: (event: string, listener: Listener) => {
      if (event === 'terminal-output') emitOutput = listener;
      return () => {};
    },
  } as unknown as Window['korev'];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('XTerm', () => {
  it('answers live terminal queries but not ones replayed from scrollback', async () => {
    render(
      <XTerm
        workspaceId="w1"
        terminalRef="w1:shell"
        kind="shell"
        interactive
      />,
    );
    await vi.waitFor(() =>
      expect(call).toHaveBeenCalledWith('openTerminal', expect.anything()),
    );

    emitOutput({ ref: 'w1:shell', data: CURSOR_QUERY });

    await vi.waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatch(CURSOR_REPLY);
  });

  it('opens the find box on Cmd+F', async () => {
    const { container } = render(
      <XTerm
        workspaceId="w1"
        terminalRef="w1:shell"
        kind="shell"
        interactive
      />,
    );
    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('terminal input missing');

    fireEvent.keyDown(textarea, { key: 'f', metaKey: true });

    await vi.waitFor(() =>
      expect(screen.getByLabelText('Find in terminal')).toBe(
        document.activeElement,
      ),
    );
  });
});
