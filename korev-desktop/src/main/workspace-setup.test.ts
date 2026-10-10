import { describe, expect, it } from 'vitest';
import {
  allocatePort,
  findLocalUrl,
  FIRST_PORT,
  firstWords,
  PORTS_PER_WORKSPACE,
} from './workspace-setup';

describe('ports', () => {
  it('gives each workspace its own block of ten ports', () => {
    expect(allocatePort([])).toBe(FIRST_PORT);
    expect(
      allocatePort([FIRST_PORT, FIRST_PORT + 2 * PORTS_PER_WORKSPACE]),
    ).toBe(FIRST_PORT + PORTS_PER_WORKSPACE);
  });
});

describe('run output', () => {
  it('finds the local URL a dev server prints, without colour codes', () => {
    const esc = String.fromCharCode(27);
    expect(
      findLocalUrl(
        `  ➜  Local:   ${esc}[36mhttp://localhost:${esc}[1m5173${esc}[22m/${esc}[39m`,
      ),
    ).toBe('http://localhost:5173/');
    expect(findLocalUrl('listening on http://0.0.0.0:3000')).toBe(
      'http://localhost:3000',
    );
    expect(findLocalUrl('compiled successfully')).toBeNull();
  });
});

describe('names', () => {
  it('keeps only the first words of a slug', () => {
    expect(firstWords('add-stack-pr-picker-mobile', 3)).toBe('add-stack-pr');
    expect(firstWords('add-note', 3)).toBe('add-note');
  });
});
