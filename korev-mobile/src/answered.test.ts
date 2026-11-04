import { describe, expect, it } from 'vitest';
import type { AppState, ChatItem } from '../../korev-desktop/src/shared/model';
import {
  caughtUp,
  currentAnswers,
  trackAnswer,
  withAnswered,
  withAnsweredItems,
  type Answer,
} from './answered';
import { workspaceOf } from './appState';
import { demoWorld } from './demoContent';

const world = demoWorld(Date.now());
const sessionId = world.state.waitingSessions[0];
const workspaceId = workspaceOf(world.state, sessionId)!.id;
const pendingItem = world.transcripts
  .get(sessionId)!
  .find((item) => item.kind === 'permission' && item.status === 'pending')!;
const allowed: Answer = {
  itemId: pendingItem.id,
  status: 'allowed',
  sent: false,
};

function macState(running: boolean, waiting: boolean): AppState {
  return {
    ...world.state,
    runningSessions: running ? [sessionId] : [],
    waitingSessions: waiting ? [sessionId] : [],
  };
}

describe('answered permissions', () => {
  it('shows an answered chat as running before the Mac replies', () => {
    const state = withAnswered(world.state, new Map([[sessionId, allowed]]));
    expect(state.waitingSessions).not.toContain(sessionId);
    expect(state.runningSessions).toContain(sessionId);
    expect(state.runtime[workspaceId].status).toBe('working');
  });

  it('keeps the answer until the Mac stops showing the chat as waiting', () => {
    expect(caughtUp(macState(true, true), sessionId, allowed)).toBe(false);
    expect(caughtUp(macState(false, false), sessionId, allowed)).toBe(false);
    expect(caughtUp(macState(true, false), sessionId, allowed)).toBe(true);
    expect(
      caughtUp(macState(false, false), sessionId, { ...allowed, sent: true }),
    ).toBe(true);
  });

  it('resolves only the answered permission item', () => {
    const items = world.transcripts.get(sessionId)!;
    const shown = withAnsweredItems(items, allowed);
    expect(shown.find((item) => item.id === pendingItem.id)).toMatchObject({
      status: 'allowed',
    });
    const others = (list: ChatItem[]) =>
      list.filter((item) => item.id !== pendingItem.id);
    expect(others(shown)).toEqual(others(items));
  });

  it('drops the answer when sending fails', async () => {
    await trackAnswer(sessionId, allowed, async () => false);
    expect(currentAnswers().has(sessionId)).toBe(false);
  });
});
