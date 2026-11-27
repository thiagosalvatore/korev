import { describe, expect, it } from 'vitest';
import { parseFileRef, splitBarePaths, toWorkspaceRelative } from './fileRefs';

describe('parseFileRef', () => {
  it('reads a path with a line and column', () => {
    expect(parseFileRef('src/app/main.ts:12:4')).toEqual({
      file: 'src/app/main.ts',
      line: 12,
    });
  });

  it('accepts an explicit path without an extension', () => {
    expect(parseFileRef('~/notes/todo')).toEqual({
      file: '~/notes/todo',
      line: null,
    });
  });

  it('leaves code and branch names alone', () => {
    expect(parseFileRef('npm run build')).toBeNull();
    expect(parseFileRef('feature/login')).toBeNull();
  });
});

describe('splitBarePaths', () => {
  it('splits absolute and home paths out of prose', () => {
    expect(splitBarePaths('See ~/code/a.ts:3 and (/tmp/b.md).')).toEqual([
      'See ',
      { file: '~/code/a.ts', line: 3, label: '~/code/a.ts:3' },
      ' and (',
      { file: '/tmp/b.md', line: null, label: '/tmp/b.md' },
      ').',
    ]);
  });

  it('keeps text without paths whole', () => {
    expect(splitBarePaths('no paths here')).toEqual(['no paths here']);
  });
});

describe('toWorkspaceRelative', () => {
  it('strips the workspace folder and keeps other paths', () => {
    expect(toWorkspaceRelative('/w/repo', '/w/repo/src/a.ts')).toBe('src/a.ts');
    expect(toWorkspaceRelative('/w/repo', '/w/repo-2/a.ts')).toBe(
      '/w/repo-2/a.ts',
    );
  });
});
