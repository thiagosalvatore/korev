import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DiffComment } from '../../../../../korev-desktop/src/shared/comments';
import {
  isBinaryDiff,
  parseUnifiedDiff,
  type DiffRow,
} from '../../../../../korev-desktop/src/shared/diff';
import { fileName } from '../../../../../korev-desktop/src/shared/format';
import type { TurnRange } from '../../../../../korev-desktop/src/shared/model';
import { rangeOf, type RangeParams } from '../../../changes';
import {
  canComment,
  removeComment,
  useDiffComments,
  withNotes,
  type DiffItem,
} from '../../../diffComments';
import { useConnection } from '../../../korev';
import { Loading } from '../../../Offline';
import { SendComments } from '../../../SendComments';
import { MONO_FONT, TYPE, useTheme, type Theme } from '../../../theme';
import { MIN_TOUCH_TARGET } from '../../../ui';

const SIGNS: Record<DiffRow['type'], string> = {
  add: '+',
  del: '−',
  ctx: ' ',
  hunk: '',
};

const LINE_NUMBER_WIDTH = 36;

function useFileDiff(
  workspaceId: string,
  path: string,
  range: TurnRange | null,
): string | null {
  const { api } = useConnection();
  const [patch, setPatch] = useState<string | null>(null);
  const from = range?.from;
  const to = range?.to;
  useEffect(() => {
    void api
      .fileDiff(workspaceId, path, from && to ? { from, to } : null)
      .catch(() => '')
      .then(setPatch);
  }, [api, workspaceId, path, from, to]);
  return patch;
}

function rowStyle(row: DiffRow, styles: Styles) {
  if (row.type === 'add') return styles.rowAdd;
  if (row.type === 'del') return styles.rowDel;
  if (row.type === 'hunk') return styles.rowHunk;
  return null;
}

function DiffLine({ row, styles }: { row: DiffRow; styles: Styles }) {
  if (row.type === 'hunk')
    return (
      <Text style={[styles.hunk, styles.rowHunk]} numberOfLines={1}>
        {row.code}
      </Text>
    );
  return (
    <View style={[styles.line, rowStyle(row, styles)]}>
      <Text style={styles.number}>{row.oldLine ?? ''}</Text>
      <Text style={styles.number}>{row.newLine ?? ''}</Text>
      <Text selectable style={[styles.code, rowStyle(row, styles)]}>
        {SIGNS[row.type]} {row.code}
      </Text>
    </View>
  );
}

function Note({
  comment,
  onDelete,
  styles,
}: {
  comment: DiffComment;
  onDelete: () => void;
  styles: Styles;
}) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteBody}>{comment.body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete comment"
        style={styles.noteDelete}
        onPress={onDelete}
      >
        <Text style={styles.noteDeleteText}>Delete</Text>
      </Pressable>
    </View>
  );
}

function emptyMessage(patch: string): string {
  return isBinaryDiff(patch)
    ? 'This is a binary file, so there is no text diff.'
    : 'No line changes to show.';
}

export default function DiffScreen() {
  const params = useLocalSearchParams<
    RangeParams & { id: string; path: string; sessionId?: string }
  >();
  const { id, path } = params;
  const styles = makeStyles(useTheme());
  const patch = useFileDiff(id, path, rangeOf(params));
  const comments = useDiffComments(id);
  const items = useMemo(
    () =>
      withNotes(
        patch && !isBinaryDiff(patch) ? parseUnifiedDiff(patch) : [],
        path,
        comments,
      ),
    [patch, path, comments],
  );

  const comment = (row: DiffRow) =>
    router.push({
      pathname: '/changes/[id]/comment',
      params: { id, path, line: String(row.newLine), code: row.code },
    });

  const renderItem = ({ item }: { item: DiffItem }) => {
    if (item.kind === 'note')
      return (
        <Note
          comment={item.comment}
          styles={styles}
          onDelete={() => removeComment(id, item.comment.id)}
        />
      );
    const line = <DiffLine row={item.row} styles={styles} />;
    if (!canComment(item.row)) return line;
    const { row } = item;
    return (
      <Pressable
        accessibilityHint="Comments on this line"
        onPress={() => comment(row)}
      >
        {line}
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: fileName(path) }} />
      {patch === null ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) =>
            item.kind === 'note' ? item.comment.id : String(item.index)
          }
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={
            <Text style={styles.path} selectable>
              {path}
            </Text>
          }
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.empty}>{emptyMessage(patch)}</Text>
          }
        />
      )}
      <SendComments workspaceId={id} sessionId={params.sessionId} />
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(theme: Theme) {
  const mono = { ...TYPE.caption, fontFamily: MONO_FONT, lineHeight: 18 };
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bgApp },
    path: {
      ...mono,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.fg3,
    },
    line: { flexDirection: 'row' },
    number: {
      ...mono,
      width: LINE_NUMBER_WIDTH,
      paddingRight: 6,
      textAlign: 'right',
      color: theme.fg4,
    },
    code: { ...mono, flex: 1, paddingRight: 12, color: theme.fg1 },
    hunk: { ...mono, paddingHorizontal: 12, paddingVertical: 4 },
    note: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 12,
      borderLeftWidth: 3,
      borderLeftColor: theme.accent,
      backgroundColor: theme.accentSubtle,
    },
    noteBody: {
      ...TYPE.subhead,
      flex: 1,
      paddingVertical: 8,
      color: theme.fg1,
    },
    noteDelete: {
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    noteDeleteText: { ...TYPE.footnote, color: theme.fg3 },
    rowAdd: { backgroundColor: theme.diffAddBg, color: theme.diffAdd },
    rowDel: { backgroundColor: theme.diffDelBg, color: theme.diffDel },
    rowHunk: { backgroundColor: theme.diffHunkBg, color: theme.accentText },
    empty: {
      ...TYPE.subhead,
      padding: 24,
      color: theme.fg3,
      textAlign: 'center',
    },
  });
}
