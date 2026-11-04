import { router } from 'expo-router';
import { GitPullRequest } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { timeAgo } from '../../../korev-desktop/src/shared/format';
import {
  INBOX_GROUPS,
  inboxStatuses,
  type AppState,
  type InboxPullRequest,
  type InboxStatus,
  type Result,
} from '../../../korev-desktop/src/shared/model';
import {
  reviewChatOf,
  workspaceOfPr,
} from '../../../korev-desktop/src/shared/workspaces';
import { attempt } from '../attempt';
import { chooseOption } from '../chooseOption';
import { useAppState, usePendingAction } from '../hooks';
import { useConnection } from '../korev';
import { ListRow, ROW_ICON_SIZE } from '../ListRow';
import { Loading } from '../Offline';
import { useTheme, type Theme } from '../theme';

type Action = 'review' | 'explain' | 'workspace' | 'github';
type Api = ReturnType<typeof useConnection>['api'];

const ACTIONS: readonly Action[] = ['review', 'explain', 'workspace', 'github'];

function actionLabels(state: AppState, pr: InboxPullRequest) {
  return {
    review: reviewChatOf(state, pr.url) ? 'Open review' : 'Review',
    explain: 'Explain',
    workspace: workspaceOfPr(state, pr.url) ? 'Open workspace' : 'Check out',
    github: 'Open on GitHub',
  };
}

function openAskChat(askChatId: string) {
  router.replace({ pathname: '/ask/[id]', params: { id: askChatId } });
}

function openWorkspace(workspaceId: string) {
  router.replace({ pathname: '/workspace/[id]', params: { id: workspaceId } });
}

async function review(api: Api, state: AppState, pr: InboxPullRequest) {
  const existing = reviewChatOf(state, pr.url);
  if (existing) return openAskChat(existing.id);
  await attempt('Korev could not start the review', async () => {
    const started = await api.reviewPullRequest(pr.repoId, pr.number);
    if (started.ok) openAskChat(started.value.askChatId);
    return started;
  });
}

async function explain(api: Api, pr: InboxPullRequest) {
  await attempt('Korev could not explain the pull request', async () => {
    const started = await api.startExplainer({
      kind: 'pr',
      repoId: pr.repoId,
      number: pr.number,
    });
    if (started.ok && started.value.askChatId)
      openAskChat(started.value.askChatId);
    return started;
  });
}

async function checkOut(api: Api, state: AppState, pr: InboxPullRequest) {
  const existing = workspaceOfPr(state, pr.url);
  if (existing) return openWorkspace(existing.id);
  await attempt('Korev could not check out the pull request', async () => {
    const created = await api.createWorkspaces([pr.repoId], null, {
      kind: 'pr',
      number: pr.number,
      branch: pr.headRefName,
      baseBranch: pr.baseRefName,
    });
    if (created.ok) openWorkspace(created.value[0].id);
    return created;
  });
}

function runAction(
  action: Action,
  api: Api,
  state: AppState,
  pr: InboxPullRequest,
): Promise<void> {
  if (action === 'review') return review(api, state, pr);
  if (action === 'explain') return explain(api, pr);
  if (action === 'workspace') return checkOut(api, state, pr);
  return Linking.openURL(pr.url);
}

function useInbox(api: Api) {
  const [inbox, setInbox] = useState<Result<InboxPullRequest[]> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const loaded = await api.pullRequestInbox().catch((error: unknown) => ({
      ok: false as const,
      message: String(error),
    }));
    setInbox(loaded);
  }, [api]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);
  useEffect(() => {
    void load();
  }, [load]);
  return { inbox, refreshing, refresh };
}

function statusColor(theme: Theme, tone: InboxStatus['tone']): string {
  if (tone === 'danger') return theme.dangerText;
  if (tone === 'warning') return theme.warningText;
  if (tone === 'success') return theme.successText;
  return theme.fg3;
}

export default function PullRequestsScreen() {
  const { api } = useConnection();
  const state = useAppState();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { inbox, refreshing, refresh } = useInbox(api);
  const { pending, run } = usePendingAction();
  if (!inbox || !state) return <Loading style={styles.loading} />;

  const choose = async (pr: InboxPullRequest) => {
    const action = await chooseOption(
      `#${pr.number} ${pr.title}`,
      ACTIONS,
      actionLabels(state, pr),
    );
    if (action) await run(pr.url, () => runAction(action, api, state, pr));
  };

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      {inbox.ok ? null : <Text style={styles.empty}>{inbox.message}</Text>}
      {(inbox.ok ? INBOX_GROUPS : []).map((group) => {
        const prs = inbox.ok
          ? inbox.value.filter((pr) => pr.reason === group.reason)
          : [];
        return (
          <View key={group.reason}>
            <Text accessibilityRole="header" style={styles.groupTitle}>
              {group.title}
            </Text>
            {prs.length ? null : (
              <Text style={styles.groupEmpty}>{group.empty}</Text>
            )}
            {prs.map((pr) => {
              const repo = state.repos.find((entry) => entry.id === pr.repoId);
              return (
                <ListRow
                  key={pr.url}
                  accessibilityLabel={`#${pr.number} ${pr.title}`}
                  icon={
                    pending === pr.url ? (
                      <ActivityIndicator
                        size="small"
                        color={theme.accentText}
                      />
                    ) : (
                      <GitPullRequest size={ROW_ICON_SIZE} color={theme.fg4} />
                    )
                  }
                  title={`#${pr.number} ${pr.title}`}
                  subtitle={`${repo?.name ?? ''} · @${pr.author} · ${timeAgo(pr.updatedAt)}`}
                  end={inboxStatuses(pr).map((status) => (
                    <Text
                      key={status.label}
                      style={[
                        styles.status,
                        { color: statusColor(theme, status.tone) },
                      ]}
                    >
                      {status.label}
                    </Text>
                  ))}
                  onPress={() => void choose(pr)}
                />
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    loading: { marginTop: 40 },
    page: { padding: 8, paddingBottom: 32, gap: 12 },
    empty: { padding: 24, color: theme.fg3, textAlign: 'center' },
    groupTitle: {
      paddingHorizontal: 8,
      paddingBottom: 4,
      color: theme.fg3,
      fontSize: 13,
      fontWeight: '600',
    },
    groupEmpty: { paddingHorizontal: 8, color: theme.fg4, fontSize: 14 },
    status: { fontSize: 12, fontWeight: '600' },
  });
}
