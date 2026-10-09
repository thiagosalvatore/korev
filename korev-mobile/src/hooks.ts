import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import {
  upsertChatItem,
  type AppState,
  type ChatItem,
  type ModelChoice,
  type Settings,
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

export function useModelChoice(settings: Settings) {
  const [agent, setAgent] = useState(settings.defaultAgent);
  const [model, setModel] = useState(settings.defaultModels[agent]);
  const [effort, setEffort] = useState(settings.defaultEffort[agent]);
  function choose(choice: ModelChoice) {
    if (choice.agent !== agent) setEffort(settings.defaultEffort[choice.agent]);
    setAgent(choice.agent);
    setModel(choice.id);
  }
  return { agent, model, effort, choose };
}

const KEYBOARD_SHOW =
  Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const KEYBOARD_HIDE =
  Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(KEYBOARD_SHOW, () => setShown(true));
    const hide = Keyboard.addListener(KEYBOARD_HIDE, () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}
