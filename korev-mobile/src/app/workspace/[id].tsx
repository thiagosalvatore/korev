import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  hasWorktree,
  type AppState,
  type ChatSession,
  type Workspace,
} from '../../../../korev-desktop/src/shared/model';
import {
  crossRepoLead,
  groupRepoName,
  laneRepos,
  waitsForLane,
  workspaceLabel,
} from '../../../../korev-desktop/src/shared/workspaces';
import { attempt } from '../../attempt';
import { Chat } from '../../chat/Chat';
import { RunDecisions } from '../../chat/RunDecisions';
import { useAppState, usePendingAction } from '../../hooks';
import { Loading } from '../../Offline';
import { useConnection } from '../../korev';
import { PickerButton, type PickerOption } from '../../PickerSheet';
import { PrBar } from '../../PrBar';
import { useTheme, type Theme } from '../../theme';
import { CHROME_FONT_SCALE, MIN_TOUCH_TARGET, touchSlop } from '../../ui';
import { WorktreePending } from '../../WorktreePending';

type Styles = ReturnType<typeof makeStyles>;

const NEW_CHAT_HEIGHT = 32;
const NEEDS_YOU = 'Needs you';

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

function workspaceTitle(state: AppState, workspace: Workspace): string {
  const repo = groupRepoName(state, workspace);
  const label = workspaceLabel(workspace);
  return repo ? `${repo} · ${label}` : label;
}

function waitingHint(state: AppState, workspace: Workspace) {
  const lead = waitsForLane(state, workspace)
    ? crossRepoLead(state, workspace)
    : null;
  if (!lead) return undefined;
  return `This workspace's agent starts when you approve the plan in ${groupRepoName(state, lead)}.`;
}

function SessionBar({
  state,
  workspace,
  selected,
  onSelect,
  styles,
}: {
  state: AppState;
  workspace: Workspace;
  selected: ChatSession | undefined;
  onSelect: (sessionId: string) => void;
  styles: Styles;
}) {
  const { api } = useConnection();
  const theme = useTheme();
  const { pending, run } = usePendingAction();
  const creating = pending !== null;
  const waiting = waitingSessionIds(state);
  const otherChatWaits = workspace.sessions.some(
    (session) => session.id !== selected?.id && waiting.has(session.id),
  );

  function sessionIcon(sessionId: string) {
    if (state.runningSessions.includes(sessionId))
      return <ActivityIndicator size="small" color={theme.accentText} />;
    if (waiting.has(sessionId)) return <View style={styles.waitingDot} />;
    return undefined;
  }

  const options: PickerOption[] = workspace.sessions.map((session) => ({
    key: session.id,
    label: session.title,
    detail: waiting.has(session.id) ? NEEDS_YOU : undefined,
    icon: sessionIcon(session.id),
    selected: session.id === selected?.id,
  }));

  async function newChat() {
    const session = await api.newSession(
      workspace.id,
      state.settings.defaultAgent,
    );
    onSelect(session.id);
  }

  return (
    <View style={styles.sessionBar}>
      {selected ? (
        <PickerButton
          label="Chats"
          value={selected.title}
          title="Chats"
          options={options}
          onSelect={onSelect}
        />
      ) : null}
      {otherChatWaits ? (
        <View
          accessibilityLabel="Another chat needs you"
          style={styles.waitingDot}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: creating }}
        disabled={creating}
        hitSlop={touchSlop(NEW_CHAT_HEIGHT)}
        style={styles.newChat}
        onPress={() =>
          void run('new-chat', () =>
            attempt('Korev could not start a chat', newChat),
          )
        }
      >
        {creating ? (
          <ActivityIndicator size="small" color={theme.accentText} />
        ) : null}
        <Text
          maxFontSizeMultiplier={CHROME_FONT_SCALE}
          style={styles.newChatText}
        >
          + New chat
        </Text>
      </Pressable>
    </View>
  );
}

export default function WorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useAppState();
  const styles = makeStyles(useTheme());
  const [selectedId, setSelectedId] = useState<string>();
  const workspace = state?.workspaces.find((entry) => entry.id === id);
  const runtime = workspace && state?.runtime[workspace.id];
  const archiving = !!workspace?.archivedAt || runtime?.status === 'archiving';
  useEffect(() => {
    if (archiving) router.dismissTo('/');
  }, [archiving]);

  if (!state) return <Loading style={styles.fill} />;
  if (!workspace)
    return <Text style={styles.empty}>This workspace no longer exists.</Text>;
  if (runtime && !hasWorktree(runtime))
    return (
      <>
        <Stack.Screen options={{ title: workspaceTitle(state, workspace) }} />
        <WorktreePending workspace={workspace} runtime={runtime} />
      </>
    );
  const session =
    workspace.sessions.find((entry) => entry.id === selectedId) ??
    defaultSession(state, workspace);
  if (session && session.id !== selectedId) setSelectedId(session.id);
  const coordinatedRun = state.runs?.findLast((run) =>
    workspace.sessions.some((entry) => entry.id === run.coordinatorSessionId),
  );

  return (
    <>
      <Stack.Screen options={{ title: workspaceTitle(state, workspace) }} />
      <PrBar
        workspace={workspace}
        runtime={runtime}
        sessionId={session?.id}
        onExplained={setSelectedId}
      />
      {coordinatedRun ? <RunDecisions run={coordinatedRun} /> : null}
      <SessionBar
        state={state}
        workspace={workspace}
        selected={session}
        onSelect={setSelectedId}
        styles={styles}
      />
      {session ? (
        <Chat
          key={session.id}
          state={state}
          session={session}
          repoId={workspace.repoId}
          laneRepos={laneRepos(state, workspace)}
          emptyHint={waitingHint(state, workspace)}
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
    sessionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
    },
    newChat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: NEW_CHAT_HEIGHT,
      marginLeft: 'auto',
      paddingHorizontal: 10,
      borderRadius: 6,
    },
    newChatText: { color: theme.fg2, fontSize: 13 },
    waitingDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.warning,
    },
  });
}
