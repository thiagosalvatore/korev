import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCRIPTS,
  type AppState,
  type Repo,
} from '../../korev-desktop/src/shared/model';
import { dropTarget, reorderRows, type ReorderRow } from './reorder';

const ROW_HEIGHT = 40;

function repo(id: string, folderId: string | null = null): Repo {
  return {
    id,
    name: id,
    path: `/code/${id}`,
    defaultBranch: 'main',
    scripts: EMPTY_SCRIPTS,
    folderId,
  };
}

const state = {
  repos: [repo('acme'), repo('web', 'work'), repo('api', 'work'), repo('docs')],
  folders: [{ id: 'work', name: 'Work' }],
  rootOrder: ['acme', 'work', 'docs'],
} as unknown as AppState;

const rows = reorderRows(state);
const layouts = Object.fromEntries(
  rows.map((row, index) => [
    row.id,
    { y: index * ROW_HEIGHT, height: ROW_HEIGHT },
  ]),
);

function row(id: string): ReorderRow {
  return rows.find((entry) => entry.id === id)!;
}

function dropOn(dragged: string, target: string) {
  return dropTarget(rows, layouts, row(dragged), layouts[target].y + 1);
}

describe('reorderRows', () => {
  it('lists folders with their repositories after them, in sidebar order', () => {
    expect(rows.map((entry) => entry.id)).toEqual([
      'acme',
      'work',
      'web',
      'api',
      'docs',
    ]);
  });
});

describe('dropTarget', () => {
  it('puts a repository before the repository it is dropped on, in that folder', () => {
    expect(dropOn('acme', 'api')).toEqual({
      kind: 'repo',
      repoId: 'acme',
      destination: { folderId: 'work', beforeId: 'api' },
    });
  });

  it('moves a repository to the end of the folder it is dropped on', () => {
    expect(dropOn('docs', 'work')).toEqual({
      kind: 'repo',
      repoId: 'docs',
      destination: { folderId: 'work', beforeId: null },
    });
  });

  it('moves anything dropped below the last row to the end of the root', () => {
    const below = rows.length * ROW_HEIGHT + 1;
    expect(dropTarget(rows, layouts, row('web'), below)).toEqual({
      kind: 'repo',
      repoId: 'web',
      destination: { folderId: null, beforeId: null },
    });
    expect(dropTarget(rows, layouts, row('work'), below)).toEqual({
      kind: 'folder',
      folderId: 'work',
      beforeId: null,
    });
  });

  it('puts a folder before the root item it is dropped on', () => {
    expect(dropOn('work', 'acme')).toEqual({
      kind: 'folder',
      folderId: 'work',
      beforeId: 'acme',
    });
  });

  it('puts a folder dropped on a repository inside a folder before that folder', () => {
    const withPersonal = {
      ...state,
      repos: [...state.repos, repo('blog', 'personal')],
      folders: [...state.folders, { id: 'personal', name: 'Personal' }],
      rootOrder: [...state.rootOrder, 'personal'],
    } as AppState;
    const nested = reorderRows(withPersonal);
    const nestedLayouts = Object.fromEntries(
      nested.map((entry, index) => [
        entry.id,
        { y: index * ROW_HEIGHT, height: ROW_HEIGHT },
      ]),
    );
    const personal = nested.find((entry) => entry.id === 'personal')!;

    expect(
      dropTarget(nested, nestedLayouts, personal, nestedLayouts.api.y + 1),
    ).toEqual({ kind: 'folder', folderId: 'personal', beforeId: 'work' });
  });

  it('does not move an item dropped on itself or a folder dropped on its own repositories', () => {
    expect(dropOn('web', 'web')).toBeNull();
    expect(dropOn('work', 'api')).toBeNull();
  });
});
