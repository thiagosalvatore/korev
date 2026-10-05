import { describe, expect, it, vi } from 'vitest';
import { makePr } from '../../inbox/test-fixtures';
import type { Checkouts } from '../checkouts';
import type { TaskRun } from './engine';
import { createReviewFixTask, createReviewTask, reviewPrompt } from './review';
import type { RunAgent } from './run-agent';

const PR = makePr({
  number: 64,
  repo: 'acme/api',
  title: 'Retry webhooks',
  headRefName: 'retry',
  baseRefName: 'main',
});

const FILE = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join(
  '\n',
);

function fakeCheckouts() {
  return {
    open: vi.fn(async () => ({
      path: '/worktrees/acme/api/64',
      headOid: 'f00d',
    })),
    git: vi.fn(async (_path: string, args: string[]) =>
      args.includes('--stat') ? ' retry.ts | 3 +++' : '+retry()',
    ),
    tryGit: vi.fn(async () => ({ exitCode: 0, stdout: FILE, stderr: '' })),
    commitAll: vi.fn(async () => true),
    push: vi.fn(async () => ({ kind: 'pushed' as const, sha: 'beef' })),
    remove: vi.fn(async () => undefined),
  } as unknown as Checkouts;
}

function agentReplies(...outputs: object[]): RunAgent {
  const queue = [...outputs];
  return vi.fn(async () => ({
    ok: true as const,
    output: JSON.stringify({
      summary: 'One bug.',
      changed: false,
      commitMessage: null,
      questions: [],
      event: 'COMMENT',
      comments: [],
      ...queue.shift(),
    }),
  }));
}

function runOf(): TaskRun {
  return {
    ref: 'acme/api#64',
    pr: PR,
    instructions: 'Review it.',
    answered: [],
    signal: new AbortController().signal,
    step: () => undefined,
    activity: () => undefined,
  };
}

const BUG = {
  path: 'src/retry.ts',
  line: 10,
  body: 'This retries forever.',
  severity: 'high',
  confidence: 'high',
};

describe('review task', () => {
  it('builds the same prompt for the fixture PR', async () => {
    const prompt = reviewPrompt({
      pr: PR,
      body: 'Retries failed webhooks.',
      changes: { diffStat: ' retry.ts | 3 +++', diff: '+retry()' },
      instructions: 'Review it.',
      answered: [],
    });

    await expect(prompt).toMatchFileSnapshot('golden/review.prompt.txt');
  });

  it('drafts comments with their path, line and the code around them, read-only', async () => {
    const runAgent = agentReplies({ comments: [BUG] });
    const task = createReviewTask({
      checkouts: fakeCheckouts(),
      runAgent,
      prBody: async () => 'Retries failed webhooks.',
    });

    const outcome = await task.run(runOf());

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ access: 'read-only' }),
    );
    expect(outcome).toMatchObject({
      status: 'done',
      review: {
        headOid: 'f00d',
        event: 'COMMENT',
        comments: [
          {
            path: 'src/retry.ts',
            line: 10,
            severity: 'high',
            contextStart: 7,
            context: [
              'line 7',
              'line 8',
              'line 9',
              'line 10',
              'line 11',
              'line 12',
              'line 13',
            ],
            status: 'open',
          },
        ],
      },
    });
  });

  it('never approves for the user', async () => {
    const task = createReviewTask({
      checkouts: fakeCheckouts(),
      runAgent: agentReplies({ event: 'APPROVE' }),
      prBody: async () => '',
    });

    expect(await task.run(runOf())).toMatchObject({
      review: { event: 'COMMENT' },
    });
  });

  it('asks about a finding it is unsure of instead of drafting it', async () => {
    const task = createReviewTask({
      checkouts: fakeCheckouts(),
      runAgent: agentReplies({ comments: [{ ...BUG, confidence: 'low' }] }),
      prBody: async () => '',
    });

    expect(await task.run(runOf())).toMatchObject({
      status: 'needs-input',
      questions: [{ context: 'src/retry.ts:10' }],
    });
  });

  it('feeds the findings on my own PR to an edit run and pushes the fix', async () => {
    const runAgent = agentReplies(
      { comments: [BUG] },
      {
        changed: true,
        commitMessage: 'Cap webhook retries',
        summary: 'Capped retries',
      },
    );
    const checkouts = fakeCheckouts();
    const task = createReviewFixTask({
      checkouts,
      runAgent,
      prBody: async () => '',
      canPushWorkflows: async () => false,
    });

    const outcome = await task.run(runOf());

    expect(outcome).toEqual({
      status: 'done',
      summary: 'Capped retries',
      commits: ['beef'],
    });
    expect(runAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        access: 'edit',
        prompt: expect.stringContaining(
          'src/retry.ts:10 (high) This retries forever.',
        ),
      }),
    );
  });
});
