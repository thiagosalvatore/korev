import { router } from 'expo-router';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Link,
  MessageCircleQuestion,
  Plus,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  prBadge,
  primaryPr,
  type AppState,
  type PrBadge,
  type Repo,
  type RepoFolder,
  type Workspace,
  type WorkspaceRuntime,
  type WorkspaceStatus,
} from '../../../../korev-desktop/src/shared/model';
import {
  activeWorkspaces,
  crossRepoLeads,
  repoSections,
  sidebarEntries,
  sidebarRepoId,
  waitsForLane,
} from '../../../../korev-desktop/src/shared/workspaces';
import { attempt } from '../../attempt';
import { succeeded } from '../../haptics';
import { useAppState, useReconnect } from '../../hooks';
import { useConnection } from '../../korev';
import { ListRow, ROW_ICON_SIZE } from '../../ListRow';
import { lifted } from '../../haptics';
import { Loading } from '../../Offline';
import { openNewWorkspace } from '../../navigation';
import { RepoAvatar } from '../../RepoAvatar';
import { ReorderList } from '../../ReorderList';
import { MONO_FONT, useTheme, type Theme } from '../../theme';
import { CHROME_FONT_SCALE, touchSlop } from '../../ui';

const REPO_ADD_ICON_SIZE = ROW_ICON_SIZE + 2;

const BUSY_STATUSES: ReadonlySet<WorkspaceStatus> = new Set([
  'creating',
  'setting-up',
  'working',
]);

const BADGE_ICONS: Record<PrBadge, LucideIcon> = {
  merged: GitMerge,
  closed: GitPullRequestClosed,
  conflicts: GitPullRequest,
  'checks-failing': GitPullRequest,
  'checks-running': GitPullRequest,
  draft: GitPullRequestDraft,
  open: GitPullRequest,
};

function badgeColor(theme: Theme, badge: PrBadge): string {
  const colors: Record<PrBadge, string> = {
    merged: theme.merged,
    closed: theme.fg4,
    conflicts: theme.warningText,
    'checks-failing': theme.dangerText,
    'checks-running': theme.warningText,
    draft: theme.fg3,
    open: theme.successText,
  };
  return colors[badge];
}

type Styles = ReturnType<typeof makeStyles>;

function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

function StatusIcon({
  workspace,
  runtime,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime;
}) {
  const theme = useTheme();
  if (BUSY_STATUSES.has(runtime.status))
    return <ActivityIndicator size="small" color={theme.accentText} />;
  if (runtime.status === 'waiting')
    return (
      <MessageCircleQuestion size={ROW_ICON_SIZE} color={theme.warningText} />
    );
  if (runtime.status === 'error' || runtime.status === 'failed')
    return <TriangleAlert size={ROW_ICON_SIZE} color={theme.dangerText} />;
  const pr = primaryPr(workspace, runtime);
  if (!pr) return <GitBranch size={ROW_ICON_SIZE} color={theme.fg4} />;
  const badge = prBadge(pr);
  const Badge = BADGE_ICONS[badge];
  return <Badge size={ROW_ICON_SIZE} color={badgeColor(theme, badge)} />;
}

const ARCHIVE_ACTION = 'archive';

function ArchiveAction({
  onPress,
  styles,
}: {
  onPress: () => void;
  styles: Styles;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.archiveAction}
      onPress={onPress}
    >
      <Archive size={ROW_ICON_SIZE} color={theme.fgOnWarning} />
      <Text
        maxFontSizeMultiplier={CHROME_FONT_SCALE}
        style={styles.archiveLabel}
      >
        Archive
      </Text>
    </Pressable>
  );
}

interface GroupMember {
  repo: string;
  waitsOn: string | null;
}

function memberDetail(workspace: Workspace, member: GroupMember): string {
  return member.waitsOn
    ? `Waits for the plan in ${member.waitsOn}`
    : workspace.branch;
}

