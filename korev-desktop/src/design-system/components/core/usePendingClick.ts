import { useState, type MouseEvent } from 'react';

export type ClickHandler = (event: MouseEvent<HTMLButtonElement>) => unknown;

export function usePendingClick(onClick: ClickHandler | undefined) {
  const [pending, setPending] = useState(false);
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    const result = onClick?.(event);
    if (!(result instanceof Promise)) return;
    setPending(true);
    void result.finally(() => setPending(false));
  }
  return { pending, handleClick };
}
