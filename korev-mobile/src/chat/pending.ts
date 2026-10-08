import type { ChatItem } from '../../../korev-desktop/src/shared/model';

export interface PendingSend {
  text: string;
  at: string;
  userCount: number;
}

const PENDING_ID = 'pending';

function countUserMessages(items: ChatItem[]) {
  return items.filter((item) => item.kind === 'user').length;
}

export function pendingSend(
  items: ChatItem[],
  text: string,
  at: string,
): PendingSend {
  return { text, at, userCount: countUserMessages(items) };
}

export function pendingUserItem(
  text: string,
  at: string,
): Extract<ChatItem, { kind: 'user' }> {
  return { id: PENDING_ID, kind: 'user', text, at, checkpoint: null };
}

export function withPendingMessage(
  items: ChatItem[],
  pending: PendingSend | null,
): ChatItem[] {
  if (!pending || countUserMessages(items) > pending.userCount) return items;
  return [...items, pendingUserItem(pending.text, pending.at)];
}