function WorkspaceRow({
  workspace,
  runtime,
  member,
  styles,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime | undefined;
  member?: GroupMember;
  styles: Styles;
}) {
  const { api } = useConnection();
  const stats = runtime?.stats;
  const hasStats = stats && (stats.additions > 0 || stats.deletions > 0);
  const archive = async () =>
    succeeded(
      await attempt('Korev could not archive', () =>
        api.archiveWorkspace(workspace.id),
      ),
    );
  const archiveFromSwipe = async (swipeable: SwipeableMethods) => {
    if (!(await archive())) swipeable.close();
  };
  return (
    <ReanimatedSwipeable
      overshootRight={false}
      childrenContainerStyle={styles.swipeableRow}
      renderRightActions={(_progress, _translation, swipeable) => (
        <ArchiveAction
          onPress={() => void archiveFromSwipe(swipeable)}
          styles={styles}
        />
      )}
    >
      <ListRow
        accessibilityLabel={
          member
            ? `Workspace ${workspace.name} in ${member.repo}`
            : `Workspace ${workspace.name}`
        }
        accessibilityActions={[{ name: ARCHIVE_ACTION, label: 'Archive' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === ARCHIVE_ACTION) void archive();
        }}
        icon={
          runtime ? (
            <StatusIcon workspace={workspace} runtime={runtime} />
          ) : null
        }
        title={member ? member.repo : workspace.branch}
        highlighted={runtime?.unread || runtime?.status === 'waiting'}
        subtitle={
          <>
            {member ? memberDetail(workspace, member) : workspace.name}
            {runtime?.message ? (
              <Text style={styles.error}> · {runtime.message}</Text>
            ) : null}
          </>
        }
        end={
          <>
            {hasStats ? (
              <Text
                maxFontSizeMultiplier={CHROME_FONT_SCALE}
                style={styles.stats}
              >
                <Text style={styles.additions}>+{stats.additions}</Text>{' '}
                <Text style={styles.deletions}>−{stats.deletions}</Text>
              </Text>
            ) : null}
            {runtime?.unread ? <View style={styles.dot} /> : null}
          </>
        }
        onPress={() =>
          router.push({
            pathname: '/workspace/[id]',
            params: { id: workspace.id },
          })
        }
      />
    </ReanimatedSwipeable>
  );
}

function LinkedGroup({
  state,
  lead,
  members,
  styles,
}: {
  state: AppState;
  lead: Workspace;
  members: Workspace[];
  styles: Styles;
}) {
  const theme = useTheme();
  const repoName = (workspace: Workspace) =>
    state.repos.find((repo) => repo.id === workspace.repoId)?.name ?? '';
  return (
    <View accessibilityLabel={`Linked workspace ${lead.name}`}>
      <View style={styles.linkedLabel}>
        <Link size={ROW_ICON_SIZE - 4} color={theme.fg3} />
        <Text
          maxFontSizeMultiplier={CHROME_FONT_SCALE}
          style={styles.linkedName}
          numberOfLines={1}
        >
          {lead.name}
        </Text>
      </View>
      <View style={styles.linkedMembers}>
        {members.map((workspace) => (
          <WorkspaceRow
            key={workspace.id}
            workspace={workspace}
            runtime={state.runtime[workspace.id]}
            member={{
              repo: repoName(workspace),
              waitsOn: waitsForLane(state, workspace) ? repoName(lead) : null,
            }}
            styles={styles}
          />
        ))}
      </View>
    </View>
  );
}

function Chevron({ collapsed }: { collapsed: boolean }) {
  const theme = useTheme();
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return <Icon size={ROW_ICON_SIZE - 3} color={theme.fg4} />;
}

function RepoGroup({
  state,
  repo,
  workspaces,
  leads,
  collapsed,
  onToggle,
  onReorder,
  styles,
}: {
  state: AppState;
  repo: Repo;
  workspaces: Workspace[];
  leads: Map<string, Workspace>;
  collapsed: boolean;
  onToggle: () => void;
  onReorder: () => void;
  styles: Styles;
}) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <View style={styles.repoHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          style={styles.repoToggle}
          onPress={onToggle}
          onLongPress={onReorder}
        >
          <RepoAvatar repo={repo} />
          <Text
            maxFontSizeMultiplier={CHROME_FONT_SCALE}
            style={styles.repoName}
            numberOfLines={1}
          >
            {repo.name}
          </Text>
          <Chevron collapsed={collapsed} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`New workspace in ${repo.name}`}
          hitSlop={touchSlop(REPO_ADD_ICON_SIZE)}
          onPress={() => openNewWorkspace(repo.id)}
        >
          <Plus size={REPO_ADD_ICON_SIZE} color={theme.fg3} />
        </Pressable>
      </View>
      {collapsed
        ? null
        : sidebarEntries(workspaces, leads).map(([first, ...rest]) => {
            const lead = first.groupId ? leads.get(first.groupId) : undefined;
            return lead ? (
              <LinkedGroup
                key={first.id}
                state={state}
                lead={lead}
                members={[first, ...rest]}
                styles={styles}
              />
            ) : (
              <WorkspaceRow
                key={first.id}
                workspace={first}
                runtime={state.runtime[first.id]}
                styles={styles}
              />
            );
          })}
    </View>
  );
}

