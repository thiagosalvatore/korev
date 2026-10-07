import { useEffect, useState } from 'react';
import type { AppState } from '../../korev-desktop/src/shared/model';
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
