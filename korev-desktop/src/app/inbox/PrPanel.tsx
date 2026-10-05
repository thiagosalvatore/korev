import type { ReactNode } from 'react';
import {
  Badge,
  Button,
  DiffStat,
  SidePanel,
  SizeBadge,
  cn,
  type SidePanelMode,
} from '../../design-system';
import { prSize } from '../../inbox/size';
import type { Approval, MyPr, ReviewItem, SizeInfo } from '../../shared/inbox';
import type {
  Check,
  CheckOutcome,
  CiState,
  PullRequest,
  Reviewer,
  ReviewState,
  StackInfo,
  StackLayer,
} from '../../shared/pull-request';
import { formatAge, joinMeta, pluralize } from '../format';
import { MINUTE_MS, useNow } from '../useNow';
import { CiIcon } from './CiIcon';
import { subjectSummary, type PanelSubject } from './list-model';
import { layerStateLabel } from './OtherLayerRow';
import { authorHandle } from './PrRow';
import { ActionFooter, ActionStatus, type PanelActions } from './PanelActions';
import { AgentActivityLog } from '../ai/AgentActivityLog';
import { AgentTaskStatus } from '../ai/agent-task-state';
import { KorevActivity } from '../ai/KorevActivity';
import { KorevAiSection } from '../ai/KorevAiSection';
import { AnswersFooter, QuestionsSection } from '../ai/QuestionsSection';
import type { PanelAi } from '../ai/useKorevAi';
import { PanelSection } from './PanelSection';
import { PriorityBadge } from './PriorityBadge';
import { ApprovalBadge, approvalText } from './ReviewRow';

const PANEL_LABEL = 'Pull request details';
const OPEN_ON_GITHUB = 'Open on GitHub';
const OPEN_SHORTCUT = '⌘↵';

const OUTCOME_CI: Record<CheckOutcome, CiState> = {
  failing: 'failing',
  pending: 'running',
  passing: 'passing',
  skipped: 'none',
};

const OUTCOME_WORDS: Record<CheckOutcome, string> = {
  failing: 'failing',
  pending: 'running',
  passing: 'passing',
  skipped: 'skipped',
};

const LISTED_OUTCOMES: CheckOutcome[] = ['failing', 'pending'];
const SUMMARISED_OUTCOMES: CheckOutcome[] = ['passing', 'skipped'];

const REVIEW_WORDS: Record<ReviewState, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes requested',
  COMMENTED: 'commented',
  DISMISSED: 'dismissed',
  PENDING: 'review pending',
};

const LINE = 'flex min-w-0 items-center gap-2 py-1 text-sm text-fg-2';

function Line({ children }: { children: ReactNode }) {
  return <div className={LINE}>{children}</div>;
}

function PanelHeader({ subject }: { subject: PanelSubject }) {
  const now = useNow(MINUTE_MS);
  const summary = subjectSummary(subject);
  const updated =
    subject.kind === 'layer'
      ? null
      : `updated ${formatAge(subject.item.pr.updatedAt, now)}`;
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-fg-3">
        <span className="font-mono">{summary.reference}</span>
        {` · ${joinMeta([authorHandle(summary.authorLogin), updated])}`}
      </div>
      <h2 className="m-0 mt-1 type-h3 text-fg-1">{summary.title}</h2>
    </div>
  );
}

function ReasonsSection({ item }: { item: MyPr }) {
  const title = item.bucket === 'needs-you' ? 'Why it needs you' : 'Status';
  return (
    <PanelSection title={title}>
      <div className="flex flex-wrap gap-1.5">
        {item.reasons.map((reason) => (
          <Badge key={reason.code} tone={reason.severity}>
            {reason.label}
          </Badge>
        ))}
      </div>
    </PanelSection>
  );
}

function ApprovalSection({ approval }: { approval: Approval }) {
  return (
    <PanelSection title="Already approved">
      <Line>
        <ApprovalBadge approval={approval} />
        {approvalText(approval)}
      </Line>
    </PanelSection>
  );
}

