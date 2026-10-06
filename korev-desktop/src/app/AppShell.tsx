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
import type { AppCommand } from '../shared/ipc-contract';
import { prRef } from '../shared/pr-ref';
import {
  DEFAULT_SETTINGS,
  type InboxView,
  type ListView,
  type MyPrsView,
  type RepoFilter,
  type Settings,
} from '../shared/settings';
import { filterSnapshot } from './inbox/filter';
import { RepoFilterMenu } from './inbox/RepoFilterMenu';
import type { Bucket } from '../shared/inbox';
import {
  bucketCount,
  hasTopPriority,
  listedPullRequests,
  myPrsViewOf,
  myPrsViewSnapshot,
  sectionCounts,
} from './inbox/selectors';
import { useKeyShortcuts } from './keyboard';
import { DRAG_REGION, NARROW_QUERY } from './layout';
import { CommandPalette, type PaletteItem } from './CommandPalette';
import { LiveAnnouncer } from './LiveAnnouncer';
import { MyPrs } from './MyPrs';
import { ReviewInbox } from './ReviewInbox';
import { SettingsPage } from './Settings';
import { SHORTCUT_SHEET_KEY, ShortcutSheet } from './ShortcutSheet';
import { Topbar } from './Topbar';
import {
  useAppCommands,
  useFocusPrRequests,
  type AppCommandHandlers,
} from './useAppCommands';
import { FocusRequestProvider, type FocusRequest } from './inbox/focus-request';
import { refreshInbox, useInboxSnapshot } from './useInboxSnapshot';
import { useMediaQuery } from './useMediaQuery';
import { saveLastView, useSettings } from './useSettings';

const SETTINGS_VIEW = 'settings';

type View = ListView | typeof SETTINGS_VIEW;

const VIEW_TITLES: Record<View, string> = {
  review: 'Review requests',
  open: 'Open',
  ready: 'Ready to merge',
  stale: 'Stale',
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

function openBadge(snapshot: InboxSnapshot): SidebarNavBadge {
  const count = bucketCount(snapshot, 'needs-you');
  return countBadge(count, count > 0, `${count} need you`);
}

function readyBadge(snapshot: InboxSnapshot): SidebarNavBadge {
  const count = bucketCount(snapshot, 'ready');
  const tone = count > 0 ? 'success' : 'neutral';
  return { count, tone, label: `${count} ready to merge` };
}

function staleBadge(snapshot: InboxSnapshot): SidebarNavBadge {
  const count = bucketCount(snapshot, 'stale');
  return countBadge(count, false, `${count} stale`);
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
      id: 'open',
      label: VIEW_TITLES.open,
      icon: 'git-pull-request',
      badge: synced ? openBadge(snapshot) : undefined,
    },
    {
      id: 'ready',
      label: VIEW_TITLES.ready,
      icon: 'git-merge',
      badge: synced ? readyBadge(snapshot) : undefined,
    },
    {
      id: 'stale',
      label: VIEW_TITLES.stale,
      icon: 'clock',
      badge: synced ? staleBadge(snapshot) : undefined,
    },
  ];
}

const SECTION_SUMMARY: Record<Bucket, string> = {
  'needs-you': 'need you',
  'korev-working': 'with Korev',
  ready: 'ready to merge',
  'in-progress': 'in progress',
  stale: 'stale',
  kept: 'kept',
};

const EMPTY_SUMMARIES: Record<MyPrsView, string> = {
  open: 'Nothing needs you',
  ready: 'Nothing ready to merge',
  stale: 'Nothing stale',
};

function mineSummary(snapshot: InboxSnapshot, view: MyPrsView): string {
  const parts = sectionCounts(myPrsViewSnapshot(snapshot, view))
    .filter((section) => section.count > 0)
    .map((section) => `${section.count} ${SECTION_SUMMARY[section.bucket]}`);
  return parts.length > 0 ? parts.join(' · ') : EMPTY_SUMMARIES[view];
}

const FILTERED_NOTE = ' · filtered';

function viewSummary(view: ListView, snapshot: InboxSnapshot): string {
  if (view === 'review') return `${snapshot.reviewCount} waiting on you`;
  return mineSummary(snapshot, view);
}

