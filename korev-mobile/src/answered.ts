import type {
  AppState,
  ChatItem,
  PermissionStatus,
} from '../../korev-desktop/src/shared/model';
import { withRunning } from './appState';

export interface Answer {
  itemId: string | null;
  status: PermissionStatus;
  sent: boolean;
}

export type Answers = ReadonlyMap<string, Answer>;

let answers: Answers = new Map();
const listeners = new Set<() => void>();

function replace(next: Answers) {
  answers = next;
  listeners.forEach((listener) => listener());
}

function remember(sessionId: string, answer: Answer) {
  replace(new Map(answers).set(sessionId, answer));
}

function forget(sessionIds: string[]) {
  if (!sessionIds.length) return;
  const next = new Map(answers);
  sessionIds.forEach((sessionId) => next.delete(sessionId));
  replace(next);
}

export function subscribeAnswers(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentAnswers(): Answers {
  return answers;
}

export async function trackAnswer(
  sessionId: string,
  answer: Omit<Answer, 'sent'>,
  send: () => Promise<boolean>,
): Promise<boolean> {
  remember(sessionId, { ...answer, sent: false });
  const sent = await send();
  const current = answers.get(sessionId);
  if (!sent) forget([sessionId]);
  else if (current) remember(sessionId, { ...current, sent: true });
  return sent;
}

export function caughtUp(
  state: AppState,
  sessionId: string,
  answer: Answer,
): boolean {
  if (state.waitingSessions.includes(sessionId)) return false;
  return answer.sent || state.runningSessions.includes(sessionId);
}

export function forgetCaughtUp(state: AppState) {
  forget(
    [...answers].flatMap(([sessionId, answer]) =>
      caughtUp(state, sessionId, answer) ? [sessionId] : [],
    ),
  );
}

export function withAnswered(state: AppState, given: Answers): AppState {
  return [...given.keys()].reduce(
    (next, sessionId) => withRunning(next, sessionId, true),
    state,
  );
}

export function withAnsweredItems(
  items: ChatItem[],
  answer: Answer | undefined,
): ChatItem[] {
  if (!answer?.itemId) return items;
  return items.map((item) =>
    item.id === answer.itemId &&
    item.kind === 'permission' &&
    item.status === 'pending'
      ? { ...item, status: answer.status }
      : item,
  );
}
