import { ListChecks, X } from 'lucide-react-native';
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
import { planFileName } from '../../../korev-desktop/src/shared/message';
import { attempt } from '../attempt';
import { useConnection } from '../korev';
import { ModelPicker } from '../ModelPicker';
import { useTheme, type Theme } from '../theme';
import { Button } from '../ui';
import { PlanChip } from './PlanChip';

export function Composer({
  state,
  session,
}: {
  state: AppState;
  session: ChatSession;
}) {
  const { api } = useConnection();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const running = state.runningSessions.includes(session.id);
  const { pendingPlan } = session;
  const canSend = Boolean(text.trim() || pendingPlan);

  async function send() {
    const message = text.trim();
    if (!canSend) return;
    setText('');
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
    if (!sent) setText(message);
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

  return (
    <View
      style={[
        styles.composer,
        session.planMode && styles.planMode,
        { marginBottom: insets.bottom + 8 },
      ]}
    >
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
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder(running, Boolean(pendingPlan))}
        placeholderTextColor={theme.fg4}
        multiline
      />
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: session.planMode }}
          onPress={togglePlanMode}
        >
          <Text style={session.planMode ? styles.planOn : styles.meta}>
            Plan
          </Text>
        </Pressable>
        <View style={styles.model}>
          <ModelPicker
            state={state}
            agent={session.agent}
            model={session.model}
            onChange={changeModel}
          />
        </View>
        {running ? (
          <Button label="Stop" variant="secondary" onPress={stop} />
        ) : null}
        <Button label="Send" disabled={!canSend} onPress={() => void send()} />
      </View>
    </View>
  );
}

function placeholder(running: boolean, hasPendingPlan: boolean): string {
  if (hasPendingPlan) return PENDING_PLAN_PLACEHOLDER;
  return running ? 'Steer the agent or queue a message' : 'Ask';
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    composer: {
      marginHorizontal: 12,
      padding: 10,
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border2,
      backgroundColor: theme.bgSurface,
    },
    planMode: { borderColor: theme.accent, borderStyle: 'dashed' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
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
    input: { maxHeight: 160, color: theme.fg1, fontSize: 15 },
    toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    meta: { color: theme.fg3, fontSize: 13 },
    planOn: { color: theme.accentText, fontSize: 13, fontWeight: '600' },
    model: { flex: 1 },
  });
}
