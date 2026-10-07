import { useSyncExternalStore, type ReactNode } from 'react';
import { Toast } from '../../design-system';
import type { Result } from '../../shared/model';

interface ToastEntry {
  id: number;
  tone: 'danger' | 'success' | 'neutral';
  title: string;
}

const TOAST_MS = 6_000;
let toasts: ToastEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: ToastEntry[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

export function toast(title: string, tone: ToastEntry['tone'] = 'neutral') {
  const entry = { id: nextId++, tone, title };
  publish([...toasts, entry]);
  setTimeout(
    () => publish(toasts.filter((item) => item.id !== entry.id)),
    TOAST_MS,
  );
}

export function reportFailure<T>(
  result: Result<T>,
): result is { ok: true; value: T } {
  if (!result.ok) toast(result.message, 'danger');
  return result.ok;
}

export function Toaster({ children }: { children?: ReactNode }) {
  const entries = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-200 flex w-96 flex-col gap-2">
      <div className="pointer-events-auto empty:hidden">{children}</div>
      {entries.map((entry) => (
        <div key={entry.id} className="pointer-events-auto">
          <Toast
            tone={entry.tone}
            title={entry.title}
            onClose={() =>
              publish(toasts.filter((item) => item.id !== entry.id))
            }
          />
        </div>
      ))}
    </div>
  );
}
