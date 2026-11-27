import { ChevronDown } from 'lucide-react-native';
import { Stack } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import {
  KeyboardChatScrollView,
  KeyboardStickyView,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { duration, modelLabel } from '../../../korev-desktop/src/shared/format';
import {
  AGENT_LABELS,
  answerQuestions,
  finishedTextPlan,
  planAwaitingReview,
  questionAwaitingAnswer,
  type AppState,
  type ChatItem,
  type ChatSession,
  type PermissionResponse,
  type PlanLane,
  type PrStatus,
  picksFor,
  withPick,
  type PickedAnswers,
  type Repo,
} from '../../../korev-desktop/src/shared/model';
import { trackAnswer } from '../answered';
import { attempt } from '../attempt';
import { succeeded, warned } from '../haptics';
import { useRepoGithubUrl, useTranscript } from '../hooks';
import { Loading } from '../Offline';
import { useConnection } from '../korev';
import { useNewerMac } from '../newerMac';
import { useTheme, type Theme } from '../theme';
import { ICON_BUTTON_ICON_SIZE, ICON_BUTTON_SIZE, IconButton } from '../ui';
import { ChatMenu, ChatTitle, type ChatMenuEntry } from './ChatHeader';
import { chatStatus } from './chatStatus';
import { foldActivity, type TranscriptRow } from './activity';
import { ActivityCard } from './ActivityCard';
import { ChatItemView } from './ChatItemView';
import { BAR_PADDING, Composer, useComposerBottomPadding } from './Composer';
import { ExplainerView } from './ExplainerView';
import { pendingSend, withPendingMessage, type PendingSend } from './pending';
import { PlanReview } from './PermissionCard';
import { QueuedMessages } from './QueuedMessages';
import { QuestionPanel } from './QuestionPanel';
import { WorkingIndicator } from './WorkingIndicator';

const FADE_MS = 150;
const FLOATING_CLEARANCE = 68;

export type ChatMode = 'explainer' | 'chat';

function emptyChatHint(state: AppState, session: ChatSession): string {
  const agent = AGENT_LABELS[session.agent];
  const model = modelLabel(state, session);
  return model === agent ? `Message ${agent}` : `Message ${agent} · ${model}`;
}

type UserItem = Extract<ChatItem, { kind: 'user' }>;

function isQueued(item: ChatItem): item is UserItem {
  return item.kind === 'user' && Boolean(item.queued);
}

interface Draft {
  text: string;
  version: number;
}

function finishedLabel(durationMs: number | null): string {
  return durationMs === null
    ? 'Completed'
    : `Completed in ${duration(durationMs)}`;
}

function useKeyboardOffset(): number {
  return useComposerBottomPadding() - BAR_PADDING;
}

function TranscriptScrollView({
  ref,
  ...props
}: ScrollViewProps & { ref?: Ref<Animated.ScrollView> }) {
  return (
    <KeyboardChatScrollView
      ref={ref}
      inverted
      offset={useKeyboardOffset()}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      {...props}
    />
  );
}

function JumpToLatest({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  return (
    <KeyboardStickyView
      offset={{ opened: useKeyboardOffset() }}
      style={styles.jump}
    >
      <Animated.View
        entering={FadeIn.duration(FADE_MS)}
        exiting={FadeOut.duration(FADE_MS)}
        style={styles.jumpButton}
      >
        <IconButton
          label="Jump to latest message"
          icon={<ChevronDown size={ICON_BUTTON_ICON_SIZE} color={theme.fg1} />}
          background={theme.bgRaised}
          onPress={onPress}
        />
      </Animated.View>
    </KeyboardStickyView>
  );
}

function explainerMenuEntry(
  mode: ChatMode,
  onChange: (mode: ChatMode) => void,
): ChatMenuEntry {
  return mode === 'explainer'
    ? {
        label: 'Show chat',
        icon: 'text.bubble',
        onPress: () => onChange('chat'),
      }
    : {
        label: 'Show explanation',
        icon: 'book',
        onPress: () => onChange('explainer'),
      };
}

function FloatingAction({ children }: { children: ReactNode }) {
  const styles = makeStyles(useTheme());
  const keyboardShown = useKeyboardState((keyboard) => keyboard.isVisible);
  if (keyboardShown) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(FADE_MS)}
      exiting={FadeOut.duration(FADE_MS)}
      style={styles.floating}
    >
      {children}
    </Animated.View>
  );
}

