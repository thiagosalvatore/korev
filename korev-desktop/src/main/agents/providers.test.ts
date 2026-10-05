import { describe, expect, it } from 'vitest';
import {
  AGENT_PROVIDERS,
  type AgentAccess,
  type AgentProvider,
} from '../../shared/agents';
import type { CommandResult } from './command-runner';
import { PROVIDERS, type RunOptions } from './providers';

function result(stdout: string, exitCode = 0, stderr = ''): CommandResult {
  return { exitCode, stdout, stderr };
}

function jsonl(...events: object[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n');
}

describe('claude provider', () => {
  const claude = PROVIDERS.claude;

  it('reads the subscription from a signed-in status', () => {
    const status = result(
      JSON.stringify({ loggedIn: true, subscriptionType: 'max' }),
    );
    expect(claude.parseStatus(status)).toEqual({
      signedIn: true,
      plan: 'Claude Max',
    });
  });

  it.each([
    ['signed out', result(JSON.stringify({ loggedIn: false }), 1)],
    ['unreadable', result('Error: something broke', 1)],
  ])('treats a %s status as signed out', (_case, status) => {
    expect(claude.parseStatus(status)).toEqual({ signedIn: false, plan: null });
  });

  it('returns the structured output when a schema was given', () => {
    const stdout = JSON.stringify({
      result: 'Here it is',
      structured_output: { summary: 'Done' },
    });
    expect(claude.parseRun(stdout)).toEqual({
      ok: true,
      output: '{"summary":"Done"}',
    });
  });

  it('returns the answer, or the error Claude Code reported', () => {
    expect(claude.parseRun(JSON.stringify({ result: 'OK' }))).toEqual({
      ok: true,
      output: 'OK',
    });
    expect(
      claude.parseRun(
        JSON.stringify({ is_error: true, result: 'Usage limit reached' }),
      ),
    ).toEqual({ ok: false, message: 'Usage limit reached' });
  });
});

describe('codex provider', () => {
  const codex = PROVIDERS.codex;

  it('reads the sign-in from the exit code and the plan from stderr', () => {
    expect(codex.parseStatus(result('', 0, 'Logged in using ChatGPT'))).toEqual(
      { signedIn: true, plan: 'ChatGPT' },
    );
    expect(codex.parseStatus(result('', 1, 'Not logged in'))).toEqual({
      signedIn: false,
      plan: null,
    });
  });

  it('lists only the models Codex shows, in its order', async () => {
    const catalog = JSON.stringify({
      models: [
        {
          slug: 'gpt-b',
          display_name: 'GPT B',
          visibility: 'list',
          priority: 5,
        },
        { slug: 'hidden', display_name: 'H', visibility: 'hide', priority: 1 },
        {
          slug: 'gpt-a',
          display_name: 'GPT A',
          visibility: 'list',
          priority: 2,
        },
      ],
    });

    const models = await codex.listModels(async () => result(catalog));

    expect(models).toEqual([
      { id: 'gpt-a', label: 'GPT A' },
      { id: 'gpt-b', label: 'GPT B' },
    ]);
  });

  it('returns the last agent message from the event stream', () => {
    const stdout = jsonl(
      { type: 'thread.started' },
      { type: 'item.completed', item: { type: 'reasoning', text: 'hmm' } },
      { type: 'item.completed', item: { type: 'agent_message', text: 'OK' } },
      { type: 'turn.completed' },
    );
    expect(codex.parseRun(stdout)).toEqual({ ok: true, output: 'OK' });
  });

  it('returns the failure when the turn fails', () => {
    const stdout = jsonl(
      { type: 'turn.started' },
      { type: 'turn.failed', error: { message: 'You hit your usage limit' } },
    );
    expect(codex.parseRun(stdout)).toEqual({
      ok: false,
      message: 'You hit your usage limit',
    });
  });
});

const ACCESS_LEVELS: AgentAccess[] = ['read-only', 'edit'];

function flagValue(args: string[], flag: string): string | undefined {
  return args[args.indexOf(flag) + 1];
}

describe('run access', () => {
  it('gives Claude Code only the file-reading tools for a read-only run', () => {
    const args = PROVIDERS.claude.runArgs({
      model: null,
      access: 'read-only',
      schema: null,
    });

    expect(args).toContain('--restricted');
    expect(flagValue(args, '--tools')).toBe('Read,Grep,Glob');
    expect(flagValue(args, '--permission-prompts')).toBe('none');
  });

  it('runs Claude Code shell commands in a sandbox that cannot be skipped for an edit run', () => {
    const args = PROVIDERS.claude.runArgs({
      model: null,
      access: 'edit',
      schema: null,
    });

    expect(args).toContain('--restricted');
    expect(flagValue(args, '--tools')?.split(',')).toEqual(
      expect.arrayContaining(['Edit', 'Write', 'Bash']),
    );
    expect(flagValue(args, '--permission-mode')).toBe('acceptEdits');
    expect(JSON.parse(flagValue(args, '--settings') ?? '{}')).toEqual({
      sandbox: {
        enabled: true,
        allowUnsandboxedCommands: false,
        failIfUnavailable: true,
      },
    });
  });

  it.each([
    ['read-only', 'read-only'],
    ['edit', 'workspace-write'],
  ] as const)('runs Codex %s in the %s sandbox', (access, sandbox) => {
    const args = PROVIDERS.codex.runArgs({ model: null, access, schema: null });

    expect(flagValue(args, '--sandbox')).toBe(sandbox);
  });

  const SCHEMA = { json: '{"type":"object"}', path: '/tmp/schema.json' };
  const everyRun = AGENT_PROVIDERS.flatMap((provider) =>
    ACCESS_LEVELS.flatMap((access) =>
      [null, SCHEMA].map(
        (schema): [AgentProvider, AgentAccess, RunOptions['schema']] => [
          provider,
          access,
          schema,
        ],
      ),
    ),
  );

  it.each(everyRun)(
    'never lets %s skip its permissions or sandbox on a %s run (schema %o)',
    (provider, access, schema) => {
      const args = PROVIDERS[provider].runArgs({ model: null, access, schema });

      expect(args.join(' ')).not.toMatch(/dangerously|bypass|no-sandbox/i);
      if (provider === 'codex') {
        expect(flagValue(args, '--sandbox')).toBe(
          access === 'edit' ? 'workspace-write' : 'read-only',
        );
        return;
      }
      expect(args).toContain('--restricted');
      if (access === 'edit') {
        expect(
          JSON.parse(flagValue(args, '--settings') ?? '{}').sandbox,
        ).toEqual({
          enabled: true,
          allowUnsandboxedCommands: false,
          failIfUnavailable: true,
        });
      }
    },
  );

  it('passes the schema inline to Claude Code and as a file to Codex', () => {
    const claude = PROVIDERS.claude.runArgs({
      model: null,
      access: 'read-only',
      schema: SCHEMA,
    });
    const codex = PROVIDERS.codex.runArgs({
      model: null,
      access: 'read-only',
      schema: SCHEMA,
    });

    expect(flagValue(claude, '--json-schema')).toBe(SCHEMA.json);
    expect(flagValue(codex, '--output-schema')).toBe(SCHEMA.path);
  });
});
