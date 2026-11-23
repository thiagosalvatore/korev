import { useEffect, useState } from 'react';
import type { KorevApi } from '../../korev-desktop/src/shared/api';
import { UnsupportedMethodError } from './connection';
import { useConnection } from './korev';

const probes = new WeakMap<KorevApi, Promise<boolean>>();

function probe(api: KorevApi): Promise<boolean> {
  const known = probes.get(api);
  if (known) return known;
  const answer = api.scriptOutput('', 'setup').then(
    () => true,
    (error: unknown) => !(error instanceof UnsupportedMethodError),
  );
  probes.set(api, answer);
  return answer;
}

export function useNewerMac(): boolean {
  const { api } = useConnection();
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    let current = true;
    void probe(api).then((answer) => current && setNewer(answer));
    return () => {
      current = false;
    };
  }, [api]);
  return newer;
}
