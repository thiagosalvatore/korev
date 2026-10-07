import { useHeaderHeight } from 'expo-router/react-navigation';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import {
  finishedCodexPlan,
  type AppState,
  type ChatSession,
  type PermissionResponse,
  type PlanLane,
} from '../../../korev-desktop/src/shared/model';
import { attempt } from '../attempt';
import { useTranscript } from '../hooks';
import { useConnection } from '../korev';
import { ChatItemView } from './ChatItemView';
import { Composer } from './Composer';
import { PlanReview } from './PermissionCard';

export function Chat({
  state,
  session,
  onHandoff,
}: {
  state: AppState;
  session: ChatSession;
  onHandoff?(sessionId: string): void;
}) {
  const { api } = useConnection();
  const items = useTranscript(session.id);
  const headerHeight = useHeaderHeight();

  const respond = (itemId: string, response: PermissionResponse) =>
    void attempt('Korev could not send your answer', () =>
      api.respondPermission(session.id, itemId, response),
    );

  const codexPlan = finishedCodexPlan(
    session,
    items,
    state.runningSessions.includes(session.id),
  );

  const approvePlan = (lanes: PlanLane[]) =>
    void attempt('Korev could not approve the plan', () =>
      api.approvePlan(session.id, lanes),
    );

  const handoff = onHandoff
    ? () =>
        void attempt('Korev could not hand off the plan', async () => {
          const result = await api.handoffPlan(session.id);
          if (result.ok) onHandoff(result.value);
          return result;
        })
    : undefined;

  const keepPlanning = (feedback: string) =>
    void attempt('Korev could not send your feedback', () =>
      api.send(session.id, {
        text: feedback,
        agent: session.agent,
        model: session.model,
        effort: session.effort,
        planMode: true,
        fast: session.fast,
      }),
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
            <ChatItemView item={item} onRespond={respond} onHandoff={handoff} />
          )}
          ListHeaderComponent={
            codexPlan ? (
              <PlanReview
                key={codexPlan.id}
                plan={codexPlan.plan}
                showPlan={false}
                onApprove={approvePlan}
                onKeepPlanning={keepPlanning}
                onHandoff={handoff}
              />
            ) : null
          }
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
