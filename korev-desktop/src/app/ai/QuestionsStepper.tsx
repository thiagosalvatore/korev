import { useState, type KeyboardEvent } from 'react';
import { Button, Field, cn } from '../../design-system';
import type { AgentQuestion, QuestionAnswers } from '../../shared/agent-tasks';
import { hasCommandModifier } from '../keyboard';

const TEXTAREA_CLASS =
  'min-h-32 w-full resize-y rounded-sm border border-border-2 bg-inset p-2.5 type-ui text-fg-1 outline-none hover:border-border-strong focus:border-accent focus:shadow-halo';

export const SEND_ANSWERS = 'Send answers';
const ANSWER_EVERY_QUESTION = 'Answer every question first';

function hasAnswer(answers: QuestionAnswers, question: AgentQuestion) {
  return Boolean(answers[question.id]?.trim());
}

export interface QuestionsStepperProps {
  questions: AgentQuestion[];
  answers: QuestionAnswers;
  onAnswer: (id: string, text: string) => void;
  onSend: () => void;
  onDismiss: () => void;
}

function dotColour(current: boolean, answered: boolean): string {
  if (current) return 'bg-accent';
  return answered ? 'bg-fg-3' : 'bg-active';
}

function StepDots({
  questions,
  answers,
  current,
  onSelect,
}: {
  questions: AgentQuestion[];
  answers: QuestionAnswers;
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="m-0 flex list-none gap-1.5 p-0">
      {questions.map((question, index) => (
        <li key={question.id}>
          <button
            type="button"
            aria-label={`Question ${index + 1}`}
            aria-current={index === current ? 'step' : undefined}
            onClick={() => onSelect(index)}
            className={cn(
              'block h-1.5 w-6 cursor-pointer rounded-full border-0 p-0',
              dotColour(index === current, hasAnswer(answers, question)),
            )}
          />
        </li>
      ))}
    </ol>
  );
}

export function QuestionsStepper({
  questions,
  answers,
  onAnswer,
  onSend,
  onDismiss,
}: QuestionsStepperProps) {
  const [current, setCurrent] = useState(0);
  const [moved, setMoved] = useState(false);
  const index = Math.min(current, questions.length - 1);
  const question = questions[index];
  const isLast = index === questions.length - 1;
  const answered = hasAnswer(answers, question);
  const everyAnswered = questions.every((each) => hasAnswer(answers, each));

  function goTo(next: number) {
    setCurrent(next);
    setMoved(true);
  }

  function advance() {
    if (!isLast) {
      if (answered) goTo(index + 1);
      return;
    }
    if (everyAnswered) onSend();
  }

  function advanceOnCommandEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || !hasCommandModifier(event)) return;
    event.preventDefault();
    advance();
  }

  return (
    <section
      aria-label="Korev needs your answer"
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-3">
        <h3 className="m-0 type-overline text-fg-3">Korev needs your answer</h3>
        <span className="text-xs text-fg-3">
          Question {index + 1} of {questions.length}
        </span>
        <span className="flex-1" />
        <StepDots
          questions={questions}
          answers={answers}
          current={index}
          onSelect={goTo}
        />
      </div>
      {question.context ? (
        <p className="m-0 text-sm whitespace-pre-wrap text-fg-2">
          {question.context}
        </p>
      ) : null}
      <p className="m-0 type-h3 whitespace-pre-wrap text-fg-1">
        {question.question}
      </p>
      <Field label="Your answer">
        <textarea
          key={question.id}
          autoFocus={moved}
          className={TEXTAREA_CLASS}
          value={answers[question.id] ?? ''}
          onChange={(event) => onAnswer(question.id, event.target.value)}
          onKeyDown={advanceOnCommandEnter}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onDismiss}>
          I'll do it myself
        </Button>
        <span className="flex-1" />
        <Button disabled={index === 0} onClick={() => goTo(index - 1)}>
          Back
        </Button>
        {isLast ? (
          <Button
            variant="primary"
            kbd="⌘↵"
            disabled={!everyAnswered}
            title={everyAnswered ? undefined : ANSWER_EVERY_QUESTION}
            onClick={onSend}
          >
            {SEND_ANSWERS}
          </Button>
        ) : (
          <Button
            variant="primary"
            kbd="⌘↵"
            disabled={!answered}
            onClick={advance}
          >
            Next
          </Button>
        )}
      </div>
    </section>
  );
}
