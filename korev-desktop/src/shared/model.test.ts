import { describe, expect, it } from 'vitest';
import {
  keepsPrReady,
  answerQuestions,
  conversationText,
  EMPTY_INBOX_FILTER,
  filterInbox,
  finishedCodexPlan,
  INBOX_VIEWS,
  planLanes,
  presetLaneRepo,
  planOf,
  PLAN_TOOL,
  prBadge,
  primaryStatus,
  prProblems,
  replyToQuestions,
  stackRows,
  type AgentQuestion,
  type ChatItem,
  type ChatSession,
  type InboxFilter,
  type InboxPullRequest,
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

describe('replyToQuestions', () => {
  const questions = [
    question('Which database?'),
    question('Which tests?', true),
  ];

  it('answers every question you did not pick an option for with the reply', () => {
    expect(
      replyToQuestions(questions, { 'Which database?': ['Postgres'] }, 'None'),
    ).toEqual({
      allow: true,
      answers: { 'Which database?': 'Postgres', 'Which tests?': 'None' },
    });
  });

  it('sends only the picks when there is no reply', () => {
    expect(
      replyToQuestions(
        questions,
        { 'Which database?': ['Postgres'], 'Which tests?': ['Unit'] },
        ' ',
      ),
    ).toEqual({
      allow: true,
      answers: { 'Which database?': 'Postgres', 'Which tests?': 'Unit' },
    });
  });

  it('waits for a pick or a reply for every question', () => {
    expect(
      replyToQuestions(questions, { 'Which database?': ['Postgres'] }, ''),
    ).toBeNull();
  });

  it('adds the reply to every answer when you picked an option for each', () => {
    expect(
      replyToQuestions(
        questions,
        { 'Which database?': ['Postgres'], 'Which tests?': ['Unit'] },
        'and keep it fast',
      ),
    ).toEqual({
      allow: true,
      answers: {
        'Which database?': 'Postgres, and keep it fast',
        'Which tests?': 'Unit, and keep it fast',
      },
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
    headRefOid: 'abc123',
    baseRefName: 'main',
    createdAt: '2026-01-01T00:00:00Z',
    checks: [{ name: 'lint', state: 'failure', url: null, required: true }],
    stack: null,
    unansweredThreads: [],
  };

  it('shows conflicts before failing checks', () => {
    expect(prBadge({ ...pr, mergeable: 'CONFLICTING' })).toBe('conflicts');
  });

  it('shows a merged PR as merged whatever its checks say', () => {
    expect(prBadge({ ...pr, state: 'MERGED' })).toBe('merged');
  });

  it('shows unanswered review comments even while checks run', () => {
    const running = {
      ...pr,
      checks: [{ ...pr.checks[0]!, state: 'pending' as const }],
      unansweredThreads: ['c1'],
    };
    expect(prBadge(running)).toBe('review');
  });

  describe('prProblems', () => {
    it('names conflicts, failing required checks and unanswered threads', () => {
      const broken: PrStatus = {
        ...pr,
        mergeable: 'CONFLICTING',
        checks: [
          ...pr.checks,
          { name: 'preview', state: 'failure', url: null, required: false },
          { name: 'test', state: 'pending', url: null, required: true },
        ],
        unansweredThreads: ['c1', 'c2'],
      };
      expect(prProblems(broken).map((found) => found.key)).toEqual([
        'conflict:main@abc123',
        'check:lint@abc123',
        'thread:c1@7',
        'thread:c2@7',
      ]);
    });

    it('finds nothing on a PR that is not open', () => {
      expect(prProblems({ ...pr, state: 'MERGED' })).toEqual([]);
    });
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

describe('presetLaneRepo', () => {
  const repos = [
    { id: 'desktop', name: 'korev-desktop' },
    { id: 'api', name: 'korev-api' },
  ];

  it.each([
    ['korev-api', 'api'],
    ['KOREV-API', 'api'],
    ['API', 'api'],
    ['korev-api: billing endpoint', 'api'],
    ['Docs', 'desktop'],
  ])('sends the %s lane to %s', (lane, repoId) => {
    expect(presetLaneRepo(lane, repos)).toBe(repoId);
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

describe('planOf and conversationText', () => {
  const user = (text: string): ChatItem => ({
    id: text,
    kind: 'user',
    text,
    at: '',
    checkpoint: null,
  });
  const assistant = (text: string): ChatItem => ({
    id: text,
    kind: 'assistant',
    text,
  });
  const planTool = (plan: string): ChatItem => ({
    id: plan,
    kind: 'tool',
    name: PLAN_TOOL,
    summary: '',
    detail: plan,
    output: null,
    failed: false,
  });

  it('finds the last plan, even after later turns', () => {
    const items = [
      user('plan it'),
      planTool('first plan'),
      user('change step 2'),
      planTool('second plan'),
      user('go'),
      assistant('done'),
    ];
    expect(planOf(items)).toBe('second plan');
  });

  it('finds no plan in a chat without one', () => {
    expect(planOf([user('hi'), assistant('hello')])).toBeNull();
  });

  it('keeps only user and assistant messages, in full', () => {
    const items = [user('hello there'), planTool('a plan'), assistant('hi')];
    expect(conversationText(items)).toBe('User: hello there\n\nAssistant: hi');
  });

  it('cuts each message to the given length', () => {
    const items = [user('hello there'), assistant('hi')];
    expect(conversationText(items, 5)).toBe('User: hello\n\nAssistant: hi');
  });
});

function inboxPr(overrides: Partial<InboxPullRequest>): InboxPullRequest {
  return {
    repoId: 'web',
    reason: 'review-requested',
    number: 42,
    title: 'Add install steps',
    url: 'https://github.com/acme/web/pull/42',
    author: 'octo',
    isDraft: false,
    headRefName: 'octo/install',
    baseRefName: 'main',
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-04T10:00:00Z',
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    checks: 'success',
    unresolvedThreads: 0,
    hasApproval: false,
    requestedAsCodeOwner: false,
    ...overrides,
  };
}

describe('filterInbox', () => {
  const install = inboxPr({});
  const login = inboxPr({
    repoId: 'api',
    number: 7,
    title: 'Fix login redirect',
    author: 'me',
    headRefName: 'me/login-42',
    checks: 'failure',
  });
  const draft = inboxPr({ number: 420, title: 'Draft docs', isDraft: true });
  const prs = [install, login, draft];
  const repoNames = new Map([
    ['web', 'acme-web'],
    ['api', 'acme-api'],
  ]);

  function matching(filter: Partial<InboxFilter>) {
    return filterInbox(prs, { ...EMPTY_INBOX_FILTER, ...filter }, repoNames);
  }

  it('finds a pull request by its number', () => {
    expect(matching({ query: '#42' })).toEqual([install]);
    expect(matching({ query: '42' })).toEqual([install, login]);
  });

  it('needs every word to match the title, author, branch or repository', () => {
    expect(matching({ query: 'LOGIN me' })).toEqual([login]);
    expect(matching({ query: 'acme-api redirect' })).toEqual([login]);
    expect(matching({ query: 'login octo' })).toEqual([]);
  });

  it('keeps pull requests that show any of the chosen statuses', () => {
    expect(matching({ statuses: ['Draft', 'Checks failing'] })).toEqual([
      login,
      draft,
    ]);
  });

  it('keeps only the chosen repository', () => {
    expect(matching({ repoId: 'web' })).toEqual([install, draft]);
  });
});

describe('primaryStatus', () => {
  it('shows the most severe problem', () => {
    expect(
      primaryStatus(inboxPr({ checks: 'failure', mergeable: 'CONFLICTING' })),
    ).toEqual({ label: 'Conflicts', tone: 'danger' });
  });

  it('is Ready when nothing blocks the pull request', () => {
    expect(primaryStatus(inboxPr({ reviewDecision: 'APPROVED' }))).toEqual({
      label: 'Ready',
      tone: 'success',
    });
  });
});

describe('INBOX_VIEWS', () => {
  function shownIn(viewId: string, prs: InboxPullRequest[]) {
    const view = INBOX_VIEWS.find((entry) => entry.id === viewId);
    return prs.filter((pr) => view?.matches(pr)).map((pr) => pr.number);
  }

  const reviewing = inboxPr({ number: 1, checks: 'failure' });
  const approved = inboxPr({
    number: 2,
    reason: 'authored',
    reviewDecision: 'APPROVED',
  });
  const commented = inboxPr({
    number: 3,
    reason: 'authored',
    reviewDecision: 'APPROVED',
    unresolvedThreads: 1,
  });
  const running = inboxPr({
    number: 4,
    reason: 'authored',
    reviewDecision: 'APPROVED',
    checks: 'pending',
  });
  const prs = [reviewing, approved, commented, running];

  it('needs attention for your own pull requests that someone must act on', () => {
    expect(shownIn('attention', prs)).toEqual([3]);
  });

  it('is ready to merge only when approved, green and without conflicts', () => {
    expect(shownIn('ready', prs)).toEqual([2, 3]);
  });

  it.each<[string, Partial<InboxPullRequest>, boolean]>([
    ['nobody has approved it', {}, true],
    ['someone else approved it', { hasApproval: true }, false],
    [
      'your code-owner review is still required',
      {
        hasApproval: true,
        requestedAsCodeOwner: true,
        reviewDecision: 'REVIEW_REQUIRED',
      },
      true,
    ],
    [
      'it is approved even though you are a code owner',
      {
        hasApproval: true,
        requestedAsCodeOwner: true,
        reviewDecision: 'APPROVED',
      },
      false,
    ],
    ['you opened it', { reason: 'authored' }, false],
  ])('needs review when %s', (_case, overrides, shown) => {
    expect(shownIn('review', [inboxPr(overrides)])).toEqual(shown ? [42] : []);
  });
});

describe('stackRows', () => {
  const bottom = inboxPr({
    number: 1,
    headRefName: 'stack/1',
    baseRefName: 'main',
    updatedAt: '2026-11-01T10:00:00Z',
  });
  const middle = inboxPr({
    number: 2,
    headRefName: 'stack/2',
    baseRefName: 'stack/1',
    updatedAt: '2026-11-03T10:00:00Z',
  });
  const top = inboxPr({
    number: 3,
    headRefName: 'stack/3',
    baseRefName: 'stack/2',
    updatedAt: '2026-11-02T10:00:00Z',
  });
  const alone = inboxPr({ number: 4, headRefName: 'solo' });

  function rows(prs: InboxPullRequest[]) {
    return stackRows(prs).map(({ pr, depth, stackSize }) => [
      pr.number,
      depth,
      stackSize,
    ]);
  }

  it('puts each pull request under the one its branch is based on', () => {
    expect(rows([middle, top, alone, bottom])).toEqual([
      [1, 0, 3],
      [2, 1, null],
      [3, 2, null],
      [4, 0, null],
    ]);
  });

  it('starts a new stack when the base pull request is not in the list', () => {
    expect(rows([top, bottom])).toEqual([
      [3, 0, null],
      [1, 0, null],
    ]);
  });

  it('does not stack pull requests from different repositories', () => {
    expect(rows([bottom, { ...middle, repoId: 'api' }])).toEqual([
      [1, 0, null],
      [2, 0, null],
    ]);
  });
});

describe('keepsPrReady', () => {
  it.each([
    [
      'the setting is on',
      true,
      { pausePrReady: false, keepPrReady: false },
      true,
    ],
    [
      'the workspace is paused',
      true,
      { pausePrReady: true, keepPrReady: true },
      false,
    ],
    [
      'the setting is off',
      false,
      { pausePrReady: false, keepPrReady: false },
      false,
    ],
    [
      'the workspace opted in',
      false,
      { pausePrReady: true, keepPrReady: true },
      true,
    ],
  ])('when %s', (_case, keepPrsReady, flags, expected) => {
    expect(keepsPrReady(flags, { keepPrsReady })).toBe(expected);
  });
});
