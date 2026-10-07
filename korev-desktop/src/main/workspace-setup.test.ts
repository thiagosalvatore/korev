import { describe, expect, it } from 'vitest';
import {
  allocatePort,
  findLocalUrl,
  FIRST_PORT,
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
