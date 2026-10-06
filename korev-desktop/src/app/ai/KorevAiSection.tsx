import type { ReactNode } from 'react';
import { Button, Switch } from '../../design-system';
import { AGENT_TASK_WORDS } from '../../shared/agent-tasks';
import { pluralize } from '../format';
import { PanelSection } from '../inbox/PanelSection';
import { isRunning } from './agent-task-state';
import {
  EXPLAIN_KEY,
  KEEP_MERGEABLE_KEY,
  REVIEW_KEY,
  type FixAction,
  type KeepMergeableToggle,
  type PanelAi,
} from './useKorevAi';

export const NO_AGENT_LINE = 'Set up Claude Code or Codex to use Korev AI';
const ALREADY_WORKING = 'Korev is already working on this PR';
const KEEP_MERGEABLE_HINT =
  'Korev fixes conflicts, failing checks and review comments as they happen.';

function NoAgent({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <p className="m-0 min-w-0 flex-1 text-sm text-fg-2">{NO_AGENT_LINE}</p>
      <Button size="sm" onClick={onOpenSettings}>
        Open Settings
      </Button>
    </div>
  );
}

export function FixButton({
  fix,
  busy,
  onFix,
}: {
  fix: FixAction;
  busy: boolean;
  onFix: () => void;
}) {
  const title = fix.disabledReason ?? (busy ? ALREADY_WORKING : undefined);
  return (
    <Button
      size="sm"
      disabled={busy || fix.disabledReason !== null}
      title={title}
      onClick={onFix}
    >
      {AGENT_TASK_WORDS[fix.kind].name}
    </Button>
  );
}

function ResultLine({ children }: { children: ReactNode }) {
  return (
    <section className="mt-4.5 flex items-center gap-2">{children}</section>
  );
}

export function KorevRunResult({ ai }: { ai: PanelAi }) {
  if (ai.draft) {
    return (
      <ResultLine>
        <p className="m-0 min-w-0 flex-1 text-sm text-fg-2">
          Review draft · {pluralize(ai.draft.comments.length, 'comment')}
        </p>
        <Button size="sm" variant="primary" onClick={ai.onOpenRun}>
          Open review draft
        </Button>
      </ResultLine>
    );
  }
  if (ai.state?.status !== 'done') return null;
  return (
    <ResultLine>
      <p className="m-0 min-w-0 flex-1 text-sm text-fg-2">Last Korev run</p>
      <Button size="sm" variant="ghost" onClick={ai.onOpenRun}>
        Open
      </Button>
    </ResultLine>
  );
}

function KeepMergeableSwitch({ toggle }: { toggle: KeepMergeableToggle }) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 py-1">
        <Switch
          label="Keep mergeable"
          checked={toggle.on}
          onChange={toggle.onToggle}
          className="flex-1"
        />
        <span className="font-mono text-2xs text-fg-3">
          ⇧{KEEP_MERGEABLE_KEY}
        </span>
      </div>
      <p className="m-0 text-xs text-fg-3">{KEEP_MERGEABLE_HINT}</p>
    </div>
  );
}

export function KorevAiSection({ ai }: { ai: PanelAi }) {
  if (!ai.available) {
    return (
      <PanelSection title="Korev AI">
        <NoAgent onOpenSettings={ai.onOpenSettings} />
      </PanelSection>
    );
  }
  const busy = isRunning(ai.state);
  return (
    <PanelSection title="Korev AI">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          kbd={`⇧${EXPLAIN_KEY}`}
          disabled={busy}
          title={busy ? ALREADY_WORKING : undefined}
          onClick={ai.onExplain}
        >
          Explain
        </Button>
        <Button
          size="sm"
          variant="ghost"
          kbd={`⇧${REVIEW_KEY}`}
          disabled={busy}
          title={busy ? ALREADY_WORKING : undefined}
          onClick={ai.onReview}
        >
          {AGENT_TASK_WORDS.review.name}
        </Button>
      </div>
      {ai.keepMergeable ? (
        <KeepMergeableSwitch toggle={ai.keepMergeable} />
      ) : null}
    </PanelSection>
  );
}
