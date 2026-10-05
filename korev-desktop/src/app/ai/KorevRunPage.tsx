import { useEffect, type ReactNode } from 'react';
import { Button } from '../../design-system';
import type { PrTarget } from '../../shared/merge';
import type { PullRequest } from '../../shared/pull-request';
import { ActivityFeed } from './ActivityFeed';
import { AgentTaskStatus, isRunning } from './agent-task-state';
import { KorevActivity } from './KorevActivity';
import { QuestionsStepper } from './QuestionsStepper';
import { ReviewDraftEditor } from './ReviewDraftEditor';
import type { PanelAi } from './useKorevAi';

const NOT_WORKING = "Korev isn't working on this PR.";

function useCloseOnEscape(onClose: () => void) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
}

function targetOf(pr: PullRequest): PrTarget {
  return { id: pr.id, repo: pr.repo, number: pr.number };
}

function runResult(pr: PullRequest, ai: PanelAi): ReactNode {
  const { state } = ai;
  if (ai.questions) {
    return (
      <QuestionsStepper
        questions={ai.questions}
        answers={ai.answers}
        onAnswer={ai.onAnswer}
        onSend={ai.onSendAnswers}
        onDismiss={ai.onDismiss}
      />
    );
  }
  if (ai.draft) {
    return <ReviewDraftEditor target={targetOf(pr)} draft={ai.draft} />;
  }
  if (state?.status === 'done') {
    return (
      <section aria-label="Result">
        <h3 className="m-0 type-overline text-fg-3">Result</h3>
        <KorevActivity runs={ai.history.slice(0, 1)} prUrl={ai.prUrl} />
      </section>
    );
  }
  if (!state) return <p className="m-0 text-sm text-fg-2">{NOT_WORKING}</p>;
  return null;
}

function RunHeader({ pr, ai, onClose }: KorevRunPageProps) {
  return (
    <header className="flex items-start gap-3 border-b border-border-1 px-5 py-3">
      <Button
        variant="ghost"
        size="sm"
        icon="arrow-left"
        kbd="Esc"
        onClick={onClose}
      >
        Back
      </Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-fg-3">
          <span className="font-mono">
            {pr.repo}#{pr.number}
          </span>
        </div>
        <h2 className="m-0 mt-1 type-h3 text-fg-1">{pr.title}</h2>
        {ai.state ? (
          <AgentTaskStatus
            state={ai.state}
            latestStep={ai.latestStep}
            onStop={ai.onStop}
            onRetry={ai.onRetry}
            onOpenTerminal={ai.onOpenTerminal}
          />
        ) : null}
      </div>
    </header>
  );
}

export interface KorevRunPageProps {
  pr: PullRequest;
  ai: PanelAi;
  onClose: () => void;
}

export function KorevRunPage({ pr, ai, onClose }: KorevRunPageProps) {
  useCloseOnEscape(onClose);
  const running = isRunning(ai.state);
  const result = running ? null : runResult(pr, ai);
  const feed = (
    <ActivityFeed
      entries={ai.activity}
      running={running}
      className="px-5 py-4"
    />
  );
  return (
    <section
      aria-label={`Korev on #${pr.number}`}
      className="flex h-full min-h-0 flex-1 flex-col bg-app"
    >
      <RunHeader pr={pr} ai={ai} onClose={onClose} />
      {result ? (
        <div className="flex min-h-0 flex-1 max-[900px]:flex-col">
          <div className="min-h-0 min-w-0 flex-1 overflow-auto px-5 py-4">
            {result}
          </div>
          <div className="flex min-h-0 w-[min(380px,40%)] flex-col border-l border-border-1 max-[900px]:w-full max-[900px]:border-t max-[900px]:border-l-0">
            {feed}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 w-full max-w-[80ch] flex-1 flex-col">
          {feed}
        </div>
      )}
    </section>
  );
}
