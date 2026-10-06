import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { CALL_CHANNEL } from '../shared/api';
import { isAppUrl, isWebUrl, type AppOrigin } from './app-origin';
import {
  registerIpcHandlers,
  UnknownMethodError,
  UntrustedSenderError,
} from './ipc';

const DEV_ORIGIN: AppOrigin = {
  devServerUrl: 'http://localhost:5173',
  rendererDirectory: '/unused',
};
const PACKAGED_ORIGIN: AppOrigin = {
  devServerUrl: undefined,
  rendererDirectory: '/Applications/Korev.app/renderer/main_window',
};

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function callFrom(senderUrl: string, method: string, handler: () => unknown) {
  let listener: Listener | undefined;
  registerIpcHandlers(
    {
      handle: (channel, registered) => {
        if (channel === CALL_CHANNEL) listener = registered;
      },
    },
    { getState: handler },
    (url) => isAppUrl(url, DEV_ORIGIN),
  );
  const event = { senderFrame: { url: senderUrl } } as IpcMainInvokeEvent;
  return () => listener?.(event, method, []);
}

describe('IPC sender guard', () => {
  it('runs the handler for the app origin', () => {
    const handler = vi.fn(() => 'ok');
    expect(
      callFrom('http://localhost:5173/index.html', 'getState', handler)(),
    ).toBe('ok');
  });

  it('rejects a sender outside the app origin', () => {
    const handler = vi.fn();
    const call = callFrom('https://evil.example/', 'getState', handler);
    expect(call).toThrow(UntrustedSenderError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects methods that are not handlers', () => {
    const call = callFrom('http://localhost:5173/', 'toString', vi.fn());
    expect(call).toThrow(UnknownMethodError);
  });
});

describe('app origin', () => {
  it('accepts only files inside the packaged renderer directory', () => {
    expect(
      isAppUrl(
        'file:///Applications/Korev.app/renderer/main_window/index.html',
        PACKAGED_ORIGIN,
      ),
    ).toBe(true);
    expect(isAppUrl('file:///etc/passwd', PACKAGED_ORIGIN)).toBe(false);
  });

  it('opens only web links externally', () => {
    expect(isWebUrl('https://github.com/acme/api/pull/1')).toBe(true);
    expect(isWebUrl('file:///etc/passwd')).toBe(false);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
  });
});
