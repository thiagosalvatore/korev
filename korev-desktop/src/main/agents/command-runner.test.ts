import { describe, expect, it } from 'vitest';
import {
  CommandAbortedError,
  CommandNotFoundError,
  CommandTimeoutError,
  runProcess,
} from './command-runner';

describe('runProcess', () => {
  it('feeds stdin to the command and reports its output and exit code', async () => {
    const result = await runProcess(
      '/bin/sh',
      ['-c', 'cat; echo oops >&2; exit 3'],
      { stdin: 'hello', timeoutMs: 5000 },
    );

    expect(result).toEqual({ exitCode: 3, stdout: 'hello', stderr: 'oops\n' });
  });

  it('hands over each stdout line as it arrives, joining lines split across chunks', async () => {
    const lines: string[] = [];
    await runProcess(
      '/bin/sh',
      ['-c', 'printf "one\\ntw"; sleep 0.05; printf "o\\nthree"'],
      { timeoutMs: 5000, onLine: (line) => lines.push(line) },
    );

    expect(lines).toEqual(['one', 'two', 'three']);
  });

  it('reports a command that is not on the PATH as not installed', async () => {
    await expect(
      runProcess('korev-no-such-cli', [], { timeoutMs: 5000 }),
    ).rejects.toBeInstanceOf(CommandNotFoundError);
  });

  it('kills a command that runs past its timeout', async () => {
    await expect(
      runProcess('/bin/sleep', ['5'], { timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(CommandTimeoutError);
  });

  it('kills a command when its signal aborts', async () => {
    const controller = new AbortController();
    const running = runProcess('/bin/sleep', ['5'], {
      timeoutMs: 5000,
      signal: controller.signal,
    });

    controller.abort();

    await expect(running).rejects.toBeInstanceOf(CommandAbortedError);
  });
});
