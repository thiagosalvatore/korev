import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIVITY_KEPT,
  type AgentActivity,
  type AgentActivityEvent,
  type AgentTaskState,
} from '../../shared/agent-tasks';
import type { PrTarget } from '../../shared/merge';
import { prRef } from '../../shared/pr-ref';
import { korev } from '../bridge';

type ActivityByRef = Record<string, AgentActivity[]>;

function appended(current: ActivityByRef, { ref, entry }: AgentActivityEvent) {
  const log = [...(current[ref] ?? []), entry].slice(-ACTIVITY_KEPT);
  return { ...current, [ref]: log };
}

function withoutRestarted(
  current: ActivityByRef,
  previous: Record<string, AgentTaskState>,
  tasks: Record<string, AgentTaskState>,
): ActivityByRef {
  const restarted = Object.keys(current).filter(
    (ref) =>
      tasks[ref]?.status === 'running' && previous[ref]?.status !== 'running',
  );
  if (restarted.length === 0) return current;
  const next = { ...current };
  restarted.forEach((ref) => delete next[ref]);
  return next;
}

export interface AgentActivityLog {
  activity: ActivityByRef;
  load: (target: PrTarget) => void;
}

export function useAgentActivity(
  tasks: Record<string, AgentTaskState>,
): AgentActivityLog {
  const [activity, setActivity] = useState<ActivityByRef>({});
  const previousTasks = useRef(tasks);

  useEffect(
    () =>
      korev().ai.onActivity((event) =>
        setActivity((current) => appended(current, event)),
      ),
    [],
  );

  useEffect(() => {
    const previous = previousTasks.current;
    previousTasks.current = tasks;
    setActivity((current) => withoutRestarted(current, previous, tasks));
  }, [tasks]);

  const load = useCallback((target: PrTarget) => {
    const ref = prRef(target);
    void korev()
      .ai.activityLog(target)
      .then((log) =>
        setActivity((current) =>
          log.length >= (current[ref]?.length ?? 0)
            ? { ...current, [ref]: log }
            : current,
        ),
      );
  }, []);

  return { activity, load };
}
