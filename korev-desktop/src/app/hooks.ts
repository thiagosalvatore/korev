import { useEffect, useRef, useState } from 'react';
import {
  upsertChatItem,
  type AppState,
  type ChatItem,
  type ModelChoice,
  type Settings,
} from '../shared/model';
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

export function useModelChoice(settings: Settings) {
  const [agent, setAgent] = useState(settings.defaultAgent);
  const [model, setModel] = useState(settings.defaultModels[agent]);
  const [effort, setEffort] = useState(settings.defaultEffort[agent]);
  function choose(choice: ModelChoice) {
    if (choice.agent !== agent) setEffort(settings.defaultEffort[choice.agent]);
    setAgent(choice.agent);
    setModel(choice.id);
  }
  return { agent, model, effort, setEffort, choose };
}

export function useTranscript(sessionId: string): ChatItem[] | null {
  const [items, setItems] = useState<ChatItem[] | null>(null);
  useEffect(() => {
    let loaded: ChatItem[] | null = null;
    const pending: ChatItem[] = [];
    const stop = on('chat', (update) => {
      if (update.sessionId !== sessionId) return;
      if (!loaded) {
        pending.push(update.item);
        return;
      }
      loaded = upsertChatItem(loaded, update.item);
      setItems(loaded);
    });
    setItems(null);
    void api.transcript(sessionId).then((initial) => {
      loaded = pending.reduce(upsertChatItem, initial);
      setItems(loaded);
    });
    return stop;
  }, [sessionId]);
  return items;
}

export function usePolling(
  callback: () => void,
  intervalMs: number | null,
  deps: unknown[],
) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    latest.current();
    if (intervalMs === null) return;
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
