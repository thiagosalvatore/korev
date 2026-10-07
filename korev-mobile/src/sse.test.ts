import { describe, expect, it } from 'vitest';
import { createSseParser, type ServerEvent } from './sse';

function parse(chunks: string[]): ServerEvent[] {
  const events: ServerEvent[] = [];
  const feed = createSseParser((event) => events.push(event));
  chunks.forEach(feed);
  return events;
}

describe('createSseParser', () => {
  it('reads named events', () => {
    expect(
      parse(['event: state\ndata: {"a":1}\n\nevent: toast\ndata: {}\n\n']),
    ).toEqual([
      { event: 'state', data: '{"a":1}' },
      { event: 'toast', data: '{}' },
    ]);
  });

  it('joins an event split across chunks', () => {
    expect(parse(['event: ch', 'at\ndata: {"id"', ':"x"}\n', '\n'])).toEqual([
      { event: 'chat', data: '{"id":"x"}' },
    ]);
  });

  it('joins multi-line data with newlines', () => {
    expect(parse(['data: one\ndata: two\n\n'])).toEqual([
      { event: 'message', data: 'one\ntwo' },
    ]);
  });

  it('holds back an event until its blank line arrives', () => {
    expect(parse(['event: state\ndata: {}\n'])).toEqual([]);
  });
});
