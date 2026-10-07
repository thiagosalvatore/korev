import { useEffect, useState } from 'react';
import {
  upsertChatItem,
  type AppState,
  type ChatItem,
} from '../../korev-desktop/src/shared/model';
import { useConnection } from './korev';

export function useAppState(): AppState | null {
  const connection = useConnection();
  const [state, setState] = useState<AppState | null>(null);
  useEffect(() => {
    let received = 0;
    const stopState = connection.on('state', (next) => {
      received++;
      setState(next);
    });
    const refresh = () => {
      const before = received;
      void connection.api
        .getState()
        .then((fresh) => {
          if (received === before) setState(fresh);
        })
        .catch(() => undefined);
    };
    const stopConnect = connection.onConnect(refresh);
    refresh();
    return () => {
      stopState();
      stopConnect();
    };
  }, [connection]);
  return state;
}

export function useTranscript(sessionId: string): ChatItem[] | null {
  const connection = useConnection();
  const [items, setItems] = useState<ChatItem[] | null>(null);
  useEffect(() => {
    let loaded: ChatItem[] | null = null;
    let pending: ChatItem[] = [];
    let request = 0;
    const stopChat = connection.on('chat', (update) => {
      if (update.sessionId !== sessionId) return;
      if (!loaded) {
        pending.push(update.item);
        return;
      }
      loaded = upsertChatItem(loaded, update.item);
      setItems(loaded);
    });
    const refresh = () => {
      const mine = ++request;
      loaded = null;
      pending = [];
      void connection.api
        .transcript(sessionId)
        .then((initial) => {
          if (mine !== request) return;
          loaded = pending.reduce(upsertChatItem, initial);
          setItems(loaded);
        })
        .catch(() => undefined);
    };
    const stopConnect = connection.onConnect(refresh);
    setItems(null);
    refresh();
    return () => {
      stopChat();
      stopConnect();
    };
  }, [connection, sessionId]);
  return items;
}
