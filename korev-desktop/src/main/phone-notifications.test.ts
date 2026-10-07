import { describe, expect, it, vi } from 'vitest';
import { sendPhoneNotification } from './phone-notifications';

const NOTICE = {
  title: 'api ✨ needs your input',
  body: 'Fix the flaky test',
  workspaceId: 'w1',
};

describe('phone notifications', () => {
  it('posts the alert to the ntfy topic', async () => {
    const post = vi.fn(async () => new Response('ok'));
    await sendPhoneNotification('https://ntfy.sh/korev-abc', NOTICE, post);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get('title')).toBe(NOTICE.title);
    expect(url.startsWith('https://ntfy.sh/korev-abc?')).toBe(true);
    expect(init).toMatchObject({ method: 'POST', body: NOTICE.body });
  });

  it('sends nothing without a web address', async () => {
    const post = vi.fn(async () => new Response('ok'));
    await sendPhoneNotification('', NOTICE, post);
    await sendPhoneNotification('file:///etc/passwd', NOTICE, post);
    expect(post).not.toHaveBeenCalled();
  });

  it('does not throw when the service cannot be reached', async () => {
    const post = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(
      sendPhoneNotification('https://ntfy.sh/korev-abc', NOTICE, post),
    ).resolves.toBeUndefined();
  });
});
