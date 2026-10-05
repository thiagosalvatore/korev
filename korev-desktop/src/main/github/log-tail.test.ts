import { describe, expect, it } from 'vitest';
import { tailLines } from './log-tail';

async function* chunksOf(...parts: string[]) {
  for (const part of parts) yield Buffer.from(part);
}

function numberedLines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join(
    '\n',
  );
}

describe('tailLines', () => {
  it('keeps exactly the last lines of a log larger than the window', async () => {
    const log = `${numberedLines(5000)}\n`;
    const chunks = log.match(/[\s\S]{1,997}/g) ?? [];

    const tail = await tailLines(chunksOf(...chunks), 4096, 200);

    expect(tail.split('\n')).toHaveLength(200);
    expect(tail.split('\n').at(0)).toBe('line 4801');
    expect(tail.split('\n').at(-1)).toBe('line 5000');
  });

  it('keeps a line split across two chunks whole', async () => {
    const tail = await tailLines(
      chunksOf('npm ERR! missing scr', 'ipt: lint\nexit 1\n'),
      4096,
      200,
    );

    expect(tail).toBe('npm ERR! missing script: lint\nexit 1');
  });
});
