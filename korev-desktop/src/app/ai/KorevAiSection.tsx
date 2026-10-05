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
  type PanelAi,
} from './useKorevAi';

export const NO_AGENT_LINE = 'Set up Claude Code or Codex to use Korev AI';
const ALREADY_WORKING = 'Korev is already working on this PR';

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

function FixRow({
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1">
      <span className="min-w-0 flex-1 text-sm text-fg-2">{fix.reason}</span>
      <Button
        size="sm"
        disabled={busy || fix.disabledReason !== null}
        title={title}
        onClick={onFix}
      >
        {AGENT_TASK_WORDS[fix.kind].name}
      </Button>
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
  const forkReason = ai.fixes.find((fix) => fix.disabledReason)?.disabledReason;
  return (
    <PanelSection title="Korev AI">
      {ai.keepMergeable ? (
        <div className="flex items-center gap-2 py-1">
          <Switch
            label="Keep mergeable"
            checked={ai.keepMergeable.on}
            onChange={ai.keepMergeable.onToggle}
            className="flex-1"
          />
          <span className="font-mono text-2xs text-fg-3">
            ⇧{KEEP_MERGEABLE_KEY}
          </span>
        </div>
      ) : null}
      {ai.state?.status === 'done' ? (
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="m-0 min-w-0 flex-1 text-sm text-fg-2">
            Last Korev run · {ai.state.summary}
          </p>
          {ai.state.rerunRunIds?.length ? (
            <Button size="sm" onClick={ai.onRerunFailedJobs}>
              Re-run failed jobs
            </Button>
          ) : null}
        </div>
      ) : null}
      {ai.fixes.map((fix) => (
        <FixRow
          key={fix.kind}
          fix={fix}
          busy={busy}
          onFix={() => ai.onFix(fix.kind)}
        />
      ))}
      {forkReason ? (
        <p className="m-0 mb-1 text-xs text-fg-3">{forkReason}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-2">
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
          {AGENT_TASK_WORDS[ai.reviewKind].name}
        </Button>
      </div>
      {ai.draft ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="m-0 min-w-0 flex-1 text-sm text-fg-2">
            Review draft · {pluralize(ai.draft.comments.length, 'comment')}
          </p>
          <Button size="sm" variant="primary" onClick={ai.onOpenDraft}>
            Open review draft
          </Button>
        </div>
      ) : null}
    </PanelSection>
  );
}
