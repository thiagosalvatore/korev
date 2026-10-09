import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  upsertChatItem,
  type AppState,
  type ChatItem,
} from '../../korev-desktop/src/shared/model';
import { createDemoConnection } from './demo';
import type { Connection } from './connection';

const LONG_ENOUGH_MS = 60_000;

let connection: Connection;

function waitingQuestion(state: AppState) {
  const sessionId = state.waitingSessions[0];
  return { sessionId, workspace: workspaceOf(state, sessionId) };
}

function workspaceOf(state: AppState, sessionId: string) {
  return state.workspaces.find((workspace) =>
    workspace.sessions.some((session) => session.id === sessionId),
  )!;
}

async function followTranscript(sessionId: string) {
  let items: ChatItem[] = await connection.api.transcript(sessionId);
  connection.on('chat', (update) => {
    if (update.sessionId === sessionId)
      items = upsertChatItem(items, update.item);
  });
  return () => items;
}

beforeEach(() => {
  vi.useFakeTimers();
  connection = createDemoConnection();
  connection.open();
});

afterEach(() => {
  connection.close();
  vi.useRealTimers();
});

describe('demo connection', () => {
  it('is online without a network', () => {
    expect(connection.status()).toEqual({ state: 'online', attempting: false });
  });

  it('streams a reply to a message and then finishes', async () => {
    const state = await connection.api.getState();
    const session = state.workspaces.at(-1)!.sessions[0];
    const transcript = await followTranscript(session.id);
    await connection.api.send(session.id, {
      text: 'Add a dark mode toggle',
      agent: session.agent,
      model: session.model,
      effort: session.effort,
      planMode: false,
      fast: false,
    });
    expect((await connection.api.getState()).runningSessions).toContain(
      session.id,
    );

    await vi.advanceTimersByTimeAsync(LONG_ENOUGH_MS);

    const items = transcript();
    expect(items.at(-3)).toMatchObject({
      kind: 'user',
      text: 'Add a dark mode toggle',
    });
    expect(items.at(-2)?.kind).toBe('assistant');
    expect(items.at(-1)).toMatchObject({ kind: 'result', ok: true });
    expect((await connection.api.getState()).runningSessions).not.toContain(
      session.id,
    );
  });

  it('stops waiting once the question is answered', async () => {
    const { sessionId } = waitingQuestion(await connection.api.getState());
    const question = (await connection.api.transcript(sessionId)).find(
      (item) => item.kind === 'permission' && item.status === 'pending',
    )!;

    await connection.api.respondPermission(sessionId, question.id, {
      allow: true,
      answers: { provider: 'Stripe' },
    });

    expect((await connection.api.getState()).waitingSessions).not.toContain(
      sessionId,
    );
  });

  it('merges the open pull request', async () => {
    const state = await connection.api.getState();
    const [workspaceId, runtime] = Object.entries(state.runtime).find(
      ([, entry]) => entry.prs.some((pr) => pr.state === 'OPEN'),
    )!;

    await connection.api.mergePr(workspaceId, runtime.prs[0].number);

    const merged = (await connection.api.getState()).runtime[workspaceId];
    expect(merged.prs[0].state).toBe('MERGED');
  });
});
