import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Toast } from '../../design-system';
import {
  AGENT_TASK_WORDS,
  FORK_WITHOUT_EDITS,
  canPushFixes,
  type AgentQuestion,
  type AgentTaskKind,
  type AgentTaskState,
  type QuestionAnswers,
} from '../../shared/agent-tasks';
import type { ReasonCode } from '../../shared/inbox';
import type { PrTarget } from '../../shared/merge';
import { prRef } from '../../shared/pr-ref';
import type { PullRequest } from '../../shared/pull-request';
import { korev } from '../bridge';
import type { ShortcutMap } from '../keyboard';
import { announce } from '../LiveAnnouncer';
import { useSettings } from '../useSettings';
import { useTimedToast } from '../useTimedToast';
import type { PanelSubject } from '../inbox/list-model';
import { ExplainReader } from './ExplainReader';

export const EXPLAIN_KEY = 'E';
const TOAST_MS = 8000;
const SHORT_SHA = 7;

const FIX_FOR_REASON: Partial<Record<ReasonCode, AgentTaskKind>> = {
  conflicts: 'fix-conflicts',
};

export interface FixAction {
  kind: AgentTaskKind;
  reason: string;
  disabledReason: string | null;
}

export interface PanelAi {
  available: boolean;
  state: AgentTaskState | null;
  fixes: FixAction[];
  questions: AgentQuestion[] | null;
  answers: QuestionAnswers;
  onAnswer: (id: string, text: string) => void;
  onSendAnswers: () => void;
  onDismiss: () => void;
  onFix: (kind: AgentTaskKind) => void;
  onExplain: () => void;
  onStop: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
}

interface DoneToast {
  message: string;
  commitUrl: string | null;
}

function subjectPr(subject: PanelSubject | null): PullRequest | null {
  if (!subject || subject.kind === 'layer') return null;
  return subject.item.pr;
}

function targetOf(pr: PullRequest): PrTarget {
  return { id: pr.id, repo: pr.repo, number: pr.number };
}

function fixesFor(subject: PanelSubject | null): FixAction[] {
  if (subject?.kind !== 'mine') return [];
  const { pr, reasons } = subject.item;
  const disabledReason = canPushFixes(pr) ? null : FORK_WITHOUT_EDITS;
  return reasons.flatMap((reason) => {
    const kind = FIX_FOR_REASON[reason.code];
    return kind ? [{ kind, reason: reason.label, disabledReason }] : [];
  });
}

function startTask(kind: AgentTaskKind, target: PrTarget) {
  if (kind === 'explain') void korev().ai.explain(target, true);
  else void korev().ai.start(target, kind);
}

function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA);
}

function commitUrl(prUrl: string, sha: string): string {
  return `${prUrl.replace(/\/pull\/\d+$/, '')}/commit/${sha}`;
}

function settledMessage(ref: string, state: AgentTaskState): string | null {
  const number = ref.slice(ref.lastIndexOf('#'));
  const words = AGENT_TASK_WORDS[state.kind];
  if (state.status === 'failed') return `${words.failed} on ${number}`;
  if (state.status === 'needs-input') {
    return `Korev needs your answer on ${number}`;
  }
  if (state.status !== 'done') return null;
  const [sha] = state.commits;
  const pushed = sha ? ` · pushed ${shortSha(sha)}` : '';
  return `${words.done} ${number}${pushed}`;
}

function useSettledAnnouncements(
  tasks: Record<string, AgentTaskState>,
  onDone: (ref: string, state: AgentTaskState, message: string) => void,
) {
  const previous = useRef(tasks);
  const latestOnDone = useRef(onDone);
  useEffect(() => {
    latestOnDone.current = onDone;
  });
  useEffect(() => {
    for (const [ref, state] of Object.entries(tasks)) {
      if (previous.current[ref]?.status === state.status) continue;
      const message = settledMessage(ref, state);
      if (!message) continue;
      announce(message);
      if (state.status === 'done') latestOnDone.current(ref, state, message);
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
  pullRequests: (ref: string) => PullRequest | null,
  onOpenSettings: () => void,
): KorevAi {
  const settings = useSettings();
  const [reader, setReader] = useState<PullRequest | null>(null);
  const [drafts, setDrafts] = useState<Record<string, QuestionAnswers>>({});
  const toast = useTimedToast<DoneToast>(TOAST_MS);
  const available = Boolean(settings?.agent.provider);

  useSettledAnnouncements(tasks, (ref, state, message) => {
    if (state.status !== 'done' || state.kind === 'explain') return;
    const pr = pullRequests(ref);
    const [sha] = state.commits;
    toast.show({
      message,
      commitUrl: pr && sha ? commitUrl(pr.url, sha) : null,
    });
  });

  function explain(pr: PullRequest | null) {
    if (!pr || !available) return;
    setReader(pr);
    void korev().ai.explain(targetOf(pr), false);
  }

  function setAnswer(ref: string, id: string, text: string) {
    setDrafts((current) => ({
      ...current,
      [ref]: { ...current[ref], [id]: text },
    }));
  }

  function forget(ref: string) {
    setDrafts(({ [ref]: _dropped, ...rest }) => rest);
  }

  async function sendAnswers(pr: PullRequest) {
    const ref = prRef(pr);
    const result = await korev().ai.answer(targetOf(pr), drafts[ref] ?? {});
    if (result.ok) forget(ref);
    else announce(result.message);
  }

  function panelAi(subject: PanelSubject | null): PanelAi | undefined {
    const pr = subjectPr(subject);
    if (!pr) return undefined;
    const ref = prRef(pr);
    const state = tasks[ref] ?? null;
    const target = targetOf(pr);
    return {
      available,
      state,
      fixes: fixesFor(subject),
      questions: state?.status === 'needs-input' ? state.questions : null,
      answers: drafts[ref] ?? {},
      onAnswer: (id, text) => setAnswer(ref, id, text),
      onSendAnswers: () => void sendAnswers(pr),
      onDismiss: () => {
        forget(ref);
        void korev().ai.dismiss(target);
      },
      onFix: (kind) => startTask(kind, target),
      onExplain: () => explain(pr),
      onStop: () => void korev().ai.cancel(target),
      onRetry: () => {
        if (state) startTask(state.kind, target);
      },
      onOpenSettings,
    };
  }

  const readerTask = reader ? tasks[prRef(reader)] : undefined;
  const shown = toast.toast;
  const overlays = (
    <>
      {reader ? (
        <ExplainReader
          target={targetOf(reader)}
          title={reader.title}
          headOid={reader.headRefOid}
          state={readerTask?.kind === 'explain' ? readerTask : null}
          onClose={() => setReader(null)}
        />
      ) : null}
      {shown ? (
        <div className="fixed right-5 bottom-5 z-50">
          <Toast
            tone="success"
            title={shown.message}
            onClose={toast.dismiss}
            action={
              shown.commitUrl ? (
                <Button
                  size="sm"
                  onClick={() => {
                    toast.dismiss();
                    if (shown.commitUrl) {
                      void korev().shell.openGithub(shown.commitUrl);
                    }
                  }}
                >
                  View commit
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : null}
    </>
  );

  return {
    panelAi,
    shortcuts: { [EXPLAIN_KEY]: () => explain(subjectPr(selected)) },
    overlays,
  };
}
