import { describe, expect, it } from 'vitest';
import type { CommandRunner } from './command-runner';
import { runProcess } from './command-runner';
import { childEnv, resolveLoginEnv } from './login-path';

const INHERITED_SOCK = '/tmp/launchd/Listeners';
const SHELL_SOCK = '/Users/me/Library/Containers/secretive/socket.ssh';

function loginShellExporting(rcExports: string): CommandRunner {
  return (_file, args, options) =>
    runProcess('/bin/sh', ['-c', `${rcExports}\n${args.at(-1)}`], options);
}

async function agentEnv(rcExports: string): Promise<NodeJS.ProcessEnv> {
  const env = { PATH: '/usr/bin:/bin', SSH_AUTH_SOCK: INHERITED_SOCK };
  return childEnv(
    env,
    await resolveLoginEnv(loginShellExporting(rcExports), env),
  );
}

describe('agent environment from the login shell', () => {
  it('uses the SSH agent socket the login shell exports', async () => {
    const env = await agentEnv(`export SSH_AUTH_SOCK=${SHELL_SOCK}`);
    expect(env.SSH_AUTH_SOCK).toBe(SHELL_SOCK);
  });

  it('keeps the inherited SSH agent socket when the shell exports none', async () => {
    const env = await agentEnv('unset SSH_AUTH_SOCK');
    expect(env.SSH_AUTH_SOCK).toBe(INHERITED_SOCK);
  });

  it('keeps the inherited SSH agent socket when the shell fails', async () => {
    const env = await agentEnv('exit 1');
    expect(env.SSH_AUTH_SOCK).toBe(INHERITED_SOCK);
  });
});