function PrioritySection({ item }: { item: ReviewItem }) {
  return (
    <PanelSection title="Why this priority">
      <div className="flex items-start gap-2">
        <PriorityBadge priority={item.priority} />
        <ul className="m-0 list-none p-0 text-sm text-fg-2">
          {item.priority.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
      <Line>{item.pr.isDraft ? 'Draft' : 'Ready for review'}</Line>
    </PanelSection>
  );
}

function checksWith(checks: Check[], outcome: CheckOutcome): Check[] {
  return checks.filter((check) => check.outcome === outcome);
}

function CheckLine({ check }: { check: Check }) {
  return (
    <Line>
      <CiIcon
        state={OUTCOME_CI[check.outcome]}
        label={OUTCOME_WORDS[check.outcome]}
      />
      <span className="truncate">{check.name}</span>
    </Line>
  );
}

function OutcomeSummary({
  outcome,
  count,
}: {
  outcome: CheckOutcome;
  count: number;
}) {
  if (count === 0) return null;
  const words = `${count} ${OUTCOME_WORDS[outcome]}`;
  return (
    <Line>
      <CiIcon state={OUTCOME_CI[outcome]} label={words} />
      {words}
    </Line>
  );
}

function ChecksSection({ checks }: { checks: Check[] }) {
  return (
    <PanelSection title="Checks">
      {checks.length === 0 ? <Line>No checks reported</Line> : null}
      {LISTED_OUTCOMES.flatMap((outcome) =>
        checksWith(checks, outcome).map((check) => (
          <CheckLine key={`${outcome}:${check.name}`} check={check} />
        )),
      )}
      {SUMMARISED_OUTCOMES.map((outcome) => (
        <OutcomeSummary
          key={outcome}
          outcome={outcome}
          count={checksWith(checks, outcome).length}
        />
      ))}
    </PanelSection>
  );
}

function reviewerHandle(reviewer: Reviewer): string {
  if (reviewer.kind === 'user') return `@${reviewer.login}`;
  return `@${reviewer.org}/${reviewer.slug}`;
}

function ReviewersSection({ pr }: { pr: PullRequest }) {
  const empty = pr.reviews.length === 0 && pr.pendingReviewers.length === 0;
  return (
    <PanelSection title="Reviewers">
      {empty ? <Line>No reviewers yet</Line> : null}
      {pr.reviews.map((review) => (
        <Line key={`review:${review.login}`}>
          @{review.login} · {REVIEW_WORDS[review.state]}
        </Line>
      ))}
      {pr.pendingReviewers.map((reviewer) => {
        const handle = reviewerHandle(reviewer);
        return <Line key={`requested:${handle}`}>{handle} · requested</Line>;
      })}
    </PanelSection>
  );
}

function ChangesSection({ pr, size }: { pr: PullRequest; size: SizeInfo }) {
  return (
    <PanelSection title="Changes">
      <Line>
        <DiffStat additions={pr.additions} deletions={pr.deletions} />
        <span>· {pluralize(pr.changedFiles, 'file')} ·</span>
        <SizeBadge {...size} />
      </Line>
    </PanelSection>
  );
}

function StackLayerLine({
  layer,
  size,
  current,
}: {
  layer: StackLayer;
  size: number;
  current: boolean;
}) {
  return (
    <li
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-xs px-2 py-1 text-sm',
        current ? 'bg-accent-subtle text-fg-1' : 'text-fg-2',
        layer.state !== 'OPEN' && 'text-fg-3',
      )}
    >
      <span className="font-mono text-2xs whitespace-nowrap text-fg-3">
        {layer.position} of {size}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-mono">#{layer.number}</span> {layer.title}
      </span>
      <span className="shrink-0 text-xs">
        {layer.isDraft ? 'Draft' : layerStateLabel(layer)}
      </span>
    </li>
  );
}

function StackSection({
  stack,
  currentPosition,
}: {
  stack: StackInfo;
  currentPosition: number;
}) {
  const layers = [...stack.layers].sort(
    (left, right) => left.position - right.position,
  );
  return (
    <PanelSection title={`Stack → ${stack.baseRefName}`}>
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {layers.map((layer) => (
          <StackLayerLine
            key={layer.position}
            layer={layer}
            size={stack.size}
            current={layer.position === currentPosition}
          />
        ))}
      </ol>
    </PanelSection>
  );
}

