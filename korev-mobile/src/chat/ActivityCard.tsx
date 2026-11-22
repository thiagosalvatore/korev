import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { imageType } from '../../../korev-desktop/src/shared/format';
import type { Todo, TodoStatus } from '../../../korev-desktop/src/shared/model';
import { LoadingRing } from '../LoadingRing';
import { MONO_FONT, useTheme, type Theme } from '../theme';
import { MIN_TOUCH_TARGET } from '../ui';
import { activityLabel, type ActivityRow, type ToolItem } from './activity';
import { ImageThumbnail } from './ImagePreview';

const ICON_SIZE = 15;
const STEP_ICON_SIZE = 13;
const READ_TOOL = 'Read';

const TODO_ICONS: Record<TodoStatus, LucideIcon> = {
  pending: CircleDashed,
  in_progress: CircleDot,
  completed: CircleCheck,
};

function useStyles() {
  return makeStyles(useTheme());
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
      disabled={!body}
      onPress={() => setOpen(!open)}
    >
      <Text style={[styles.step, headerStyle]} numberOfLines={open ? 0 : 1}>
        {header}
      </Text>
      {open ? (
        <Text selectable style={styles.code}>
          {body}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ToolStep({
  tool,
  sessionId,
  running,
}: {
  tool: ToolItem;
  sessionId: string;
  running: boolean;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const body = [tool.detail, tool.output].filter(Boolean).join('\n\n');
  const pending = running && tool.output === null;
  const readsImage = tool.name === READ_TOOL && imageType(tool.summary);
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIcon}>
        {pending ? (
          <LoadingRing size={STEP_ICON_SIZE} color={theme.accentText} />
        ) : tool.failed ? (
          <CircleX size={STEP_ICON_SIZE} color={theme.dangerText} />
        ) : (
          <CircleCheck size={STEP_ICON_SIZE} color={theme.fg4} />
        )}
      </View>
      <View style={styles.stepBody}>
        <Expandable
          header={`${tool.name}  ${tool.summary}`}
          body={body}
          headerStyle={tool.failed ? styles.failed : undefined}
        />
        {readsImage && tool.output !== null ? (
          <ImageThumbnail sessionId={sessionId} path={tool.summary} />
        ) : null}
      </View>
    </View>
  );
}

function todoColor(theme: Theme, status: TodoStatus): string {
  if (status === 'in_progress') return theme.accentText;
  if (status === 'completed') return theme.successText;
  return theme.fg4;
}

function TodoProgress({ todos }: { todos: Todo[] }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const done = todos.filter((todo) => todo.status === 'completed').length;
  return (
    <View style={styles.todos}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: todos.length, now: done }}
        style={styles.track}
      >
        <View
          style={[styles.fill, { width: `${(done / todos.length) * 100}%` }]}
        />
      </View>
      {todos.map((todo) => {
        const Icon = TODO_ICONS[todo.status];
        return (
          <View key={todo.text} style={styles.todo}>
            <Icon size={STEP_ICON_SIZE} color={todoColor(theme, todo.status)} />
            <Text
              style={[
                styles.todoText,
                todo.status === 'completed' && styles.todoDone,
              ]}
            >
              {todo.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function StatusIcon({ run, running }: { run: ActivityRow; running: boolean }) {
  const theme = useTheme();
  if (running) return <LoadingRing size={ICON_SIZE} color={theme.accentText} />;
  if (run.tools.some((tool) => tool.failed))
    return <CircleX size={ICON_SIZE} color={theme.dangerText} />;
  return <CircleCheck size={ICON_SIZE} color={theme.successText} />;
}

export function ActivityCard({
  run,
  sessionId,
  running,
}: {
  run: ActivityRow;
  sessionId: string;
  running: boolean;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [open, setOpen] = useState(false);
  const hasSteps = run.tools.length + run.thinking.length > 0;
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        disabled={!hasSteps}
        style={styles.header}
        onPress={() => setOpen(!open)}
      >
        <StatusIcon run={run} running={running} />
        <Text style={styles.label} numberOfLines={1}>
          {activityLabel(run, running)}
        </Text>
        {hasSteps ? (
          <ChevronRight
            size={ICON_SIZE}
            color={theme.fg4}
            style={open ? styles.chevronOpen : undefined}
          />
        ) : null}
      </Pressable>
      {run.todos && (running || open) ? (
        <TodoProgress todos={run.todos} />
      ) : null}
      {open ? (
        <View style={styles.steps}>
          {run.thinking.map((text, index) => (
            <Expandable key={index} header="Thinking…" body={text} />
          ))}
          {run.tools.map((tool) => (
            <ToolStep
              key={tool.id}
              tool={tool}
              sessionId={sessionId}
              running={running}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border1,
      backgroundColor: theme.bgSurface,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: 12,
    },
    label: { flex: 1, color: theme.fg2, fontSize: 15 },
    chevronOpen: { transform: [{ rotate: '90deg' }] },
    steps: { gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
    stepRow: { flexDirection: 'row', gap: 8 },
    stepIcon: { paddingTop: 3 },
    stepBody: { flex: 1, gap: 6 },
    step: { color: theme.fg3, fontSize: 13, lineHeight: 19 },
    failed: { color: theme.dangerText },
    code: {
      marginTop: 4,
      padding: 8,
      borderRadius: 6,
      backgroundColor: theme.bgRaised,
      color: theme.fg2,
      fontFamily: MONO_FONT,
      fontSize: 12,
    },
    todos: { gap: 6, paddingHorizontal: 12, paddingBottom: 12 },
    track: {
      height: 4,
      borderRadius: 2,
      overflow: 'hidden',
      backgroundColor: theme.bgActive,
    },
    fill: { height: 4, backgroundColor: theme.accent },
    todo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    todoText: { flex: 1, color: theme.fg1, fontSize: 14, lineHeight: 20 },
    todoDone: { color: theme.fg3 },
  });
}
