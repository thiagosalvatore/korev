import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import {
  isBinaryDiff,
  parseUnifiedDiff,
  type DiffRow,
} from '../../../../../korev-desktop/src/shared/diff';
import { fileName } from '../../../../../korev-desktop/src/shared/format';
import { useConnection } from '../../../korev';
import { Loading } from '../../../Offline';
import { MONO_FONT, TYPE, useTheme, type Theme } from '../../../theme';

const SIGNS: Record<DiffRow['type'], string> = {
  add: '+',
  del: '−',
  ctx: ' ',
  hunk: '',
};

const LINE_NUMBER_WIDTH = 36;

function useFileDiff(workspaceId: string, path: string): string | null {
  const { api } = useConnection();
  const [patch, setPatch] = useState<string | null>(null);
  useEffect(() => {
    void api
      .fileDiff(workspaceId, path)
      .catch(() => '')
      .then(setPatch);
  }, [api, workspaceId, path]);
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

function emptyMessage(patch: string): string {
  return isBinaryDiff(patch)
    ? 'This is a binary file, so there is no text diff.'
    : 'No line changes to show.';
}

export default function DiffScreen() {
  const { id, path } = useLocalSearchParams<{ id: string; path: string }>();
  const styles = makeStyles(useTheme());
  const patch = useFileDiff(id, path);
  const rows = patch && !isBinaryDiff(patch) ? parseUnifiedDiff(patch) : [];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: fileName(path) }} />
      {patch === null ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(_, index) => String(index)}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={
            <Text style={styles.path} selectable>
              {path}
            </Text>
          }
          renderItem={({ item }) => <DiffLine row={item} styles={styles} />}
          ListEmptyComponent={
            <Text style={styles.empty}>{emptyMessage(patch)}</Text>
          }
        />
      )}
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
