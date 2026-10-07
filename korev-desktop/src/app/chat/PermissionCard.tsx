import { useState } from 'react';
import { Button, cn, Icon, Input } from '../../design-system';
import {
  answerQuestions,
  DISMISS_QUESTION,
  laneDrafts,
  lanesToSplit,
  planLanes,
  splitLabel,
  type AgentQuestion,
  type ChatItem,
  type LaneDraft,
  type PermissionResponse,
  type PermissionStatus,
  type PlanLane,
} from '../../shared/model';
import { Markdown } from './Markdown';

type PermissionItem = Extract<ChatItem, { kind: 'permission' }>;

export interface PermissionCardProps {
  item: PermissionItem;
  onRespond(response: PermissionResponse): void;
  onHandoff?(): void;
}

const STATUS_LABELS: Record<Exclude<PermissionStatus, 'pending'>, string> = {
  allowed: 'Approved',
  denied: 'Denied',
  expired: 'No longer waiting',
  'handed-off': 'Handed off to a new tab',
};

const OTHER_OPTION = 'Other';

function Resolved({ item }: { item: PermissionItem }) {
  const label = item.status === 'pending' ? '' : STATUS_LABELS[item.status];
  return (
    <div className="flex items-center gap-2 px-1.5 text-sm text-fg-3">
      <Icon
        name={item.status === 'allowed' ? 'circle-check' : 'circle-slash'}
        size={13}
      />
      <span className="font-medium text-fg-2">
        {item.plan !== null ? 'Plan' : item.questions ? 'Question' : item.tool}
      </span>
      <span className="truncate font-mono text-xs">{item.summary}</span>
      <span className="text-xs">· {label}</span>
    </div>
  );
}

function Shell({
  title,
  icon,
  children,
}: {
  title: string;
  icon: 'shield-question' | 'list-checks' | 'message-circle-question';
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={title}
      className="rounded-lg border border-warning/40 bg-surface p-3.5 shadow-1"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg-1">
        <Icon name={icon} size={15} className="text-warning-text" />
        {title}
      </div>
      {children}
    </div>
  );
}

function ToolApproval({ item, onRespond }: PermissionCardProps) {
  return (
    <Shell title={`Allow ${item.tool}?`} icon="shield-question">
      {item.detail ? (
        <pre className="m-0 mb-3 max-h-56 overflow-auto rounded-md border border-border-1 bg-inset p-2 font-mono text-xs whitespace-pre-wrap text-fg-2">
          {item.detail}
        </pre>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          autoFocus
          onClick={() => onRespond({ allow: true })}
        >
          Allow
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRespond({ allow: false })}
        >
          Deny
        </Button>
      </div>
    </Shell>
  );
}

function LaneList({
  here,
  drafts,
  onChange,
}: {
  here: PlanLane;
  drafts: LaneDraft[];
  onChange(drafts: LaneDraft[]): void;
}) {
  const update = (index: number, change: Partial<LaneDraft>) =>
    onChange(
      drafts.map((draft, at) =>
        at === index ? { ...draft, ...change } : draft,
      ),
    );
  return (
    <fieldset className="m-0 mb-3 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 text-sm font-medium text-fg-1">
        Lanes: each ticked lane gets its own linked workspace
      </legend>
      <div className="flex items-center gap-2 text-sm text-fg-2">
        <input type="checkbox" checked disabled aria-label={here.name} />
        <span className="font-medium text-fg-1">{here.name}</span>
        <span className="text-xs text-fg-3">This workspace</span>
      </div>
      {drafts.map((draft, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.split}
            aria-label={`Split off ${draft.name}`}
            onChange={(event) => update(index, { split: event.target.checked })}
          />
          <Input
            aria-label="Lane name"
            value={draft.name}
            disabled={!draft.split}
            className="flex-1"
            onChange={(event) => update(index, { name: event.target.value })}
          />
        </div>
      ))}
    </fieldset>
  );
}

export interface PlanReviewProps {
  plan: string;
  showPlan: boolean;
  onApprove(lanes: PlanLane[]): void;
  onKeepPlanning(feedback: string): void;
  onHandoff?(): void;
}

