import { describe, expect, it } from 'vitest';
import {
  allocatePort,
  FIRST_PORT,
  parseProjectConfig,
  pickWorkspaceName,
  PORTS_PER_WORKSPACE,
} from './workspace-setup';

describe('workspace names', () => {
  it('picks a city that is not taken', () => {
    expect(pickWorkspaceName(new Set(['abuja']), () => 0)).toBe('accra');
  });

  it('adds a version suffix when every city is taken', () => {
    const everyCity = new Set<string>();
    let name = pickWorkspaceName(everyCity, () => 0);
    while (!name.includes('-v')) {
      everyCity.add(name);
      name = pickWorkspaceName(everyCity, () => 0);
    }
    expect(name).toBe('abuja-v2');
  });
});

describe('ports', () => {
  it('gives each workspace its own block of ten ports', () => {
    expect(allocatePort([])).toBe(FIRST_PORT);
    expect(
      allocatePort([FIRST_PORT, FIRST_PORT + 2 * PORTS_PER_WORKSPACE]),
    ).toBe(FIRST_PORT + PORTS_PER_WORKSPACE);
  });
});

describe('conductor.json', () => {
  it('reads the scripts and run mode', () => {
    expect(
      parseProjectConfig(
        JSON.stringify({
          scripts: { setup: 'npm ci', run: 'npm run dev', archive: 3 },
          runScriptMode: 'nonconcurrent',
        }),
      ),
    ).toEqual({
      setup: 'npm ci',
      run: 'npm run dev',
      runMode: 'nonconcurrent',
    });
  });

  it('ignores a malformed file', () => {
    expect(parseProjectConfig('{ nope')).toEqual({});
  });
});
