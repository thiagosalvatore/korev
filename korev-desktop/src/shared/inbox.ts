import type { AgentTaskState } from './agent-tasks';
import type { PrActionState, QueueStatus, RepoMergeInfo } from './merge';
import type { PullRequest, StackLayer } from './pull-request';

export type Bucket = 'needs-you' | 'in-progress' | 'ready' | 'stale' | 'kept';

export type ReasonSeverity = 'danger' | 'warning' | 'neutral' | 'success';

export type ReasonCode =
  | 'checks-failing'
  | 'changes-requested'
  | 'unresolved-threads'
  | 'conflicts'
  | 'behind'
  | 'optional-checks-failing'
  | 'checks-pending'
  | 'draft'
  | 'blocked-by-rules'
  | 'waiting-on-review'
  | 'checking-mergeability'
  | 'mergeability-unknown'
  | 'no-checks'
  | 'ready-to-merge'
  | 'in-queue'
  | 'removed-from-queue'
  | 'stale';

export interface Reason {
  code: ReasonCode;
  label: string;
  severity: ReasonSeverity;
}

export interface MyPr {
  pr: PullRequest;
  bucket: Bucket;
  reasons: Reason[];
  queue: QueueStatus | null;
  keptUntil?: string;
}

export type MyStackLayer =
  | { kind: 'mine'; position: number; item: MyPr }
  | { kind: 'other'; position: number; layer: StackLayer };

export interface MyStack {
  id: string;
  repo: string;
  baseRefName: string;
  size: number;
  openCount: number;
  partial: boolean;
  bucket: Bucket;
  headline: string;
  layers: MyStackLayer[];
}

export type MyEntry =
  | { kind: 'pr'; item: MyPr }
  | { kind: 'stack'; stack: MyStack };

export interface MySection {
  bucket: Bucket;
  count: number;
  entries: MyEntry[];
}

export type PrSize = 'S' | 'M' | 'L';

export interface SizeInfo {
  size: PrSize;
  lines: number;
  files: number;
  filesTruncated: boolean;
}

export type PriorityTier = 'P1' | 'P2' | 'P3';

export interface Priority {
  tier: PriorityTier;
  score: number;
  reasons: string[];
}

export interface ReviewRequest {
  requestedAt: string;
  approximate: boolean;
  direct: boolean;
  team: string | null;
}

export interface ReviewItem {
  pr: PullRequest;
  request: ReviewRequest;
  size: SizeInfo;
  priority: Priority;
  blocksLayers: number;
}

export type ReviewStackLayer =
  | { kind: 'requested'; position: number; item: ReviewItem }
  | { kind: 'other'; position: number; layer: StackLayer };

export interface ReviewStack {
  id: string;
  repo: string;
  baseRefName: string;
  size: number;
  requestedCount: number;
  partial: boolean;
  layers: ReviewStackLayer[];
}

export type ReviewEntry =
  | { kind: 'pr'; item: ReviewItem }
  | { kind: 'stack'; stack: ReviewStack };

export type Approval =
  | { kind: 'you' }
  | { kind: 'teammate'; login: string }
  | { kind: 'bot'; login: string }
  | { kind: 'overall' };

export interface ApprovedReview {
  item: ReviewItem;
  approval: Approval;
}

export interface ReviewList {
  entries: ReviewEntry[];
  approved: ApprovedReview[];
}

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'live'
  | 'paused'
  | 'offline'
  | 'rate_limited'
  | 'auth_lost'
  | 'error';

export type ProblemKind =
  | 'restricted'
  | 'sso'
  | 'not_found'
  | 'archived'
  | 'other';

export interface Problem {
  kind: ProblemKind;
  repo: string | null;
  message: string;
  actionUrl: string | null;
}

export interface InboxSnapshot {
  status: SyncStatus;
  syncedAt: string | null;
  fromCache: boolean;
  viewerLogin: string | null;
  repoCount: number;
  mine: MySection[];
  reviews: ReviewList;
  reviewCount: number;
  problems: Problem[];
  repoMerge: Record<string, RepoMergeInfo>;
  repoAvatars: Record<string, string>;
  actions: Record<string, PrActionState>;
  agentTasks: Record<string, AgentTaskState>;
  truncated: { mine: boolean; reviews: boolean };
  stacksUnavailable: boolean;
  error: string | null;
  rateLimitResetAt: string | null;
  nextRetryAt: string | null;
}
