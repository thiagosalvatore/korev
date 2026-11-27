import { setStringAsync } from 'expo-clipboard';
import { FileText, Paperclip } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { fileName, imageType } from '../../../korev-desktop/src/shared/format';
import {
  hasExplainerBlock,
  withoutExplainerBlocks,
} from '../../../korev-desktop/src/shared/explainer';
import {
  messageParts,
  type MessageParts,
} from '../../../korev-desktop/src/shared/message';
import type {
  ChatItem,
  PermissionResponse,
  Repo,
  TurnRange,
} from '../../../korev-desktop/src/shared/model';
import { attempt } from '../attempt';
import { chooseOption } from '../chooseOption';
import { succeeded } from '../haptics';
import { MONO_FONT, useTheme, type Theme } from '../theme';
import { MIN_TOUCH_TARGET, touchSlop } from '../ui';
import { ImagePreview, ImageThumbnail } from './ImagePreview';
import { MarkdownView, type OpenFile } from './MarkdownView';
import { PermissionCard } from './PermissionCard';
import { PlanChip } from './PlanChip';
import { ReaderSheet } from './ReaderSheet';

type ItemOf<K extends ChatItem['kind']> = Extract<ChatItem, { kind: K }>;

function useStyles() {
  return makeStyles(useTheme());
}

const CHIP_ICON_SIZE = 14;

function MessageAttachments({
  plans,
  files,
  sessionId,
}: Pick<MessageParts, 'plans' | 'files'> & { sessionId: string }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  if (!plans.length && !files.length) return null;
  return (
    <View style={styles.chips}>
      {plans.map((plan, index) => (
        <PlanChip
          key={index}
          name={plan.name}
          markdown={plan.markdown}
          style={styles.chip}
        >
          <FileText size={CHIP_ICON_SIZE} color={theme.fg3} />
          <Text style={styles.chipName} numberOfLines={1}>
            {plan.name}
          </Text>
        </PlanChip>
      ))}
      {files.map((file) => {
        const chip = (
          <View key={file} style={styles.chip}>
            <Paperclip size={CHIP_ICON_SIZE} color={theme.fg3} />
            <Text style={styles.chipName} numberOfLines={1}>
              {fileName(file)}
            </Text>
          </View>
        );
        return imageType(file) ? (
          <ImageThumbnail
            key={file}
            sessionId={sessionId}
            path={file}
            fallback={chip}
          />
        ) : (
          chip
        );
      })}
    </View>
  );
}

type MessageAction = 'copy' | 'select' | 'share';

const MESSAGE_ACTIONS: MessageAction[] = ['copy', 'select', 'share'];

const MESSAGE_ACTION_LABELS: Record<MessageAction, string> = {
  copy: 'Copy',
  select: 'Select text',
  share: 'Share…',
};

function copyMessage(text: string) {
  return attempt('Korev could not copy the message', () =>
    setStringAsync(text),
  ).then(succeeded);
}

function MessageActions({
  text,
  style,
  children,
}: {
  text: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const styles = useStyles();
  const [selecting, setSelecting] = useState(false);

  const showActions = async () => {
    const action = await chooseOption(
      'Message',
      MESSAGE_ACTIONS,
      MESSAGE_ACTION_LABELS,
    );
    if (action === 'copy') await copyMessage(text);
    if (action === 'select') setSelecting(true);
    if (action === 'share') await Share.share({ message: text });
  };

  const longPress = Gesture.LongPress()
    .runOnJS(true)
    .enabled(Boolean(text))
    .onStart(() => void showActions());

  return (
    <>
      <GestureDetector gesture={longPress}>
        <View
          style={style}
          accessible
          accessibilityHint="Long press to copy or select the text"
        >
          {children}
        </View>
      </GestureDetector>
      <ReaderSheet
        title={MESSAGE_ACTION_LABELS.select}
        visible={selecting}
        onClose={() => setSelecting(false)}
      >
        <TextInput
          value={text}
          editable={false}
          multiline
          scrollEnabled={false}
          style={styles.text}
        />
      </ReaderSheet>
    </>
  );
}

type UserAction = 'copy' | 'revert' | 'share';

const USER_ACTION_LABELS: Record<UserAction, string> = {
  copy: 'Copy',
  revert: 'Revert to before this message',
  share: 'Share…',
};

function confirmRevert(onRevert: () => void) {
  Alert.alert(
    'Revert to before this message?',
    'Korev puts the files back as they were before this message and removes it and everything after it. The message goes back into the message box.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revert', style: 'destructive', onPress: onRevert },
    ],
  );
}

export function UserMessage({
  item,
  sessionId,
  onRevert,
}: {
  item: ItemOf<'user'>;
  sessionId: string;
  onRevert?: () => void;
}) {
  const styles = useStyles();
  const { body, plans, files } = messageParts(item.text);
  const canRevert = Boolean(onRevert && item.checkpoint);
  const actions: UserAction[] = canRevert
    ? ['copy', 'revert', 'share']
    : ['copy', 'share'];

  const showActions = async () => {
    const action = await chooseOption('Message', actions, USER_ACTION_LABELS);
    if (action === 'copy') await copyMessage(body);
    if (action === 'share') await Share.share({ message: body });
    if (action === 'revert' && onRevert) confirmRevert(onRevert);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Shows copy, share and revert"
      style={[styles.userBubble, item.fromKorev && styles.korevBubble]}
      onPress={() => void showActions()}
    >
      {item.fromKorev ? (
        <Text style={[styles.dim, styles.korevCaption]}>Korev</Text>
      ) : null}
      {body ? (
        <TextInput
          value={body}
          editable={false}
          multiline
          scrollEnabled={false}
          style={[styles.text, styles.selectableText]}
          onPress={() => void showActions()}
        />
      ) : null}
      <MessageAttachments plans={plans} files={files} sessionId={sessionId} />
      {item.queued ? <Text style={styles.dim}>Queued</Text> : null}
    </Pressable>
  );
}

