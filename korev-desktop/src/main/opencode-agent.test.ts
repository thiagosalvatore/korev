import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ChatItem } from '../shared/model';
import { parseJsonLine } from './agent-events';
import { createOpencodeParser } from './opencode-agent';

const FIXTURE = path.resolve(
  __dirname,
  '../../test-support/opencode-turn.jsonl',
);

function feedFixture(): {
  items: ChatItem[];
  parser: ReturnType<typeof createOpencodeParser>;
} {
  const parser = createOpencodeParser('/private/tmp/oc-rec');
  const items = readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .flatMap((line) => {
      const event = parseJsonLine(line);
      return event ? parser.feed(event) : [];
    });
  return { items, parser };
}

describe('opencode JSON parser', () => {
  it('maps text, thinking, tools and the finished turn from a real run', () => {
    const { items, parser } = feedFixture();

    expect(items.map((item) => item.kind)).toEqual([
      'thinking',
      'assistant',
      'tool',
      'tool',
      'tool',
      'tool',
      'assistant',
      'result',
    ]);
    expect(items.filter((item) => item.kind === 'tool')).toMatchObject([
      { name: 'Write', summary: 'todo.txt', failed: false },
      {
        name: 'Edit',
        summary: 'notes.txt',
        detail: '- hello\n+ hello\n+ world',
      },
      { name: 'Bash', summary: 'ls /nonexistent-dir', failed: true },
      { name: 'Read', output: 'File not found: missing.txt', failed: true },
    ]);
    expect(items.at(-1)).toMatchObject({
      kind: 'result',
      ok: true,
      costUsd: 0,
    });
    expect(parser.sessionId()).toBe('ses_df1ee6f13ffe4CnaxPf4UmNi7r');
  });

  it('reports an error event as a failed turn with its message', () => {
    const parser = createOpencodeParser('/work');

    const items = parser.feed({
      type: 'error',
      sessionID: 'ses_1',
      error: {
        type: 'provider.no-route',
        message: 'Model unavailable: nope/nothing',
      },
    });

    expect(items).toMatchObject([
      { kind: 'result', ok: false, text: 'Model unavailable: nope/nothing' },
    ]);
  });
});
