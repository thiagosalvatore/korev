import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  FileChange,
  FileStatus,
  TurnRange,
} from '../../../../../korev-desktop/src/shared/model';
import { rangeOf, rangeParams, type RangeParams } from '../../../changes';
import { useConnection } from '../../../korev';
import { Loading } from '../../../Offline';
import { SendComments } from '../../../SendComments';
import { MONO_FONT, TYPE, useTheme, type Theme } from '../../../theme';
import { MIN_TOUCH_TARGET } from '../../../ui';

const CHEVRON_SIZE = 16;

function statusColor(theme: Theme, status: FileStatus): string {
  return {
    A: theme.diffAdd,
    M: theme.warningText,
    D: theme.diffDel,
    R: theme.accentText,
  }[status];
}

function splitPath(path: string): { name: string; folder: string } {
  const slash = path.lastIndexOf('/');
  return { name: path.slice(slash + 1), folder: path.slice(0, slash + 1) };
}

function useChanges(
  workspaceId: string,
  range: TurnRange | null,
): FileChange[] | null {
  const { api } = useConnection();
  const [files, setFiles] = useState<FileChange[] | null>(null);
  const from = range?.from;
  const to = range?.to;
  useEffect(() => {
    void (
      from && to
        ? api.rangeChanges(workspaceId, { from, to })
        : api.changes(workspaceId)
    )
      .catch(() => [])
      .then(setFiles);
  }, [api, workspaceId, from, to]);
  return files;
}

function FileRow({ file, onPress }: { file: FileChange; onPress: () => void }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { name, folder } = splitPath(file.path);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${file.path}, ${file.additions} added, ${file.deletions} removed`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={[styles.status, { color: statusColor(theme, file.status) }]}>
        {file.status}
      </Text>
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {folder ? (
          <Text style={styles.folder} numberOfLines={1} ellipsizeMode="head">
            {folder}
          </Text>
        ) : null}
      </View>
      <Text style={styles.added}>+{file.additions}</Text>
      <Text style={styles.removed}>−{file.deletions}</Text>
      <ChevronRight size={CHEVRON_SIZE} color={theme.fg4} />
    </Pressable>
  );
}

export default function ChangesScreen() {
  const params = useLocalSearchParams<
    RangeParams & { id: string; sessionId?: string }
  >();
  const { id, sessionId } = params;
  const range = rangeOf(params);
  const styles = makeStyles(useTheme());
  const files = useChanges(id, range);
  const added = files?.reduce((sum, file) => sum + file.additions, 0) ?? 0;
  const removed = files?.reduce((sum, file) => sum + file.deletions, 0) ?? 0;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{ title: range ? 'Changes in this turn' : 'Changes' }}
      />
      {files ? (
        <FlatList
          data={files}
          keyExtractor={(file) => file.path}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            files.length ? (
              <Text style={styles.summary}>
                {files.length} {files.length === 1 ? 'file' : 'files'} ·{' '}
                <Text style={styles.added}>+{added}</Text>{' '}
                <Text style={styles.removed}>−{removed}</Text>
              </Text>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <FileRow
              file={item}
              onPress={() =>
                router.push({
                  pathname: '/changes/[id]/diff',
                  params: {
                    id,
                    path: item.path,
                    sessionId,
                    ...rangeParams(range),
                  },
                })
              }
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>This workspace has no changes yet.</Text>
          }
        />
      ) : (
        <Loading />
      )}
      <SendComments workspaceId={id} sessionId={sessionId} />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bgApp },
    list: { paddingBottom: 24 },
    summary: {
      ...TYPE.footnote,
      paddingHorizontal: 20,
      paddingVertical: 12,
      color: theme.fg3,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: theme.bgSurface,
    },
    pressed: { backgroundColor: theme.bgHover },
    status: { ...TYPE.footnote, width: 14, fontFamily: MONO_FONT },
    names: { flex: 1 },
    name: { ...TYPE.callout, color: theme.fg1 },
    folder: { ...TYPE.caption, color: theme.fg3 },
    added: { ...TYPE.footnote, color: theme.diffAdd, fontFamily: MONO_FONT },
    removed: { ...TYPE.footnote, color: theme.diffDel, fontFamily: MONO_FONT },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 44,
      backgroundColor: theme.border1,
    },
    empty: {
      ...TYPE.subhead,
      padding: 24,
      color: theme.fg3,
      textAlign: 'center',
    },
  });
}
