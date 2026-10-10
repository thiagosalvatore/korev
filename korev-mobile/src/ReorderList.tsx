import { GripVertical } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type { RemoteApi } from '../../korev-desktop/src/shared/api';
import type { AppState } from '../../korev-desktop/src/shared/model';
import {
  movedFolder,
  movedRepo,
  type MovedOrder,
} from '../../korev-desktop/src/shared/workspaces';
import { lifted, warned } from './haptics';
import { useConnection } from './korev';
import { ROW_ICON_SIZE } from './ListRow';
import {
  dropIndicator,
  dropTarget,
  movesWith,
  reorderRows,
  type ReorderMove,
  type ReorderRow,
  type RowLayout,
} from './reorder';
import { RepoAvatar } from './RepoAvatar';
import { useTheme, type Theme } from './theme';
import { CHROME_FONT_SCALE, touchSlop } from './ui';

const LIFTED_OPACITY = 0.85;
const INDICATOR_HEIGHT = 2;

type Styles = ReturnType<typeof makeStyles>;

function sameMove(a: ReorderMove | null, b: ReorderMove | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function movedOrder(state: AppState, move: ReorderMove): MovedOrder {
  if (move.kind === 'repo')
    return movedRepo(state, move.repoId, move.destination);
  return movedFolder(state, move.folderId, move.beforeId);
}

function sendMove(api: RemoteApi, move: ReorderMove): Promise<void> {
  if (move.kind === 'repo') return api.moveRepo(move.repoId, move.destination);
  return api.moveFolder(move.folderId, move.beforeId);
}

function RowContent({ row, styles }: { row: ReorderRow; styles: Styles }) {
  if (row.kind === 'folder')
    return (
      <Text
        maxFontSizeMultiplier={CHROME_FONT_SCALE}
        style={styles.folderName}
        numberOfLines={1}
      >
        {row.folder.name}
      </Text>
    );
  return (
    <>
      <RepoAvatar repo={row.repo} />
      <Text
        maxFontSizeMultiplier={CHROME_FONT_SCALE}
        style={styles.repoName}
        numberOfLines={1}
      >
        {row.repo.name}
      </Text>
    </>
  );
}

export function ReorderList({
  state,
  onDone,
  onDraggingChange,
}: {
  state: AppState;
  onDone: () => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const { api } = useConnection();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [pending, setPending] = useState<MovedOrder | null>(null);
  const [dragged, setDragged] = useState<ReorderRow | null>(null);
  const [target, setTarget] = useState<ReorderMove | null>(null);
  const layouts = useRef<Record<string, RowLayout>>({});
  const dragY = useSharedValue(0);
  const liftedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  const order = pending ? { ...state, ...pending } : state;
  const rows = reorderRows(order);
  const indicator = dropIndicator(target);

  function targetFor(row: ReorderRow, translationY: number) {
    const layout = layouts.current[row.id];
    const center = layout.y + layout.height / 2 + translationY;
    return dropTarget(rows, layouts.current, row, center);
  }

  function apply(move: ReorderMove | null) {
    if (!move) return;
    setPending(movedOrder(order, move));
    sendMove(api, move)
      .catch((error: Error) => {
        warned();
        Alert.alert("Couldn't move it", error.message);
      })
      .finally(() => setPending(null));
  }

  function finishDrag() {
    dragY.value = 0;
    setDragged(null);
    setTarget(null);
    onDraggingChange(false);
  }

  function dragGesture(row: ReorderRow) {
    return Gesture.Pan()
      .runOnJS(true)
      .onBegin(() => onDraggingChange(true))
      .onStart(() => {
        lifted();
        setDragged(row);
      })
      .onUpdate((event) => {
        dragY.value = event.translationY;
        const next = targetFor(row, event.translationY);
        setTarget((current) => (sameMove(current, next) ? current : next));
      })
      .onEnd((event) => apply(targetFor(row, event.translationY)))
      .onFinalize(finishDrag);
  }

  return (
    <View>
      <View style={styles.toolbar}>
        <Text maxFontSizeMultiplier={CHROME_FONT_SCALE} style={styles.hint}>
          Drag to reorder
        </Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={touchSlop(ROW_ICON_SIZE)}
          onPress={onDone}
        >
          <Text maxFontSizeMultiplier={CHROME_FONT_SCALE} style={styles.done}>
            Done
          </Text>
        </Pressable>
      </View>
      {rows.map((row) => {
        const moving = dragged !== null && movesWith(row, dragged);
        return (
          <Animated.View
            key={row.id}
            onLayout={(event) => {
              layouts.current[row.id] = event.nativeEvent.layout;
            }}
            style={[
              styles.row,
              row.kind === 'repo' && row.folderId && styles.nested,
              indicator?.kind === 'into' &&
                indicator.id === row.id &&
                styles.into,
              moving && [styles.lifted, liftedStyle],
            ]}
          >
            {indicator?.kind === 'before' && indicator.id === row.id ? (
              <View style={styles.indicator} />
            ) : null}
            <RowContent row={row} styles={styles} />
            <GestureDetector gesture={dragGesture(row)}>
              <View
                accessible
                accessibilityLabel={`Reorder ${row.kind === 'repo' ? row.repo.name : row.folder.name}`}
                hitSlop={touchSlop(ROW_ICON_SIZE)}
              >
                <GripVertical size={ROW_ICON_SIZE} color={theme.fg4} />
              </View>
            </GestureDetector>
          </Animated.View>
        );
      })}
      {indicator?.kind === 'end' ? <View style={styles.endIndicator} /> : null}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    hint: { color: theme.fg3, fontSize: 13 },
    done: { color: theme.accentText, fontSize: 15, fontWeight: '600' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    nested: { paddingLeft: 26 },
    into: { backgroundColor: theme.accentSubtle },
    lifted: {
      zIndex: 1,
      opacity: LIFTED_OPACITY,
      backgroundColor: theme.bgRaised,
    },
    indicator: {
      position: 'absolute',
      top: 0,
      left: 10,
      right: 10,
      height: INDICATOR_HEIGHT,
      backgroundColor: theme.accent,
    },
    endIndicator: {
      marginHorizontal: 10,
      height: INDICATOR_HEIGHT,
      backgroundColor: theme.accent,
    },
    folderName: {
      flex: 1,
      color: theme.fg4,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    repoName: {
      flex: 1,
      color: theme.fg1,
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
