import { setStringAsync } from 'expo-clipboard';
import { FileText, Paperclip } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  duration,
  fileName,
  imageType,
} from '../../../korev-desktop/src/shared/format';
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
  TodoStatus,
} from '../../../korev-desktop/src/shared/model';
import { attempt } from '../attempt';
import { chooseOption } from '../chooseOption';
import { succeeded } from '../haptics';
import { MONO_FONT, useTheme, type Theme } from '../theme';
import { MIN_TOUCH_TARGET } from '../ui';
import { ImagePreview, ImageThumbnail } from './ImagePreview';
import { MarkdownView } from './MarkdownView';
import { PermissionCard } from './PermissionCard';
import { PlanChip } from './PlanChip';
import { ReaderSheet } from './ReaderSheet';

type ItemOf<K extends ChatItem['kind']> = Extract<ChatItem, { kind: K }>;

const TODO_MARKS: Record<TodoStatus, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '●',
};

function useStyles() {
  return makeStyles(useTheme());
}

const CHIP_ICON_SIZE = 14;

const READ_TOOL = 'Read';

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

type MessageAction = 'copy' | 'select';

const MESSAGE_ACTIONS: MessageAction[] = ['copy', 'select'];

const MESSAGE_ACTION_LABELS: Record<MessageAction, string> = {
  copy: 'Copy message',
  select: 'Select text',
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
  };

  return (
    <>
      <Pressable
        style={style}
        accessibilityHint="Long press to copy or select the text"
        onLongPress={text ? () => void showActions() : undefined}
      >
        {children}
      </Pressable>
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

export function UserMessage({
  item,
  sessionId,
}: {
  item: ItemOf<'user'>;
  sessionId: string;
}) {
  const styles = useStyles();
  const { body, plans, files } = messageParts(item.text);
  return (
    <MessageActions text={body} style={styles.userBubble}>
      {body ? <Text style={styles.text}>{body}</Text> : null}
      <MessageAttachments plans={plans} files={files} sessionId={sessionId} />
      {item.queued ? <Text style={styles.dim}>Queued</Text> : null}
    </MessageActions>
  );
}

function Expandable({
  header,
  body,
  headerStyle,
}: {
  header: string;
  body: string;
  headerStyle?: StyleProp<TextStyle>;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen(!open)}
    >
      <Text style={[styles.dim, headerStyle]} numberOfLines={open ? 0 : 1}>
        {header}
      </Text>
      {open && body ? (
        <Text selectable style={styles.code}>
          {body}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ToolLine({
  item,
  sessionId,
  running,
}: {
  item: ItemOf<'tool'>;
  sessionId: string;
  running: boolean;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const body = [item.detail, item.output].filter(Boolean).join('\n\n');
  const readsImage = item.name === READ_TOOL && imageType(item.summary);
  const pending = running && item.output === null;
  return (
    <View style={styles.tool}>
      <View style={styles.toolHeader}>
        {pending ? (
          <ActivityIndicator size="small" color={theme.accentText} />
        ) : null}
        <View style={styles.toolBody}>
          <Expandable
            header={`${item.name}  ${item.summary}`}
            body={body}
            headerStyle={item.failed ? styles.failed : undefined}
          />
        </View>
      </View>
      {readsImage && item.output !== null ? (
        <ImageThumbnail sessionId={sessionId} path={item.summary} />
      ) : null}
    </View>
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
}: {
  item: ItemOf<'assistant'>;
  sessionId: string;
  repoUrl: string | null;
  onOpenExplainer?: () => void;
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

function TodoList({ item }: { item: ItemOf<'todos'> }) {
  const styles = useStyles();
  return (
    <View>
      {item.todos.map((todo) => (
        <Text key={todo.text} style={styles.dim}>
          {TODO_MARKS[todo.status]} {todo.text}
        </Text>
      ))}
    </View>
  );
}

function ResultLine({ item }: { item: ItemOf<'result'> }) {
  const styles = useStyles();
  if (!item.ok)
    return (
      <Text style={styles.failed}>
        {item.text || 'The agent stopped with an error.'}
      </Text>
    );
  const parts = [
    item.durationMs !== null
      ? `Completed in ${duration(item.durationMs)}`
      : 'Completed',
    item.costUsd !== null ? `$${item.costUsd.toFixed(2)}` : null,
  ].filter(Boolean);
  return <Text style={styles.dim}>{parts.join(' · ')}</Text>;
}

export function ChatItemView({
  item,
  sessionId,
  repoUrl,
  running,
  laneRepos,
  onRespond,
  onHandoff,
  onOpenExplainer,
}: {
  item: ChatItem;
  sessionId: string;
  repoUrl: string | null;
  running: boolean;
  laneRepos?: Repo[];
  onRespond(itemId: string, response: PermissionResponse): Promise<boolean>;
  onHandoff?(): Promise<boolean>;
  onOpenExplainer?(): void;
}) {
  const styles = useStyles();
  switch (item.kind) {
    case 'user':
      return <UserMessage item={item} sessionId={sessionId} />;
    case 'assistant':
      return (
        <AssistantMessage
          item={item}
          sessionId={sessionId}
          repoUrl={repoUrl}
          onOpenExplainer={onOpenExplainer}
        />
      );
    case 'thinking':
      return <Expandable header="Thinking…" body={item.text} />;
    case 'tool':
      return <ToolLine item={item} sessionId={sessionId} running={running} />;
    case 'todos':
      return <TodoList item={item} />;
    case 'result':
      return <ResultLine item={item} />;
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
    failed: { color: theme.dangerText, fontSize: 13, lineHeight: 19 },
    code: {
      marginTop: 4,
      padding: 8,
      borderRadius: 6,
      backgroundColor: theme.bgRaised,
      color: theme.fg2,
      fontFamily: MONO_FONT,
      fontSize: 12,
    },
    tool: { gap: 6 },
    toolHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    toolBody: { flex: 1 },
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
      padding: 10,
      borderRadius: 10,
      backgroundColor: theme.bgRaised,
      borderWidth: 1,
      borderColor: theme.border1,
    },
  });
}
