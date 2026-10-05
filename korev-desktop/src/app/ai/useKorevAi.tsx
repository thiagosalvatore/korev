import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AGENT_TASK_WORDS,
  type AgentTaskKind,
  type AgentTaskState,
} from '../../shared/agent-tasks';
import type { PrTarget } from '../../shared/merge';
import { prRef } from '../../shared/pr-ref';
import type { PullRequest } from '../../shared/pull-request';
import { korev } from '../bridge';
import type { ShortcutMap } from '../keyboard';
import { announce } from '../LiveAnnouncer';
import { useSettings } from '../useSettings';
import type { PanelSubject } from '../inbox/list-model';
import { ExplainReader } from './ExplainReader';

export const EXPLAIN_KEY = 'E';

export interface PanelAi {
  available: boolean;
  state: AgentTaskState | null;
  onExplain: () => void;
  onStop: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
}

function subjectPr(subject: PanelSubject | null): PullRequest | null {
  if (!subject || subject.kind === 'layer') return null;
  return subject.item.pr;
}

function targetOf(pr: PullRequest): PrTarget {
  return { id: pr.id, repo: pr.repo, number: pr.number };
}

function startTask(kind: AgentTaskKind, target: PrTarget) {
  if (kind === 'explain') void korev().ai.explain(target, true);
}

function settledMessage(ref: string, state: AgentTaskState): string | null {
  const number = ref.slice(ref.lastIndexOf('#'));
  if (state.status === 'failed') {
    return `${AGENT_TASK_WORDS[state.kind].failed} on ${number}`;
  }
  if (state.status === 'done' && state.kind === 'explain') {
    return `Explanation ready for ${number}`;
  }
  return null;
}

function useSettledAnnouncements(tasks: Record<string, AgentTaskState>) {
  const previous = useRef(tasks);
  useEffect(() => {
    for (const [ref, state] of Object.entries(tasks)) {
      if (previous.current[ref]?.status === state.status) continue;
      const message = settledMessage(ref, state);
      if (message) announce(message);
    }
    previous.current = tasks;
  }, [tasks]);
}

export interface KorevAi {
  panelAi(subject: PanelSubject | null): PanelAi | undefined;
  shortcuts: ShortcutMap;
  overlays: ReactNode;
}

export function useKorevAi(
  tasks: Record<string, AgentTaskState>,
  selected: PanelSubject | null,
  onOpenSettings: () => void,
): KorevAi {
  const settings = useSettings();
  const [reader, setReader] = useState<PullRequest | null>(null);
  const available = Boolean(settings?.agent.provider);
  useSettledAnnouncements(tasks);

  function explain(pr: PullRequest | null) {
    if (!pr || !available) return;
    setReader(pr);
    void korev().ai.explain(targetOf(pr), false);
  }

  function panelAi(subject: PanelSubject | null): PanelAi | undefined {
    const pr = subjectPr(subject);
    if (!pr) return undefined;
    const state = tasks[prRef(pr)] ?? null;
    return {
      available,
      state,
      onExplain: () => explain(pr),
      onStop: () => void korev().ai.cancel(targetOf(pr)),
      onRetry: () => {
        if (state) startTask(state.kind, targetOf(pr));
      },
      onOpenSettings,
    };
  }

  const readerTask = reader ? tasks[prRef(reader)] : undefined;
  const overlays = reader ? (
    <ExplainReader
      target={targetOf(reader)}
      title={reader.title}
      headOid={reader.headRefOid}
      state={readerTask?.kind === 'explain' ? readerTask : null}
      onClose={() => setReader(null)}
    />
  ) : null;

  return {
    panelAi,
    shortcuts: { [EXPLAIN_KEY]: () => explain(subjectPr(selected)) },
    overlays,
  };
}
