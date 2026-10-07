import { router } from 'expo-router';
import { MessageCircleQuestion } from 'lucide-react-native';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { timeAgo } from '../../../../korev-desktop/src/shared/format';
import type {
  AppState,
  AskChat,
} from '../../../../korev-desktop/src/shared/model';
import { useAppState } from '../../hooks';
import { ListRow, ROW_ICON_SIZE } from '../../ListRow';
import { openNewAsk } from '../../navigation';
import { useTheme, type Theme } from '../../theme';
import { Button } from '../../ui';

function repoNames(state: AppState, ask: AskChat): string {
  return ask.repoIds
    .map((id) => state.repos.find((repo) => repo.id === id)?.name)
    .filter(Boolean)
    .join(', ');
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
      onPress={() =>
        router.push({ pathname: '/ask/[id]', params: { id: ask.id } })
      }
    />
  );
}

export default function AskChatsScreen() {
  const state = useAppState();
  const styles = makeStyles(useTheme());
  if (!state) return <ActivityIndicator style={styles.loading} />;
  if (!state.askChats.length)
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Ask a question about one or more repositories. The agent reads the
          code and changes nothing.
        </Text>
        <Button label="Ask a question" onPress={openNewAsk} />
      </View>
    );
  const newestFirst = [...state.askChats].sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt),
  );
  return (
    <ScrollView contentContainerStyle={styles.page}>
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
    empty: { padding: 24, gap: 16, alignItems: 'center' },
    emptyText: {
      color: theme.fg3,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
    },
  });
}
