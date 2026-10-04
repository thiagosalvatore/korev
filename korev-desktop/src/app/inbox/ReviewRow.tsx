import { Badge, SizeBadge, cn } from '../../design-system';
import type {
  Approval,
  ApprovedReview,
  ReviewItem,
  ReviewRequest,
} from '../../shared/inbox';
import { formatAge, pluralize } from '../format';
import { NARROW_HIDDEN } from '../layout';
import { MINUTE_MS, useNow } from '../useNow';
import { CiIcon } from './CiIcon';
import { approvedKey } from './entries';
import { REVIEW_GRID, REVIEW_LAYER_GRID } from './grid';
import {
  LayerLabel,
  PrRow,
  PrSummary,
  authorHandle,
  prRef,
  type StackPlace,
} from './PrRow';
import { PriorityBadge } from './PriorityBadge';

function requestSource(request: ReviewRequest): string {
  if (!request.direct && request.team) return `via ${request.team}`;
  return 'Requested from you';
}

interface MetaPart {
  text: string | null;
  narrowHidden?: boolean;
}

function requestTiming(item: ReviewItem, now: number): MetaPart[] {
  const { request, pr } = item;
  if (request.approximate) {
    return [
      { text: `PR opened ${formatAge(pr.createdAt, now)} ago` },
      { text: 'request time unknown' },
    ];
  }
  return [
    { text: requestSource(request), narrowHidden: true },
    { text: formatAge(request.requestedAt, now) },
  ];
}

function blocksNote(blocksLayers: number): string | null {
  if (blocksLayers === 0) return null;
  return `blocks ${pluralize(blocksLayers, 'layer')}`;
}

interface MetaLineProps {
  authorLogin: string | null;
  number: number;
  parts: MetaPart[];
}

function MetaLine({ authorLogin, number, parts }: MetaLineProps) {
  const author = authorHandle(authorLogin);
  return (
    <>
      {author ? <span className={NARROW_HIDDEN}>{author} · </span> : null}#
      {number}
      {parts.map((part) =>
        part.text ? (
          <span
            key={part.text}
            className={part.narrowHidden ? NARROW_HIDDEN : undefined}
          >
            {' · '}
            {part.text}
          </span>
        ) : null,
      )}
    </>
  );
}

function reviewMeta(item: ReviewItem, now: number) {
  return (
    <MetaLine
      authorLogin={item.pr.authorLogin}
      number={item.pr.number}
      parts={[
        ...requestTiming(item, now),
        { text: blocksNote(item.blocksLayers) },
      ]}
    />
  );
}

export function approvalText(approval: Approval): string {
  switch (approval.kind) {
    case 'you':
      return 'You approved';
    case 'teammate':
      return `Approved by @${approval.login}`;
    case 'bot':
      return `Approved by bot @${approval.login}`;
    default:
      return 'Approved';
  }
}

export function ApprovalBadge({ approval }: { approval: Approval }) {
  if (approval.kind === 'bot') return <Badge>Bot approved</Badge>;
  return <Badge tone="success">Approved</Badge>;
}

function approvedMeta({ item, approval }: ApprovedReview) {
  return (
    <MetaLine
      authorLogin={item.pr.authorLogin}
      number={item.pr.number}
      parts={[
        { text: requestSource(item.request), narrowHidden: true },
        { text: approvalText(approval) },
      ]}
    />
  );
}

interface ReviewColumnsProps {
  item: ReviewItem;
}

function ReviewColumns({ item }: ReviewColumnsProps) {
  const { pr, size } = item;
  return (
    <>
      <span
        className={cn('text-right font-mono text-xs text-fg-2', NARROW_HIDDEN)}
      >
        {pr.changedFiles}
        <span className="sr-only"> files</span>
      </span>
      <SizeBadge {...size} />
      <span>{pr.isDraft ? <Badge outline>Draft</Badge> : null}</span>
      <CiIcon state={pr.ci} checks={pr.checks} />
    </>
  );
}

export interface ReviewRowProps {
  item: ReviewItem;
  stackPlace?: StackPlace;
}

export function ReviewRow({ item, stackPlace }: ReviewRowProps) {
  const now = useNow(MINUTE_MS);
  const { pr, priority } = item;
  return (
    <PrRow
      optionKey={prRef(pr)}
      url={pr.url}
      className={stackPlace ? REVIEW_LAYER_GRID : REVIEW_GRID}
    >
      {stackPlace ? <LayerLabel {...stackPlace} /> : null}
      <PriorityBadge priority={priority} />
      <PrSummary
        title={pr.title}
        repo={stackPlace ? undefined : pr.repo}
        meta={reviewMeta(item, now)}
      />
      <ReviewColumns item={item} />
    </PrRow>
  );
}

export function ApprovedRow({ approved }: { approved: ApprovedReview }) {
  const { pr } = approved.item;
  return (
    <PrRow optionKey={approvedKey(pr)} url={pr.url} className={REVIEW_GRID}>
      <span>
        <ApprovalBadge approval={approved.approval} />
      </span>
      <PrSummary
        title={pr.title}
        repo={pr.repo}
        meta={approvedMeta(approved)}
      />
      <ReviewColumns item={approved.item} />
    </PrRow>
  );
}
