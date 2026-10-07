import { router } from 'expo-router';
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageCircleQuestion,
  Plus,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  prBadge,
  primaryPr,
  type PrBadge,
  type Repo,
  type RepoFolder,
  type Workspace,
  type WorkspaceRuntime,
  type WorkspaceStatus,
} from '../../../../korev-desktop/src/shared/model';
import {
  activeWorkspaces,
  repoSections,
} from '../../../../korev-desktop/src/shared/workspaces';
import { useAppState } from '../../hooks';
import { ListRow, ROW_ICON_SIZE } from '../../ListRow';
import { openNewWorkspace } from '../../navigation';
import { RepoAvatar } from '../../RepoAvatar';
import { MONO_FONT, useTheme, type Theme } from '../../theme';

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

function WorkspaceRow({
  workspace,
  runtime,
  styles,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime | undefined;
  styles: Styles;
}) {
  const stats = runtime?.stats;
  const hasStats = stats && (stats.additions > 0 || stats.deletions > 0);
  return (
    <ListRow
      accessibilityLabel={`Workspace ${workspace.name}`}
      icon={
        runtime ? <StatusIcon workspace={workspace} runtime={runtime} /> : null
      }
      title={workspace.branch}
      highlighted={runtime?.unread || runtime?.status === 'waiting'}
      subtitle={
        <>
          {workspace.name}
          {runtime?.message ? (
            <Text style={styles.error}> · {runtime.message}</Text>
          ) : null}
        </>
      }
      end={
        <>
          {hasStats ? (
            <Text style={styles.stats}>
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
  );
}

function Chevron({ collapsed }: { collapsed: boolean }) {
  const theme = useTheme();
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return <Icon size={ROW_ICON_SIZE - 3} color={theme.fg4} />;
}

function RepoGroup({
  repo,
  workspaces,
  runtime,
  collapsed,
  onToggle,
  styles,
}: {
  repo: Repo;
  workspaces: Workspace[];
  runtime: Record<string, WorkspaceRuntime>;
  collapsed: boolean;
  onToggle: () => void;
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
        >
          <RepoAvatar repo={repo} />
          <Text style={styles.repoName} numberOfLines={1}>
            {repo.name}
          </Text>
          <Chevron collapsed={collapsed} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`New workspace in ${repo.name}`}
          hitSlop={8}
          onPress={() => openNewWorkspace(repo.id)}
        >
          <Plus size={ROW_ICON_SIZE + 2} color={theme.fg3} />
        </Pressable>
      </View>
      {collapsed
        ? null
        : workspaces.map((workspace) => (
            <WorkspaceRow
              key={workspace.id}
              workspace={workspace}
              runtime={runtime[workspace.id]}
              styles={styles}
            />
          ))}
    </View>
  );
}

function FolderGroup({
  folder,
  collapsed,
  onToggle,
  children,
  styles,
}: {
  folder: RepoFolder;
  collapsed: boolean;
  onToggle: () => void;
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
      >
        <Text style={styles.folderName} numberOfLines={1}>
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

  if (!state) return <ActivityIndicator style={styles.loading} />;

  const workspaces = activeWorkspaces(state);
  const sections = repoSections(state);
  const repoGroup = (repo: Repo) => (
    <RepoGroup
      key={repo.id}
      repo={repo}
      workspaces={workspaces.filter((ws) => ws.repoId === repo.id)}
      runtime={state.runtime}
      collapsed={collapsed.has(repo.id)}
      onToggle={() => toggle(repo.id)}
      styles={styles}
    />
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {sections.map(({ folder, repos }) =>
        folder ? (
          <FolderGroup
            key={folder.id}
            folder={folder}
            collapsed={collapsed.has(folder.id)}
            onToggle={() => toggle(folder.id)}
            styles={styles}
          >
            {repos.map(repoGroup)}
          </FolderGroup>
        ) : (
          repos.map(repoGroup)
        ),
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
    stats: { fontFamily: MONO_FONT, fontSize: 11 },
    additions: { color: theme.diffAdd },
    deletions: { color: theme.diffDel },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.accent,
    },
    empty: { padding: 24, color: theme.fg3, textAlign: 'center' },
  });
}
