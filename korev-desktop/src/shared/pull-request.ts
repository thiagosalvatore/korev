export type PrState = 'OPEN' | 'CLOSED' | 'MERGED';

export type Mergeable = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';

export type MergeStateStatus =
  | 'BEHIND'
  | 'BLOCKED'
  | 'CLEAN'
  | 'DIRTY'
  | 'HAS_HOOKS'
  | 'UNKNOWN'
  | 'UNSTABLE';

export type ReviewDecision =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REVIEW_REQUIRED';

export type CiState = 'passing' | 'failing' | 'running' | 'none';

export type CheckOutcome = 'passing' | 'failing' | 'pending' | 'skipped';

export interface Check {
  name: string;
  outcome: CheckOutcome;
}

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
}

export type ReviewState =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'COMMENTED'
  | 'DISMISSED'
  | 'PENDING';

export interface SubmittedReview {
  login: string;
  state: ReviewState;
  isBot: boolean;
}

export type Reviewer =
  | { kind: 'user'; login: string }
  | { kind: 'team'; org: string; slug: string };

export interface ReviewRequestEvent {
  reviewer: Reviewer;
  createdAt: string;
}

export interface PrComment {
  authorLogin: string | null;
  isBot: boolean;
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface StackLayer {
  position: number;
  number: number;
  title: string;
  url: string;
  state: PrState;
  isDraft: boolean;
  authorLogin: string | null;
}

export interface StackInfo {
  id: string;
  size: number;
  baseRefName: string;
  position: number;
  layers: StackLayer[];
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  repo: string;
  headRefName: string;
  baseRefName: string;
  headRefOid: string;
  headRepositoryUrl: string | null;
  isCrossRepository: boolean;
  maintainerCanModify: boolean;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  state: PrState;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  reviewDecision: ReviewDecision | null;
  mergeable: Mergeable;
  mergeStateStatus: MergeStateStatus;
  ci: CiState;
  checks: Check[];
  unresolvedThreads: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: ChangedFile[];
  filesTruncated: boolean;
  pendingReviewers: Reviewer[];
  reviews: SubmittedReview[];
  reviewRequestEvents: ReviewRequestEvent[];
  stack: StackInfo | null;
  isInMergeQueue: boolean;
  comments: PrComment[];
}
