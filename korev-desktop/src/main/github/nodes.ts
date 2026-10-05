export interface PageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

export interface Connection<TNode> {
  pageInfo?: PageInfo;
  nodes?: (TNode | null)[] | null;
}

export interface ReviewerNode {
  __typename?: string;
  login?: string;
  slug?: string;
  organization?: { login?: string } | null;
}

export interface CheckContextNode {
  __typename?: string;
  name?: string;
  status?: string;
  conclusion?: string | null;
  context?: string;
  state?: string;
}

export interface StackLayerNode {
  position?: number;
  pullRequest?: {
    number?: number;
    title?: string;
    url?: string;
    state?: string;
    isDraft?: boolean;
    author?: { login?: string } | null;
  } | null;
}

export interface StackNode {
  id?: string;
  size?: number;
  baseRefName?: string;
  entries?: Connection<StackLayerNode> | null;
}

export interface LatestReviewNode {
  author?: { __typename?: string; login?: string } | null;
  state?: string;
}

export interface CommentNode {
  author?: { __typename?: string; login?: string } | null;
  body?: string;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
}

export interface ReviewThreadNode {
  isResolved: boolean;
}

export interface PullRequestNode {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  repository: { nameWithOwner: string };
  headRefName?: string;
  baseRefName?: string;
  headRefOid?: string;
  headRepository?: { url?: string } | null;
  isCrossRepository?: boolean;
  maintainerCanModify?: boolean;
  author?: { login?: string; avatarUrl?: string } | null;
  reviewDecision?: string | null;
  mergeable?: string;
  mergeStateStatus?: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  statusCheckRollup?: {
    state?: string;
    contexts?: Connection<CheckContextNode>;
  } | null;
  latestReviews?: Connection<LatestReviewNode>;
  stack?: StackNode | null;
  stackEntry?: { position?: number } | null;
  reviewThreads?: Connection<ReviewThreadNode>;
  isInMergeQueue?: boolean;
  comments?: Connection<CommentNode>;
  commits?: Connection<{ commit?: { committedDate?: string } | null }>;
  files?: Connection<{ path: string; additions: number; deletions: number }>;
  reviewRequests?: Connection<{ requestedReviewer?: ReviewerNode | null }>;
  timelineItems?: Connection<{
    createdAt?: string;
    requestedReviewer?: ReviewerNode | null;
  }>;
}

export function presentNodes<TNode>(
  connection: Connection<TNode> | null | undefined,
): TNode[] {
  return (connection?.nodes ?? []).filter(
    (node): node is TNode => node !== null && node !== undefined,
  );
}
