import type {
  AuthState,
  Connection,
  ConnectionMethod,
  LoginState,
  TokenResult,
} from '../shared/auth';
import type { StoredToken, TokenLoadResult, TokenStore } from './token-store';

export interface ViewerInfo {
  login: string;
  avatarUrl: string | null;
  scopes: string[];
}

export interface DeviceFlow {
  getState(): LoginState;
  start(): Promise<LoginState>;
  cancel(): void;
  subscribe(listener: (state: LoginState) => void): () => void;
}

export interface AuthServiceDeps {
  tokenStore: TokenStore;
  fetchViewer(token: string): Promise<ViewerInfo>;
  createDeviceFlow(onToken: (token: string) => Promise<void>): DeviceFlow;
  onStateChange(state: AuthState): void;
  onConnectionChange(connection: Connection | null): Promise<void>;
  warn(message: string): void;
}

export interface AuthService {
  init(): Promise<void>;
  retryUnlock(): Promise<void>;
  state(): AuthState;
  token(): string | null;
  startDeviceFlow(): Promise<LoginState>;
  cancelDeviceFlow(): void;
  useToken(token: string): Promise<TokenResult>;
  disconnect(): Promise<void>;
}

const SCOPE_GRANTED_BY: Record<string, readonly string[]> = {
  repo: ['repo'],
  'read:org': ['read:org', 'write:org', 'admin:org'],
};
const REQUIRED_TOKEN_SCOPES = Object.keys(SCOPE_GRANTED_BY);
const UNLOCK_FAILED_WARNING =
  'Korev could not decrypt the saved GitHub sign-in with the keychain key.';

export function missingScopes(granted: readonly string[]): string[] {
  return REQUIRED_TOKEN_SCOPES.filter(
    (scope) =>
      !SCOPE_GRANTED_BY[scope].some((grant) => granted.includes(grant)),
  );
}

function missingScopesMessage(missing: string[]): string {
  return `This token is missing the ${missing.join(' and ')} scope. Paste the output of gh auth token, or create a classic token with repo and read:org.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toConnection(stored: StoredToken): Connection {
  return {
    login: stored.login,
    avatarUrl: stored.avatarUrl,
    method: stored.method,
  };
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  let stored: StoredToken | null = null;
  let storageProblem: string | null = null;
  let unlockFailures = 0;
  const deviceFlow = deps.createDeviceFlow(async (token) => {
    await connect(token, 'oauth', await deps.fetchViewer(token));
  });

  function state(): AuthState {
    return {
      connection: stored ? toConnection(stored) : null,
      login: deviceFlow.getState(),
      storageProblem,
      unlockFailures,
    };
  }

  function announce(): void {
    deps.onStateChange(state());
  }

  async function connect(
    token: string,
    method: ConnectionMethod,
    viewer: ViewerInfo,
  ): Promise<Connection> {
    const next: StoredToken = {
      token,
      method,
      login: viewer.login,
      avatarUrl: viewer.avatarUrl,
    };
    await saveOrRecordProblem(next);
    stored = next;
    announce();
    const connection = toConnection(next);
    await deps.onConnectionChange(connection);
    return connection;
  }

  async function saveOrRecordProblem(next: StoredToken): Promise<void> {
    try {
      await deps.tokenStore.save(next);
      storageProblem = null;
    } catch (error) {
      storageProblem = errorMessage(error);
      announce();
      throw error;
    }
  }

  async function connectWithToken(token: string): Promise<TokenResult> {
    const viewer = await deps.fetchViewer(token);
    const missing = missingScopes(viewer.scopes);
    if (missing.length > 0) {
      return { ok: false, message: missingScopesMessage(missing) };
    }
    return { ok: true, connection: await connect(token, 'token', viewer) };
  }

  async function useToken(token: string): Promise<TokenResult> {
    try {
      return await connectWithToken(token.trim());
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  async function disconnect(): Promise<void> {
    deviceFlow.cancel();
    await deps.tokenStore.clear();
    stored = null;
    unlockFailures = 0;
    announce();
    await deps.onConnectionChange(null);
  }

  function applyLoad(loaded: TokenLoadResult): void {
    stored = loaded.status === 'loaded' ? loaded.token : null;
    if (loaded.status !== 'unreadable') {
      unlockFailures = 0;
      return;
    }
    unlockFailures += 1;
    deps.warn(UNLOCK_FAILED_WARNING);
  }

  async function init(): Promise<void> {
    applyLoad(await deps.tokenStore.load());
    announce();
  }

  async function retryUnlock(): Promise<void> {
    await init();
    if (stored) await deps.onConnectionChange(toConnection(stored));
  }

  deviceFlow.subscribe(announce);

  return {
    init,
    retryUnlock,
    state,
    token: () => stored?.token ?? null,
    startDeviceFlow: () => deviceFlow.start(),
    cancelDeviceFlow: () => deviceFlow.cancel(),
    useToken,
    disconnect,
  };
}
