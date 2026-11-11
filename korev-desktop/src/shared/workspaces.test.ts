import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCRIPTS,
  type AppState,
  type AskChat,
  type PrStatus,
  type Repo,
  type Workspace,
  type WorkspaceRuntime,
} from './model';
import {
  acrossReposIn,
  activeWorkspaces,
  askSections,
  asksWaitingForYou,
  boardColumn,
  crossRepoLead,
  crossRepoLeads,
  folderRuns,
  isAcrossRepos,
  laneRepos,
  pickerRepos,
  repoSections,
  waitsForLane,
  workspacesWaitingForYou,
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
      folderRuns(sorted).map((run) => [
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

  it('sorts all its members together, before every repository', () => {
    expect(activeWorkspaces(group).map((ws) => ws.id)).toEqual([
      'web-lead',
      'api-member',
      'scratch-member',
      'api-1',
    ]);
  });

  it('hands the lead to the next member when the lead is archived', () => {
    expect(crossRepoLead(withoutLead, apiMember)?.id).toBe('api-member');
    expect(activeWorkspaces(withoutLead).map((ws) => ws.id)).toEqual([
      'api-member',
      'scratch-member',
      'api-1',
    ]);
  });

  it('keeps its members out of the folder of the lead', () => {
    const foldered = {
      ...group,
      workspaces: [
        ...group.workspaces.map((ws) =>
          ws === lead ? { ...ws, folderId: 'wave' } : ws,
        ),
        { ...workspace('api-2', 'api', '2026-01-03'), folderId: 'wave' },
      ],
    } as AppState;

    expect(activeWorkspaces(foldered).map((ws) => ws.id)).toEqual([
      'web-lead',
      'api-member',
      'scratch-member',
      'api-1',
      'api-2',
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

describe('isAcrossRepos', () => {
  const linked = {
    ...state,
    runtime: {},
    workspaces: [
      workspace('web-lead', 'web', '2026-01-01', 'billing'),
      workspace('api-member', 'api', '2026-01-01', 'billing'),
      workspace('lane-1', 'scratch', '2026-01-02', 'plan'),
      workspace('lane-2', 'scratch', '2026-01-02', 'plan'),
      workspace('alone', 'blog', '2026-01-03'),
    ],
  } as unknown as AppState;
  const leads = crossRepoLeads(linked);
  const acrossRepos = (id: string) =>
    isAcrossRepos(leads, linked.workspaces.find((ws) => ws.id === id)!);

  it('marks only the members of a group that spans repositories', () => {
    expect(acrossRepos('web-lead')).toBe(true);
    expect(acrossRepos('api-member')).toBe(true);
    expect(acrossRepos('lane-1')).toBe(false);
    expect(acrossRepos('alone')).toBe(false);
  });

  it('counts the linked groups and Asks across repositories a repository is part of', () => {
    const withAsks = {
      ...linked,
      askChats: [
        ask('both', ['web', 'api']),
        ask('web-only', ['web']),
        ask('elsewhere', ['blog', 'scratch']),
      ],
    } as AppState;
    expect(acrossReposIn(withAsks, 'web')).toEqual({ linked: 1, asks: 1 });
    expect(acrossReposIn(withAsks, 'scratch')).toEqual({ linked: 0, asks: 1 });
    expect(acrossReposIn(withAsks, 'orphan')).toEqual({ linked: 0, asks: 0 });
  });
});

function ask(
  id: string,
  repoIds: string[],
  lastMessageAt = '2026-01-01',
): AskChat {
  return {
    id,
    repoIds,
    lastMessageAt,
    session: { id: `${id}-session` },
  } as AskChat;
}

describe('askSections', () => {
  it('puts each Ask with its one repository, across repositories or under no repository, newest first', () => {
    const sections = askSections({
      askChats: [
        ask('old-web', ['web'], '2026-01-01'),
        ask('both', ['web', 'api'], '2026-01-02'),
        ask('general', [], '2026-01-03'),
        ask('new-web', ['web'], '2026-01-04'),
        ask('api', ['api'], '2026-01-05'),
        {
          ...ask('nightly', ['web']),
          automationRun: { automationId: 'a1' },
        } as AskChat,
      ],
    });
    const ids = (asks: AskChat[] | undefined) => asks?.map((entry) => entry.id);

    expect(ids(sections.acrossRepos)).toEqual(['both']);
    expect(ids(sections.noRepo)).toEqual(['general']);
    expect(ids(sections.byRepo.get('web'))).toEqual(['new-web', 'old-web']);
    expect(ids(sections.byRepo.get('api'))).toEqual(['api']);
  });
});

describe('asksWaitingForYou', () => {
  it('lists the Asks waiting for your input, without automation runs', () => {
    const waiting = asksWaitingForYou({
      askChats: [
        ask('waiting', ['web']),
        ask('idle', ['web']),
        {
          ...ask('nightly', ['web']),
          automationRun: { automationId: 'a1' },
        } as AskChat,
      ],
      waitingSessions: ['waiting-session', 'nightly-session'],
    });
    expect(waiting.map((entry) => entry.id)).toEqual(['waiting']);
  });
});

describe('boardColumn', () => {
  const runtime = (
    status: WorkspaceRuntime['status'],
    unread = false,
  ): WorkspaceRuntime => ({ status, unread }) as WorkspaceRuntime;

  it('puts each status in its column', () => {
    expect(boardColumn(runtime('waiting'))).toBe('needs-you');
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

  it('asks for you when the setup script failed and no agent is working', () => {
    const failedSetup = (status: WorkspaceRuntime['status']) =>
      ({ status, setupError: 'Setup script failed' }) as WorkspaceRuntime;
    expect(boardColumn(failedSetup('idle'))).toBe('needs-you');
    expect(boardColumn(failedSetup('working'))).toBe('working');
  });
});

describe('workspacesWaitingForYou', () => {
  const pr = (unansweredThreads: string[]) =>
    ({
      number: 7,
      state: 'OPEN',
      mergeable: 'MERGEABLE',
      checks: [],
      unansweredThreads,
    }) as unknown as PrStatus;
  const runtime = (
    status: WorkspaceRuntime['status'],
    prs: PrStatus[],
  ): WorkspaceRuntime => ({ status, unread: false, prs }) as WorkspaceRuntime;

  it('lists an idle workspace whose PR has unanswered comments', () => {
    const waiting = workspacesWaitingForYou({
      ...state,
      settings: { ...state.settings, keepPrsReady: false },
      runtime: {
        'blog-1': runtime('idle', [pr(['c1'])]),
        'web-1': runtime('idle', [pr([])]),
        'api-1': runtime('working', [pr(['c2'])]),
      },
    });
    expect(waiting.map((entry) => entry.id)).toEqual(['blog-1']);
  });

  it('lists a kept-ready workspace only once Korev has already sent its problems to the agent', () => {
    const handled = (id: string, prReadyHandled: string[]) =>
      ({
        ...workspace(id, 'blog', '2026-01-01'),
        pausePrReady: false,
        prReadyHandled,
      }) as Workspace;
    const waiting = workspacesWaitingForYou({
      ...state,
      settings: { keepPrsReady: true },
      workspaces: [handled('sent', ['thread:c1@7']), handled('new', [])],
      runtime: {
        sent: runtime('idle', [pr(['c1'])]),
        new: runtime('idle', [pr(['c1'])]),
      },
    } as unknown as AppState);
    expect(waiting.map((entry) => entry.id)).toEqual(['sent']);
  });
});

describe('pickerRepos', () => {
  it('lists the three most recently used repositories first, then the rest by name', () => {
    const order = pickerRepos({
      repos: [
        repo('zeta'),
        repo('Beta'),
        repo('alpha'),
        repo('used-first'),
        repo('used-by-ask'),
        repo('used-latest'),
        repo('gamma'),
      ],
      workspaces: [
        workspace('w1', 'used-first', '2026-01-01'),
        workspace('w2', 'used-latest', '2026-03-01'),
        workspace('w3', 'gamma', '2025-12-01'),
      ],
      askChats: [
        { repoIds: ['used-by-ask'], createdAt: '2026-02-01' },
      ] as AppState['askChats'],
    });

    expect(order.map(({ repo, recent }) => [repo.id, recent])).toEqual([
      ['used-latest', true],
      ['used-by-ask', true],
      ['used-first', true],
      ['alpha', false],
      ['Beta', false],
      ['gamma', false],
      ['zeta', false],
    ]);
  });
});
