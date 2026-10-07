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
