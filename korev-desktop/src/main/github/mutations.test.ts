import { describe, expect, it } from 'vitest';
import { createGithubWriter } from './mutations';
import { createFakeFetch } from './test-fetch';

const TARGET = { id: 'PR_303', repo: 'acme/web', number: 303 };
const OPTIONS = { action: 'direct_merge', method: 'squash' } as const;

function writerAnswering(status: number, body: unknown) {
  const fake = createFakeFetch({ status, body });
  return {
    fake,
    writer: createGithubWriter({ fetch: fake.fetch, apiUrl: 'https://api' }),
  };
}

describe('GitHub writer', () => {
  it('submits an async merge and reads the request id', async () => {
    const { fake, writer } = writerAnswering(202, {
      status: 'pending',
      details: { uuid: 'abc', message: 'Merge request enqueued.' },
    });

    const response = await writer.mergeAsync('gho', TARGET, OPTIONS);

    expect(response).toEqual({
      status: 'pending',
      uuid: 'abc',
      message: 'Merge request enqueued.',
    });
    expect(fake.requests[0]).toMatchObject({
      url: 'https://api/repos/acme/web/pulls/303/merge-async',
      method: 'PUT',
      body: { merge_action: 'direct_merge', merge_method: 'squash' },
    });
  });

  it('keeps waiting on the merge already pending when GitHub answers 409', async () => {
    const { writer } = writerAnswering(409, {
      status: 'pending',
      details: { uuid: 'existing', message: 'Already pending' },
    });

    expect(await writer.mergeAsync('gho', TARGET, OPTIONS)).toMatchObject({
      status: 'pending',
      uuid: 'existing',
    });
  });

  it("reports GitHub's reason when it refuses the merge", async () => {
    const { writer } = writerAnswering(400, {
      status: 'failed',
      details: { message: 'Pull request is in draft state' },
    });

    expect(await writer.mergeAsync('gho', TARGET, OPTIONS)).toEqual({
      status: 'failed',
      uuid: null,
      message: 'Pull request is in draft state',
    });
  });

  it('posts a review with each comment on its file and line of the new code', async () => {
    const { fake, writer } = writerAnswering(200, {
      data: { addPullRequestReview: { pullRequestReview: { id: 'R_1' } } },
    });

    await writer.submitReview('gho', 'PR_303', {
      summary: 'Two things to fix.',
      event: 'COMMENT',
      comments: [{ path: 'src/cache.ts', line: 12, body: 'Name this.' }],
    });

    expect(fake.requests[0].body).toMatchObject({
      variables: {
        id: 'PR_303',
        event: 'COMMENT',
        body: 'Two things to fix.',
        threads: [
          { path: 'src/cache.ts', line: 12, side: 'RIGHT', body: 'Name this.' },
        ],
      },
    });
  });

  it('re-runs only the failed jobs of a workflow run', async () => {
    const { fake, writer } = writerAnswering(201, null);

    await writer.rerunFailedJobs('gho', 'acme/web', 9);

    expect(fake.requests[0]).toMatchObject({
      url: 'https://api/repos/acme/web/actions/runs/9/rerun-failed-jobs',
      method: 'POST',
    });
  });
});
