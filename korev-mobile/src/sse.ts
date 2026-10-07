export interface ServerEvent {
  event: string;
  data: string;
}

const EVENT_SEPARATOR = '\n\n';
const DEFAULT_EVENT = 'message';

function parseEvent(block: string): ServerEvent | null {
  let event = DEFAULT_EVENT;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

export function createSseParser(onEvent: (event: ServerEvent) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n?/g, '\n');
    const blocks = buffer.split(EVENT_SEPARATOR);
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const event = parseEvent(block);
      if (event) onEvent(event);
    }
  };
}
