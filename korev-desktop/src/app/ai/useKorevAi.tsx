import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Toast } from '../../design-system';
import {
  AGENT_TASK_WORDS,
  FORK_WITHOUT_EDITS,
  canPushFixes,
  isKeptMergeable,
  type AgentQuestion,
  type AgentTaskKind,
  type AgentTaskState,
  type QuestionAnswers,
  type KorevRun,
  type ReviewDraft,
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
import { ReviewDraftReader } from './ReviewDraftReader';
import { KeepMergeableIntro } from './KeepMergeableIntro';
import { needsIntro, saveKeepMergeable } from './keep-mergeable';

export const EXPLAIN_KEY = 'E';
export const KEEP_MERGEABLE_KEY = 'A';
export const REVIEW_KEY = 'R';
const TOAST_MS = 8000;
const SHORT_SHA = 7;

const FIX_FOR_REASON: Partial<Record<ReasonCode, AgentTaskKind>> = {
  conflicts: 'fix-conflicts',
  'checks-failing': 'fix-ci',
  'unresolved-threads': 'address-comments',
};

export interface FixAction {
  kind: AgentTaskKind;
  reason: string;
  disabledReason: string | null;
}

export interface KeepMergeableToggle {
  on: boolean;
  onToggle: () => void;
}

export interface PanelAi {
  available: boolean;
  keepMergeable: KeepMergeableToggle | null;
  state: AgentTaskState | null;
  fixes: FixAction[];
  questions: AgentQuestion[] | null;
  answers: QuestionAnswers;
  onAnswer: (id: string, text: string) => void;
  onSendAnswers: () => void;
  onDismiss: () => void;
  onFix: (kind: AgentTaskKind) => void;
  onExplain: () => void;
  reviewKind: 'review' | 'review-fix';
  draft: ReviewDraft | null;
  history: KorevRun[];
  prUrl: string;
  onReview: () => void;
  onOpenDraft: () => void;
  onStop: () => void;
  onRetry: () => void;
  onRerunFailedJobs: () => void;
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
  history: Record<string, KorevRun[]>,
  selected: PanelSubject | null,
  pullRequests: (ref: string) => PullRequest | null,
  onOpenSettings: () => void,
): KorevAi {
  const settings = useSettings();
  const [reader, setReader] = useState<PullRequest | null>(null);
  const [draftFor, setDraftFor] = useState<PullRequest | null>(null);
  const [drafts, setDrafts] = useState<Record<string, QuestionAnswers>>({});
  const [intro, setIntro] = useState<PullRequest | null>(null);
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

  function reviewKindOf(subject: PanelSubject | null) {
    return subject?.kind === 'mine' ? 'review-fix' : 'review';
  }

  function review(subject: PanelSubject | null) {
    const pr = subjectPr(subject);
    if (!pr || !available) return;
    void korev().ai.start(targetOf(pr), reviewKindOf(subject));
  }

  function draftOf(pr: PullRequest): ReviewDraft | null {
    const state = tasks[prRef(pr)];
    return state?.status === 'done' ? (state.review ?? null) : null;
  }

  function explain(pr: PullRequest | null) {
    if (!pr || !available) return;
    setReader(pr);
    void korev().ai.explain(targetOf(pr), false);
  }

  function toggleKeepMergeable(pr: PullRequest | null) {
    if (!pr || !settings || !available) return;
    const ref = prRef(pr);
    const on = !isKeptMergeable(settings.aiTasks.keepMergeable, ref);
    if (needsIntro(settings.aiTasks, on)) {
      setIntro(pr);
      return;
    }
    void saveKeepMergeable(settings.aiTasks, ref, on);
    announce(`${on ? 'Keeping' : 'Stopped keeping'} #${pr.number} mergeable`);
  }

  function keepMergeableFor(
    subject: PanelSubject | null,
  ): KeepMergeableToggle | null {
    if (subject?.kind !== 'mine' || !settings) return null;
    const { pr } = subject.item;
    return {
      on: isKeptMergeable(settings.aiTasks.keepMergeable, prRef(pr)),
      onToggle: () => toggleKeepMergeable(pr),
    };
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

  async function rerunFailedJobs(target: PrTarget) {
    const result = await korev().ai.rerunFailedJobs(target);
    announce(
      result.ok
        ? `Re-running failed jobs on #${target.number}`
        : result.message,
    );
  }

  function panelAi(subject: PanelSubject | null): PanelAi | undefined {
    const pr = subjectPr(subject);
    if (!pr) return undefined;
    const ref = prRef(pr);
    const state = tasks[ref] ?? null;
    const target = targetOf(pr);
    return {
      available,
      keepMergeable: keepMergeableFor(subject),
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
      reviewKind: reviewKindOf(subject),
      draft: draftOf(pr),
      history: history[ref] ?? [],
      prUrl: pr.url,
      onReview: () => review(subject),
      onOpenDraft: () => setDraftFor(pr),
      onStop: () => void korev().ai.cancel(target),
      onRetry: () => {
        if (state) startTask(state.kind, target);
      },
      onRerunFailedJobs: () => void rerunFailedJobs(target),
      onOpenSettings,
    };
  }

  const readerTask = reader ? tasks[prRef(reader)] : undefined;
  const openDraft = draftFor ? draftOf(draftFor) : null;
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
      {draftFor && openDraft ? (
        <ReviewDraftReader
          key={prRef(draftFor)}
          target={targetOf(draftFor)}
          title={draftFor.title}
          draft={openDraft}
          onClose={() => setDraftFor(null)}
        />
      ) : null}
      {intro && settings ? (
        <KeepMergeableIntro
          number={intro.number}
          onCancel={() => setIntro(null)}
          onTurnOn={() => {
            void saveKeepMergeable(settings.aiTasks, prRef(intro), true);
            setIntro(null);
          }}
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
    shortcuts: {
      [EXPLAIN_KEY]: () => explain(subjectPr(selected)),
      [REVIEW_KEY]: () => review(selected),
      [KEEP_MERGEABLE_KEY]: () => {
        if (selected?.kind === 'mine') toggleKeepMergeable(selected.item.pr);
      },
    },
    overlays,
  };
}
