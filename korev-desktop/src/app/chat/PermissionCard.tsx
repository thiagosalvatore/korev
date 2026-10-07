import { useState } from 'react';
import { Button, cn, Icon } from '../../design-system';
import {
  answerQuestions,
  DISMISS_QUESTION,
  type AgentQuestion,
  type ChatItem,
  type PermissionResponse,
  type PermissionStatus,
} from '../../shared/model';
import { Markdown } from './Markdown';

type PermissionItem = Extract<ChatItem, { kind: 'permission' }>;

export interface PermissionCardProps {
  item: PermissionItem;
  onRespond(response: PermissionResponse): void;
}

const STATUS_LABELS: Record<Exclude<PermissionStatus, 'pending'>, string> = {
  allowed: 'Approved',
  denied: 'Denied',
  expired: 'No longer waiting',
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

function PlanApproval({ item, onRespond }: PermissionCardProps) {
  const [feedback, setFeedback] = useState('');
  return (
    <Shell title="Plan ready for review" icon="list-checks">
      <div className="mb-3 max-h-96 overflow-auto rounded-md border border-border-1 bg-raised p-3">
        <Markdown text={item.plan ?? ''} />
      </div>
      <textarea
        aria-label="Feedback on the plan"
        value={feedback}
        placeholder="Optional: tell the agent what to change in the plan"
        className="mb-2 min-h-14 w-full resize-y rounded-md border border-border-2 bg-inset p-2 font-sans text-sm text-fg-1 outline-none focus:border-accent-border"
        onChange={(event) => setFeedback(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          icon="check"
          onClick={() => onRespond({ allow: true })}
        >
          Approve plan
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!feedback.trim()}
          onClick={() => onRespond({ allow: false, message: feedback })}
        >
          Keep planning
        </Button>
      </div>
    </Shell>
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

export function PermissionCard({ item, onRespond }: PermissionCardProps) {
  if (item.status !== 'pending') return <Resolved item={item} />;
  if (item.plan !== null)
    return <PlanApproval item={item} onRespond={onRespond} />;
  if (item.questions) return <QuestionForm item={item} onRespond={onRespond} />;
  return <ToolApproval item={item} onRespond={onRespond} />;
}
