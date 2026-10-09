import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import type {
  AppState,
  AskChat,
} from '../../../../korev-desktop/src/shared/model';
import { attempt } from '../../attempt';
import { Chat } from '../../chat/Chat';
import { useAppState } from '../../hooks';
import { Loading } from '../../Offline';
import { useConnection } from '../../korev';
import { useTheme, type Theme } from '../../theme';

function repoNames(state: AppState, ask: AskChat): string {
  return ask.repoIds
    .map((id) => state.repos.find((repo) => repo.id === id)?.name)
    .filter(Boolean)
    .join(', ');
}

export default function AskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useConnection();
  const state = useAppState();
  const theme = useTheme();
  const styles = makeStyles(theme);

  if (!state) return <Loading style={styles.loading} />;
  const ask = state.askChats.find((entry) => entry.id === id);
  if (!ask) return <Text style={styles.empty}>This Ask chat was deleted.</Text>;

  const confirmDelete = () =>
    Alert.alert(`Delete ${ask.session.title}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void attempt('Korev could not delete the chat', () =>
            api.deleteAskChat(ask.id),
          ).then((deleted) => deleted && router.back()),
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: ask.session.title,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete this Ask chat"
              hitSlop={8}
              onPress={confirmDelete}
            >
              <Trash2 size={20} color={theme.fg2} />
            </Pressable>
          ),
        }}
      />
      <Text style={styles.repos} numberOfLines={1}>
        {repoNames(state, ask)}
      </Text>
      <Chat state={state} session={ask.session} />
    </>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    loading: { marginTop: 40 },
    empty: { padding: 24, color: theme.fg3, textAlign: 'center' },
    repos: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      color: theme.fg3,
      fontSize: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
    },
  });
}
