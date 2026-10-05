import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import type { AgentPreference } from '../../shared/agents';
import { createMemoryFileSystem } from '../file-system';
import { createAgentsService } from './agents-service';
import {
  CommandNotFoundError,
  CommandTimeoutError,
  type CommandOptions,
  type CommandResult,
} from './command-runner';

const ENV = { HOME: '/Users/maria', SHELL: '/bin/zsh', PATH: '/usr/bin' };
const LOGIN_PATH = '/Users/maria/.local/bin:/usr/bin';
const SCRATCH = '/tmp/korev';

type Reply = CommandResult | Error;

function ok(stdout: string, stderr = ''): CommandResult {
  return { exitCode: 0, stdout, stderr };
}

function setup(
  replies: Record<string, Reply>,
  preference: AgentPreference = DEFAULT_SETTINGS.agent,
) {
  const run = vi.fn(
    async (file: string, args: readonly string[], _options: CommandOptions) => {
      if (file === ENV.SHELL) {
        return ok(`__KOREV_PATH_START__${LOGIN_PATH}__KOREV_PATH_END__`);
      }
      const reply = replies[[file, ...args].join(' ')] ?? replies[file];
      if (!reply) throw new Error(`Unexpected command: ${file} ${args}`);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  );
  const fs = createMemoryFileSystem();
  const agents = createAgentsService({
    run,
    env: ENV,
    scratchDir: SCRATCH,
    fs,
    preference: () => preference,
  });
  const callTo = (binary: string) =>
    run.mock.calls.find(([file]) => file === binary);
  return { agents, callTo, fs };
}

describe('agents service', () => {
  it('reports each CLI as signed in, signed out or not installed', async () => {
    const { agents } = setup({
      'claude --version': ok('2.1.288 (Claude Code)\n'),
      'claude auth status --json': ok(
        JSON.stringify({ loggedIn: true, subscriptionType: 'pro' }),
      ),
      codex: new CommandNotFoundError('codex'),
    });

    expect(await agents.statuses()).toEqual([
      {
        provider: 'claude',
        installed: true,
        version: '2.1.288',
        signedIn: true,
        plan: 'Claude Pro',
        problem: null,
      },
      {
        provider: 'codex',
        installed: false,
        version: null,
        signedIn: false,
        plan: null,
        problem: null,
      },
    ]);
  });

  it('runs the saved agent and model at the requested access, with the prompt on stdin and the login PATH', async () => {
    const { agents, callTo } = setup(
      {
        codex: ok(
          '{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}',
        ),
      },
      { provider: 'codex', models: { codex: 'gpt-6-sol' } },
    );

    const result = await agents.run({
      prompt: 'Fix CI',
      cwd: '/repo',
      access: 'edit',
    });

    expect(result).toEqual({ ok: true, output: 'Done' });
    const [, args, options] = callTo('codex') ?? [];
    expect(args).toEqual(
      expect.arrayContaining(['--model', 'gpt-6-sol', 'workspace-write']),
    );
    expect(options).toMatchObject({
      cwd: '/repo',
      stdin: 'Fix CI',
      env: expect.objectContaining({
        PATH: expect.stringMatching(`^${LOGIN_PATH}`),
      }),
    });
  });

  it('leaves the model to the CLI when none is saved', async () => {
    const { agents, callTo } = setup({ claude: ok('{"result":"OK"}') });

    expect(await agents.test('claude')).toEqual({ ok: true, output: 'OK' });

    const [, args, options] = callTo('claude') ?? [];
    expect(args).not.toContain('--model');
    expect(options?.cwd).toBe(SCRATCH);
  });

  it('asks the user to choose an agent before running one', async () => {
    const { agents } = setup({});

    expect(
      await agents.run({ prompt: 'Fix CI', cwd: '/repo', access: 'read-only' }),
    ).toEqual({
      ok: false,
      message: expect.stringContaining('Choose an AI agent'),
    });
  });

  it('shows a timed-out sign-in on the agent that was signing in', async () => {
    const { agents } = setup({
      'claude --version': new CommandNotFoundError('claude'),
      'codex --version': ok('codex-cli 0.160.0'),
      'codex login': new CommandTimeoutError('codex'),
      'codex login status': {
        exitCode: 1,
        stdout: '',
        stderr: 'Not logged in',
      },
    });

    const [, codex] = await agents.signIn('codex');

    expect(codex).toMatchObject({
      installed: true,
      signedIn: false,
      problem: 'Sign-in timed out.',
    });
  });

  it('writes the output schema to a file Codex can read and gives the run its own time limit', async () => {
    const { agents, callTo, fs } = setup(
      {
        codex: ok(
          '{"type":"item.completed","item":{"type":"agent_message","text":"{}"}}',
        ),
      },
      { provider: 'codex', models: {} },
    );

    await agents.run({
      prompt: 'Explain',
      cwd: '/repo',
      access: 'read-only',
      schema: { type: 'object' },
      timeoutMs: 30 * 60_000,
    });

    const [, args, options] = callTo('codex') ?? [];
    const schemaPath = args?.[args.indexOf('--output-schema') + 1] ?? '';
    expect(fs.files.get(schemaPath)?.toString()).toBe('{"type":"object"}');
    expect(options?.timeoutMs).toBe(30 * 60_000);
  });

  it('reports a run that hit its time limit in minutes', async () => {
    const { agents } = setup(
      { claude: new CommandTimeoutError('claude') },
      { provider: 'claude', models: {} },
    );

    expect(
      await agents.run({
        prompt: 'Fix CI',
        cwd: '/repo',
        access: 'edit',
        timeoutMs: 30 * 60_000,
      }),
    ).toEqual({ ok: false, message: 'Stopped after 30 minutes' });
  });
});
