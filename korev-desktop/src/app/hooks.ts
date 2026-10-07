import { useEffect, useRef, useState } from 'react';
import type { AppState, ChatItem } from '../shared/model';
import { api, on } from './bridge';

export function useAppState(): AppState | null {
  const [state, setState] = useState<AppState | null>(null);
  useEffect(() => {
    const stop = on('state', setState);
    void api
      .getState()
      .then((initial) => setState((current) => current ?? initial));
    return stop;
  }, []);
  return state;
}

export function useTranscript(sessionId: string): ChatItem[] | null {
  const [items, setItems] = useState<ChatItem[] | null>(null);
  useEffect(() => {
    let loaded: ChatItem[] | null = null;
    const pending: ChatItem[] = [];
    const apply = (list: ChatItem[], item: ChatItem) => {
      const index = list.findIndex((entry) => entry.id === item.id);
      if (index === -1) return [...list, item];
      const next = [...list];
      next[index] = item;
      return next;
    };
    const stop = on('chat', (update) => {
      if (update.sessionId !== sessionId) return;
      if (!loaded) {
        pending.push(update.item);
        return;
      }
      loaded = apply(loaded, update.item);
      setItems(loaded);
    });
    setItems(null);
    void api.transcript(sessionId).then((initial) => {
      loaded = pending.reduce(apply, initial);
      setItems(loaded);
    });
    return stop;
  }, [sessionId]);
  return items;
}

export function usePolling(
  callback: () => void,
  intervalMs: number,
  deps: unknown[],
) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    latest.current();
    const timer = setInterval(() => latest.current(), intervalMs);
    return () => clearInterval(timer);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const update = () => setMatches(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}
