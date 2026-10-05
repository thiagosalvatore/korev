import type { PrState } from '../../shared/pull-request';
import { splitRepoName } from '../repo-names';
import { CHECK_CONTEXTS_LIMIT } from './config';
import { graphql } from './graphql';
import { tailLines } from './log-tail';
import { toCheck } from './map-pull-request';
import { type Connection, type CheckContextNode, presentNodes } from './nodes';
import { buildHeaders, githubRequest, type FetchLike } from './request';

export interface PrTextRef {
  repo: string;
  number: number;
}

export interface PrText {
  body: string;
  state: PrState;
}

export interface FailingCheck {
  name: string;
  summary: string;
  url: string | null;
  checkRunId: number | null;
  workflowRunId: number | null;
  isActionsJob: boolean;
}

export interface CheckAnnotation {
  path: string;
  line: number | null;
  level: string;
  message: string;
}

export interface TaskReads {
  pullRequestText(token: string, pr: PrTextRef): Promise<PrText | null>;
  failingChecks(token: string, pr: PrTextRef): Promise<FailingCheck[]>;
  annotations(
    token: string,
    repo: string,
    checkRunId: number,
  ): Promise<CheckAnnotation[]>;
  jobLogTail(
    token: string,
    repo: string,
    jobId: number,
  ): Promise<string | null>;
}

const PR_TEXT_QUERY = `
query PullRequestText($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) { body state }
  }
}`;

const FAILING_CHECKS_QUERY = `
query FailingChecks($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      statusCheckRollup {
        contexts(first: ${CHECK_CONTEXTS_LIMIT}) {
          nodes {
            __typename
            ... on CheckRun {
              databaseId name status conclusion detailsUrl title summary
              checkSuite { app { slug } workflowRun { databaseId } }
            }
            ... on StatusContext { context state description targetUrl }
          }
        }
      }
    }
  }
}`;

const PR_STATES: readonly PrState[] = ['OPEN', 'CLOSED', 'MERGED'];
const ACTIONS_APP_SLUG = 'github-actions';
const ANNOTATIONS_PAGE_SIZE = 50;
const LOGS_ACCEPT = 'application/vnd.github+json';

interface CheckNode extends CheckContextNode {
  databaseId?: number | null;
  detailsUrl?: string | null;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  targetUrl?: string | null;
  checkSuite?: {
    app?: { slug?: string } | null;
    workflowRun?: { databaseId?: number } | null;
  } | null;
}

interface FailingChecksData {
  repository?: {
    pullRequest?: {
      statusCheckRollup?: { contexts?: Connection<CheckNode> } | null;
    } | null;
  } | null;
}

interface AnnotationNode {
  path?: string;
  start_line?: number | null;
  annotation_level?: string;
  message?: string;
}

function toFailingCheck(node: CheckNode): FailingCheck {
  const isActionsJob = node.checkSuite?.app?.slug === ACTIONS_APP_SLUG;
  return {
    name: node.name ?? node.context ?? '',
    summary: [node.title, node.summary, node.description]
      .filter(Boolean)
      .join('\n'),
    url: node.detailsUrl ?? node.targetUrl ?? null,
    checkRunId: node.databaseId ?? null,
    workflowRunId: node.checkSuite?.workflowRun?.databaseId ?? null,
    isActionsJob,
  };
}

function toAnnotation(node: AnnotationNode): CheckAnnotation[] {
  if (!node.path || !node.message) return [];
  return [
    {
      path: node.path,
      line: node.start_line ?? null,
      level: node.annotation_level ?? 'failure',
      message: node.message,
    },
  ];
}

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

  async function failingChecks(
    token: string,
    pr: PrTextRef,
  ): Promise<FailingCheck[]> {
    const result = await graphql<FailingChecksData>(deps.fetch, {
      apiUrl: deps.apiUrl,
      token,
      query: FAILING_CHECKS_QUERY,
      variables: prVariables(pr),
    });
    const contexts =
      result.data.repository?.pullRequest?.statusCheckRollup?.contexts;
    return presentNodes(contexts)
      .filter((node) => toCheck(node).outcome === 'failing')
      .map(toFailingCheck);
  }

  async function annotations(
    token: string,
    repo: string,
    checkRunId: number,
  ): Promise<CheckAnnotation[]> {
    const response = await githubRequest(deps.fetch, {
      url: `${deps.apiUrl}/repos/${repo}/check-runs/${checkRunId}/annotations?per_page=${ANNOTATIONS_PAGE_SIZE}`,
      token,
    });
    return Array.isArray(response.body)
      ? (response.body as AnnotationNode[]).flatMap(toAnnotation)
      : [];
  }

  async function jobLogTail(
    token: string,
    repo: string,
    jobId: number,
  ): Promise<string | null> {
    const response = await deps.fetch(
      `${deps.apiUrl}/repos/${repo}/actions/jobs/${jobId}/logs`,
      {
        method: 'GET',
        headers: buildHeaders(
          { url: '', token, headers: { Accept: LOGS_ACCEPT } },
          false,
        ),
      },
    );
    if (response.status < 200 || response.status >= 300) return null;
    if (!response.body) return tailLines([Buffer.from(await response.text())]);
    return tailLines(response.body);
  }

  return { pullRequestText, failingChecks, annotations, jobLogTail };
}
