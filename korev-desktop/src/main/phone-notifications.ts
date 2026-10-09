import { isWebUrl } from './app-origin';
import type { Notice } from './context';

const TITLE_PARAM = 'title';

type Post = (url: string, init: RequestInit) => Promise<Response>;

export async function sendPhoneNotification(
  topicUrl: string,
  notice: Notice,
  post: Post = fetch,
): Promise<void> {
  if (!isWebUrl(topicUrl)) return;
  const url = new URL(topicUrl);
  url.searchParams.set(TITLE_PARAM, notice.title);
  try {
    const response = await post(url.toString(), {
      method: 'POST',
      body: notice.body,
    });
    if (!response.ok)
      console.warn(`Phone notification failed: HTTP ${response.status}`);
  } catch (error) {
    console.warn(`Phone notification failed: ${String(error)}`);
  }
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

interface PushTicket {
  details?: { error?: string };
}

function pushMessage(token: string, notice: Notice) {
  return {
    to: token,
    title: notice.title,
    body: notice.body,
    data: { workspaceId: notice.workspaceId },
    sound: 'default',
    priority: 'high',
  };
}

export async function sendPushNotifications(
  tokens: string[],
  notice: Notice,
  post: Post = fetch,
): Promise<string[]> {
  if (tokens.length === 0) return [];
  try {
    const response = await post(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(tokens.map((token) => pushMessage(token, notice))),
    });
    if (!response.ok) {
      console.warn(`Push notification failed: HTTP ${response.status}`);
      return [];
    }
    const { data: tickets } = (await response.json()) as { data: PushTicket[] };
    return tokens.filter(
      (_token, index) =>
        tickets[index]?.details?.error === DEVICE_NOT_REGISTERED,
    );
  } catch (error) {
    console.warn(`Push notification failed: ${String(error)}`);
    return [];
  }
}
