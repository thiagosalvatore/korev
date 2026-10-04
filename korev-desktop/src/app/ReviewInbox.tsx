import { useState } from 'react';
import { EmptyState, cn } from '../design-system';
import type {
  ApprovedReview,
  InboxSnapshot,
  ReviewEntry,
  ReviewStack,
  ReviewStackLayer,
} from '../shared/inbox';
import { formatSynced, joinMeta, pluralize } from './format';
import { approvedKey, approvedToggleKey, toggleKey } from './inbox/entries';
import { REVIEW_GRID } from './inbox/grid';
import { InboxList } from './inbox/InboxList';
import {
  FilteredOut,
  LoadError,
  LoadingList,
  SectionSkeletons,
} from './inbox/InboxStates';
import { REVIEW_MODEL } from './inbox/list-model';
import { OtherLayerRow } from './inbox/OtherLayerRow';
import { inboxPhase } from './inbox/phase';
import { ApprovedRow, ReviewRow } from './inbox/ReviewRow';
import { requestedItems } from './inbox/selectors';
import { StackGroup, StackLayerItem, byPosition } from './inbox/StackGroup';
import { ToggleRow } from './inbox/ToggleRow';
import {
  useCollapsedSections,
  type CollapsedSections,
} from './inbox/useCollapsedSections';
import { useRepoFilter } from './inbox/useRepoFilter';
import { NARROW_HIDDEN } from './layout';
import { MINUTE_MS, useNow } from './useNow';

const LIST_LABEL = 'Review requests';
const NO_REVIEWS = 'No reviews waiting on you.';

type OtherLayer = Extract<ReviewStackLayer, { kind: 'other' }>;

function isOtherLayer(layer: ReviewStackLayer): layer is OtherLayer {
  return layer.kind === 'other';
}

function otherLayersSummary(others: OtherLayer[]): string {
  const merged = others.filter((other) => other.layer.state === 'MERGED');
  return joinMeta([
    pluralize(others.length, 'other layer'),
    merged.length > 0 ? `${merged.length} merged` : null,
  ]);
}

function ReviewLayer({
  repo,
  layer,
  size,
}: {
  repo: string;
  layer: ReviewStackLayer;
  size: number;
}) {
  if (layer.kind === 'other') {
    return <OtherLayerRow repo={repo} layer={layer.layer} stackSize={size} />;
  }
  return (
    <ReviewRow
      item={layer.item}
      stackPlace={{ position: layer.position, size }}
    />
  );
}

function ReviewStackGroup({ stack }: { stack: ReviewStack }) {
  const [expanded, setExpanded] = useState(false);
  const layers = byPosition(stack.layers);
  const others = layers.filter(isOtherLayer);
  const visible = expanded
    ? layers
    : layers.filter((layer) => !isOtherLayer(layer));
  return (
    <StackGroup
      repo={stack.repo}
      baseRefName={stack.baseRefName}
      summary={`You're asked on ${stack.requestedCount} of ${stack.size}`}
      partial={stack.partial}
    >
      {others.length > 0 ? (
        <ToggleRow
          optionKey={toggleKey(stack.id)}
          expanded={expanded}
          onToggle={() => setExpanded((current) => !current)}
          className="pl-20"
        >
          {otherLayersSummary(others)}
        </ToggleRow>
      ) : null}
      {visible.map((layer) => (
        <StackLayerItem key={layer.position}>
          <ReviewLayer repo={stack.repo} layer={layer} size={stack.size} />
        </StackLayerItem>
      ))}
    </StackGroup>
  );
}

function entryKey(entry: ReviewEntry): string {
  return entry.kind === 'pr' ? entry.item.pr.id : entry.stack.id;
}

function ReviewEntryView({ entry }: { entry: ReviewEntry }) {
  if (entry.kind === 'stack') return <ReviewStackGroup stack={entry.stack} />;
  return <ReviewRow item={entry.item} />;
}

function ColumnHeader() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'sticky top-0 z-5 grid items-end gap-3 border-b border-border-1 bg-app px-5 pt-3 pb-1 type-overline text-fg-3',
        REVIEW_GRID,
      )}
    >
      <span>Suggested priority</span>
      <span>Pull request</span>
      <span className={cn('text-right', NARROW_HIDDEN)}>Files</span>
      <span>Size</span>
      <span />
      <span>CI</span>
    </div>
  );
}

function NoReviews({ syncedAt }: { syncedAt: string | null }) {
  const now = useNow(MINUTE_MS);
  return (
    <EmptyState
      icon="inbox"
      title={NO_REVIEWS}
      description={syncedAt ? formatSynced(syncedAt, now) : undefined}
    />
  );
}

const APPROVED_LABEL = 'Already approved';

function ApprovedSection({
  approved,
  collapsed,
}: {
  approved: ApprovedReview[];
  collapsed: CollapsedSections;
}) {
  const expanded = !collapsed.isCollapsed('approved');
  return (
    <>
      <ToggleRow
        optionKey={approvedToggleKey()}
        expanded={expanded}
        onToggle={() => collapsed.toggle('approved', APPROVED_LABEL)}
        className="pl-5"
      >
        {APPROVED_LABEL}
        <span className="font-mono text-fg-2">{approved.length}</span>
      </ToggleRow>
      {expanded
        ? approved.map((review) => (
            <ApprovedRow key={approvedKey(review.item.pr)} approved={review} />
          ))
        : null}
    </>
  );
}

function ReviewList({
  snapshot,
  collapsed,
}: {
  snapshot: InboxSnapshot;
  collapsed: CollapsedSections;
}) {
  const { entries, approved } = snapshot.reviews;
  return (
    <>
      {requestedItems(snapshot).length === 0 ? (
        <p className="m-0 px-5 pt-4 pb-2 text-sm text-fg-2">{NO_REVIEWS}</p>
      ) : null}
      {entries.map((entry) => (
        <ReviewEntryView key={entryKey(entry)} entry={entry} />
      ))}
      {approved.length > 0 ? (
        <ApprovedSection approved={approved} collapsed={collapsed} />
      ) : null}
    </>
  );
}

export interface ReviewInboxProps {
  snapshot: InboxSnapshot | null;
  onOpenSettings: () => void;
}

export function ReviewInbox({ snapshot, onOpenSettings }: ReviewInboxProps) {
  const collapsed = useCollapsedSections();
  const filter = useRepoFilter('review');
  const phase = inboxPhase(snapshot);
  if (phase.kind === 'loading') {
    return (
      <LoadingList>
        <SectionSkeletons />
      </LoadingList>
    );
  }
  if (phase.kind === 'failed') {
    return (
      <LoadError
        title="Couldn't load review requests"
        message={phase.message}
      />
    );
  }
  return (
    <InboxList
      snapshot={phase.snapshot}
      model={REVIEW_MODEL}
      view="review"
      label={LIST_LABEL}
      repoFilter={filter.repos}
      onOpenSettings={onOpenSettings}
      filteredOut={
        <FilteredOut
          title="No review requests in the selected repos."
          hiddenCount={
            requestedItems(phase.snapshot).length +
            phase.snapshot.reviews.approved.length
          }
          noun="review request"
          onShowAll={filter.clear}
        />
      }
      header={<ColumnHeader />}
      empty={<NoReviews syncedAt={phase.snapshot.syncedAt} />}
    >
      {(displayed) => <ReviewList snapshot={displayed} collapsed={collapsed} />}
    </InboxList>
  );
}
