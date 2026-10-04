import { useCallback, useEffect, useState } from 'react';
import type { AgentProvider, AgentStatus } from '../../shared/agents';
import { korev } from '../bridge';

export interface AgentStatuses {
  statuses: AgentStatus[] | null;
  signingIn: AgentProvider | null;
  refresh(): void;
  signIn(provider: AgentProvider): void;
  cancelSignIn(): void;
}

export function useAgentStatuses(): AgentStatuses {
  const [statuses, setStatuses] = useState<AgentStatus[] | null>(null);
  const [signingIn, setSigningIn] = useState<AgentProvider | null>(null);

  const refresh = useCallback(() => {
    void korev().agents.statuses().then(setStatuses);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  async function signIn(provider: AgentProvider) {
    setSigningIn(provider);
    try {
      setStatuses(await korev().agents.signIn(provider));
    } finally {
      setSigningIn(null);
    }
  }

  return {
    statuses,
    signingIn,
    refresh,
    signIn: (provider) => void signIn(provider),
    cancelSignIn: () => void korev().agents.cancelSignIn(),
  };
}
