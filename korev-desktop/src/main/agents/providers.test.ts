import { describe, expect, it } from 'vitest';
import type { CommandResult } from './command-runner';
import { PROVIDERS } from './providers';

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
