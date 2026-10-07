import { describe, expect, it } from 'vitest';
import {
  answerQuestions,
  prBadge,
  type AgentQuestion,
  type PrStatus,
} from './model';

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

describe('prBadge', () => {
  const pr: PrStatus = {
    number: 7,
    url: 'https://github.com/acme/web/pull/7',
    title: 'Add login',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    reviewDecision: null,
    mergedAt: null,
    headRefName: 'dev/login',
    baseRefName: 'main',
    createdAt: '2026-01-01T00:00:00Z',
    checks: [{ name: 'lint', state: 'failure', url: null }],
    stack: null,
  };

  it('shows conflicts before failing checks', () => {
    expect(prBadge({ ...pr, mergeable: 'CONFLICTING' })).toBe('conflicts');
  });

  it('shows a merged PR as merged whatever its checks say', () => {
    expect(prBadge({ ...pr, state: 'MERGED' })).toBe('merged');
  });
});
