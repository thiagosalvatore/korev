import { describe, expect, it, vi } from 'vitest';
import {
  sendPhoneNotification,
  sendPushNotifications,
} from './phone-notifications';

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

const PHONE = 'ExponentPushToken[phone]';
const TABLET = 'ExponentPushToken[tablet]';

function expoReplies(tickets: unknown[]) {
  return vi.fn(async () => Response.json({ data: tickets }));
}

describe('push notifications', () => {
  it('sends the alert to every phone through Expo', async () => {
    const post = expoReplies([{ status: 'ok' }, { status: 'ok' }]);
    const stale = await sendPushNotifications([PHONE, TABLET], NOTICE, post);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(JSON.parse(init.body as string)).toEqual(
      [PHONE, TABLET].map((to) =>
        expect.objectContaining({
          to,
          title: NOTICE.title,
          body: NOTICE.body,
          data: { workspaceId: 'w1' },
        }),
      ),
    );
    expect(stale).toEqual([]);
  });

  it('returns the phones that no longer accept notifications', async () => {
    const post = expoReplies([
      { status: 'ok' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);
    expect(await sendPushNotifications([PHONE, TABLET], NOTICE, post)).toEqual([
      TABLET,
    ]);
  });

  it('sends nothing when no phone is registered', async () => {
    const post = expoReplies([]);
    await sendPushNotifications([], NOTICE, post);
    expect(post).not.toHaveBeenCalled();
  });

  it('does not throw when Expo cannot be reached', async () => {
    const post = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await sendPushNotifications([PHONE], NOTICE, post)).toEqual([]);
  });
});
