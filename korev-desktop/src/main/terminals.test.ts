import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTerminals } from './terminals';

function fakePty() {
  const outputs: ((data: string) => void)[] = [];
  const pty = {
    written: [] as string[],
    print: (data: string) => outputs.forEach((listener) => listener(data)),
    onData: (listener: (data: string) => void) => outputs.push(listener),
    onExit: () => undefined,
    write: (data: string) => pty.written.push(data),
    resize: () => undefined,
    kill: () => undefined,
  };
  return pty;
}

describe('terminal input', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function startWithInput() {
    const pty = fakePty();
    const terminals = createTerminals({
      spawnPty: () => pty,
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined,
    });
    terminals.start('w1:tab-1', {
      cwd: '/',
      env: {},
      input: '/ship',
      typeInputAfter: /auto mode on/,
    });
    return pty;
  }

  it('types the input once, when the program goes quiet after the text it waits for', () => {
    const pty = startWithInput();

    vi.advanceTimersByTime(5_000);
    expect(pty.written).toEqual([]);

    pty.print('auto mode');
    vi.advanceTimersByTime(100);
    pty.print(' on');
    vi.advanceTimersByTime(100);
    expect(pty.written).toEqual([]);

    vi.advanceTimersByTime(5_000);
    pty.print('/ship');
    vi.advanceTimersByTime(5_000);
    expect(pty.written).toEqual(['/ship']);
  });

  it('holds the input until the program shows the text it waits for', () => {
    const pty = startWithInput();

    pty.print('Yes, I trust this folder');
    vi.advanceTimersByTime(5_000);
    expect(pty.written).toEqual([]);

    pty.print('auto mode on');
    vi.advanceTimersByTime(5_000);
    expect(pty.written).toEqual(['/ship']);
  });
});