function inboxViewOf(view: ListView): InboxView {
  return view === 'review' ? 'review' : 'mine';
}

function viewSubtitle(
  view: View,
  snapshot: InboxSnapshot | null,
  repoFilter: RepoFilter,
) {
  if (view === SETTINGS_VIEW || !isSynced(snapshot)) return undefined;
  const repos = repoFilter[inboxViewOf(view)];
  const summary = viewSummary(view, filterSnapshot(snapshot, repos));
  return repos.length > 0 ? `${summary}${FILTERED_NOTE}` : summary;
}

interface PaletteCommand {
  command: AppCommand;
  label: string;
  hint: string;
}

const PALETTE_COMMANDS: PaletteCommand[] = [
  { command: 'show-review', label: VIEW_TITLES.review, hint: '⌘1' },
  { command: 'show-open', label: VIEW_TITLES.open, hint: '⌘2' },
  { command: 'show-ready', label: VIEW_TITLES.ready, hint: '⌘3' },
  { command: 'show-stale', label: VIEW_TITLES.stale, hint: '⌘4' },
  { command: 'show-settings', label: VIEW_TITLES.settings, hint: '⌘,' },
  { command: 'refresh', label: 'Refresh', hint: '⌘R' },
  { command: 'show-shortcuts', label: 'Keyboard shortcuts', hint: '?' },
];

function paletteItems(
  snapshot: InboxSnapshot | null,
  commands: AppCommandHandlers,
  focusPr: (ref: string) => void,
): PaletteItem[] {
  const commandItems = PALETTE_COMMANDS.map(({ command, label, hint }) => ({
    id: command,
    label,
    hint,
    run: commands[command],
  }));
  const prItems = (snapshot ? listedPullRequests(snapshot) : []).map((pr) => ({
    id: prRef(pr),
    label: `#${pr.number} ${pr.title}`,
    detail: pr.repo,
    run: () => focusPr(prRef(pr)),
  }));
  return [...commandItems, ...prItems];
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
  if (view === 'review') {
    return <ReviewInbox snapshot={snapshot} onOpenSettings={onOpenSettings} />;
  }
  if (view !== SETTINGS_VIEW) {
    return (
      <MyPrs view={view} snapshot={snapshot} onOpenSettings={onOpenSettings} />
    );
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const snapshot = useInboxSnapshot();
  const repoFilter = useSettings()?.repoFilter ?? DEFAULT_SETTINGS.repoFilter;
  const openSettings = () => selectView(SETTINGS_VIEW);
  const showShortcuts = () => setShortcutsOpen(true);

  function selectView(next: View) {
    setView(next);
    if (next !== SETTINGS_VIEW) void saveLastView(next);
  }

  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusPr = (ref: string) => {
    selectView((snapshot && myPrsViewOf(snapshot, ref)) ?? 'review');
    setFocusRequest({ ref, at: Date.now() });
  };
  useFocusPrRequests(focusPr);

  const commands: AppCommandHandlers = {
    'show-review': () => selectView('review'),
    'show-open': () => selectView('open'),
    'show-ready': () => selectView('ready'),
    'show-stale': () => selectView('stale'),
    'show-settings': openSettings,
    refresh: () => void refreshInbox(),
    'show-shortcuts': showShortcuts,
    'show-palette': () => setPaletteOpen(true),
  };
  useKeyShortcuts({ [SHORTCUT_SHEET_KEY]: showShortcuts });
  useAppCommands(commands);

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
                view={inboxViewOf(view)}
                repoAvatars={snapshot?.repoAvatars ?? {}}
              />
            )
          }
          snapshot={snapshot}
          onReconnect={openSettings}
          onShowShortcuts={view === SETTINGS_VIEW ? undefined : showShortcuts}
        />
        <main className="min-h-0 flex-1 overflow-hidden">
          <FocusRequestProvider value={focusRequest}>
            <ViewContent
              key={view}
              view={view}
              auth={auth}
              settings={settings}
              snapshot={snapshot}
              onOpenSettings={openSettings}
            />
          </FocusRequestProvider>
        </main>
      </div>
      <LiveAnnouncer snapshot={snapshot} />
      <ShortcutSheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <CommandPalette
        open={paletteOpen}
        items={paletteItems(snapshot, commands, focusPr)}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
