import { describe, expect, it } from 'vitest';
import { answerQuestions, type AgentQuestion } from './model';

function question(text: string, multiSelect = false): AgentQuestion {
  return { question: text, header: text, options: [], multiSelect };
}

describe('answerQuestions', () => {
  const questions = [
    question('Which database?'),
    question('Which tests?', true),
  ];

  it('waits until every question has an answer', () => {
    expect(
      answerQuestions(questions, { 'Which database?': ['Postgres'] }),
    ).toBeNull();
  });

  it('joins the options picked for a multi-select question', () => {
    expect(
      answerQuestions(questions, {
        'Which database?': ['Postgres'],
        'Which tests?': ['Unit', 'E2E'],
      }),
    ).toEqual({
      allow: true,
      answers: { 'Which database?': 'Postgres', 'Which tests?': 'Unit, E2E' },
    });
  });
});
