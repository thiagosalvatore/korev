import { File } from 'expo-file-system';
import { ArrowUp, Plus, Slash, Square } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatAttachments } from '../../../korev-desktop/src/shared/message';
import {
  PENDING_PLAN_PLACEHOLDER,
  PLAN_FEEDBACK_PLACEHOLDER,
  QUESTION_REPLY_PLACEHOLDER,
  type QuestionPicks,
  type AppState,
  type ChatSession,
  type ContextUsage,
} from '../../../korev-desktop/src/shared/model';
import { insertDictation } from '../../../korev-desktop/src/shared/dictation';
import { attempt } from '../attempt';
import { succeeded } from '../haptics';
import { MicButton, RecordingBar } from '../VoiceInput';
import { useDictation } from '../dictation';
import { usePendingAction } from '../hooks';
import { useConnection } from '../korev';
import { TYPE, useTheme, type Theme } from '../theme';
import {
  CHROME_FONT_SCALE,
  ICON_BUTTON_ICON_SIZE,
  IconButton,
  MIN_TOUCH_TARGET,
  touchSlop,
} from '../ui';
import { composerAction } from './composerAction';
import { ComposerChips } from './ComposerChips';
import { ComposerToolbar } from './ComposerToolbar';
import { pickAttachments, type PickedFile } from './pickAttachments';
import { useSessionUpdate } from './sessionUpdate';
import { slashSuggestions } from './slashCommands';

export const BAR_PADDING = 8;
const SLASH_SIZE = 22;
const SLASH_ICON_SIZE = 16;
const SUGGESTIONS_MAX_HEIGHT = 200;

export function Composer({
  state,
  session,
  reviewingPlan,
  answers,
  context,
  initialText = '',
  sendReady = false,
  onSend,
  onSendFailed,
}: {
  state: AppState;
  session: ChatSession;
  context: ContextUsage | null;
  initialText?: string;
  reviewingPlan: boolean;
  answers?: QuestionPicks;
  sendReady?: boolean;
  onSend(text: string): void;
  onSendFailed(): void;
}) {
  const { api } = useConnection();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const bottomPadding = useComposerBottomPadding();
  const [text, setText] = useState(initialText);
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
  const input = useRef<TextInput>(null);
  const [commands, setCommands] = useState<string[] | null>(null);
  const suggestions = commands && slashSuggestions(text, commands);
  const updateSession = useSessionUpdate(session.id);
  const sending = usePendingAction();
  const canSend =
    Boolean(text.trim() || pendingPlan || attachments.length || sendReady) &&
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
        answers,
      }),
    );
    succeeded(sent);
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

  async function startSlashCommand() {
    if (!workspaceId) return;
    setText('/');
    input.current?.focus();
    if (commands) return;
    setCommands(await api.slashCommands(workspaceId).catch(() => []));
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
      {suggestions?.length ? (
        <SlashSuggestions
          commands={suggestions}
          onPick={(name) => setText(`/${name} `)}
        />
      ) : null}
      <ComposerChips
        pendingPlan={pendingPlan}
        attachments={attachments}
        uploading={uploading}
        onDiscardPlan={() => updateSession({ pendingPlan: null })}
        onRemoveAttachment={(file) =>
          setAttachments((current) => current.filter((entry) => entry !== file))
        }
      />
      <ComposerToolbar state={state} session={session} context={context} />
      <View style={styles.row}>
        <IconButton
          label="Attach a photo or file"
          icon={<Plus size={ICON_BUTTON_ICON_SIZE} color={theme.fg2} />}
          background={theme.bgActive}
          onPress={() => void attach()}
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
                ref={input}
                maxFontSizeMultiplier={CHROME_FONT_SCALE}
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={placeholder({
                  running,
                  reviewingPlan,
                  answeringQuestion: Boolean(answers),
                  hasPendingPlan: Boolean(pendingPlan),
                })}
                placeholderTextColor={theme.fg4}
                multiline
              />
              {workspaceId && !text ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Slash commands"
                  hitSlop={touchSlop(SLASH_SIZE)}
                  style={styles.slash}
                  onPress={() => void startSlashCommand()}
                >
                  <Slash size={SLASH_ICON_SIZE} color={theme.fg3} />
                </Pressable>
              ) : null}
            </>
          )}
        </View>
        {actionButton()}
      </View>
    </View>
  );
}

function SlashSuggestions({
  commands,
  onPick,
}: {
  commands: string[];
  onPick: (name: string) => void;
}) {
  const styles = makeStyles(useTheme());
  return (
    <ScrollView style={styles.suggestions} keyboardShouldPersistTaps="always">
      {commands.map((name) => (
        <Pressable
          key={name}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.suggestion,
            pressed && styles.suggestionPressed,
          ]}
          onPress={() => onPick(name)}
        >
          <Text style={styles.suggestionText} numberOfLines={1}>
            /{name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function useComposerBottomPadding(): number {
  return Math.max(useSafeAreaInsets().bottom, BAR_PADDING);
}

function placeholder({
  running,
  reviewingPlan,
  answeringQuestion,
  hasPendingPlan,
}: {
  running: boolean;
  reviewingPlan: boolean;
  answeringQuestion: boolean;
  hasPendingPlan: boolean;
}): string {
  if (reviewingPlan) return PLAN_FEEDBACK_PLACEHOLDER;
  if (answeringQuestion) return QUESTION_REPLY_PLACEHOLDER;
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
      gap: 8,
    },
    slash: {
      alignItems: 'center',
      justifyContent: 'center',
      width: SLASH_SIZE,
      height: SLASH_SIZE,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border2,
    },
    suggestions: {
      maxHeight: SUGGESTIONS_MAX_HEIGHT,
      borderRadius: 12,
      backgroundColor: theme.bgRaised,
    },
    suggestion: {
      justifyContent: 'center',
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: 14,
    },
    suggestionPressed: { backgroundColor: theme.bgActive },
    suggestionText: { ...TYPE.subhead, color: theme.fg1 },
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
    input: {
      flex: 1,
      maxHeight: 140,
      padding: 0,
      ...TYPE.subhead,
      color: theme.fg1,
    },
  });
}
