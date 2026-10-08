import { describe, expect, it } from 'vitest';
import type { AppState, AskChat, Workspace } from '../shared/model';
import { freeTab, placeInPane, resolvePane } from './grid';
import type { WorkspaceUi } from './ui-store';

const workspace = {
  id: 'w1',
  name: 'login-page',
  branch: 'login-page',
  sessions: [{ id: 's1', title: 'Chat', agent: 'claude' }],
} as unknown as Workspace;

const ask = {
  id: 'a1',
  repoIds: ['r1'],
  session: { id: 'as1', title: 'How does login work?', agent: 'claude' },
} as unknown as AskChat;

function stateWith(workspaces: Workspace[], askChats = [ask]): AppState {
  return { workspaces, askChats } as unknown as AppState;
}

const chat = { workspaceId: 'w1', tabKey: 'chat:s1' };
const terminal = {
  kind: 'terminal' as const,
  id: 't1',
  preset: 'claude' as const,
};
const withTerminal: Record<string, WorkspaceUi> = {
  w1: {
    extraTabs: [terminal],
    activeKey: null,
    terminalTab: 'shell',
    comments: [],
  },
};

describe('placeInPane', () => {
  it('moves a tab out of the pane that already shows it', () => {
    expect(placeInPane([chat, null, null, null], 2, chat)).toEqual([
      null,
      null,
      chat,
      null,
    ]);
  });

  it('lets the new ask form show in one pane at most', () => {
    const newAsk = { askChatId: null };
    expect(placeInPane([newAsk, chat, null, null], 2, newAsk)).toEqual([
      null,
      chat,
      newAsk,
      null,
    ]);
  });
});

describe('freeTab', () => {
  const terminalPane = { workspaceId: 'w1', tabKey: 'terminal:t1' };

  it('skips a tab that another pane shows', () => {
    expect(freeTab([chat, null, null, null], 1, [chat, terminalPane])).toEqual(
      terminalPane,
    );
  });

  it('keeps a tab the target pane already shows', () => {
    expect(freeTab([chat, null, null, null], 0, [chat])).toEqual(chat);
  });

  it('is null when other panes show every tab', () => {
    expect(
      freeTab([chat, terminalPane, null, null], 2, [chat, terminalPane]),
    ).toBeNull();
  });
});

describe('resolvePane', () => {
  it('finds the chat a pane points at', () => {
    expect(resolvePane(stateWith([workspace]), {}, chat)).toEqual({
      kind: 'chat',
      workspace,
      session: workspace.sessions[0],
    });
  });

  it('finds the terminal tab a pane points at', () => {
    expect(
      resolvePane(stateWith([workspace]), withTerminal, {
        workspaceId: 'w1',
        tabKey: 'terminal:t1',
      }),
    ).toEqual({ kind: 'terminal', workspace, terminal });
  });

  it('is empty once the chat is closed', () => {
    expect(
      resolvePane(stateWith([{ ...workspace, sessions: [] }]), {}, chat),
    ).toBeNull();
  });

  it('finds the ask chat a pane points at', () => {
    expect(resolvePane(stateWith([]), {}, { askChatId: 'a1' })).toEqual({
      kind: 'ask',
      ask,
    });
  });

  it('is empty once the ask chat is deleted', () => {
    expect(resolvePane(stateWith([], []), {}, { askChatId: 'a1' })).toBeNull();
  });

  it('is empty once the workspace is archived', () => {
    expect(
      resolvePane(
        stateWith([{ ...workspace, archivedAt: '2026-10-08T00:00:00Z' }]),
        {},
        chat,
      ),
    ).toBeNull();
  });
});