function ExplainerChip({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Explanation ready. Open it."
      style={styles.explainerChip}
      onPress={onPress}
    >
      <Text style={styles.explainerChipText}>Explanation ready</Text>
      <Text style={styles.explainerChipAction}>Open</Text>
    </Pressable>
  );
}

function AssistantMessage({
  item,
  sessionId,
  repoUrl,
  onOpenExplainer,
  onOpenFile,
}: {
  item: ItemOf<'assistant'>;
  sessionId: string;
  repoUrl: string | null;
  onOpenExplainer?: () => void;
  onOpenFile?: OpenFile;
}) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const explains = Boolean(onOpenExplainer) && hasExplainerBlock(item.text);
  const text = explains ? withoutExplainerBlocks(item.text) : item.text;
  const styles = useStyles();
  return (
    <>
      <View style={styles.assistant}>
        {text ? (
          <MessageActions text={text}>
            <MarkdownView
              value={text}
              onOpenImage={setPreviewImage}
              onOpenFile={onOpenFile}
              repoUrl={repoUrl}
              selectable={false}
            />
          </MessageActions>
        ) : null}
        {explains && onOpenExplainer ? (
          <ExplainerChip onPress={onOpenExplainer} />
        ) : null}
      </View>
      <ImagePreview
        sessionId={sessionId}
        path={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </>
  );
}

function ResultLine({
  item,
  onOpenTurn,
}: {
  item: ItemOf<'result'>;
  onOpenTurn?: (range: TurnRange) => void;
}) {
  const styles = useStyles();
  if (item.ok) {
    const turn = item.turn;
    const count = turn?.files.length ?? 0;
    if (!turn || !count || !onOpenTurn) return null;
    return (
      <Pressable
        accessibilityRole="button"
        hitSlop={touchSlop(styles.dim.lineHeight)}
        style={styles.turnFiles}
        onPress={() => onOpenTurn(turn.range)}
      >
        <Text style={[styles.dim, styles.link]}>
          {count} file{count === 1 ? '' : 's'} changed
        </Text>
      </Pressable>
    );
  }
  return (
    <Text style={styles.failed}>
      {item.text || 'The agent stopped with an error.'}
    </Text>
  );
}

export function ChatItemView({
  item,
  sessionId,
  repoUrl,
  laneRepos,
  onRespond,
  onHandoff,
  onOpenExplainer,
  onRevert,
  onOpenTurn,
  onOpenFile,
}: {
  item: ChatItem;
  sessionId: string;
  repoUrl: string | null;
  laneRepos?: Repo[];
  onRespond(itemId: string, response: PermissionResponse): Promise<boolean>;
  onHandoff?(): Promise<boolean>;
  onOpenExplainer?(): void;
  onRevert?(): void;
  onOpenTurn?(range: TurnRange): void;
  onOpenFile?: OpenFile;
}) {
  const styles = useStyles();
  switch (item.kind) {
    case 'user':
      return (
        <UserMessage item={item} sessionId={sessionId} onRevert={onRevert} />
      );
    case 'assistant':
      return (
        <AssistantMessage
          item={item}
          sessionId={sessionId}
          repoUrl={repoUrl}
          onOpenExplainer={onOpenExplainer}
          onOpenFile={onOpenFile}
        />
      );
    case 'thinking':
    case 'tool':
    case 'todos':
      return null;
    case 'result':
      return <ResultLine item={item} onOpenTurn={onOpenTurn} />;
    case 'notice':
      return <Text style={styles.dim}>{item.text}</Text>;
    case 'permission':
      return (
        <PermissionCard
          item={item}
          laneRepos={laneRepos}
          onRespond={(response) => onRespond(item.id, response)}
          onHandoff={onHandoff}
        />
      );
  }
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    assistant: { gap: 8 },
    explainerChip: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      alignItems: 'center',
      gap: 8,
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
      backgroundColor: theme.bgSurface,
    },
    explainerChipText: { color: theme.fg1, fontSize: 14 },
    explainerChipAction: { color: theme.accentText, fontSize: 14 },
    text: { color: theme.fg1, fontSize: 15, lineHeight: 22 },
    dim: { color: theme.fg3, fontSize: 13, lineHeight: 19 },
    selectableText: { padding: 0 },
    failed: { color: theme.dangerText, fontSize: 13, lineHeight: 19 },
    turnFiles: { alignSelf: 'flex-start' },
    link: { color: theme.accentText },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border1,
      backgroundColor: theme.bgActive,
    },
    chipName: {
      flexShrink: 1,
      color: theme.fg1,
      fontFamily: MONO_FONT,
      fontSize: 12,
    },
    userBubble: {
      alignSelf: 'flex-end',
      maxWidth: '85%',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      borderBottomRightRadius: 4,
      backgroundColor: theme.bgRaised,
      borderWidth: 1,
      borderColor: theme.border1,
    },
    korevBubble: {
      backgroundColor: theme.accentSubtle,
      borderColor: theme.accent,
    },
    korevCaption: { color: theme.accentText, fontWeight: '600' },
  });
}
