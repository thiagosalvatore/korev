import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
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
import { pendingSend, withPendingMessage, type PendingSend } from './pending';
import { PlanReview } from './PermissionCard';
import { WorkingIndicator } from './WorkingIndicator';

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
  const [pending, setPending] = useState<PendingSend | null>(null);
  const running = state.runningSessions.includes(session.id);
  const shown = items && withPendingMessage(items, pending);
  const working = running || shown !== items;
  const lastUser = shown?.findLast((item) => item.kind === 'user');

  const startSending = (text: string) =>
    setPending(
      text && items ? pendingSend(items, text, new Date().toISOString()) : null,
    );

  const respond = (itemId: string, response: PermissionResponse) =>
    attempt('Korev could not send your answer', () =>
      api.respondPermission(session.id, itemId, response),
    );

  const codexPlan = finishedCodexPlan(session, items, running);

  const approvePlan = (lanes: PlanLane[]) =>
    attempt('Korev could not approve the plan', () =>
      api.approvePlan(session.id, lanes),
    );

  const handoff = onHandoff
    ? () =>
        attempt('Korev could not hand off the plan', async () => {
          const result = await api.handoffPlan(session.id);
          if (result.ok) onHandoff(result.value);
          return result;
        })
    : undefined;

  const keepPlanning = (feedback: string) =>
    attempt('Korev could not send your feedback', () =>
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
      {shown ? (
        <FlatList
          inverted
          data={[...shown].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatItemView
              item={item}
              sessionId={session.id}
              running={running}
              onRespond={respond}
              onHandoff={handoff}
            />
          )}
          ListHeaderComponent={
            working ? (
              <WorkingIndicator
                label="Working…"
                since={lastUser && Date.parse(lastUser.at)}
              />
            ) : codexPlan ? (
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
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <ActivityIndicator style={styles.fill} />
      )}
      <Composer
        state={state}
        session={session}
        onSend={startSending}
        onSendFailed={() => setPending(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  transcript: { padding: 12, gap: 12 },
});
