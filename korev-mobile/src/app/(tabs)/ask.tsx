import { router } from 'expo-router';
import { MessageCircleQuestion } from 'lucide-react-native';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { timeAgo } from '../../../../korev-desktop/src/shared/format';
import type {
  AppState,
  AskChat,
} from '../../../../korev-desktop/src/shared/model';
import { NewAskForm } from '../../ask/NewAskForm';
import { useAppState, useReconnect } from '../../hooks';
import { Loading } from '../../Offline';
import { ListRow, ROW_ICON_SIZE } from '../../ListRow';
import { useTheme, type Theme } from '../../theme';

function repoNames(state: AppState, ask: AskChat): string {
  return ask.repoIds
    .map((id) => state.repos.find((repo) => repo.id === id)?.name)
    .filter(Boolean)
    .join(', ');
}

function openAskChat(ask: AskChat) {
  router.push({ pathname: '/ask/[id]', params: { id: ask.id } });
}

function AskChatRow({ state, ask }: { state: AppState; ask: AskChat }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const running = state.runningSessions.includes(ask.session.id);
  return (
    <ListRow
      accessibilityLabel={`Ask ${ask.session.title}`}
      icon={
        running ? (
          <ActivityIndicator size="small" color={theme.accentText} />
        ) : (
          <MessageCircleQuestion size={ROW_ICON_SIZE} color={theme.fg4} />
        )
      }
      title={ask.session.title}
      subtitle={repoNames(state, ask)}
      end={<Text style={styles.age}>{timeAgo(ask.lastMessageAt)}</Text>}
      onPress={() => openAskChat(ask)}
    />
  );
}

export default function AskChatsScreen() {
  const state = useAppState();
  const styles = makeStyles(useTheme());
  const { refreshing, refresh } = useReconnect();
  if (!state) return <Loading style={styles.loading} />;
  if (!state.askChats.length)
    return <NewAskForm state={state} autoFocus={false} onAsked={openAskChat} />;
  const newestFirst = [...state.askChats].sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt),
  );
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      {newestFirst.map((ask) => (
        <AskChatRow key={ask.id} state={state} ask={ask} />
      ))}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    loading: { marginTop: 40 },
    page: { padding: 8, paddingBottom: 32 },
    age: { color: theme.fg4, fontSize: 11 },
  });
}