function FolderGroup({
  folder,
  collapsed,
  onToggle,
  onReorder,
  children,
  styles,
}: {
  folder: RepoFolder;
  collapsed: boolean;
  onToggle: () => void;
  onReorder: () => void;
  children: ReactNode;
  styles: Styles;
}) {
  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        style={styles.folderHeader}
        onPress={onToggle}
        onLongPress={onReorder}
      >
        <Text
          maxFontSizeMultiplier={CHROME_FONT_SCALE}
          style={styles.folderName}
          numberOfLines={1}
        >
          {folder.name}
        </Text>
        <Chevron collapsed={collapsed} />
      </Pressable>
      {collapsed ? null : children}
    </View>
  );
}

export default function WorkspacesScreen() {
  const state = useAppState();
  const styles = makeStyles(useTheme());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setCollapsed(toggled(collapsed, id));
  const { refreshing, refresh } = useReconnect();
  const [reordering, setReordering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startReordering = () => {
    lifted();
    setReordering(true);
  };

  if (!state) return <Loading style={styles.loading} />;

  const workspaces = activeWorkspaces(state);
  const leads = crossRepoLeads(state);
  const sections = repoSections(state);
  const repoGroup = (repo: Repo) => (
    <RepoGroup
      key={repo.id}
      state={state}
      repo={repo}
      workspaces={workspaces.filter(
        (ws) => sidebarRepoId(leads, ws) === repo.id,
      )}
      leads={leads}
      collapsed={collapsed.has(repo.id)}
      onToggle={() => toggle(repo.id)}
      onReorder={startReordering}
      styles={styles}
    />
  );

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      scrollEnabled={!dragging}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      {reordering ? (
        <ReorderList
          state={state}
          onDone={() => setReordering(false)}
          onDraggingChange={setDragging}
        />
      ) : (
        sections.map(({ folder, repos }) =>
          folder ? (
            <FolderGroup
              key={folder.id}
              folder={folder}
              collapsed={collapsed.has(folder.id)}
              onToggle={() => toggle(folder.id)}
              onReorder={startReordering}
              styles={styles}
            >
              {repos.map(repoGroup)}
            </FolderGroup>
          ) : (
            repos.map(repoGroup)
          ),
        )
      )}
      {sections.length === 0 && (
        <Text style={styles.empty}>
          Add a repository in Korev on your Mac to start.
        </Text>
      )}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    loading: { marginTop: 40 },
    page: { padding: 8, paddingBottom: 32 },
    group: { marginBottom: 12 },
    folderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    folderName: {
      color: theme.fg4,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    repoHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    repoToggle: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    repoName: {
      flexShrink: 1,
      color: theme.fg1,
      fontSize: 15,
      fontWeight: '600',
    },
    error: { color: theme.dangerText },
    linkedLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingTop: 6,
    },
    linkedName: { flexShrink: 1, color: theme.fg3, fontSize: 12 },
    linkedMembers: { paddingLeft: 12 },
    stats: { fontFamily: MONO_FONT, fontSize: 11 },
    additions: { color: theme.diffAdd },
    deletions: { color: theme.diffDel },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.accent,
    },
    swipeableRow: { backgroundColor: theme.bgApp },
    archiveAction: {
      justifyContent: 'center',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 20,
      borderRadius: 8,
      backgroundColor: theme.warning,
    },
    archiveLabel: {
      color: theme.fgOnWarning,
      fontSize: 12,
      fontWeight: '600',
    },
    empty: { padding: 24, color: theme.fg3, textAlign: 'center' },
  });
}
