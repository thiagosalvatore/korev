import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCRIPTS,
  type AppState,
  type Repo,
  type Workspace,
} from '../shared/model';
import { activeWorkspaces, repoSections } from './actions';

function repo(id: string, folderId: string | null = null): Repo {
  return {
    id,
    name: id,
    path: `/${id}`,
    defaultBranch: 'main',
    scripts: EMPTY_SCRIPTS,
    folderId,
  };
}

function workspace(id: string, repoId: string, createdAt: string): Workspace {
  return { id, repoId, createdAt, archivedAt: null } as Workspace;
}

const state = {
  folders: [
    { id: 'work', name: 'Work' },
    { id: 'personal', name: 'Personal' },
  ],
  repos: [
    repo('blog', 'personal'),
    repo('api', 'work'),
    repo('scratch'),
    repo('orphan', 'deleted-folder'),
    repo('web', 'work'),
  ],
  workspaces: [
    workspace('blog-1', 'blog', '2026-01-01'),
    workspace('web-1', 'web', '2026-01-01'),
    workspace('api-2', 'api', '2026-01-03'),
    workspace('api-1', 'api', '2026-01-02'),
    workspace('scratch-1', 'scratch', '2026-01-04'),
  ],
} as unknown as AppState;

describe('repoSections', () => {
  it('lists repositories without a folder first, then each folder in order', () => {
    expect(
      repoSections(state).map((section) => [
        section.folder?.name ?? null,
        section.repos.map((entry) => entry.id),
      ]),
    ).toEqual([
      [null, ['scratch', 'orphan']],
      ['Work', ['api', 'web']],
      ['Personal', ['blog']],
    ]);
  });
});

describe('activeWorkspaces', () => {
  it('follows the sidebar order of repositories', () => {
    expect(activeWorkspaces(state).map((ws) => ws.id)).toEqual([
      'scratch-1',
      'api-1',
      'api-2',
      'web-1',
      'blog-1',
    ]);
  });
});
