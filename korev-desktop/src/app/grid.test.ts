import { describe, expect, it } from 'vitest';
import type { AppState, Workspace } from '../shared/model';
import { placeInPane, resolvePane } from './grid';

const workspace = {
  id: 'w1',
  name: 'login-page',
  branch: 'login-page',
  sessions: [{ id: 's1', title: 'Chat', agent: 'claude' }],
} as unknown as Workspace;

function stateWith(workspaces: Workspace[]): AppState {
  return { workspaces } as unknown as AppState;
}

const chat = { workspaceId: 'w1', tabKey: 'chat:s1' };

describe('placeInPane', () => {
  it('moves a tab out of the pane that already shows it', () => {
    expect(placeInPane([chat, null, null, null], 2, chat)).toEqual([
      null,
      null,
      chat,
      null,
    ]);
  });
});

describe('resolvePane', () => {
  it('finds the chat a pane points at', () => {
    expect(resolvePane(stateWith([workspace]), chat)).toEqual({
      kind: 'chat',
      workspace,
      session: workspace.sessions[0],
    });
  });

  it('is empty once the chat is closed', () => {
    expect(
      resolvePane(stateWith([{ ...workspace, sessions: [] }]), chat),
    ).toBeNull();
  });

  it('is empty once the workspace is archived', () => {
    expect(
      resolvePane(
        stateWith([{ ...workspace, archivedAt: '2026-10-08T00:00:00Z' }]),
        chat,
      ),
    ).toBeNull();
  });
});