export function Chat({
  state,
  session,
  repoId,
  title,
  subtitle,
  pr = null,
  menu = [],
  menuBadge,
  accessory,
  floatingAction,
  laneRepos,
  emptyHint,
  onHandoff,
}: {
  state: AppState;
  session: ChatSession;
  repoId: string | null;
  title: string;
  subtitle?: string;
  pr?: PrStatus | null;
  menu?: ChatMenuEntry[];
  menuBadge?: string;
  accessory?: ReactNode;
  floatingAction?: ReactNode;
  laneRepos?: Repo[];
  emptyHint?: string;
  onHandoff?(sessionId: string): void;
}) {
  const { api } = useConnection();
  const items = useTranscript(session.id);
  const repoUrl = useRepoGithubUrl(repoId);
  const keyboardOffset = useKeyboardOffset();
  const renderScrollView = useCallback(
    (props: ScrollViewProps) => <TranscriptScrollView {...props} />,
    [],
  );
  const styles = makeStyles(useTheme());
  const list = useRef<FlatList<TranscriptRow>>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [scrolledBack, setScrolledBack] = useState(false);
  const [pending, setPending] = useState<PendingSend | null>(null);
  const [mode, setMode] = useState<ChatMode>('explainer');
  const [picked, setPicked] = useState<PickedAnswers | null>(null);
  const [draft, setDraft] = useState<Draft>({ text: '', version: 0 });
  const newerMac = useNewerMac();
  const explaining = Boolean(session.explainer) && mode === 'explainer';
  const running = state.runningSessions.includes(session.id);
  const withPending = items && withPendingMessage(items, pending);
  const delivered = Boolean(pending && items && withPending === items);
  if (delivered) setPending(null);
  const working = running || withPending !== items;
  const queued = newerMac ? (withPending?.filter(isQueued) ?? []) : [];
  const shown = queued.length
    ? withPending?.filter((item) => !isQueued(item))
    : withPending;
  const lastUser = shown?.findLast((item) => item.kind === 'user');
  const lastResult = shown?.findLast((item) => item.kind === 'result');
  const status = chatStatus({
    running: working,
    waiting: Boolean(state.waitingSessions?.includes(session.id)),
    pr,
    finished: lastResult?.ok ? finishedLabel(lastResult.durationMs) : undefined,
  });
  const menuEntries = session.explainer
    ? [explainerMenuEntry(mode, setMode), ...menu]
    : menu;

  const startSending = (text: string) => {
    setMode('chat');
    setPending(
      text && items ? pendingSend(items, text, new Date().toISOString()) : null,
    );
  };

  const respond = (itemId: string, response: PermissionResponse) =>
    trackAnswer(
      session.id,
      { itemId, status: response.allow ? 'allowed' : 'denied' },
      () =>
        attempt('Korev could not send your answer', () =>
          api.respondPermission(session.id, itemId, response),
        ),
    ).then(response.allow ? succeeded : warned);

  const sendQueuedNow = (itemId: string) =>
    void attempt('Korev could not send the message now', () =>
      api.sendQueuedNow(session.id, itemId),
    ).then(succeeded);

  const removeQueued = (itemId: string) =>
    void attempt('Korev could not remove the message', () =>
      api.removeQueued(session.id, itemId),
    );

  const revert = (itemId: string) =>
    void attempt('Korev could not revert the chat', async () => {
      const reverted = await api.revert(session.id, itemId);
      if (reverted.ok)
        setDraft((current) => ({
          text: reverted.value,
          version: current.version + 1,
        }));
      return reverted;
    }).then(succeeded);

  const textPlan = finishedTextPlan(session, items, running);
  const question = questionAwaitingAnswer(items);
  const picks = picksFor(picked, question?.id);

  const trackScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setScrolledBack(event.nativeEvent.contentOffset.y > windowHeight);

  const jumpToLatest = () =>
    list.current?.scrollToOffset({ offset: 0, animated: true });

  const approvePlan = (lanes: PlanLane[]) =>
    trackAnswer(session.id, { itemId: null, status: 'allowed' }, () =>
      attempt('Korev could not approve the plan', () =>
        api.approvePlan(session.id, lanes),
      ),
    ).then(succeeded);

  const handoff = onHandoff
    ? () =>
        attempt('Korev could not hand off the plan', async () => {
          const result = await api.handoffPlan(session.id);
          if (result.ok) onHandoff(result.value);
          return result;
        })
    : undefined;

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <ChatTitle
              title={title}
              subtitle={subtitle}
              status={status}
              since={lastUser && Date.parse(lastUser.at)}
            />
          ),
        }}
      />
      {menuEntries.length ? (
        <ChatMenu entries={menuEntries} badge={menuBadge} />
      ) : null}
      {accessory}
      {explaining ? (
        <ExplainerView
          session={session}
          items={items}
          onShowChat={() => setMode('chat')}
        />
      ) : shown ? (
        <View style={styles.fill}>
          <FlatList
            ref={list}
            inverted
            renderScrollComponent={renderScrollView}
            data={foldActivity(shown).reverse()}
            keyExtractor={(row) =>
              row.kind === 'activity' ? row.id : row.item.id
            }
            renderItem={({ item: row, index }) =>
              row.kind === 'activity' ? (
                <ActivityCard
                  run={row}
                  sessionId={session.id}
                  running={running && index === 0}
                />
              ) : (
                <ChatItemView
                  item={row.item}
                  sessionId={session.id}
                  repoUrl={repoUrl}
                  laneRepos={laneRepos}
                  onRespond={respond}
                  onRevert={
                    newerMac && !running && row.item.kind === 'user'
                      ? () => revert(row.item.id)
                      : undefined
                  }
                  onHandoff={handoff}
                  onOpenExplainer={
                    session.explainer ? () => setMode('explainer') : undefined
                  }
                />
              )
            }
            ListHeaderComponent={
              working ? (
                <WorkingIndicator
                  label="Working…"
                  since={lastUser && Date.parse(lastUser.at)}
                />
              ) : textPlan ? (
                <PlanReview
                  key={textPlan.id}
                  plan={textPlan.plan}
                  showPlan={false}
                  laneRepos={laneRepos}
                  onApprove={approvePlan}
                  onHandoff={handoff}
                />
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.emptyHint} numberOfLines={2}>
                {emptyHint ?? emptyChatHint(state, session)}
              </Text>
            }
            contentContainerStyle={[
              shown.length ? styles.transcript : styles.emptyTranscript,
              floatingAction ? styles.floatingClearance : null,
            ]}
            onScroll={trackScroll}
            scrollEventThrottle={100}
          />
          {scrolledBack ? <JumpToLatest onPress={jumpToLatest} /> : null}
        </View>
      ) : (
        <Loading />
      )}
      <KeyboardStickyView offset={{ opened: keyboardOffset }}>
        {floatingAction ? (
          <FloatingAction>{floatingAction}</FloatingAction>
        ) : null}
        <QueuedMessages
          items={queued}
          onSendNow={sendQueuedNow}
          onRemove={removeQueued}
        />
        {question?.questions ? (
          <QuestionPanel
            key={question.id}
            questions={question.questions}
            picks={picks}
            onPick={(questionText, labels) =>
              setPicked((current) =>
                withPick(current, question.id, questionText, labels),
              )
            }
            onRespond={(response) => respond(question.id, response)}
          />
        ) : null}
        <Composer
          key={draft.version}
          initialText={draft.text}
          state={state}
          session={session}
          context={lastResult?.context ?? null}
          reviewingPlan={Boolean(textPlan) || planAwaitingReview(items)}
          answers={question ? picks : undefined}
          sendReady={Boolean(
            question?.questions && answerQuestions(question.questions, picks),
          )}
          onSend={startSending}
          onSendFailed={() => setPending(null)}
        />
      </KeyboardStickyView>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    transcript: { padding: 12, gap: 12 },
    emptyTranscript: { flexGrow: 1, padding: 24 },
    emptyHint: {
      color: theme.fg3,
      textAlign: 'center',
      transform: [{ scaleY: -1 }],
    },
    jump: { position: 'absolute', right: 12, bottom: 12 },
    floatingClearance: { paddingTop: FLOATING_CLEARANCE },
    floating: {
      position: 'absolute',
      bottom: '100%',
      alignSelf: 'center',
      marginBottom: 12,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
      borderRadius: 12,
    },
    jumpButton: {
      borderRadius: ICON_BUTTON_SIZE / 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
    },
  });
}
