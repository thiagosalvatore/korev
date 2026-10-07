import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AppState as PhoneAppState } from 'react-native';
import type { RemotePairing } from '../../korev-desktop/src/shared/model';
import {
  call,
  clearPairing,
  connect,
  loadPairing,
  savePairing,
  type Connection,
} from './connection';

interface KorevContextValue {
  loading: boolean;
  connection: Connection | null;
  pair(pairing: RemotePairing): Promise<void>;
  unpair(): Promise<void>;
}

const KorevContext = createContext<KorevContextValue | null>(null);

export function KorevProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<Connection | null>(null);

  async function unpair() {
    await clearPairing();
    setConnection(null);
  }

  function open(pairing: RemotePairing) {
    setConnection(connect(pairing, () => void unpair()));
  }

  async function pair(pairing: RemotePairing) {
    await call(pairing, 'getState', []);
    await savePairing(pairing);
    open(pairing);
  }

  useEffect(() => {
    void loadPairing()
      .then((saved) => saved && open(saved))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!connection) return;
    connection.open();
    const foreground = PhoneAppState.addEventListener('change', (status) => {
      if (status === 'active') connection.open();
    });
    return () => {
      foreground.remove();
      connection.close();
    };
  }, [connection]);

  return (
    <KorevContext.Provider value={{ loading, connection, pair, unpair }}>
      {children}
    </KorevContext.Provider>
  );
}

export function useKorev(): KorevContextValue {
  const value = useContext(KorevContext);
  if (!value) throw new Error('useKorev needs a KorevProvider above it.');
  return value;
}

export function useConnection(): Connection {
  const { connection } = useKorev();
  if (!connection) throw new Error('This screen needs a paired Korev.');
  return connection;
}
