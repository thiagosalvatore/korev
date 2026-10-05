import type { PrState } from '../../shared/pull-request';
import { splitRepoName } from '../repo-names';
import { graphql } from './graphql';
import type { FetchLike } from './request';

export interface PrTextRef {
  repo: string;
  number: number;
}

export interface PrText {
  body: string;
  state: PrState;
}

export interface TaskReads {
  pullRequestText(token: string, pr: PrTextRef): Promise<PrText | null>;
}

const PR_TEXT_QUERY = `
query PullRequestText($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) { body state }
  }
}`;

const PR_STATES: readonly PrState[] = ['OPEN', 'CLOSED', 'MERGED'];

interface PrTextData {
  repository?: {
    pullRequest?: { body?: string | null; state?: string } | null;
  } | null;
}

export function prVariables(pr: PrTextRef) {
  return { ...splitRepoName(pr.repo), number: pr.number };
}

export function createTaskReads(deps: {
  fetch: FetchLike;
  apiUrl: string;
}): TaskReads {
  async function pullRequestText(
    token: string,
    pr: PrTextRef,
  ): Promise<PrText | null> {
    const result = await graphql<PrTextData>(deps.fetch, {
      apiUrl: deps.apiUrl,
      token,
      query: PR_TEXT_QUERY,
      variables: prVariables(pr),
    });
    const node = result.data.repository?.pullRequest;
    const state = PR_STATES.find((value) => value === node?.state);
    if (!node || !state) return null;
    return { body: node.body ?? '', state };
  }

  return { pullRequestText };
}
