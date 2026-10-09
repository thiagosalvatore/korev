import { ArrowUp, ListChecks, Square, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PENDING_PLAN_PLACEHOLDER,
  STOP_BEFORE_SWITCHING,
  type AppState,
  type ChatSession,
  type ModelChoice,
} from '../../../korev-desktop/src/shared/model';
import { insertDictation } from '../../../korev-desktop/src/shared/dictation';
import { planFileName } from '../../../korev-desktop/src/shared/message';
import { attempt } from '../attempt';
import { MicButton, RecordingBar } from '../VoiceInput';
import { useDictation } from '../dictation';
import { useKeyboardShown } from '../hooks';
import { useConnection } from '../korev';
import { useTheme, type Theme } from '../theme';
import { ICON_BUTTON_ICON_SIZE, IconButton } from '../ui';
import { composerAction } from './composerAction';
import { ComposerOptions } from './ComposerOptions';
import { PlanChip } from './PlanChip';

const BAR_PADDING = 8;

export function Composer({
  state,
  session,
  onSend,
  onSendFailed,
}: {
  state: AppState;
  session: ChatSession;
  onSend(text: string): void;
  onSendFailed(): void;
}) {
  const { api } = useConnection();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardShown();
  const bottomPadding = keyboardShown
    ? BAR_PADDING
    : Math.max(insets.bottom, BAR_PADDING);
  const [text, setText] = useState('');
  const running = state.runningSessions.includes(session.id);
  const { pendingPlan } = session;
  const dictation = useDictation((spoken) =>
    setText((current) => insertDictation(current, current.length, spoken).text),
  );
  const dictating = dictation.phase !== 'idle';
  const canSend = Boolean(text.trim() || pendingPlan) && !dictating;
  const action = composerAction({
    canSend,
    running,
    dictating,
    voice: Boolean(state.dictation),
  });

  async function send() {
    const message = text.trim();
    if (!canSend) return;
    setText('');
    onSend(message);
    const sent = await attempt('Korev could not send the message', () =>
      api.send(session.id, {
        text: message,
        agent: session.agent,
        model: session.model,
        effort: session.effort,
        planMode: session.planMode,
        fast: session.fast,
      }),
    );
    if (sent) return;
    onSendFailed();
    setText(message);
  }

  const togglePlanMode = () =>
    void attempt('Korev could not switch plan mode', () =>
      api.updateSession(session.id, { planMode: !session.planMode }),
    );

  function changeModel(choice: ModelChoice) {
    if (choice.agent !== session.agent && running)
      return Alert.alert(STOP_BEFORE_SWITCHING);
    void attempt('Korev could not switch the model', () =>
      api.updateSession(session.id, { agent: choice.agent, model: choice.id }),
    );
  }

  const discardPendingPlan = () =>
    void attempt('Korev could not remove the plan', () =>
      api.updateSession(session.id, { pendingPlan: null }),
    );

  const stop = () =>
    void attempt('Korev could not stop the agent', () => api.stop(session.id));

  function actionButton() {
    if (action === 'mic')
      return <MicButton status={state.dictation} dictation={dictation} />;
    if (action === 'stop')
      return (
        <IconButton
          label="Stop the agent"
          icon={
            <Square
              size={ICON_BUTTON_ICON_SIZE / 2}
              color={theme.bgApp}
              fill={theme.bgApp}
            />
          }
          background={theme.fg1}
          onPress={stop}
        />
      );
    return (
      <IconButton
        label="Send"
        icon={<ArrowUp size={ICON_BUTTON_ICON_SIZE} color={theme.fgOnAccent} />}
        background={theme.accent}
        disabled={!canSend}
        onPress={() => void send()}
      />
    );
  }

  return (
    <View style={[styles.composer, { paddingBottom: bottomPadding }]}>
      {pendingPlan || session.planMode ? (
        <View style={styles.chips}>
          {pendingPlan ? (
            <View style={styles.chip}>
              <PlanChip
                name={planFileName(pendingPlan.plan)}
                markdown={pendingPlan.plan}
                style={styles.chipPreview}
              >
                <ListChecks size={14} color={theme.accentText} />
                <Text style={styles.chipLabel} numberOfLines={1}>
                  Plan · {pendingPlan.from}
                </Text>
              </PlanChip>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove the handed-off plan"
                hitSlop={8}
                onPress={discardPendingPlan}
              >
                <X size={14} color={theme.accentText} />
              </Pressable>
            </View>
          ) : null}
          {session.planMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Turn off plan mode"
              hitSlop={8}
              style={styles.chip}
              onPress={togglePlanMode}
            >
              <Text style={styles.chipLabel}>Plan mode</Text>
              <X size={14} color={theme.accentText} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={styles.row}>
        <ComposerOptions
          state={state}
          session={session}
          onTogglePlanMode={togglePlanMode}
          onChangeModel={changeModel}
        />
        <View
          style={[
            styles.pill,
            dictating && styles.pillRecording,
            session.planMode && styles.planMode,
          ]}
        >
          {dictating ? (
            <RecordingBar dictation={dictation} />
          ) : (
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={placeholder(running, Boolean(pendingPlan))}
              placeholderTextColor={theme.fg4}
              multiline
            />
          )}
        </View>
        {actionButton()}
      </View>
    </View>
  );
}

function placeholder(running: boolean, hasPendingPlan: boolean): string {
  if (hasPendingPlan) return PENDING_PLAN_PLACEHOLDER;
  return running ? 'Steer or queue a message' : 'Message';
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    composer: {
      gap: 6,
      paddingTop: BAR_PADDING,
      paddingHorizontal: BAR_PADDING,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border1,
      backgroundColor: theme.bgSurface,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 44 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: theme.accentSubtle,
    },
    chipPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      gap: 6,
    },
    chipLabel: { flexShrink: 1, color: theme.accentText, fontSize: 13 },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    pill: {
      flex: 1,
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border2,
      backgroundColor: theme.bgApp,
    },
    pillRecording: { paddingVertical: 1 },
    planMode: { borderColor: theme.accent, borderStyle: 'dashed' },
    input: {
      maxHeight: 140,
      padding: 0,
      color: theme.fg1,
      fontSize: 15,
      lineHeight: 20,
    },
  });
}
