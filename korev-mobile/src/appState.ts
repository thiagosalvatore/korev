import type {
  AppState,
  Workspace,
  WorkspaceRuntime,
} from '../../korev-desktop/src/shared/model';

export function without(list: string[], id: string): string[] {
  return list.filter((entry) => entry !== id);
}

export function workspaceOf(
  state: AppState,
  sessionId: string,
): Workspace | undefined {
  return state.workspaces.find((workspace) =>
    workspace.sessions.some((session) => session.id === sessionId),
  );
}

export function withRuntime(
  state: AppState,
  workspaceId: string | undefined,
  change: (runtime: WorkspaceRuntime) => Partial<WorkspaceRuntime>,
): AppState {
  const runtime = workspaceId ? state.runtime[workspaceId] : undefined;
  if (!workspaceId || !runtime) return state;
  return {
    ...state,
    runtime: {
      ...state.runtime,
      [workspaceId]: { ...runtime, ...change(runtime) },
    },
  };
}

export function withRunning(
  state: AppState,
  sessionId: string,
  running: boolean,
): AppState {
  const next = {
    ...state,
    runningSessions: running
      ? [...without(state.runningSessions, sessionId), sessionId]
      : without(state.runningSessions, sessionId),
    waitingSessions: without(state.waitingSessions, sessionId),
  };
  return withRuntime(next, workspaceOf(state, sessionId)?.id, () =>
    running ? { status: 'working' } : { status: 'idle', unread: true },
  );
}
