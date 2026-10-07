import { useHeaderHeight } from 'expo-router/react-navigation';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import type {
  AppState,
  ChatSession,
  PermissionResponse,
} from '../../../korev-desktop/src/shared/model';
import { attempt } from '../attempt';
import { useTranscript } from '../hooks';
import { useConnection } from '../korev';
import { ChatItemView } from './ChatItemView';
import { Composer } from './Composer';

export function Chat({
  state,
  session,
}: {
  state: AppState;
  session: ChatSession;
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
      <Composer state={state} session={session} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  transcript: { padding: 12, gap: 12 },
});
