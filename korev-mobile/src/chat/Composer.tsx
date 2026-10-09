import { File } from 'expo-file-system';
import { ArrowUp, Paperclip, Square } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatAttachments } from '../../../korev-desktop/src/shared/message';
import {
  PENDING_PLAN_PLACEHOLDER,
  STOP_BEFORE_SWITCHING,
  type AppState,
  type ChatSession,
  type ModelChoice,
} from '../../../korev-desktop/src/shared/model';
import { insertDictation } from '../../../korev-desktop/src/shared/dictation';
import { attempt } from '../attempt';
import { MicButton, RecordingBar } from '../VoiceInput';
import { useDictation } from '../dictation';
import { useKeyboardShown, usePendingAction } from '../hooks';
import { useConnection } from '../korev';
import { useTheme, type Theme } from '../theme';
import { ICON_BUTTON_ICON_SIZE, IconButton } from '../ui';
import { composerAction } from './composerAction';
import { COMPOSER_ROW_GAP, ComposerChips } from './ComposerChips';
import { ComposerOptions, type SessionPatch } from './ComposerOptions';
import { pickAttachments, type PickedFile } from './pickAttachments';

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
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const running = state.runningSessions.includes(session.id);
  const { pendingPlan } = session;
  const workspaceId =
    state.workspaces.find((workspace) =>
      workspace.sessions.some((entry) => entry.id === session.id),
    )?.id ?? null;
  const dictation = useDictation((spoken) =>
    setText((current) => insertDictation(current, current.length, spoken).text),
  );
  const dictating = dictation.phase !== 'idle';
  const sending = usePendingAction();
  const canSend =
    Boolean(text.trim() || pendingPlan || attachments.length) &&
    !dictating &&
    !uploading &&
    sending.pending === null;
  const action = composerAction({
    canSend,
    running,
    dictating,
    voice: Boolean(state.dictation),
  });

  async function send() {
    if (!canSend) return;
    const typed = text.trim();
    const attached = attachments;
    const message = typed + formatAttachments(attached);
    setText('');
    setAttachments([]);
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
    setText(typed);
    setAttachments(attached);
  }

  async function upload(file: PickedFile) {
    await attempt(`Korev could not attach ${file.name}`, async () => {
      const saved = await api.saveAttachment(
        workspaceId,
        file.name,
        await new File(file.uri).base64(),
      );
      if (saved.ok) setAttachments((current) => [...current, saved.value]);
      return saved;
    });
    setUploading((count) => count - 1);
  }

  async function attach() {
    const picked = await pickAttachments();
    setUploading((count) => count + picked.length);
    for (const file of picked) await upload(file);
  }

  const updateSession = (patch: SessionPatch) =>
    void attempt('Korev could not change the chat settings', () =>
      api.updateSession(session.id, patch),
    );

  function changeModel(choice: ModelChoice) {
    if (choice.agent !== session.agent && running)
      return Alert.alert(STOP_BEFORE_SWITCHING);
    updateSession({ agent: choice.agent, model: choice.id });
  }

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
        onPress={() => void sending.run('send', send)}
      />
    );
  }

  return (
    <View style={[styles.composer, { paddingBottom: bottomPadding }]}>
      <ComposerChips
        pendingPlan={pendingPlan}
        planMode={session.planMode}
        attachments={attachments}
        uploading={uploading}
        onDiscardPlan={() => updateSession({ pendingPlan: null })}
        onTurnOffPlanMode={() => updateSession({ planMode: false })}
        onRemoveAttachment={(file) =>
          setAttachments((current) => current.filter((entry) => entry !== file))
        }
      />
      <View style={styles.row}>
        <ComposerOptions
          state={state}
          session={session}
          onUpdate={updateSession}
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
            <RecordingBar dictation={dictation} style={styles.fill} />
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={placeholder(running, Boolean(pendingPlan))}
                placeholderTextColor={theme.fg4}
                multiline
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Attach a photo or file"
                hitSlop={8}
                style={styles.attach}
                onPress={() => void attach()}
              >
                <Paperclip size={ICON_BUTTON_ICON_SIZE} color={theme.fg3} />
              </Pressable>
            </>
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
    row: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: COMPOSER_ROW_GAP,
    },
    pill: {
      flex: 1,
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingLeft: 14,
      paddingRight: 10,
      paddingVertical: 7,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border2,
      backgroundColor: theme.bgApp,
    },
    pillRecording: { paddingVertical: 1 },
    planMode: { borderColor: theme.accent, borderStyle: 'dashed' },
    fill: { flex: 1 },
    attach: { paddingBottom: 1 },
    input: {
      flex: 1,
      maxHeight: 140,
      padding: 0,
      color: theme.fg1,
      fontSize: 15,
      lineHeight: 20,
    },
  });
}
