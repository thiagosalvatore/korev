import { router, Stack } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  AppState,
  Repo,
  Workspace,
  WorkspaceRuntime,
  WorkspaceStatus,
} from '../../../korev-desktop/src/shared/model';
import {
  activeWorkspaces,
  repoSections,
} from '../../../korev-desktop/src/shared/workspaces';
import { useAppState } from '../hooks';
import { useKorev } from '../korev';
import { useTheme, type Theme } from '../theme';

const BUSY_STATUSES: ReadonlySet<WorkspaceStatus> = new Set([
  'creating',
  'setting-up',
  'working',
]);

interface RepoGroup {
  repo: Repo;
  data: Workspace[];
}

function repoGroups(state: AppState): RepoGroup[] {
  const workspaces = activeWorkspaces(state);
  return repoSections(state)
    .flatMap((section) => section.repos)
    .map((repo) => ({
      repo,
      data: workspaces.filter((workspace) => workspace.repoId === repo.id),
    }))
    .filter((group) => group.data.length > 0);
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

function WorkspaceRow({
  workspace,
  runtime,
  styles,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime | undefined;
  styles: Styles;
}) {
  const waiting = runtime?.status === 'waiting';
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.row}
      onPress={() =>
        router.push({
          pathname: '/workspace/[id]',
          params: { id: workspace.id },
        })
      }
    >
      <View style={styles.statusSlot}>
        {runtime && BUSY_STATUSES.has(runtime.status) && (
          <ActivityIndicator size="small" />
        )}
      </View>
      <View style={styles.rowText}>
        <Text
          style={[styles.branch, runtime?.unread && styles.unread]}
          numberOfLines={1}
        >
          {workspace.branch}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {workspace.name}
          {runtime?.message ? ` · ${runtime.message}` : ''}
        </Text>
      </View>
      {waiting && <Text style={styles.badge}>Needs input</Text>}
      {(runtime?.unread || waiting) && <View style={styles.dot} />}
    </Pressable>
  );
}

export default function WorkspacesScreen() {
  const state = useAppState();
  const { unpair } = useKorev();
  const theme = useTheme();
  const styles = makeStyles(theme);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => confirmUnpair(unpair)}>
              <Text style={styles.headerAction}>Unpair</Text>
            </Pressable>
          ),
        }}
      />
      {state ? (
        <SectionList
          sections={repoGroups(state)}
          keyExtractor={(workspace) => workspace.id}
          renderSectionHeader={({ section }) => (
            <Text style={styles.section}>{section.repo.name}</Text>
          )}
          renderItem={({ item }) => (
            <WorkspaceRow
              workspace={item}
              runtime={state.runtime[item.id]}
              styles={styles}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No workspaces yet. Create one in Korev on your Mac.
            </Text>
          }
          stickySectionHeadersEnabled={false}
        />
      ) : (
        <ActivityIndicator style={styles.loading} />
      )}
    </>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    loading: { marginTop: 40 },
    headerAction: { color: theme.accentText, fontSize: 16 },
    section: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 6,
      color: theme.fg3,
      fontSize: 13,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
    },
    statusSlot: { width: 20, alignItems: 'center' },
    rowText: { flex: 1, gap: 2 },
    branch: { color: theme.fg1, fontSize: 15 },
    unread: { fontWeight: '700' },
    name: { color: theme.fg3, fontSize: 13 },
    badge: {
      color: theme.warningText,
      fontSize: 12,
      fontWeight: '600',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.accent,
    },
    empty: { padding: 24, color: theme.fg3, textAlign: 'center' },
  });
}
