import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { timeAgo } from '../../../../korev-desktop/src/shared/format';
import type {
  PrComment,
  PrThread,
} from '../../../../korev-desktop/src/shared/model';
import { MarkdownView } from '../../chat/MarkdownView';
import { useConnection } from '../../korev';
import { Loading } from '../../Offline';
import { MONO_FONT, TYPE, useTheme, type Theme } from '../../theme';

const HUNK_TAIL_LINES = 4;

function useThreads(workspaceId: string, prUrl: string): PrThread[] | null {
  const { api } = useConnection();
  const [threads, setThreads] = useState<PrThread[] | null>(null);
  useEffect(() => {
    void api
      .prThreads(workspaceId, prUrl)
      .catch(() => [])
      .then((loaded) =>
        setThreads(
          [...loaded].sort(
            (a, b) => Number(a.isResolved) - Number(b.isResolved),
          ),
        ),
      );
  }, [api, workspaceId, prUrl]);
  return threads;
}

function location(thread: PrThread): string {
  if (!thread.path) return 'Pull request';
  return thread.line ? `${thread.path}:${thread.line}` : thread.path;
}

function hunkTail(hunk: string): string {
  return hunk.split('\n').slice(-HUNK_TAIL_LINES).join('\n');
}

function Comment({ comment }: { comment: PrComment }) {
  const styles = makeStyles(useTheme());
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint="Opens the comment on GitHub"
      style={styles.comment}
      onPress={() => void Linking.openURL(comment.url)}
    >
      <Text style={styles.author}>
        {comment.author}
        <Text style={styles.when}> · {timeAgo(comment.createdAt)}</Text>
      </Text>
      <MarkdownView value={comment.body} />
    </Pressable>
  );
}

function ThreadCard({ thread }: { thread: PrThread }) {
  const styles = makeStyles(useTheme());
  const state = [
    thread.isResolved ? 'Resolved' : null,
    thread.isOutdated ? 'Outdated' : null,
  ].filter(Boolean);
  return (
    <View style={[styles.card, thread.isResolved && styles.resolved]}>
      <View style={styles.cardHeader}>
        <Text style={styles.location} numberOfLines={1} ellipsizeMode="head">
          {location(thread)}
        </Text>
        {state.length ? (
          <Text style={styles.state}>{state.join(' · ')}</Text>
        ) : null}
      </View>
      {thread.diffHunk ? (
        <Text style={styles.hunk}>{hunkTail(thread.diffHunk)}</Text>
      ) : null}
      {thread.comments.map((comment) => (
        <Comment key={comment.id} comment={comment} />
      ))}
    </View>
  );
}

export default function ThreadsScreen() {
  const { id, pr } = useLocalSearchParams<{ id: string; pr: string }>();
  const styles = makeStyles(useTheme());
  const threads = useThreads(id, pr);
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Review comments' }} />
      {threads ? (
        <FlatList
          data={threads}
          keyExtractor={(thread) => thread.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ThreadCard thread={item} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              This pull request has no review comments.
            </Text>
          }
        />
      ) : (
        <Loading />
      )}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bgApp },
    list: { gap: 12, padding: 12 },
    card: {
      gap: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border1,
      backgroundColor: theme.bgSurface,
    },
    resolved: { opacity: 0.6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    location: {
      ...TYPE.caption,
      flex: 1,
      fontFamily: MONO_FONT,
      color: theme.fg2,
    },
    state: { ...TYPE.caption, color: theme.fg3 },
    hunk: {
      ...TYPE.caption,
      padding: 8,
      borderRadius: 6,
      fontFamily: MONO_FONT,
      color: theme.fg2,
      backgroundColor: theme.bgRaised,
    },
    comment: { gap: 4 },
    author: { ...TYPE.footnote, fontWeight: '600', color: theme.fg1 },
    when: { fontWeight: '400', color: theme.fg3 },
    empty: {
      ...TYPE.subhead,
      padding: 24,
      color: theme.fg3,
      textAlign: 'center',
    },
  });
}
