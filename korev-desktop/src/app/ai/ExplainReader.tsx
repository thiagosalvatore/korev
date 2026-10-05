import { useEffect, useState } from 'react';
import { Banner, Button, Dialog, Skeleton } from '../../design-system';
import type { AgentTaskState, ExplanationView } from '../../shared/agent-tasks';
import { explanationDocument } from '../../shared/explanation-document';
import type { PrTarget } from '../../shared/merge';
import { prRef } from '../../shared/pr-ref';
import { korev } from '../bridge';

const READER_WIDTH = 'min(960px, calc(100vw - 32px))';
const SHORT_SHA = 7;
const SKELETON_LINES = ['w-[92%]', 'w-[78%]', 'w-[85%]', 'w-[60%]'];

function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA);
}

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function useExplanation(target: PrTarget, version: string) {
  const [view, setView] = useState<ExplanationView | null>(null);
  const ref = prRef(target);
  useEffect(() => {
    let live = true;
    void korev()
      .ai.explanation(target)
      .then((next) => {
        if (live) setView(next);
      });
    return () => {
      live = false;
    };
  }, [ref, version]);
  return view;
}

function taskVersion(state: AgentTaskState | null): string {
  if (!state) return 'none';
  return state.status === 'done' ? state.finishedAt : state.status;
}

export interface ExplainReaderProps {
  target: PrTarget;
  title: string;
  headOid: string;
  state: AgentTaskState | null;
  onClose: () => void;
}

function Loading({ number, onStop }: { number: number; onStop: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {SKELETON_LINES.map((width) => (
        <Skeleton key={width} className={width} />
      ))}
      <div className="flex items-center gap-2">
        <p className="m-0 flex-1 text-sm text-fg-2">
          Explaining #{number} · usually 1–3 min
        </p>
        <Button size="sm" variant="ghost" onClick={onStop}>
          Stop
        </Button>
      </div>
    </div>
  );
}

function Failure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <p className="m-0 flex-1 text-sm text-danger-text">{message}</p>
      <Button size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function ExplainReader({
  target,
  title,
  headOid,
  state,
  onClose,
}: ExplainReaderProps) {
  const view = useExplanation(target, taskVersion(state));
  const running = state?.status === 'running';
  const failed = state?.status === 'failed' ? state : null;
  const regenerate = () => void korev().ai.explain(target, true);
  const stop = () => void korev().ai.cancel(target);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);

  function body() {
    if (running) return <Loading number={target.number} onStop={stop} />;
    if (failed)
      return <Failure message={failed.message} onRetry={regenerate} />;
    if (!view) return <Loading number={target.number} onStop={stop} />;
    return (
      <div className="flex flex-col gap-3">
        {view.stale ? (
          <Banner action={{ label: 'Regenerate', onClick: regenerate }}>
            This PR changed since this explanation ({shortSha(view.headOid)} →{' '}
            {shortSha(headOid)})
          </Banner>
        ) : null}
        <iframe
          title={`Explanation of #${target.number}`}
          sandbox=""
          srcDoc={explanationDocument(view.body, currentTheme())}
          className="h-[68vh] w-full rounded-sm border border-border-1"
        />
      </div>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      width={READER_WIDTH}
      title={`Explain #${target.number} · ${title}`}
      description={
        view ? (
          <span className="font-mono text-xs text-fg-3">
            {shortSha(view.headOid)}
          </span>
        ) : undefined
      }
      footer={
        <>
          {view?.stale ? null : (
            <Button
              variant="ghost"
              disabled={!view || running}
              onClick={regenerate}
            >
              Regenerate
            </Button>
          )}
          <Button
            disabled={!view}
            iconRight="external-link"
            onClick={() => void korev().ai.openExplanation(target)}
          >
            Open in browser
          </Button>
        </>
      }
    >
      {body()}
    </Dialog>
  );
}
