import {
  REMOTE_METHODS,
  type KorevApi,
  type RemoteMethod,
} from '../shared/api';

type Method = (...args: unknown[]) => unknown;

function deferredMethod(
  ready: Promise<Partial<KorevApi>>,
  method: RemoteMethod,
): Method {
  return async (...args) => {
    const api = await ready;
    return (api[method] as Method)(...args);
  };
}

export function deferredApi(
  ready: Promise<Partial<KorevApi>>,
): Partial<KorevApi> {
  return Object.fromEntries(
    REMOTE_METHODS.map((method) => [method, deferredMethod(ready, method)]),
  ) as Partial<KorevApi>;
}
