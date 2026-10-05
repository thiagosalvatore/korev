import { useEffect, useRef } from 'react';
import type { AppCommand } from '../shared/ipc-contract';
import { korev } from './bridge';

export type AppCommandHandlers = Record<AppCommand, () => void>;

export function useAppCommands(handlers: AppCommandHandlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(
    () => korev().app.onCommand((command) => latest.current[command]()),
    [],
  );
}

export function useFocusPrRequests(onFocus: (ref: string) => void) {
  const latest = useRef(onFocus);
  useEffect(() => {
    latest.current = onFocus;
  });
  useEffect(() => korev().app.onFocusPr((ref) => latest.current(ref)), []);
}
