import type { KorevApi } from '../../../korev-desktop/src/shared/api';
import type {
  AppState,
  ChatSession,
} from '../../../korev-desktop/src/shared/model';
import { attempt } from '../attempt';
import { useConnection } from '../korev';

export type SessionPatch = Parameters<KorevApi['updateSession']>[1];

export function useSessionUpdate(sessionId: string) {
  const { api } = useConnection();
  return (patch: SessionPatch) =>
    void attempt('Korev could not change the chat settings', () =>
      api.updateSession(sessionId, patch),
    );
}

export function findSession(
  state: AppState,
  sessionId: string,
): ChatSession | undefined {
  return (
    state.workspaces
      .flatMap((workspace) => workspace.sessions)
      .find((session) => session.id === sessionId) ??
    state.askChats.find((ask) => ask.session.id === sessionId)?.session
  );
}