export function PlanReview({
  plan,
  showPlan,
  onApprove,
  onKeepPlanning,
  onHandoff,
}: PlanReviewProps) {
  const [feedback, setFeedback] = useState('');
  const [here, ...others] = planLanes(plan);
  const [drafts, setDrafts] = useState(() => laneDrafts(others));
  const split = lanesToSplit(drafts);
  return (
    <Shell title="Plan ready for review" icon="list-checks">
      {showPlan ? (
        <div className="mb-3 max-h-96 overflow-auto rounded-md border border-border-1 bg-raised p-3">
          <Markdown text={plan} />
        </div>
      ) : null}
      {here ? (
        <LaneList here={here} drafts={drafts} onChange={setDrafts} />
      ) : null}
      <textarea
        aria-label="Feedback on the plan"
        value={feedback}
        placeholder="Optional: tell the agent what to change in the plan"
        className="mb-2 min-h-14 w-full resize-y rounded-md border border-border-2 bg-inset p-2 font-sans text-sm text-fg-1 outline-none focus:border-accent-border"
        onChange={(event) => setFeedback(event.target.value)}
      />
      <div className="flex gap-2">
        {split.length ? (
          <Button
            size="sm"
            variant="primary"
            icon="git-fork"
            onClick={() => onApprove(split)}
          >
            {splitLabel(split.length)}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant={split.length ? 'secondary' : 'primary'}
          icon="check"
          onClick={() => onApprove([])}
        >
          {here ? 'Approve here' : 'Approve plan'}
        </Button>
        {onHandoff ? (
          <Button
            size="sm"
            variant="secondary"
            icon="forward"
            title="Implement this plan in a new tab, with a fresh context"
            onClick={onHandoff}
          >
            Hand off
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          disabled={!feedback.trim()}
          onClick={() => onKeepPlanning(feedback)}
        >
          Keep planning
        </Button>
      </div>
    </Shell>
  );
}

function PlanApproval({ item, onRespond, onHandoff }: PermissionCardProps) {
  return (
    <PlanReview
      plan={item.plan ?? ''}
      showPlan
      onHandoff={onHandoff}
      onApprove={(lanes) => onRespond({ allow: true, lanes })}
      onKeepPlanning={(message) => onRespond({ allow: false, message })}
    />
  );
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: AgentQuestion;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [other, setOther] = useState('');
  const toggle = (label: string) => {
    if (!question.multiSelect) return onChange([label]);
    return onChange(
      value.includes(label)
        ? value.filter((entry) => entry !== label)
        : [...value, label],
    );
  };
  return (
    <fieldset className="m-0 mb-3 border-0 p-0">
      <legend className="mb-1.5 text-sm font-medium text-fg-1">
        {question.question}
      </legend>
      <div className="flex flex-col gap-1">
        {question.options.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={value.includes(option.label)}
            className={cn(
              'flex cursor-pointer flex-col items-start rounded-md border border-border-2 bg-raised px-3 py-2 text-left hover:border-border-strong',
              value.includes(option.label) &&
                'border-accent-border bg-accent-subtle',
            )}
            onClick={() => toggle(option.label)}
          >
            <span className="text-sm text-fg-1">{option.label}</span>
            {option.description ? (
              <span className="text-xs text-fg-3">{option.description}</span>
            ) : null}
          </button>
        ))}
        <input
          aria-label={`${OTHER_OPTION} answer to ${question.question}`}
          value={other}
          placeholder="Other…"
          className="h-8 rounded-md border border-border-2 bg-inset px-2.5 text-sm text-fg-1 outline-none focus:border-accent-border"
          onChange={(event) => {
            setOther(event.target.value);
            onChange(event.target.value ? [event.target.value] : []);
          }}
        />
      </div>
    </fieldset>
  );
}

function QuestionForm({ item, onRespond }: PermissionCardProps) {
  const questions = item.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const response = answerQuestions(questions, answers);
  return (
    <Shell title="The agent has a question" icon="message-circle-question">
      {questions.map((question) => (
        <QuestionField
          key={question.question}
          question={question}
          value={answers[question.question] ?? []}
          onChange={(value) =>
            setAnswers((current) => ({
              ...current,
              [question.question]: value,
            }))
          }
        />
      ))}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!response}
          onClick={() => response && onRespond(response)}
        >
          Answer
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRespond(DISMISS_QUESTION)}
        >
          Dismiss
        </Button>
      </div>
    </Shell>
  );
}

export function PermissionCard({
  item,
  onRespond,
  onHandoff,
}: PermissionCardProps) {
  if (item.status !== 'pending') return <Resolved item={item} />;
  if (item.plan !== null)
    return (
      <PlanApproval item={item} onRespond={onRespond} onHandoff={onHandoff} />
    );
  if (item.questions) return <QuestionForm item={item} onRespond={onRespond} />;
  return <ToolApproval item={item} onRespond={onRespond} />;
}
