import { router, Stack } from 'expo-router';
import {
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageCircleQuestion,
  Plus,
  Settings,
  SquarePen,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  type Workspace,
  type WorkspaceRuntime,
  type WorkspaceStatus,
} from '../../../korev-desktop/src/shared/model';
import {
  activeWorkspaces,
  repoSections,
} from '../../../korev-desktop/src/shared/workspaces';
import { useAppState } from '../hooks';
import { useKorev } from '../korev';
import { RepoAvatar } from '../RepoAvatar';
import { MONO_FONT, useTheme, type Theme } from '../theme';

const LOGO = require('../../assets/icon.png');
const ICON_SIZE = 16;

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

function openNewWorkspace(repoId?: string) {
  router.push({ pathname: '/new', params: repoId ? { repoId } : {} });
}

function confirmUnpair(unpair: () => Promise<void>) {
  Alert.alert(
    'Unpair this phone?',
    'You will need to scan the code in Korev again.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unpair', style: 'destructive', onPress: () => void unpair() },
    ],
  );
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
    return <MessageCircleQuestion size={ICON_SIZE} color={theme.warningText} />;
  if (runtime.status === 'error' || runtime.status === 'failed')
    return <TriangleAlert size={ICON_SIZE} color={theme.dangerText} />;
  const pr = primaryPr(workspace, runtime);
  if (!pr) return <GitBranch size={ICON_SIZE} color={theme.fg4} />;
  const badge = prBadge(pr);
  const Badge = BADGE_ICONS[badge];
  return <Badge size={ICON_SIZE} color={badgeColor(theme, badge)} />;
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
  const highlighted = runtime?.unread || runtime?.status === 'waiting';
  const stats = runtime?.stats;
  const hasStats = stats && (stats.additions > 0 || stats.deletions > 0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Workspace ${workspace.name}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() =>
        router.push({
          pathname: '/workspace/[id]',
          params: { id: workspace.id },
        })
      }
    >
      <View style={styles.statusSlot}>
        {runtime && <StatusIcon workspace={workspace} runtime={runtime} />}
      </View>
      <View style={styles.rowText}>
        <Text
          style={[styles.branch, highlighted && styles.branchHighlighted]}
          numberOfLines={1}
        >
          {workspace.branch}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {workspace.name}
          {runtime?.message ? (
            <Text style={styles.error}> · {runtime.message}</Text>
          ) : null}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        {hasStats ? (
          <Text style={styles.stats}>
            <Text style={styles.additions}>+{stats.additions}</Text>{' '}
            <Text style={styles.deletions}>−{stats.deletions}</Text>
          </Text>
        ) : null}
        {runtime?.unread ? <View style={styles.dot} /> : null}
      </View>
    </Pressable>
  );
}

function RepoGroup({
  repo,
  workspaces,
  runtime,
  styles,
}: {
  repo: Repo;
  workspaces: Workspace[];
  runtime: Record<string, WorkspaceRuntime>;
  styles: Styles;
}) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <View style={styles.repoHeader}>
        <RepoAvatar repo={repo} />
        <Text style={styles.repoName} numberOfLines={1}>
          {repo.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`New workspace in ${repo.name}`}
          hitSlop={8}
          onPress={() => openNewWorkspace(repo.id)}
        >
          <Plus size={ICON_SIZE + 2} color={theme.fg3} />
        </Pressable>
      </View>
      {workspaces.map((workspace) => (
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

function HeaderTitle({ styles }: { styles: Styles }) {
  return (
    <View style={styles.brand}>
      <Image source={LOGO} style={styles.logo} />
      <Text style={styles.brandName}>Korev</Text>
    </View>
  );
}

export default function WorkspacesScreen() {
  const state = useAppState();
  const { unpair } = useKorev();
  const theme = useTheme();
  const styles = makeStyles(theme);

  const header = (
    <Stack.Screen
      options={{
        headerTitle: () => <HeaderTitle styles={styles} />,
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
            onPress={() => confirmUnpair(unpair)}
          >
            <Settings size={ICON_SIZE + 4} color={theme.fg2} />
          </Pressable>
        ),
      }}
    />
  );

  if (!state)
    return (
      <>
        {header}
        <ActivityIndicator style={styles.loading} />
      </>
    );

  const workspaces = activeWorkspaces(state);
  const repos = repoSections(state).flatMap((section) => section.repos);

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
          onPress={() => openNewWorkspace()}
        >
          <SquarePen size={ICON_SIZE} color={theme.fg2} />
          <Text style={styles.navLabel}>New workspace</Text>
        </Pressable>
        {repos.map((repo) => (
          <RepoGroup
            key={repo.id}
            repo={repo}
            workspaces={workspaces.filter((ws) => ws.repoId === repo.id)}
            runtime={state.runtime}
            styles={styles}
          />
        ))}
        {repos.length === 0 && (
          <Text style={styles.empty}>
            Add a repository in Korev on your Mac to start.
          </Text>
        )}
      </ScrollView>
    </>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    loading: { marginTop: 40 },
    page: { paddingHorizontal: 8, paddingVertical: 8 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    logo: { width: 24, height: 24, borderRadius: 6 },
    brandName: { color: theme.fg1, fontSize: 17, fontWeight: '700' },
    pressed: { backgroundColor: theme.bgHover },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 8,
      marginBottom: 8,
    },
    navLabel: { color: theme.fg2, fontSize: 15, fontWeight: '500' },
    group: { marginBottom: 12 },
    repoHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    repoName: { flex: 1, color: theme.fg1, fontSize: 15, fontWeight: '600' },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
    },
    statusSlot: { width: 20, alignItems: 'center', paddingTop: 1 },
    rowText: { flex: 1, gap: 2 },
    branch: { color: theme.fg2, fontSize: 15, fontWeight: '500' },
    branchHighlighted: { color: theme.fg1, fontWeight: '700' },
    name: { color: theme.fg3, fontSize: 13 },
    error: { color: theme.dangerText },
    rowEnd: { alignItems: 'flex-end', gap: 6, paddingTop: 2 },
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
