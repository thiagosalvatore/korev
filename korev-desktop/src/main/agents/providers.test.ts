import { describe, expect, it } from 'vitest';
import {
  AGENT_PROVIDERS,
  type AgentAccess,
  type AgentProvider,
} from '../../shared/agents';
import type { CommandResult } from './command-runner';
import {
  PACKAGE_REGISTRY_DOMAINS,
  PROVIDERS,
  type RunOptions,
} from './providers';

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

  function claudeResult(fields: object): string {
    return jsonl(
      { type: 'system', subtype: 'init' },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hi' }] },
      },
      { type: 'result', ...fields },
    );
  }

  it('returns the structured output when a schema was given', () => {
    const stdout = claudeResult({
      result: 'Here it is',
      structured_output: { summary: 'Done' },
    });
    expect(claude.parseRun(stdout)).toEqual({
      ok: true,
      output: '{"summary":"Done"}',
    });
  });

  it('returns the answer, or the error Claude Code reported', () => {
    expect(claude.parseRun(claudeResult({ result: 'OK' }))).toEqual({
      ok: true,
      output: 'OK',
    });
    expect(
      claude.parseRun(
        claudeResult({ is_error: true, result: 'Usage limit reached' }),
      ),
    ).toEqual({ ok: false, message: 'Usage limit reached' });
  });

  it('streams its output so Korev can show the steps while it runs', () => {
    const args = claude.runArgs({ ...NO_EXTRAS, access: 'read-only' });

    expect(flagValue(args, '--output-format')).toBe('stream-json');
    expect(args).toContain('--verbose');
  });

  it('describes each tool call and message in an assistant event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Checking the queue first.' },
          { type: 'tool_use', name: 'Read', input: { file_path: 'src/q.ts' } },
          { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
        ],
      },
    });

    expect(claude.parseActivity(line)).toEqual([
      { kind: 'message', text: 'Checking the queue first.' },
      { kind: 'step', text: 'Read src/q.ts' },
      { kind: 'step', text: 'Ran npm test' },
    ]);
  });

  it('shows nothing for events that are not the agent acting', () => {
    expect(claude.parseActivity('{"type":"system","subtype":"init"}')).toEqual(
      [],
    );
    expect(claude.parseActivity('not json')).toEqual([]);
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

  it('describes commands, file changes and messages as they complete', () => {
    const lines = [
      {
        type: 'item.completed',
        item: { type: 'command_execution', command: 'npm test' },
      },
      {
        type: 'item.completed',
        item: {
          type: 'file_change',
          changes: [{ path: 'a.ts' }, { path: 'b.ts' }],
        },
      },
      { type: 'item.completed', item: { type: 'agent_message', text: 'Done' } },
      { type: 'item.completed', item: { type: 'reasoning', text: 'hmm' } },
    ].map((event) => codex.parseActivity(JSON.stringify(event)));

    expect(lines).toEqual([
      [{ kind: 'step', text: 'Ran npm test' }],
      [{ kind: 'step', text: 'Edited a.ts, b.ts' }],
      [{ kind: 'message', text: 'Done' }],
      [],
    ]);
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

const NO_EXTRAS = { model: null, schema: null, network: false };
const SCHEMA = { json: '{"type":"object"}', path: '/tmp/schema.json' };
const SANDBOX = {
  enabled: true,
  allowUnsandboxedCommands: false,
  failIfUnavailable: true,
};

function claudeSandbox(args: string[]) {
  return JSON.parse(flagValue(args, '--settings') ?? '{}').sandbox;
}

describe('run access', () => {
  it('gives Claude Code only the file-reading tools for a read-only run', () => {
    const args = PROVIDERS.claude.runArgs({
      ...NO_EXTRAS,
      access: 'read-only',
    });

    expect(args).toContain('--restricted');
    expect(flagValue(args, '--tools')).toBe('Read,Grep,Glob');
    expect(flagValue(args, '--permission-prompts')).toBe('none');
  });

  it('runs Claude Code shell commands in a sandbox that cannot be skipped for an edit run', () => {
    const args = PROVIDERS.claude.runArgs({ ...NO_EXTRAS, access: 'edit' });

    expect(args).toContain('--restricted');
    expect(flagValue(args, '--tools')?.split(',')).toEqual(
      expect.arrayContaining(['Edit', 'Write', 'Bash']),
    );
    expect(flagValue(args, '--permission-mode')).toBe('acceptEdits');
    expect(claudeSandbox(args)).toEqual(SANDBOX);
  });

  it.each([
    ['read-only', 'read-only'],
    ['edit', 'workspace-write'],
  ] as const)('runs Codex %s in the %s sandbox', (access, sandbox) => {
    const args = PROVIDERS.codex.runArgs({ ...NO_EXTRAS, access });

    expect(flagValue(args, '--sandbox')).toBe(sandbox);
  });

  it('lets a Claude Code edit run with network reach only the package registries', () => {
    const args = PROVIDERS.claude.runArgs({
      ...NO_EXTRAS,
      access: 'edit',
      network: true,
    });

    expect(claudeSandbox(args)).toEqual({
      ...SANDBOX,
      network: {
        allowedDomains: [...PACKAGE_REGISTRY_DOMAINS],
        strictAllowlist: true,
      },
    });
  });

  type RunCase = [AgentProvider, AgentAccess, boolean, RunOptions['schema']];
  const everyRun = AGENT_PROVIDERS.flatMap((provider) =>
    ACCESS_LEVELS.flatMap((access) =>
      [false, true].flatMap((network) =>
        [null, SCHEMA].map(
          (schema): RunCase => [provider, access, network, schema],
        ),
      ),
    ),
  );

  it.each(everyRun)(
    'never lets %s leave its sandbox on a %s run (network %s, schema %o)',
    (provider, access, network, schema) => {
      const args = PROVIDERS[provider].runArgs({
        model: null,
        access,
        schema,
        network,
      });
      const networkOn = access === 'edit' && network;

      expect(args.join(' ')).not.toMatch(/dangerously|bypass|no-sandbox/i);
      if (provider === 'codex') {
        expect(flagValue(args, '--sandbox')).toBe(
          access === 'edit' ? 'workspace-write' : 'read-only',
        );
        expect(args.join(' ').includes('network_access=true')).toBe(networkOn);
        return;
      }
      expect(args).toContain('--restricted');
      if (access === 'read-only') {
        expect(args).not.toContain('--settings');
        return;
      }
      const sandbox = claudeSandbox(args);
      expect(sandbox).toMatchObject(SANDBOX);
      expect(sandbox.network?.allowedDomains ?? []).toEqual(
        networkOn ? [...PACKAGE_REGISTRY_DOMAINS] : [],
      );
    },
  );

  it('passes the schema inline to Claude Code and as a file to Codex', () => {
    const run = { ...NO_EXTRAS, access: 'read-only' as const, schema: SCHEMA };

    expect(flagValue(PROVIDERS.claude.runArgs(run), '--json-schema')).toBe(
      SCHEMA.json,
    );
    expect(flagValue(PROVIDERS.codex.runArgs(run), '--output-schema')).toBe(
      SCHEMA.path,
    );
  });
});
