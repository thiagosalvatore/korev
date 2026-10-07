import { describe, expect, it } from 'vitest';
import {
  answerQuestions,
  finishedCodexPlan,
  planLanes,
  prBadge,
  type AgentQuestion,
  type ChatItem,
  type ChatSession,
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

describe('planLanes', () => {
  const plan = [
    '# Settings page',
    '## Lanes',
    '### api',
    'Add the settings endpoint.',
    '### ui',
    'Build the page.',
    'Two PRs, stacked.',
    '## Verification',
    'Run the tests.',
  ].join('\n');

  it('reads each lane under the Lanes heading', () => {
    expect(planLanes(plan)).toEqual([
      { name: 'api', body: 'Add the settings endpoint.' },
      { name: 'ui', body: 'Build the page.\nTwo PRs, stacked.' },
    ]);
  });

  it('finds no lanes in a plan without a Lanes section or with one lane', () => {
    expect(planLanes('# Plan\n### api\nDo it.')).toEqual([]);
    expect(planLanes('## Lanes\n### api\nDo it.')).toEqual([]);
  });
});

describe('finishedCodexPlan', () => {
  const session = { agent: 'codex', planMode: true } as ChatSession;
  const result = (ok: boolean): ChatItem => ({
    id: 'result:1',
    kind: 'result',
    ok,
    text: '',
    durationMs: null,
    costUsd: null,
  });
  const turn = (ok: boolean): ChatItem[] => [
    { id: 'u1', kind: 'user', text: 'Plan it', at: '', checkpoint: null },
    { id: 'a1', kind: 'assistant', text: '# Plan' },
    result(ok),
  ];

  it('offers the reply of a finished Codex plan mode turn', () => {
    expect(finishedCodexPlan(session, turn(true), false)).toEqual({
      id: 'result:1',
      plan: '# Plan',
    });
  });

  it('offers nothing while running, after a failed turn or outside plan mode', () => {
    expect(finishedCodexPlan(session, turn(true), true)).toBeNull();
    expect(finishedCodexPlan(session, turn(false), false)).toBeNull();
    expect(
      finishedCodexPlan({ ...session, planMode: false }, turn(true), false),
    ).toBeNull();
  });
});
