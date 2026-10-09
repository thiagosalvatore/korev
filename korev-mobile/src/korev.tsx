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
import { succeeded } from './haptics';

const REVOKED =
  'Korev on your Mac no longer accepts this phone. Scan a new code.';

interface KorevContextValue {
  loading: boolean;
  connection: Connection | null;
  pairing: RemotePairing | null;
  unpairReason: string | null;
  pair(pairing: RemotePairing, signal?: AbortSignal): Promise<void>;
  unpair(): Promise<void>;
}

const KorevContext = createContext<KorevContextValue | null>(null);

export function KorevProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [pairing, setPairing] = useState<RemotePairing | null>(null);
  const [unpairReason, setUnpairReason] = useState<string | null>(null);

  async function unpair() {
    await clearPairing();
    setConnection(null);
    setPairing(null);
  }

  async function revoked() {
    setUnpairReason(REVOKED);
    await unpair();
  }

  function open(saved: RemotePairing) {
    setPairing(saved);
    setConnection(connect(saved, () => void revoked()));
  }

  async function pair(next: RemotePairing, signal?: AbortSignal) {
    await call(next, 'getState', [], signal);
    await savePairing(next);
    setUnpairReason(null);
    open(next);
    succeeded();
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
    <KorevContext.Provider
      value={{ loading, connection, pairing, unpairReason, pair, unpair }}
    >
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
