import type { KorevApi, KorevBridge } from '../../korev-desktop/src/shared/api';

export function apiFor(bridge: KorevBridge): KorevApi {
  return new Proxy({} as KorevApi, {
    get:
      (_target, method: string) =>
      (...args: unknown[]) =>
        bridge.call(method, args),
  });
}

export function createEventListeners(): Pick<KorevBridge, 'on'> & {
  emit(event: string, payload: unknown): void;
} {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    emit(event, payload) {
      listeners.get(event)?.forEach((listener) => listener(payload));
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      const untyped = listener as (payload: unknown) => void;
      set.add(untyped);
      return () => set.delete(untyped);
    },
  };
}
