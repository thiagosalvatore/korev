import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MergeTool, RepoMergeInfo } from '../../shared/merge';
import type { AsyncMergeResponse, GithubWriter } from './mutations';
import { createPrActions } from './pr-actions';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const TARGET = { id: 'PR_303', repo: 'acme/web', number: 303 };
const UUID = '630b9d5e';

const DIRECT: RepoMergeInfo = {
  defaultMethod: 'squash',
  allowedMethods: ['squash'],
  hasMergeQueue: false,
};

function answer(
  status: AsyncMergeResponse['status'],
  message: string | null = null,
): AsyncMergeResponse {
  return { status, uuid: status === 'pending' ? UUID : null, message };
}

function setup(tool: MergeTool = 'github', info: RepoMergeInfo = DIRECT) {
  const writer = {
    mergeAsync: vi.fn<GithubWriter['mergeAsync']>(),
    mergeAsyncResult: vi.fn<GithubWriter['mergeAsyncResult']>(),
    closePullRequest: vi.fn<GithubWriter['closePullRequest']>(),
    reopenPullRequest: vi.fn<GithubWriter['reopenPullRequest']>(),
    dequeuePullRequest: vi.fn<GithubWriter['dequeuePullRequest']>(),
    addComment: vi.fn<GithubWriter['addComment']>(),
    rerunFailedJobs: vi.fn<GithubWriter['rerunFailedJobs']>(),
  };
  const refresh = vi.fn();
  const actions = createPrActions({
    writer,
    token: () => 'gho_maria',
    repoMerge: () => info,
    mergeWith: () => tool,
    now: () => Date.now(),
    scheduler: {
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimeout: (handle) => clearTimeout(handle),
    },
    onChange: vi.fn(),
    refresh,
  });
  const stateOf = (number: number) => actions.state()[`acme/web#${number}`];
  const merge = () =>
    actions.merge({ target: TARGET, numbers: [302, 303], method: 'squash' });
  return { writer, actions, refresh, stateOf, merge };
}

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-04T12:00:00Z') }));
afterEach(() => vi.useRealTimers());

describe('PR actions', () => {
  it('marks every layer in the range as merging, then merged when GitHub confirms', async () => {
    const { writer, refresh, stateOf, merge } = setup();
    writer.mergeAsync.mockResolvedValue(answer('pending'));
    writer.mergeAsyncResult
      .mockResolvedValueOnce(answer('pending'))
      .mockResolvedValueOnce(answer('merged'));

    await merge();
    expect(stateOf(302)).toEqual({ kind: 'merging', numbers: [302, 303] });
    expect(writer.mergeAsync).toHaveBeenCalledWith('gho_maria', TARGET, {
      action: 'direct_merge',
      method: 'squash',
    });
    await vi.advanceTimersByTimeAsync(6 * SECOND);

    expect(stateOf(303)).toEqual({ kind: 'merged', numbers: [302, 303] });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows GitHub's reason when the merge fails later", async () => {
    const { writer, stateOf, merge } = setup();
    writer.mergeAsync.mockResolvedValue(answer('pending'));
    writer.mergeAsyncResult.mockResolvedValue(
      answer('failed', 'Required status check "lint" is failing.'),
    );

    await merge();
    await vi.advanceTimersByTimeAsync(3 * SECOND);

    expect(stateOf(303)).toEqual({
      kind: 'merge-failed',
      message: 'Required status check "lint" is failing.',
    });
  });

  it("clears the merging state once the PR enters GitHub's merge queue", async () => {
    const { writer, refresh, stateOf, merge } = setup('github', {
      ...DIRECT,
      hasMergeQueue: true,
    });
    writer.mergeAsync.mockResolvedValue(answer('enqueued'));

    await merge();

    expect(writer.mergeAsync.mock.calls[0][2]).toEqual({
      action: 'merge_queue',
      method: null,
    });
    expect(stateOf(303)).toBeUndefined();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('checks every 3s, then every 10s, and hands off after 5 minutes', async () => {
    const { writer, refresh, stateOf, merge } = setup();
    writer.mergeAsync.mockResolvedValue(answer('pending'));
    writer.mergeAsyncResult.mockResolvedValue(answer('pending'));

    await merge();
    await vi.advanceTimersByTimeAsync(30 * SECOND);
    expect(writer.mergeAsyncResult).toHaveBeenCalledTimes(10);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);

    expect(writer.mergeAsyncResult).toHaveBeenCalledTimes(37);
    expect(stateOf(303)).toEqual({
      kind: 'still-merging',
      numbers: [302, 303],
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('sends nothing for a second click while a merge is pending', async () => {
    const { writer, merge } = setup();
    writer.mergeAsync.mockResolvedValue(answer('pending'));
    writer.mergeAsyncResult.mockResolvedValue(answer('pending'));

    await merge();
    const second = await merge();

    expect(second.ok).toBe(false);
    expect(writer.mergeAsync).toHaveBeenCalledOnce();
  });

  it('rolls back and reports the reason when GitHub refuses the merge', async () => {
    const { writer, stateOf, merge } = setup();
    writer.mergeAsync.mockResolvedValue(
      answer('failed', 'Pull request is in draft state'),
    );

    const result = await merge();

    expect(result).toEqual({
      ok: false,
      message: 'Pull request is in draft state',
    });
    expect(stateOf(302)).toBeUndefined();
    expect(stateOf(303)).toEqual({
      kind: 'merge-failed',
      message: 'Pull request is in draft state',
    });
  });

  it('closes several PRs, marking each closing and then closed or failed', async () => {
    const { writer, actions, refresh, stateOf } = setup();
    writer.closePullRequest
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Pull request is locked'));
    const targets = [
      { id: 'PR_301', repo: 'acme/web', number: 301 },
      { id: 'PR_302', repo: 'acme/web', number: 302 },
    ];

    const closing = actions.close(targets);
    expect(stateOf(301)).toEqual({ kind: 'closing' });
    expect(stateOf(302)).toEqual({ kind: 'closing' });
    const result = await closing;

    expect(stateOf(301)).toEqual({ kind: 'closed' });
    expect(stateOf(302)).toMatchObject({ kind: 'close-failed' });
    expect(result.ok).toBe(false);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('posts the queue command for a third-party queue and refreshes', async () => {
    const { writer, refresh, merge } = setup('trunk');

    await merge();

    expect(writer.addComment).toHaveBeenCalledWith(
      'gho_maria',
      TARGET.id,
      '/trunk merge',
    );
    expect(writer.mergeAsync).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
