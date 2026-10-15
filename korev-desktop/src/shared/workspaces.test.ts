import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCRIPTS,
  type AppState,
  type Repo,
  type Workspace,
  type WorkspaceRuntime,
} from './model';
import {
  activeWorkspaces,
  boardColumn,
  crossRepoLead,
  folderRuns,
  laneRepos,
  repoSections,
  waitsForLane,
} from './workspaces';

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

function workspace(
  id: string,
  repoId: string,
  createdAt: string,
  groupId: string | null = null,
): Workspace {
  return {
    id,
    repoId,
    createdAt,
    groupId,
    archivedAt: null,
    awaitsLane: false,
  } as Workspace;
}

const state = {
  rootOrder: ['work', 'scratch', 'personal', 'orphan'],
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
  it('lists folders and repositories without a folder in the root order', () => {
    expect(
      repoSections(state).map((section) => [
        section.folder?.name ?? null,
        section.repos.map((entry) => entry.id),
      ]),
    ).toEqual([
      ['Work', ['api', 'web']],
      [null, ['scratch']],
      ['Personal', ['blog']],
      [null, ['orphan']],
    ]);
  });
});

describe('activeWorkspaces', () => {
  it('follows the sidebar order of repositories', () => {
    expect(activeWorkspaces(state).map((ws) => ws.id)).toEqual([
      'api-1',
      'api-2',
      'web-1',
      'scratch-1',
      'blog-1',
    ]);
  });

  it('keeps the workspaces of one group next to each other', () => {
    const lanes = {
      ...state,
      workspaces: [
        workspace('lane-1', 'scratch', '2026-01-01', 'plan'),
        workspace('other', 'scratch', '2026-01-02'),
        workspace('lane-2', 'scratch', '2026-01-03', 'plan'),
      ],
    } as AppState;
    expect(activeWorkspaces(lanes).map((ws) => ws.id)).toEqual([
      'lane-1',
      'lane-2',
      'other',
    ]);
  });

  it('keeps the workspaces of one folder together, where its first one was made', () => {
    const inWave = (ws: Workspace) => ({ ...ws, folderId: 'wave' });
    const foldered = {
      ...state,
      workspaces: [
        workspace('first', 'scratch', '2026-01-01'),
        inWave(workspace('wave-2', 'scratch', '2026-01-04')),
        workspace('between', 'scratch', '2026-01-03'),
        inWave(workspace('wave-1', 'scratch', '2026-01-02')),
      ],
    } as AppState;

    const sorted = activeWorkspaces(foldered);

    expect(sorted.map((ws) => ws.id)).toEqual([
      'first',
      'wave-1',
      'wave-2',
      'between',
    ]);
    expect(
      folderRuns(sorted, new Map()).map((run) => [
        run.folderId,
        run.workspaces.map((ws) => ws.id),
      ]),
    ).toEqual([
      [null, ['first']],
      ['wave', ['wave-1', 'wave-2']],
      [null, ['between']],
    ]);
  });
});

describe('laneRepos', () => {
  const group = {
    ...state,
    workspaces: [
      workspace('web-lead', 'web', '2026-01-01', 'billing'),
      workspace('api-member', 'api', '2026-01-01', 'billing'),
      workspace('web-lane', 'web', '2026-01-02', 'billing'),
      workspace('alone', 'blog', '2026-01-03'),
    ],
  } as AppState;

  it('lists each repository of the group once, its own first', () => {
    const [, apiMember] = group.workspaces;
    expect(laneRepos(group, apiMember).map((repo) => repo.id)).toEqual([
      'api',
      'web',
    ]);
  });

  it('offers no repositories outside a group across repositories', () => {
    const [, , webLane, alone] = group.workspaces;
    expect(laneRepos(group, alone)).toEqual([]);
    expect(
      laneRepos(
        { ...group, workspaces: [group.workspaces[0], webLane] },
        webLane,
      ),
    ).toEqual([]);
  });
});

describe('a group across repositories', () => {
  const lead = workspace('web-lead', 'web', '2026-01-05', 'billing');
  const apiMember = {
    ...workspace('api-member', 'api', '2026-01-05', 'billing'),
    awaitsLane: true,
  };
  const scratchMember = {
    ...workspace('scratch-member', 'scratch', '2026-01-05', 'billing'),
    awaitsLane: true,
  };
  const group = {
    ...state,
    runtime: {},
    workspaces: [
      lead,
      apiMember,
      scratchMember,
      workspace('api-1', 'api', '2026-01-02'),
    ],
  } as unknown as AppState;
  const withoutLead = {
    ...group,
    workspaces: [
      { ...lead, archivedAt: '2026-01-06' },
      ...group.workspaces.slice(1),
    ],
  } as AppState;

  it('sorts all its members under the lead repository', () => {
    expect(activeWorkspaces(group).map((ws) => ws.id)).toEqual([
      'api-1',
      'web-lead',
      'api-member',
      'scratch-member',
    ]);
  });

  it('hands the lead to the next member when the lead is archived', () => {
    expect(crossRepoLead(withoutLead, apiMember)?.id).toBe('api-member');
    expect(activeWorkspaces(withoutLead).map((ws) => ws.id)).toEqual([
      'api-1',
      'api-member',
      'scratch-member',
    ]);
  });

  it('puts all its members in the folder of the lead', () => {
    const foldered = {
      ...group,
      workspaces: group.workspaces.map((ws) =>
        ws === lead ? { ...ws, folderId: 'wave' } : ws,
      ),
    } as AppState;
    const leads = new Map([['billing', foldered.workspaces[0]]]);

    expect(
      folderRuns(activeWorkspaces(foldered), leads).map((run) => [
        run.folderId,
        run.workspaces.map((ws) => ws.id),
      ]),
    ).toEqual([
      [null, ['api-1']],
      ['wave', ['web-lead', 'api-member', 'scratch-member']],
    ]);
  });

  it('waits for a lane only in members other than the lead', () => {
    expect(waitsForLane(group, apiMember)).toBe(true);
    expect(waitsForLane(group, lead)).toBe(false);
    expect(waitsForLane(withoutLead, apiMember)).toBe(false);
    expect(waitsForLane(group, { ...apiMember, awaitsLane: false })).toBe(
      false,
    );
  });
});

describe('boardColumn', () => {
  const runtime = (
    status: WorkspaceRuntime['status'],
    unread = false,
  ): WorkspaceRuntime => ({ status, unread }) as WorkspaceRuntime;

  it('puts each status in its column', () => {
    expect(boardColumn(runtime('waiting'))).toBe('needs-you');
    expect(boardColumn(runtime('error'))).toBe('needs-you');
    expect(boardColumn(runtime('failed'))).toBe('needs-you');
    expect(boardColumn(runtime('working'))).toBe('working');
    expect(boardColumn(runtime('setting-up'))).toBe('working');
    expect(boardColumn(runtime('creating'))).toBe('working');
    expect(boardColumn(runtime('archiving'))).toBe('working');
  });

  it('splits idle workspaces by whether you have read the last turn', () => {
    expect(boardColumn(runtime('idle', true))).toBe('done');
    expect(boardColumn(runtime('idle', false))).toBe('idle');
  });
});
