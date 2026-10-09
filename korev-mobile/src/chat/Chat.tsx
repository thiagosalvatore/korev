import { useHeaderHeight } from 'expo-router/react-navigation';
import { ChevronDown } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { modelLabel } from '../../../korev-desktop/src/shared/format';
import {
  AGENT_LABELS,
  finishedCodexPlan,
  type AppState,
  type ChatItem,
  type ChatSession,
  type PermissionResponse,
  type PlanLane,
} from '../../../korev-desktop/src/shared/model';
import { attempt } from '../attempt';
import { succeeded, warned } from '../haptics';
import { useTranscript } from '../hooks';
import { Loading } from '../Offline';
import { useConnection } from '../korev';
import { useTheme, type Theme } from '../theme';
import { ICON_BUTTON_ICON_SIZE, ICON_BUTTON_SIZE, IconButton } from '../ui';
import { ChatItemView } from './ChatItemView';
import { Composer } from './Composer';
import { pendingSend, withPendingMessage, type PendingSend } from './pending';
import { PlanReview } from './PermissionCard';
import { WorkingIndicator } from './WorkingIndicator';

const FADE_MS = 150;

function emptyChatHint(state: AppState, session: ChatSession): string {
  const agent = AGENT_LABELS[session.agent];
  const model = modelLabel(state, session);
  return model === agent ? `Message ${agent}` : `Message ${agent} · ${model}`;
}

function JumpToLatest({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  return (
    <Animated.View
      entering={FadeIn.duration(FADE_MS)}
      exiting={FadeOut.duration(FADE_MS)}
      style={styles.jump}
    >
      <IconButton
        label="Jump to latest message"
        icon={<ChevronDown size={ICON_BUTTON_ICON_SIZE} color={theme.fg1} />}
        background={theme.bgRaised}
        onPress={onPress}
      />
    </Animated.View>
  );
}

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
  const styles = makeStyles(useTheme());
  const list = useRef<FlatList<ChatItem>>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [scrolledBack, setScrolledBack] = useState(false);
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
    ).then(response.allow ? succeeded : warned);

  const codexPlan = finishedCodexPlan(session, items, running);

  const trackScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setScrolledBack(event.nativeEvent.contentOffset.y > windowHeight);

  const jumpToLatest = () =>
    list.current?.scrollToOffset({ offset: 0, animated: true });

  const approvePlan = (lanes: PlanLane[]) =>
    attempt('Korev could not approve the plan', () =>
      api.approvePlan(session.id, lanes),
    ).then(succeeded);

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
        <View style={styles.fill}>
          <FlatList
            ref={list}
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
            ListEmptyComponent={
              <Text style={styles.emptyHint} numberOfLines={2}>
                {emptyChatHint(state, session)}
              </Text>
            }
            contentContainerStyle={
              shown.length ? styles.transcript : styles.emptyTranscript
            }
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={trackScroll}
            scrollEventThrottle={100}
          />
          {scrolledBack ? <JumpToLatest onPress={jumpToLatest} /> : null}
        </View>
      ) : (
        <Loading style={styles.fill} />
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

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    transcript: { padding: 12, gap: 12 },
    emptyTranscript: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    emptyHint: {
      color: theme.fg3,
      textAlign: 'center',
      transform: [{ scaleY: -1 }],
    },
    jump: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      borderRadius: ICON_BUTTON_SIZE / 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
    },
  });
}
