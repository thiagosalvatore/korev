import type { IpcMainInvokeEvent } from 'electron';
import { CALL_CHANNEL } from '../shared/api';

export type IpcHandlers = Record<string, (...args: never[]) => unknown>;

export interface IpcRegistrar {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ): void;
}

export class UntrustedSenderError extends Error {
  constructor(method: string) {
    super(`Rejected ${method} from an untrusted sender`);
    this.name = 'UntrustedSenderError';
  }
}

export class UnknownMethodError extends Error {
  constructor(method: string) {
    super(`Unknown method ${method}`);
    this.name = 'UnknownMethodError';
  }
}

export function registerIpcHandlers(
  ipc: IpcRegistrar,
  handlers: IpcHandlers,
  isTrustedSender: (senderUrl: string | undefined) => boolean,
): void {
  ipc.handle(CALL_CHANNEL, (event, method, args) => {
    const name = String(method);
    if (!isTrustedSender(event.senderFrame?.url)) {
      throw new UntrustedSenderError(name);
    }
    return callHandler(handlers, name, args);
  });
}

export function callHandler(
  handlers: IpcHandlers,
  method: string,
  args: unknown,
): unknown {
  if (!Object.hasOwn(handlers, method)) throw new UnknownMethodError(method);
  const values = Array.isArray(args) ? args : [];
  return (handlers[method] as (...values: unknown[]) => unknown)(...values);
}
