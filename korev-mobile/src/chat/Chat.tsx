import { useHeaderHeight } from 'expo-router/react-navigation';
import { ChevronDown } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
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
  answerQuestions,
  finishedCodexPlan,
  planAwaitingReview,
  questionAwaitingAnswer,
  isSubagentTool,
  type AppState,
  type ChatItem,
  type ChatSession,
  type PermissionResponse,
  type PlanLane,
  picksFor,
  withPick,
  type PickedAnswers,
  type Repo,
} from '../../../korev-desktop/src/shared/model';
import { attempt } from '../attempt';
import { succeeded, warned } from '../haptics';
import { useRepoGithubUrl, useTranscript } from '../hooks';
import { Loading } from '../Offline';
import { useConnection } from '../korev';
import { useTheme, type Theme } from '../theme';
import {
  CHROME_FONT_SCALE,
  ICON_BUTTON_ICON_SIZE,
  ICON_BUTTON_SIZE,
  IconButton,
  touchSlop,
} from '../ui';
import { ChatItemView } from './ChatItemView';
import { Composer } from './Composer';
import { ExplainerView } from './ExplainerView';
import { pendingSend, withPendingMessage, type PendingSend } from './pending';
import { PlanReview } from './PermissionCard';
import { QuestionPanel } from './QuestionPanel';
import { WorkingIndicator } from './WorkingIndicator';

const FADE_MS = 150;
const MODE_HEIGHT = 30;

type ChatMode = 'explainer' | 'chat';

const MODES: { id: ChatMode; label: string }[] = [
  { id: 'explainer', label: 'Explanation' },
  { id: 'chat', label: 'Chat' },
];

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}) {
  const styles = makeStyles(useTheme());
  return (
    <View accessibilityRole="tablist" style={styles.modes}>
      {MODES.map((entry) => (
        <Pressable
          key={entry.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: entry.id === mode }}
          hitSlop={touchSlop(MODE_HEIGHT)}
          style={[styles.mode, entry.id === mode && styles.modeSelected]}
          onPress={() => onChange(entry.id)}
        >
          <Text
            maxFontSizeMultiplier={CHROME_FONT_SCALE}
            style={[
              styles.modeText,
              entry.id === mode && styles.modeTextSelected,
            ]}
          >
            {entry.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

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
  repoId,
  laneRepos,
  emptyHint,
  onHandoff,
}: {
  state: AppState;
  session: ChatSession;
  repoId: string | null;
  laneRepos?: Repo[];
  emptyHint?: string;
  onHandoff?(sessionId: string): void;
}) {
  const { api } = useConnection();
  const items = useTranscript(session.id);
  const repoUrl = useRepoGithubUrl(repoId);
  const headerHeight = useHeaderHeight();
  const styles = makeStyles(useTheme());
  const list = useRef<FlatList<ChatItem>>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [scrolledBack, setScrolledBack] = useState(false);
  const [pending, setPending] = useState<PendingSend | null>(null);
  const [mode, setMode] = useState<ChatMode>('explainer');
  const [picked, setPicked] = useState<PickedAnswers | null>(null);
  const explaining = Boolean(session.explainer) && mode === 'explainer';
  const running = state.runningSessions.includes(session.id);
  const shown = items && withPendingMessage(items, pending);
  const working = running || shown !== items;
  const lastUser = shown?.findLast((item) => item.kind === 'user');

  const startSending = (text: string) => {
    setMode('chat');
    setPending(
      text && items ? pendingSend(items, text, new Date().toISOString()) : null,
    );
  };

  const respond = (itemId: string, response: PermissionResponse) =>
    attempt('Korev could not send your answer', () =>
      api.respondPermission(session.id, itemId, response),
    ).then(response.allow ? succeeded : warned);

  const codexPlan = finishedCodexPlan(session, items, running);
  const question = questionAwaitingAnswer(items);
  const picks = picksFor(picked, question?.id);

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

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      {session.explainer ? <ModeSwitch mode={mode} onChange={setMode} /> : null}
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
            data={shown.filter((item) => !isSubagentTool(item)).reverse()}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ChatItemView
                item={item}
                sessionId={session.id}
                repoUrl={repoUrl}
                running={running}
                laneRepos={laneRepos}
                onRespond={respond}
                onHandoff={handoff}
                onOpenExplainer={
                  session.explainer ? () => setMode('explainer') : undefined
                }
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
        state={state}
        session={session}
        reviewingPlan={Boolean(codexPlan) || planAwaitingReview(items)}
        answers={question ? picks : undefined}
        sendReady={Boolean(
          question?.questions && answerQuestions(question.questions, picks),
        )}
        onSend={startSending}
        onSendFailed={() => setPending(null)}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    modes: {
      flexDirection: 'row',
      alignSelf: 'center',
      gap: 2,
      marginTop: 8,
      padding: 2,
      borderRadius: 8,
      backgroundColor: theme.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border1,
    },
    mode: {
      minHeight: MODE_HEIGHT,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 6,
    },
    modeSelected: { backgroundColor: theme.bgActive },
    modeText: { color: theme.fg3, fontSize: 13, fontWeight: '500' },
    modeTextSelected: { color: theme.fg1 },
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
