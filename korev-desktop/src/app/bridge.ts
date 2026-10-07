import type {
  KorevApi,
  KorevBridge,
  KorevEvents,
  Unsubscribe,
} from '../shared/api';

declare global {
  interface Window {
    korev: KorevBridge;
  }
}

export const api = new Proxy({} as KorevApi, {
  get:
    (_target, method: string) =>
    (...args: unknown[]) =>
      window.korev.call(method, args),
});

export function on<E extends keyof KorevEvents>(
  event: E,
  listener: (payload: KorevEvents[E]) => void,
): Unsubscribe {
  return window.korev.on(event, listener);
}
