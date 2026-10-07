'use client';

import { useEffect, useState } from 'react';

export function prefersReducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useTick(intervalMs: number, steps: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setTick((t) => (t + 1) % steps), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, steps]);
  return tick;
}
