import { describe, expect, it } from 'vitest';
import { loadChangelog, parseChangelog } from './changelog';

const CHANGELOG = `# Changelog

Intro for people who write entries.

## [Unreleased]

### New

- **Not out yet.** Nobody should see this.

## [0.2.0] - 2026-10-08

Speak to your agents instead of typing.

### New

- **Voice input.** Click the microphone
  next to Send.
- **Pick the language.** In Settings.

### Fixed

- A download no longer opens as damaged.

## [0.1.0] - 2026-10-07

The first release of Korev.

- Run Claude Code and Codex in parallel.
`;

describe('parseChangelog', () => {
  it('reads each released version with its summary, New and Fixed entries', () => {
    expect(parseChangelog(CHANGELOG)).toEqual([
      {
        version: '0.2.0',
        date: '2026-10-08',
        summary: 'Speak to your agents instead of typing.',
        sections: [
          {
            kind: 'new',
            items: [
              '**Voice input.** Click the microphone next to Send.',
              '**Pick the language.** In Settings.',
            ],
          },
          { kind: 'fixed', items: ['A download no longer opens as damaged.'] },
        ],
      },
      {
        version: '0.1.0',
        date: '2026-10-07',
        summary: 'The first release of Korev.',
        sections: [
          { kind: 'new', items: ['Run Claude Code and Codex in parallel.'] },
        ],
      },
    ]);
  });

  it('rejects a section heading other than New or Fixed', () => {
    expect(() =>
      parseChangelog('## [1.0.0] - 2026-10-10\n\nSummary.\n\n### Changed\n'),
    ).toThrow('### Changed');
  });
});

describe('CHANGELOG.md', () => {
  it('gives every release a summary and at least one entry', () => {
    const releases = loadChangelog();
    expect(releases.length).toBeGreaterThan(0);
    for (const release of releases) {
      expect(release.summary, release.version).not.toBe('');
      expect(release.sections.length, release.version).toBeGreaterThan(0);
    }
  });
});
