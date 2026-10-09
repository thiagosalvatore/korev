import { describe, expect, it } from 'vitest';
import type { ChatItem } from '../../../korev-desktop/src/shared/model';
import { pendingSend, withPendingMessage } from './pending';

const AT = '2026-10-08T12:00:00.000Z';

function user(id: string, text: string): ChatItem {
  return { id, kind: 'user', text, at: AT, checkpoint: null };
}

const reply: ChatItem = { id: 'a1', kind: 'assistant', text: 'Done.' };

describe('withPendingMessage', () => {
  it('shows the pending message after the transcript', () => {
    const items = [user('u1', 'hi'), reply];
    const pending = pendingSend(items, 'next', AT);
    expect(withPendingMessage(items, pending)).toEqual([
      ...items,
      user('pending', 'next'),
    ]);
  });

  it('drops the pending message once the desktop echoes it', () => {
    const before = [user('u1', 'hi'), reply];
    const pending = pendingSend(before, 'next', AT);
    const after = [...before, user('u2', 'next')];
    expect(withPendingMessage(after, pending)).toBe(after);
  });

  it('keeps the pending message when an earlier message has the same text', () => {
    const items = [user('u1', 'again'), reply];
    const pending = pendingSend(items, 'again', AT);
    expect(withPendingMessage(items, pending)).toHaveLength(3);
  });

  it('returns the transcript unchanged when nothing is pending', () => {
    const items = [user('u1', 'hi')];
    expect(withPendingMessage(items, null)).toBe(items);
  });
});