function PrStack({ pr }: { pr: PullRequest }) {
  if (!pr.stack) return null;
  return <StackSection stack={pr.stack} currentPosition={pr.stack.position} />;
}

function PullRequestDetails({
  pr,
  size,
  why,
}: {
  pr: PullRequest;
  size: SizeInfo;
  why: ReactNode;
}) {
  return (
    <>
      {why}
      <ChecksSection checks={pr.checks} />
      <ReviewersSection pr={pr} />
      <ChangesSection pr={pr} size={size} />
      <PrStack pr={pr} />
    </>
  );
}

function LayerDetails({
  subject,
}: {
  subject: Extract<PanelSubject, { kind: 'layer' }>;
}) {
  const { layer, stack } = subject;
  return (
    <>
      <PanelSection title="State">
        <Line>{layer.isDraft ? 'Draft' : layerStateLabel(layer)}</Line>
      </PanelSection>
      {stack ? (
        <StackSection stack={stack} currentPosition={layer.position} />
      ) : null}
    </>
  );
}

function SubjectDetails({
  subject,
  ai,
}: {
  subject: PanelSubject;
  ai: PanelAi | undefined;
}) {
  if (subject.kind === 'layer') return <LayerDetails subject={subject} />;
  const { pr } = subject.item;
  const aiSection = ai ? (
    <>
      <KorevAiSection ai={ai} />
      <KorevActivity runs={ai.history} prUrl={ai.prUrl} />
    </>
  ) : null;
  if (subject.kind === 'review') {
    return (
      <PullRequestDetails
        pr={pr}
        size={subject.item.size}
        why={
          <>
            {subject.approval ? (
              <ApprovalSection approval={subject.approval} />
            ) : (
              <PrioritySection item={subject.item} />
            )}
            {aiSection}
          </>
        }
      />
    );
  }
  return (
    <PullRequestDetails
      pr={pr}
      size={prSize(pr)}
      why={
        <>
          <ReasonsSection item={subject.item} />
          {aiSection}
        </>
      }
    />
  );
}

export interface PrPanelProps {
  subject: PanelSubject;
  goneLabel: string | null;
  actions?: PanelActions;
  ai?: PanelAi;
  mode: SidePanelMode;
  onClose: () => void;
  onOpenGithub: (url: string) => void;
}

export function PrPanel({
  subject,
  goneLabel,
  actions,
  ai,
  mode,
  onClose,
  onOpenGithub,
}: PrPanelProps) {
  const { url } = subjectSummary(subject);
  return (
    <SidePanel
      label={PANEL_LABEL}
      mode={mode}
      onClose={onClose}
      header={<PanelHeader subject={subject} />}
      footer={
        actions && !goneLabel ? (
          <div className="flex flex-col gap-2">
            {ai?.questions ? <AnswersFooter ai={ai} /> : null}
            <ActionFooter actions={actions} demoted={Boolean(ai?.questions)} />
          </div>
        ) : (
          <Button
            variant="primary"
            kbd={OPEN_SHORTCUT}
            onClick={() => onOpenGithub(url)}
            className="w-full"
          >
            {OPEN_ON_GITHUB}
          </Button>
        )
      }
    >
      {goneLabel ? (
        <p className="mt-3 mb-0 text-xs text-fg-3">{goneLabel}</p>
      ) : null}
      {ai ? <QuestionsSection ai={ai} /> : null}
      {actions ? <ActionStatus actions={actions} /> : null}
      {ai?.state ? (
        <AgentTaskStatus
          state={ai.state}
          onStop={ai.onStop}
          onRetry={ai.onRetry}
        />
      ) : null}
      {ai ? (
        <AgentActivityLog
          target={ai.target}
          runKey={
            ai.state?.status === 'running' ? ai.state.startedAt : 'settled'
          }
        />
      ) : null}
      <SubjectDetails subject={subject} ai={ai} />
    </SidePanel>
  );
}
