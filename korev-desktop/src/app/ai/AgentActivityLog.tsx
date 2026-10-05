import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../../design-system';
import { ACTIVITY_LINES_KEPT } from '../../shared/agent-tasks';
import type { PrTarget } from '../../shared/merge';
import { prRef } from '../../shared/pr-ref';
import { korev } from '../bridge';

function useAgentActivity(target: PrTarget, runKey: string): string[] {
  const [lines, setLines] = useState<string[]>([]);
  const { id, repo, number } = target;

  useEffect(() => {
    const ref = prRef({ repo, number });
    let current = true;
    setLines([]);
    const stop = korev().ai.onActivity((activity) => {
      if (activity.ref !== ref) return;
      setLines((previous) =>
        [...previous, activity.line].slice(-ACTIVITY_LINES_KEPT),
      );
    });
    void korev()
      .ai.activityLog({ id, repo, number })
      .then((log) => {
        if (current) setLines(log);
      });
    return () => {
      current = false;
      stop();
    };
  }, [id, repo, number, runKey]);

  return lines;
}

function ActivityLines({ lines }: { lines: string[] }) {
  const list = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);
  return (
    <ol
      ref={list}
      aria-label="Agent activity"
      className="m-0 mt-1.5 flex max-h-60 list-none flex-col gap-1 overflow-auto rounded-sm bg-inset p-2.5 font-mono text-2xs break-words whitespace-pre-wrap text-fg-2"
    >
      {lines.map((line, index) => (
        <li key={index}>{line}</li>
      ))}
    </ol>
  );
}

export interface AgentActivityLogProps {
  target: PrTarget;
  runKey: string;
}

export function AgentActivityLog({ target, runKey }: AgentActivityLogProps) {
  const lines = useAgentActivity(target, runKey);
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <section className="mt-2">
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide activity' : 'Show activity'}
      </Button>
      {open ? <ActivityLines lines={lines} /> : null}
    </section>
  );
}
