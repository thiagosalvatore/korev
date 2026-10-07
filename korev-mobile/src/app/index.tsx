import { router, Stack } from 'expo-router';
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
  Settings,
  SquarePen,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
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
  type AppState,
  type AskChat,
  type PrBadge,
  type Repo,
  type RepoFolder,
  type Workspace,
  type WorkspaceRuntime,
  type WorkspaceStatus,
} from '../../../korev-desktop/src/shared/model';
import {
  activeWorkspaces,
  repoSections,
} from '../../../korev-desktop/src/shared/workspaces';
import { timeAgo } from '../../../korev-desktop/src/shared/format';
import { useAppState } from '../hooks';
import { useKorev } from '../korev';
import { RepoAvatar } from '../RepoAvatar';
import { MONO_FONT, useTheme, type Theme } from '../theme';

const LOGO = require('../../assets/icon.png');
const ASK_CHATS_KEY = 'ask-chats';
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

function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

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

function Chevron({ collapsed }: { collapsed: boolean }) {
  const theme = useTheme();
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return <Icon size={ICON_SIZE - 3} color={theme.fg4} />;
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
          <Plus size={ICON_SIZE + 2} color={theme.fg3} />
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
        style={styles.overlineRow}
        onPress={onToggle}
      >
        <Text style={styles.overline} numberOfLines={1}>
          {folder.name}
        </Text>
        <Chevron collapsed={collapsed} />
      </Pressable>
      {collapsed ? null : children}
    </View>
  );
}

function AskChatRow({
  state,
  ask,
  styles,
}: {
  state: AppState;
  ask: AskChat;
  styles: Styles;
}) {
  const theme = useTheme();
  const running = state.runningSessions.includes(ask.session.id);
  const repoNames = ask.repoIds
    .map((id) => state.repos.find((repo) => repo.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ask ${ask.session.title}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() =>
        router.push({ pathname: '/ask/[id]', params: { id: ask.id } })
      }
    >
      <View style={styles.statusSlot}>
        {running ? (
          <ActivityIndicator size="small" color={theme.accentText} />
        ) : (
          <MessageCircleQuestion size={ICON_SIZE} color={theme.fg4} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.branch} numberOfLines={1}>
          {ask.session.title}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {repoNames}
        </Text>
      </View>
      <Text style={styles.age}>{timeAgo(ask.lastMessageAt)}</Text>
    </Pressable>
  );
}

function AskChats({
  state,
  collapsed,
  onToggle,
  styles,
}: {
  state: AppState;
  collapsed: boolean;
  onToggle: () => void;
  styles: Styles;
}) {
  if (!state.askChats.length) return null;
  const newestFirst = [...state.askChats].sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt),
  );
  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        style={styles.overlineRow}
        onPress={onToggle}
      >
        <Text style={styles.overline}>Ask chats</Text>
        <Chevron collapsed={collapsed} />
        <View style={styles.fill} />
        <Text style={styles.count}>{state.askChats.length}</Text>
      </Pressable>
      {collapsed
        ? null
        : newestFirst.map((ask) => (
            <AskChatRow key={ask.id} state={state} ask={ask} styles={styles} />
          ))}
    </View>
  );
}

function NavRow({
  icon: Icon,
  label,
  onPress,
  styles,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  styles: Styles;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Icon size={ICON_SIZE} color={theme.fg2} />
      <Text style={styles.navLabel}>{label}</Text>
    </Pressable>
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setCollapsed(toggled(collapsed, id));

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
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.nav}>
          <NavRow
            icon={SquarePen}
            label="New workspace"
            onPress={() => openNewWorkspace()}
            styles={styles}
          />
          <NavRow
            icon={MessageCircleQuestion}
            label="Ask"
            onPress={() => router.push('/ask/new')}
            styles={styles}
          />
        </View>
        <AskChats
          state={state}
          collapsed={collapsed.has(ASK_CHATS_KEY)}
          onToggle={() => toggle(ASK_CHATS_KEY)}
          styles={styles}
        />
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
    fill: { flex: 1 },
    nav: {
      marginBottom: 8,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
    },
    overlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    overline: {
      color: theme.fg4,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    count: { color: theme.fg4, fontFamily: MONO_FONT, fontSize: 11 },
    age: { color: theme.fg4, fontSize: 11, paddingTop: 2 },
    repoToggle: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 8,
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
    repoName: {
      flexShrink: 1,
      color: theme.fg1,
      fontSize: 15,
      fontWeight: '600',
    },
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
