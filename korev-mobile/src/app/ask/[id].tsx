import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, Text } from 'react-native';
import type {
  AppState,
  AskChat,
} from '../../../../korev-desktop/src/shared/model';
import { attempt } from '../../attempt';
import { Chat } from '../../chat/Chat';
import { Capsule, ChatAccessory } from '../../chat/ChatHeader';
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
  const styles = makeStyles(useTheme());

  if (!state) return <Loading />;
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

  const repos = repoNames(state, ask);
  return (
    <Chat
      state={state}
      session={ask.session}
      repoId={ask.repoIds[0] ?? null}
      title={ask.session.title}
      menu={[
        {
          label: 'Delete chat',
          icon: 'trash',
          destructive: true,
          onPress: confirmDelete,
        },
      ]}
      accessory={
        repos ? (
          <ChatAccessory>
            <Capsule label={repos} />
          </ChatAccessory>
        ) : null
      }
    />
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    empty: { padding: 24, color: theme.fg3, textAlign: 'center' },
  });
}
