import { describe, expect, it } from 'vitest';
import type { ChatItem } from '../shared/model';
import { createClaudeParser, createCodexParser } from './agent-events';

const CWD = '/work/basseterre';

function feedAll(
  parser: ReturnType<typeof createClaudeParser>,
  events: object[],
): ChatItem[] {
  const items = new Map<string, ChatItem>();
  for (const event of events) {
    for (const item of parser.feed(event as Record<string, unknown>)) {
      items.set(item.id, item);
    }
  }
  return [...items.values()];
}

describe('Claude stream parser', () => {
  it('streams text, pairs tool calls with results and reports the outcome', () => {
    const parser = createClaudeParser(CWD);
    const items = feedAll(parser, [
      { type: 'system', subtype: 'init', session_id: 'session-1' },
      {
        type: 'stream_event',
        event: { type: 'message_start', message: { id: 'msg-1' } },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Let me ' },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'look.' },
        },
      },
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: { file_path: `${CWD}/src/a.ts` },
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: '1\thello',
              is_error: false,
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          id: 'msg-2',
          content: [
            {
              type: 'tool_use',
              id: 'todo-1',
              name: 'TodoWrite',
              input: { todos: [{ content: 'Ship it', status: 'in_progress' }] },
            },
          ],
        },
      },
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 1200,
        total_cost_usd: 0.01,
        session_id: 'session-1',
      },
    ]);

    expect(parser.sessionId()).toBe('session-1');
    expect(items).toEqual([
      { id: 'msg-1:0', kind: 'assistant', text: 'Let me look.' },
      {
        id: 'tool-1',
        kind: 'tool',
        name: 'Read',
        summary: 'src/a.ts',
        detail: expect.any(String),
        output: '1\thello',
        failed: false,
      },
      {
        id: 'todo-1',
        kind: 'todos',
        todos: [{ text: 'Ship it', status: 'in_progress' }],
      },
      {
        id: 'result:session-1',
        kind: 'result',
        ok: true,
        text: '',
        durationMs: 1200,
        costUsd: 0.01,
      },
    ]);
  });

  it('ignores events from subagents', () => {
    const parser = createClaudeParser(CWD);
    const items = feedAll(parser, [
      {
        type: 'assistant',
        parent_tool_use_id: 'task-1',
        message: {
          id: 'msg-9',
          content: [
            {
              type: 'tool_use',
              id: 'tool-9',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
        },
      },
    ]);
    expect(items).toEqual([]);
  });

  it('reports a failed turn with its message', () => {
    const items = feedAll(createClaudeParser(CWD), [
      {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        result: 'Credit balance too low',
      },
    ]);
    expect(items).toMatchObject([
      { kind: 'result', ok: false, text: 'Credit balance too low' },
    ]);
  });
});

describe('Codex JSON parser', () => {
  it('maps thread, commands, messages and turn completion', () => {
    const parser = createCodexParser(CWD);
    const items = feedAll(parser, [
      { type: 'thread.started', thread_id: 'thread-1' },
      {
        type: 'item.started',
        item: {
          id: 'item_0',
          type: 'command_execution',
          command: 'npm test',
          status: 'in_progress',
        },
      },
      {
        type: 'item.completed',
        item: {
          id: 'item_0',
          type: 'command_execution',
          command: 'npm test',
          aggregated_output: 'fail',
          exit_code: 1,
          status: 'completed',
        },
      },
      {
        type: 'item.completed',
        item: { id: 'item_1', type: 'agent_message', text: 'Tests fail.' },
      },
      { type: 'turn.completed', usage: {} },
    ]);
    expect(parser.sessionId()).toBe('thread-1');
    expect(items).toEqual([
      {
        id: 'item_0',
        kind: 'tool',
        name: 'Bash',
        summary: 'npm test',
        detail: 'npm test',
        output: 'fail',
        failed: true,
      },
      { id: 'item_1', kind: 'assistant', text: 'Tests fail.' },
      {
        id: 'result:1',
        kind: 'result',
        ok: true,
        text: '',
        durationMs: null,
        costUsd: null,
      },
    ]);
  });
});
