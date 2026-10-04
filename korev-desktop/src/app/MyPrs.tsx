import { EmptyState, Icon } from '../design-system';
import type {
  Bucket,
  InboxSnapshot,
  MyEntry,
  MySection,
  MyStack,
} from '../shared/inbox';
import { sectionToggleKey } from './inbox/entries';
import {
  GroupBlock,
  type CountTone,
  type GroupToggle,
} from './inbox/GroupHeader';
import { InboxList } from './inbox/InboxList';
import { LoadError, LoadingList, SectionSkeletons } from './inbox/InboxStates';
import { MINE_MODEL } from './inbox/list-model';
import { MyPrRow } from './inbox/MyPrRow';
import { OtherLayerRow } from './inbox/OtherLayerRow';
import { inboxPhase } from './inbox/phase';
import { StackGroup, StackLayerItem, byPosition } from './inbox/StackGroup';
import {
  useCollapsedSections,
  type CollapsedSections,
} from './inbox/useCollapsedSections';

const BUCKET_LABELS: Record<Bucket, string> = {
  'needs-you': 'Needs you',
  'in-progress': 'In progress',
  ready: 'Ready to merge',
};

const LIST_LABEL = 'My pull requests';

function MyStackGroup({ stack }: { stack: MyStack }) {
  return (
    <StackGroup
      repo={stack.repo}
      baseRefName={stack.baseRefName}
      summary={stack.headline}
      partial={stack.partial}
    >
      {byPosition(stack.layers).map((layer) => (
        <StackLayerItem key={layer.position}>
          {layer.kind === 'mine' ? (
            <MyPrRow
              item={layer.item}
              stackPlace={{ position: layer.position, size: stack.size }}
            />
          ) : (
            <OtherLayerRow
              repo={stack.repo}
              layer={layer.layer}
              stackSize={stack.size}
            />
          )}
        </StackLayerItem>
      ))}
    </StackGroup>
  );
}

function entryKey(entry: MyEntry): string {
  return entry.kind === 'pr' ? entry.item.pr.id : entry.stack.id;
}

function MyEntryView({ entry }: { entry: MyEntry }) {
  if (entry.kind === 'stack') return <MyStackGroup stack={entry.stack} />;
  return <MyPrRow item={entry.item} />;
}

const COUNT_TONES: Record<Bucket, CountTone> = {
  'needs-you': 'danger',
  ready: 'success',
  'in-progress': 'neutral',
};

const ALWAYS_OPEN = 'needs-you' satisfies Bucket;

function sectionToggle(
  bucket: Exclude<Bucket, typeof ALWAYS_OPEN>,
  collapsed: CollapsedSections,
): GroupToggle {
  return {
    optionKey: sectionToggleKey(bucket),
    expanded: !collapsed.isCollapsed(bucket),
    onToggle: () => collapsed.toggle(bucket, BUCKET_LABELS[bucket]),
  };
}

interface SectionBlockProps {
  section: MySection;
  collapsed: CollapsedSections;
}

function SectionBlock({ section, collapsed }: SectionBlockProps) {
  const { bucket } = section;
  return (
    <GroupBlock
      label={BUCKET_LABELS[bucket]}
      count={section.count}
      tone={COUNT_TONES[bucket]}
      toggle={
        bucket === ALWAYS_OPEN ? undefined : sectionToggle(bucket, collapsed)
      }
    >
      {section.entries.map((entry) => (
        <MyEntryView key={entryKey(entry)} entry={entry} />
      ))}
    </GroupBlock>
  );
}

function NothingNeedsYou() {
  return (
    <p className="m-0 flex h-9 items-center gap-2 px-5 type-ui text-fg-2">
      <Icon name="check-check" size={14} />
      Nothing needs you.
    </p>
  );
}

function MySections({
  sections,
  collapsed,
}: {
  sections: MySection[];
  collapsed: CollapsedSections;
}) {
  const shown = sections.filter((section) => section.entries.length > 0);
  const needsYouShown = shown.some((section) => section.bucket === ALWAYS_OPEN);
  return (
    <>
      {needsYouShown ? null : <NothingNeedsYou />}
      {shown.map((section) => (
        <SectionBlock
          key={section.bucket}
          section={section}
          collapsed={collapsed}
        />
      ))}
    </>
  );
}

const NOTHING_NEEDS_YOU = (
  <EmptyState
    icon="check-check"
    title="Nothing needs you."
    description="You have no open PRs in the repos Korev watches."
  />
);

export interface MyPrsProps {
  snapshot: InboxSnapshot | null;
  onOpenSettings: () => void;
}

export function MyPrs({ snapshot, onOpenSettings }: MyPrsProps) {
  const collapsed = useCollapsedSections();
  const phase = inboxPhase(snapshot);
  if (phase.kind === 'loading') {
    return (
      <LoadingList>
        <SectionSkeletons />
      </LoadingList>
    );
  }
  if (phase.kind === 'failed') {
    return <LoadError title="Couldn't load your PRs" message={phase.message} />;
  }
  return (
    <InboxList
      snapshot={phase.snapshot}
      model={MINE_MODEL}
      view="mine"
      label={LIST_LABEL}
      onOpenSettings={onOpenSettings}
      empty={NOTHING_NEEDS_YOU}
    >
      {(displayed) => (
        <MySections sections={displayed.mine} collapsed={collapsed} />
      )}
    </InboxList>
  );
}
