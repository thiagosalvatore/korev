import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatComments } from '../../korev-desktop/src/shared/comments';
import { attempt } from './attempt';
import { clearComments, useDiffComments } from './diffComments';
import { succeeded } from './haptics';
import { useAppState, usePendingAction } from './hooks';
import { useConnection } from './korev';
import { useTheme, type Theme } from './theme';
import { Button } from './ui';

export function SendComments({
  workspaceId,
  sessionId,
}: {
  workspaceId: string;
  sessionId?: string;
}) {
  const { api } = useConnection();
  const state = useAppState();
  const comments = useDiffComments(workspaceId);
  const { pending, run } = usePendingAction();
  const styles = makeStyles(useTheme());
  const insets = useSafeAreaInsets();
  if (!comments.length) return null;
  const workspace = state?.workspaces.find((entry) => entry.id === workspaceId);
  const session =
    workspace?.sessions.find((entry) => entry.id === sessionId) ??
    workspace?.sessions.at(-1);
  const count = comments.length;

  const send = async () => {
    if (!session) return;
    const sent = await attempt('Korev could not send the comments', () =>
      api.send(session.id, {
        text: formatComments(comments).trimStart(),
        agent: session.agent,
        model: session.model,
        effort: session.effort,
        planMode: session.planMode,
        fast: session.fast,
      }),
    );
    if (!succeeded(sent)) return;
    clearComments(workspaceId);
    router.dismissTo({
      pathname: '/workspace/[id]',
      params: { id: workspaceId },
    });
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}>
      <Button
        large
        label={`Send ${count} comment${count === 1 ? '' : 's'}`}
        disabled={!session}
        pending={pending !== null}
        onPress={() => void run('send', send)}
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    bar: {
      paddingHorizontal: 16,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border1,
      backgroundColor: theme.bgSurface,
    },
  });
}
