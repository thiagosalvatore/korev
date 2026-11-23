import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type {
  Workspace,
  WorkspaceRuntime,
} from '../../korev-desktop/src/shared/model';
import { worktreeProgress } from '../../korev-desktop/src/shared/workspaces';
import { UserMessage } from './chat/ChatItemView';
import { pendingUserItem } from './chat/pending';
import { WorkingIndicator } from './chat/WorkingIndicator';
import { attempt } from './attempt';
import { usePendingAction } from './hooks';
import { useConnection } from './korev';
import { TYPE, useTheme, type Theme } from './theme';
import { Button } from './ui';

export function WorktreePending({
  workspace,
  runtime,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime;
}) {
  const styles = makeStyles(useTheme());
  const { api } = useConnection();
  const { pending, run } = usePendingAction();
  const creating = runtime.status === 'creating';
  return (
    <ScrollView contentContainerStyle={styles.transcript}>
      {runtime.pendingPrompt ? (
        <UserMessage
          item={pendingUserItem(runtime.pendingPrompt, workspace.createdAt)}
          sessionId={workspace.sessions[0]?.id ?? ''}
        />
      ) : null}
      {runtime.status === 'failed' ? (
        <View style={styles.failure}>
          <Text style={styles.failed}>{runtime.message}</Text>
          <Button
            label="Try again"
            pending={pending !== null}
            onPress={() =>
              void run('retry', () =>
                attempt('Korev could not set up the workspace again', () =>
                  api.retryWorkspace(workspace.id),
                ),
              )
            }
          />
        </View>
      ) : (
        <WorkingIndicator
          label={worktreeProgress(workspace, runtime).title}
          since={creating ? Date.parse(workspace.createdAt) : undefined}
        />
      )}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    transcript: {
      flexGrow: 1,
      justifyContent: 'flex-end',
      padding: 12,
      gap: 12,
    },
    failure: { alignItems: 'flex-start', gap: 12 },
    failed: { ...TYPE.footnote, color: theme.dangerText },
  });
}
