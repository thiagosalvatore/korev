import type { KeyboardEvent } from 'react';
import { Button, Field } from '../../design-system';
import { hasCommandModifier } from '../keyboard';
import { PanelSection } from '../inbox/PanelSection';
import type { PanelAi } from './useKorevAi';

const TEXTAREA_CLASS =
  'min-h-18 w-full resize-y rounded-sm border border-border-2 bg-inset p-2.5 type-ui text-fg-1 outline-none hover:border-border-strong focus:border-accent focus:shadow-halo';

export const SEND_ANSWERS = 'Send answers';

export function allAnswered(ai: PanelAi): boolean {
  return (ai.questions ?? []).every((question) =>
    Boolean(ai.answers[question.id]?.trim()),
  );
}

export function QuestionsSection({ ai }: { ai: PanelAi }) {
  if (!ai.questions) return null;
  function sendOnCommandEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || !hasCommandModifier(event)) return;
    event.preventDefault();
    if (allAnswered(ai)) ai.onSendAnswers();
  }
  return (
    <PanelSection title="Korev needs your answer">
      <div className="flex flex-col gap-4">
        {ai.questions.map((question) => (
          <div key={question.id} className="flex flex-col gap-1.5">
            {question.context ? (
              <p className="m-0 text-xs whitespace-pre-wrap text-fg-2">
                {question.context}
              </p>
            ) : null}
            <p className="m-0 text-sm text-fg-1">{question.question}</p>
            <Field label="Your answer">
              <textarea
                className={TEXTAREA_CLASS}
                value={ai.answers[question.id] ?? ''}
                onChange={(event) =>
                  ai.onAnswer(question.id, event.target.value)
                }
                onKeyDown={sendOnCommandEnter}
              />
            </Field>
          </div>
        ))}
      </div>
    </PanelSection>
  );
}

export function AnswersFooter({ ai }: { ai: PanelAi }) {
  return (
    <div className="flex gap-2">
      <Button
        variant="primary"
        className="flex-1"
        kbd="⌘↵"
        disabled={!allAnswered(ai)}
        onClick={ai.onSendAnswers}
      >
        {SEND_ANSWERS}
      </Button>
      <Button variant="ghost" onClick={ai.onDismiss}>
        I'll do it myself
      </Button>
    </div>
  );
}
