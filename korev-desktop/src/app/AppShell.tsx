import { useState } from 'react';
import {
  Logo,
  SidebarNav,
  cn,
  type SidebarNavBadge,
  type SidebarNavItem,
} from '../design-system';
import type { AuthState } from '../shared/auth';
import type { InboxSnapshot } from '../shared/inbox';
import {
  DEFAULT_SETTINGS,
  type InboxView,
  type RepoFilter,
  type Settings,
} from '../shared/settings';
import { filterSnapshot } from './inbox/filter';
import { RepoFilterMenu } from './inbox/RepoFilterMenu';
import type { Bucket } from '../shared/inbox';
import {
  hasTopPriority,
  needsYouCount,
  sectionCounts,
} from './inbox/selectors';
import { useKeyShortcuts } from './keyboard';
import { DRAG_REGION, NARROW_QUERY } from './layout';
import { LiveAnnouncer } from './LiveAnnouncer';
import { MyPrs } from './MyPrs';
import { ReviewInbox } from './ReviewInbox';
import { SettingsPage } from './Settings';
import { SHORTCUT_SHEET_KEY, ShortcutSheet } from './ShortcutSheet';
import { Topbar } from './Topbar';
import { useAppCommands } from './useAppCommands';
import { refreshInbox, useInboxSnapshot } from './useInboxSnapshot';
import { useMediaQuery } from './useMediaQuery';
import { saveLastView, useSettings } from './useSettings';

const SETTINGS_VIEW = 'settings';

type View = InboxView | typeof SETTINGS_VIEW;

const VIEW_TITLES: Record<View, string> = {
  review: 'Review requests',
  mine: 'My PRs',
  settings: 'Settings',
};

const SETTINGS_ITEMS: SidebarNavItem<View>[] = [
  { id: SETTINGS_VIEW, label: VIEW_TITLES.settings, icon: 'settings' },
];

function countBadge(
  count: number,
  urgent: boolean,
  label: string,
): SidebarNavBadge {
  return { count, tone: urgent ? 'danger' : 'neutral', label };
}

function reviewBadge(snapshot: InboxSnapshot): SidebarNavBadge {
  const count = snapshot.reviewCount;
  return countBadge(count, hasTopPriority(snapshot), `${count} waiting`);
}

function mineBadge(snapshot: InboxSnapshot): SidebarNavBadge {
  const count = needsYouCount(snapshot);
  return countBadge(count, count > 0, `${count} need you`);
}

function isSynced(snapshot: InboxSnapshot | null): snapshot is InboxSnapshot {
  return Boolean(snapshot?.syncedAt);
}

function inboxItems(snapshot: InboxSnapshot | null): SidebarNavItem<View>[] {
  const synced = isSynced(snapshot);
  return [
    {
      id: 'review',
      label: VIEW_TITLES.review,
      icon: 'inbox',
      badge: synced ? reviewBadge(snapshot) : undefined,
    },
    {
      id: 'mine',
      label: VIEW_TITLES.mine,
      icon: 'git-pull-request',
      badge: synced ? mineBadge(snapshot) : undefined,
    },
  ];
}

const SECTION_SUMMARY: Record<Bucket, string> = {
  'needs-you': 'need you',
  ready: 'ready to merge',
  'in-progress': 'in progress',
  stale: 'stale',
  kept: 'kept',
};

const NO_OPEN_PRS = 'No open PRs';

function mineSummary(snapshot: InboxSnapshot): string {
  const parts = sectionCounts(snapshot)
    .filter((section) => section.count > 0)
    .map((section) => `${section.count} ${SECTION_SUMMARY[section.bucket]}`);
  return parts.length > 0 ? parts.join(' · ') : NO_OPEN_PRS;
}

const FILTERED_NOTE = ' · filtered';

function viewSummary(view: InboxView, snapshot: InboxSnapshot): string {
  if (view === 'mine') return mineSummary(snapshot);
  return `${snapshot.reviewCount} waiting on you`;
}

