import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { spawnAgent } from './agent-process';

it('tells the agent its working directory in PWD, as a shell would', async () => {
  const cwd = await realpath(await mkdtemp(path.join(tmpdir(), 'korev-pwd-')));
  const lines: string[] = [];

  const agent = spawnAgent('/usr/bin/env', [], {
    cwd,
    env: { PWD: '/' },
    onLine: (line) => lines.push(line),
  });
  await agent.done;

  expect(lines).toContain(`PWD=${cwd}`);
});
