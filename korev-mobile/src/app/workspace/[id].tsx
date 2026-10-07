import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { modelLabel } from '../../../../korev-desktop/src/shared/format';
import type {
  AppState,
  ChatSession,
  PermissionResponse,
  Workspace,
} from '../../../../korev-desktop/src/shared/model';
import { attempt } from '../../attempt';
import { ChatItemView } from '../../chat/ChatItemView';
import { Composer } from '../../chat/Composer';
import { useAppState, useTranscript } from '../../hooks';
import { useConnection } from '../../korev';
import { useTheme, type Theme } from '../../theme';

type Styles = ReturnType<typeof makeStyles>;

function Chat({
  state,
  session,
  styles,
}: {
  state: AppState;
  session: ChatSession;
  styles: Styles;
}) {
  const { api } = useConnection();
  const items = useTranscript(session.id);
  const headerHeight = useHeaderHeight();

  const respond = (itemId: string, response: PermissionResponse) =>
    void attempt('Korev could not send your answer', () =>
      api.respondPermission(session.id, itemId, response),
    );

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      {items ? (
        <FlatList
          inverted
          data={[...items].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatItemView item={item} onRespond={respond} />
          )}
          contentContainerStyle={styles.transcript}
          keyboardDismissMode="interactive"
        />
      ) : (
        <ActivityIndicator style={styles.fill} />
      )}
      <Composer
        session={session}
        running={state.runningSessions.includes(session.id)}
        modelLabel={modelLabel(state, session)}
      />
    </KeyboardAvoidingView>
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
          style={[styles.tab, session.id === selectedId && styles.tabSelected]}
          onPress={() => onSelect(session.id)}
        >
          <Text style={styles.tabText} numberOfLines={1}>
            {session.title}
          </Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        style={styles.tab}
        onPress={() =>
          void attempt('Korev could not start a chat', () => newChat())
        }
      >
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
  const session =
    workspace.sessions.find((entry) => entry.id === selectedId) ??
    workspace.sessions.at(-1);

  return (
    <>
      <Stack.Screen options={{ title: workspace.branch }} />
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
          styles={styles}
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
    transcript: { padding: 12, gap: 12 },
    tabsBar: {
      flexGrow: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
    },
    tabs: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
    tab: {
      maxWidth: 180,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
    },
    tabSelected: { backgroundColor: theme.bgActive },
    tabText: { color: theme.fg2, fontSize: 13 },
  });
}