function viewSubtitle(
  view: View,
  snapshot: InboxSnapshot | null,
  repoFilter: RepoFilter,
) {
  if (view === SETTINGS_VIEW || !isSynced(snapshot)) return undefined;
  const repos = repoFilter[view];
  const summary = viewSummary(view, filterSnapshot(snapshot, repos));
  return repos.length > 0 ? `${summary}${FILTERED_NOTE}` : summary;
}

interface SidebarProps {
  view: View;
  snapshot: InboxSnapshot | null;
  onSelect: (view: View) => void;
}

function Sidebar({ view, snapshot, onSelect }: SidebarProps) {
  const compact = useMediaQuery(NARROW_QUERY);
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border-1 bg-surface px-2 pb-3',
        compact ? 'w-14' : 'w-sidebar',
      )}
    >
      <div className={cn('h-topbar shrink-0', DRAG_REGION)} />
      <div
        className={cn(
          'pt-1 pb-3.5',
          compact ? 'flex justify-center' : 'px-2.5',
        )}
      >
        <Logo size={18} variant={compact ? 'mark' : 'full'} />
      </div>
      <SidebarNav
        label="Inbox"
        items={inboxItems(snapshot)}
        value={view}
        onChange={onSelect}
        compact={compact}
      />
      <span className="flex-1" />
      <SidebarNav
        label="App"
        items={SETTINGS_ITEMS}
        value={view}
        onChange={onSelect}
        compact={compact}
      />
    </aside>
  );
}

interface ViewContentProps extends AppShellProps {
  view: View;
  snapshot: InboxSnapshot | null;
  onOpenSettings: () => void;
}

function ViewContent({
  view,
  auth,
  settings,
  snapshot,
  onOpenSettings,
}: ViewContentProps) {
  if (view === 'mine') {
    return <MyPrs snapshot={snapshot} onOpenSettings={onOpenSettings} />;
  }
  if (view === 'review') {
    return <ReviewInbox snapshot={snapshot} onOpenSettings={onOpenSettings} />;
  }
  return (
    <div className="h-full overflow-auto">
      <SettingsPage auth={auth} settings={settings} snapshot={snapshot} />
    </div>
  );
}

export interface AppShellProps {
  auth: AuthState;
  settings: Settings;
}

export function AppShell({ auth, settings }: AppShellProps) {
  const [view, setView] = useState<View>(settings.lastView);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const snapshot = useInboxSnapshot();
  const repoFilter = useSettings()?.repoFilter ?? DEFAULT_SETTINGS.repoFilter;
  const openSettings = () => selectView(SETTINGS_VIEW);
  const showShortcuts = () => setShortcutsOpen(true);

  function selectView(next: View) {
    setView(next);
    if (next !== SETTINGS_VIEW) void saveLastView(next);
  }

  useKeyShortcuts({ [SHORTCUT_SHEET_KEY]: showShortcuts });
  useAppCommands({
    'show-review': () => selectView('review'),
    'show-mine': () => selectView('mine'),
    'show-settings': openSettings,
    refresh: () => void refreshInbox(),
    'show-shortcuts': showShortcuts,
  });

  return (
    <div className="flex h-screen bg-app text-fg-1">
      <Sidebar view={view} snapshot={snapshot} onSelect={selectView} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={VIEW_TITLES[view]}
          subtitle={viewSubtitle(view, snapshot, repoFilter)}
          filter={
            view === SETTINGS_VIEW ? undefined : (
              <RepoFilterMenu
                view={view}
                repoAvatars={snapshot?.repoAvatars ?? {}}
              />
            )
          }
          snapshot={snapshot}
          onReconnect={openSettings}
          onShowShortcuts={view === SETTINGS_VIEW ? undefined : showShortcuts}
        />
        <main className="min-h-0 flex-1 overflow-hidden">
          <ViewContent
            key={view}
            view={view}
            auth={auth}
            settings={settings}
            snapshot={snapshot}
            onOpenSettings={openSettings}
          />
        </main>
      </div>
      <LiveAnnouncer snapshot={snapshot} />
      <ShortcutSheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
