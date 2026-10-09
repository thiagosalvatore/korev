import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  hasWorktree,
  type AppState,
  type Workspace,
} from '../../../../korev-desktop/src/shared/model';
import { attempt } from '../../attempt';
import { Chat } from '../../chat/Chat';
import { useAppState, usePendingAction } from '../../hooks';
import { useConnection } from '../../korev';
import { PrBar } from '../../PrBar';
import { useTheme, type Theme } from '../../theme';
import { WorktreePending } from '../../WorktreePending';

type Styles = ReturnType<typeof makeStyles>;

function waitingSessionIds(state: AppState): ReadonlySet<string> {
  return new Set(state.waitingSessions ?? []);
}

function defaultSession(state: AppState, workspace: Workspace) {
  const waiting = waitingSessionIds(state);
  return (
    workspace.sessions.find((entry) => waiting.has(entry.id)) ??
    workspace.sessions.at(-1)
  );
}

function SessionTabs({
  state,
  workspace,
  selectedId,
  onSelect,
  styles,
}: {
  state: AppState;
  workspace: Workspace;
  selectedId: string | undefined;
  onSelect: (sessionId: string) => void;
  styles: Styles;
}) {
  const { api } = useConnection();
  const theme = useTheme();
  const { pending, run } = usePendingAction();
  const creating = pending !== null;
  const waiting = waitingSessionIds(state);

  async function newChat() {
    const session = await api.newSession(
      workspace.id,
      state.settings.defaultAgent,
    );
    onSelect(session.id);
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabsBar}
      contentContainerStyle={styles.tabs}
    >
      {workspace.sessions.map((session) => (
        <Pressable
          key={session.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: session.id === selectedId }}
          accessibilityHint={
            waiting.has(session.id) ? 'Needs your input' : undefined
          }
          style={[styles.tab, session.id === selectedId && styles.tabSelected]}
          onPress={() => onSelect(session.id)}
        >
          {state.runningSessions.includes(session.id) ? (
            <ActivityIndicator size="small" color={theme.accentText} />
          ) : null}
          {waiting.has(session.id) ? <View style={styles.waitingDot} /> : null}
          <Text style={styles.tabText} numberOfLines={1}>
            {session.title}
          </Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: creating }}
        disabled={creating}
        style={styles.tab}
        onPress={() =>
          void run('new-chat', () =>
            attempt('Korev could not start a chat', newChat),
          )
        }
      >
        {creating ? (
          <ActivityIndicator size="small" color={theme.accentText} />
        ) : null}
        <Text style={styles.tabText}>+ New chat</Text>
      </Pressable>
    </ScrollView>
  );
}

export default function WorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useAppState();
  const styles = makeStyles(useTheme());
  const [selectedId, setSelectedId] = useState<string>();

  if (!state) return <ActivityIndicator style={styles.fill} />;
  const workspace = state.workspaces.find((entry) => entry.id === id);
  if (!workspace)
    return <Text style={styles.empty}>This workspace no longer exists.</Text>;
  const runtime = state.runtime[workspace.id];
  if (runtime && !hasWorktree(runtime))
    return (
      <>
        <Stack.Screen options={{ title: workspace.name }} />
        <WorktreePending workspace={workspace} runtime={runtime} />
      </>
    );
  const session =
    workspace.sessions.find((entry) => entry.id === selectedId) ??
    defaultSession(state, workspace);
  if (session && session.id !== selectedId) setSelectedId(session.id);

  return (
    <>
      <Stack.Screen options={{ title: workspace.name }} />
      <PrBar workspace={workspace} runtime={runtime} sessionId={session?.id} />
      <SessionTabs
        state={state}
        workspace={workspace}
        selectedId={session?.id}
        onSelect={setSelectedId}
        styles={styles}
      />
      {session ? (
        <Chat
          key={session.id}
          state={state}
          session={session}
          onHandoff={setSelectedId}
        />
      ) : (
        <Text style={styles.empty}>This workspace has no chats.</Text>
      )}
    </>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    empty: { padding: 24, color: theme.fg3, textAlign: 'center' },
    tabsBar: {
      flexGrow: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
    },
    tabs: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 32,
      maxWidth: 180,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
    },
    tabSelected: { backgroundColor: theme.bgActive },
    tabText: { flexShrink: 1, color: theme.fg2, fontSize: 13 },
    waitingDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.warning,
    },
  });
}
