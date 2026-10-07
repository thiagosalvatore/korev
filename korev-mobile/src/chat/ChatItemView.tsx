import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { duration } from '../../../korev-desktop/src/shared/format';
import type {
  ChatItem,
  PermissionResponse,
  TodoStatus,
} from '../../../korev-desktop/src/shared/model';
import { MONO_FONT, useTheme, type Theme } from '../theme';
import { PermissionCard } from './PermissionCard';

type ItemOf<K extends ChatItem['kind']> = Extract<ChatItem, { kind: K }>;

const TODO_MARKS: Record<TodoStatus, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '●',
};

function useStyles() {
  return makeStyles(useTheme());
}

function UserMessage({ item }: { item: ItemOf<'user'> }) {
  const styles = useStyles();
  return (
    <View style={styles.userBubble}>
      <Text selectable style={styles.text}>
        {item.text}
      </Text>
      {item.queued ? <Text style={styles.dim}>Queued</Text> : null}
    </View>
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
    <Pressable onPress={() => setOpen(!open)}>
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

function ToolLine({ item }: { item: ItemOf<'tool'> }) {
  const styles = useStyles();
  const body = [item.detail, item.output].filter(Boolean).join('\n\n');
  return (
    <Expandable
      header={`${item.name}  ${item.summary}`}
      body={body}
      headerStyle={item.failed ? styles.failed : undefined}
    />
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
  onRespond,
  onHandoff,
}: {
  item: ChatItem;
  onRespond(itemId: string, response: PermissionResponse): void;
  onHandoff?(): void;
}) {
  const styles = useStyles();
  switch (item.kind) {
    case 'user':
      return <UserMessage item={item} />;
    case 'assistant':
      return (
        <Text selectable style={styles.text}>
          {item.text}
        </Text>
      );
    case 'thinking':
      return <Expandable header="Thinking…" body={item.text} />;
    case 'tool':
      return <ToolLine item={item} />;
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
          onRespond={(response) => onRespond(item.id, response)}
          onHandoff={onHandoff}
        />
      );
  }
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
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
