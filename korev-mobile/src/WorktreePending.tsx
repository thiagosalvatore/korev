import { ScrollView, StyleSheet, Text } from 'react-native';
import type {
  Workspace,
  WorkspaceRuntime,
} from '../../korev-desktop/src/shared/model';
import { worktreeProgress } from '../../korev-desktop/src/shared/workspaces';
import { UserMessage } from './chat/ChatItemView';
import { pendingUserItem } from './chat/pending';
import { WorkingIndicator } from './chat/WorkingIndicator';
import { useTheme, type Theme } from './theme';

export function WorktreePending({
  workspace,
  runtime,
}: {
  workspace: Workspace;
  runtime: WorkspaceRuntime;
}) {
  const styles = makeStyles(useTheme());
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
        <Text style={styles.failed}>{runtime.message}</Text>
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
    failed: { color: theme.dangerText, fontSize: 13, lineHeight: 19 },
  });
}
