import type { MergeMethod, PrTarget } from '../../shared/merge';
import { GithubHttpError, GraphqlQueryError, redactToken } from './errors';
import { graphql } from './graphql';
import { type FetchLike, githubRequest } from './request';

export type MergeAction = 'direct_merge' | 'merge_queue';

export type AsyncMergeStatus = 'pending' | 'merged' | 'enqueued' | 'failed';

export interface AsyncMergeResponse {
  status: AsyncMergeStatus;
  uuid: string | null;
  message: string | null;
}

export interface MergeOptions {
  action: MergeAction;
  method: MergeMethod | null;
}

export interface GithubWriter {
  mergeAsync(
    token: string,
    target: PrTarget,
    options: MergeOptions,
  ): Promise<AsyncMergeResponse>;
  mergeAsyncResult(
    token: string,
    target: PrTarget,
    uuid: string,
  ): Promise<AsyncMergeResponse>;
  closePullRequest(token: string, id: string): Promise<void>;
  reopenPullRequest(token: string, id: string): Promise<void>;
  dequeuePullRequest(token: string, id: string): Promise<void>;
  addComment(token: string, id: string, body: string): Promise<void>;
  rerunFailedJobs(token: string, repo: string, runId: number): Promise<void>;
}

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const ASYNC_STATUSES: readonly AsyncMergeStatus[] = [
  'pending',
  'merged',
  'enqueued',
  'failed',
];

const CLOSE_MUTATION = `
mutation ClosePullRequest($id: ID!) {
  closePullRequest(input: { pullRequestId: $id }) { pullRequest { id } }
}`;

const REOPEN_MUTATION = `
mutation ReopenPullRequest($id: ID!) {
  reopenPullRequest(input: { pullRequestId: $id }) { pullRequest { id } }
}`;

const DEQUEUE_MUTATION = `
mutation DequeuePullRequest($id: ID!) {
  dequeuePullRequest(input: { id: $id }) { mergeQueueEntry { id } }
}`;

const ADD_COMMENT_MUTATION = `
mutation AddComment($id: ID!, $body: String!) {
  addComment(input: { subjectId: $id, body: $body }) { clientMutationId }
}`;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function readAsyncMerge(body: unknown): AsyncMergeResponse {
  const fields = asRecord(body);
  const details = asRecord(fields.details);
  const status = ASYNC_STATUSES.find((value) => value === fields.status);
  return {
    status: status ?? 'failed',
    uuid: stringOrNull(details.uuid),
    message: stringOrNull(details.message),
  };
}

function mergeAsyncUrl(apiUrl: string, target: PrTarget): string {
  return `${apiUrl}/repos/${target.repo}/pulls/${target.number}/merge-async`;
}

function answeredRefusal(error: unknown): error is GithubHttpError {
  return (
    error instanceof GithubHttpError &&
    (error.status === HTTP_CONFLICT || error.status === HTTP_BAD_REQUEST)
  );
}

function refusalResponse(error: GithubHttpError): AsyncMergeResponse {
  const response = readAsyncMerge(error.body);
  if (error.status === HTTP_CONFLICT) return { ...response, status: 'pending' };
  return { ...response, status: 'failed', message: error.message };
}

export function createGithubWriter(deps: {
  fetch: FetchLike;
  apiUrl: string;
}): GithubWriter {
  async function mutate(
    token: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<void> {
    const result = await graphql(deps.fetch, {
      apiUrl: deps.apiUrl,
      token,
      query,
      variables,
    });
    if (result.errors.length === 0) return;
    throw new GraphqlQueryError(
      result.errors.map((error) => redactToken(error.message, token)),
    );
  }

  async function mergeAsync(
    token: string,
    target: PrTarget,
    options: MergeOptions,
  ): Promise<AsyncMergeResponse> {
    const body = {
      merge_action: options.action,
      ...(options.method && options.action === 'direct_merge'
        ? { merge_method: options.method }
        : {}),
    };
    try {
      const response = await githubRequest(deps.fetch, {
        url: mergeAsyncUrl(deps.apiUrl, target),
        method: 'PUT',
        token,
        body,
      });
      return readAsyncMerge(response.body);
    } catch (error) {
      if (answeredRefusal(error)) return refusalResponse(error);
      throw error;
    }
  }

  async function mergeAsyncResult(
    token: string,
    target: PrTarget,
    uuid: string,
  ): Promise<AsyncMergeResponse> {
    const response = await githubRequest(deps.fetch, {
      url: `${mergeAsyncUrl(deps.apiUrl, target)}/${uuid}`,
      token,
    });
    return readAsyncMerge(response.body);
  }

  return {
    mergeAsync,
    mergeAsyncResult,
    closePullRequest: (token, id) => mutate(token, CLOSE_MUTATION, { id }),
    reopenPullRequest: (token, id) => mutate(token, REOPEN_MUTATION, { id }),
    dequeuePullRequest: (token, id) => mutate(token, DEQUEUE_MUTATION, { id }),
    addComment: (token, id, body) =>
      mutate(token, ADD_COMMENT_MUTATION, { id, body }),
    rerunFailedJobs: async (token, repo, runId) => {
      await githubRequest(deps.fetch, {
        url: `${deps.apiUrl}/repos/${repo}/actions/runs/${runId}/rerun-failed-jobs`,
        method: 'POST',
        token,
      });
    },
  };
}
