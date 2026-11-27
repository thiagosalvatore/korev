import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { fileName } from '../../../../korev-desktop/src/shared/format';
import type { FileContents } from '../../../../korev-desktop/src/shared/model';
import { useConnection } from '../../korev';
import { Loading } from '../../Offline';
import { MONO_FONT, TYPE, useTheme, type Theme } from '../../theme';

const LINE_NUMBER_WIDTH = 44;
const TARGET_POSITION = 0.3;

const UNAVAILABLE: Record<Exclude<FileContents['kind'], 'text'>, string> = {
  missing: "This file doesn't exist in this workspace.",
  'not-text': "Korev can't preview this file.",
};

function useFile(workspaceId: string, path: string): FileContents | null {
  const { api } = useConnection();
  const [contents, setContents] = useState<FileContents | null>(null);
  useEffect(() => {
    void api
      .readFile(workspaceId, path)
      .catch((): FileContents => ({ kind: 'missing' }))
      .then(setContents);
  }, [api, workspaceId, path]);
  return contents;
}

export default function FileScreen() {
  const params = useLocalSearchParams<{
    id: string;
    path: string;
    line?: string;
  }>();
  const styles = makeStyles(useTheme());
  const contents = useFile(params.id, params.path);
  const list = useRef<FlatList<string>>(null);
  const lines = useMemo(
    () => (contents?.kind === 'text' ? contents.text.split('\n') : []),
    [contents],
  );
  const line = Number(params.line) || 0;
  const target = line > 0 && line <= lines.length ? line - 1 : null;

  useEffect(() => {
    if (target !== null)
      list.current?.scrollToIndex({
        index: target,
        viewPosition: TARGET_POSITION,
        animated: false,
      });
  }, [target]);

  let body;
  if (!contents) body = <Loading />;
  else if (contents.kind !== 'text')
    body = <Text style={styles.empty}>{UNAVAILABLE[contents.kind]}</Text>;
  else
    body = (
      <FlatList
        ref={list}
        data={lines}
        keyExtractor={(_, index) => String(index)}
        contentInsetAdjustmentBehavior="automatic"
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          // Lines wrap, so get close first and land once they have rendered.
          list.current?.scrollToOffset({
            offset: index * averageItemLength,
            animated: false,
          });
          setTimeout(() =>
            list.current?.scrollToIndex({
              index,
              viewPosition: TARGET_POSITION,
              animated: false,
            }),
          );
        }}
        ListHeaderComponent={
          <Text style={styles.path} selectable>
            {params.path}
          </Text>
        }
        renderItem={({ item, index }) => (
          <View style={[styles.line, index === target && styles.target]}>
            <Text style={styles.number}>{index + 1}</Text>
            <Text selectable style={styles.code}>
              {item}
            </Text>
          </View>
        )}
      />
    );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: fileName(params.path) }} />
      {body}
    </View>
  );
}

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
    target: { backgroundColor: theme.accentSubtle },
    number: {
      ...mono,
      width: LINE_NUMBER_WIDTH,
      paddingRight: 8,
      textAlign: 'right',
      color: theme.fg4,
    },
    code: { ...mono, flex: 1, paddingRight: 12, color: theme.fg1 },
    empty: {
      ...TYPE.subhead,
      padding: 24,
      color: theme.fg3,
      textAlign: 'center',
    },
  });
}
