import type { ReactNode } from 'react';
import { useKorevAiContext } from './useKorevAi';

export function KorevStage({ children }: { children: ReactNode }) {
  const ai = useKorevAiContext();
  const run = ai.runPage();
  return (
    <div className="flex h-full min-h-0 flex-col">
      {run}
      <div hidden={run !== null} className="min-h-0 flex-1">
        {children}
      </div>
      {ai.terminal}
      {ai.overlays}
    </div>
  );
}
