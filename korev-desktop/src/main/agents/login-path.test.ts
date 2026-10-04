import { describe, expect, it } from 'vitest';
import type { CommandRunner } from './command-runner';
import { resolveLoginPath } from './login-path';

const ENV = { HOME: '/Users/maria', SHELL: '/bin/zsh', PATH: '/usr/bin:/bin' };

describe('resolveLoginPath', () => {
  it('puts the login shell PATH first and ignores what the shell prints around it', async () => {
    const run: CommandRunner = async () => ({
      exitCode: 0,
      stdout:
        'Welcome back!\n__KOREV_PATH_START__/Users/maria/.cargo/bin:/usr/bin\n__KOREV_PATH_END__',
      stderr: '',
    });

    const path = await resolveLoginPath(run, ENV);

    expect(path.split(':').slice(0, 3)).toEqual([
      '/Users/maria/.cargo/bin',
      '/usr/bin',
      '/bin',
    ]);
  });

  it('falls back to the usual install folders when the shell fails', async () => {
    const run: CommandRunner = async () => {
      throw new Error('shell crashed');
    };

    const path = await resolveLoginPath(run, ENV);

    expect(path.split(':')).toEqual([
      '/usr/bin',
      '/bin',
      '/Users/maria/.local/bin',
      '/Users/maria/.npm-global/bin',
      '/Users/maria/.bun/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ]);
  });
});
