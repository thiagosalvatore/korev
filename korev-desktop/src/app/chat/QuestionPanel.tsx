import { useId } from 'react';
import { Button, cn, Icon } from '../../design-system';
import {
  DISMISS_QUESTION,
  QUESTION_REPLY_HINT,
  togglePick,
  type AgentQuestion,
  type PermissionResponse,
  type QuestionPicks,
} from '../../shared/model';
import { Markdown } from './Markdown';

const TITLE = 'The agent has a question';

function QuestionField({
  question,
  picked,
  onPick,
}: {
  question: AgentQuestion;
  picked: string[];
  onPick(labels: string[]): void;
}) {
  const labelId = useId();
  return (
    <fieldset aria-labelledby={labelId} className="m-0 mb-3 border-0 p-0">
      <div id={labelId}>
        <Markdown
          text={question.question}
          breaks
          className="mb-1.5 text-sm text-fg-1"
        />
      </div>
      <div className="flex flex-col gap-1">
        {question.options.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={picked.includes(option.label)}
            className={cn(
              'flex cursor-pointer flex-col items-start rounded-md border border-border-2 bg-surface px-3 py-2 text-left hover:border-border-strong',
              picked.includes(option.label) &&
                'border-accent-border bg-accent-subtle',
            )}
            onClick={() => onPick(togglePick(question, picked, option.label))}
          >
            <span className="text-sm text-fg-1">{option.label}</span>
            {option.description ? (
              <span className="text-xs text-fg-3">{option.description}</span>
            ) : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export interface QuestionPanelProps {
  questions: AgentQuestion[];
  picks: QuestionPicks;
  onPick(question: string, labels: string[]): void;
  onRespond(response: PermissionResponse): void;
}

export function QuestionPanel({
  questions,
  picks,
  onPick,
  onRespond,
}: QuestionPanelProps) {
  return (
    <div
      role="group"
      aria-label={TITLE}
      className="mb-2 max-h-[45vh] overflow-auto rounded-xl border border-warning/40 bg-raised p-3.5 shadow-1"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg-1">
        <Icon
          name="message-circle-question"
          size={15}
          className="text-warning-text"
        />
        {TITLE}
      </div>
      {questions.map((question) => (
        <QuestionField
          key={question.question}
          question={question}
          picked={picks[question.question] ?? []}
          onPick={(labels) => onPick(question.question, labels)}
        />
      ))}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRespond(DISMISS_QUESTION)}
        >
          Dismiss
        </Button>
        <span className="text-xs text-fg-3">{QUESTION_REPLY_HINT}</span>
      </div>
    </div>
  );
}
