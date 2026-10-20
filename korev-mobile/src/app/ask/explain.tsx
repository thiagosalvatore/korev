import { router } from 'expo-router';
import { GitPullRequest } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  AppState,
  PullRequestSummary,
  Repo,
} from '../../../../korev-desktop/src/shared/model';
import { attempt } from '../../attempt';
import { useAppState } from '../../hooks';
import { useConnection } from '../../korev';
import { ListRow, ROW_ICON_SIZE } from '../../ListRow';
import { Loading } from '../../Offline';
import { useTheme, type Theme } from '../../theme';

const REVIEW_REQUESTED = 'review-requested:@me';
const OPENED_BY_ME = 'author:@me';

interface Choice {
  repo: Repo;
  pr: PullRequestSummary;
}

interface Group {
  title: string;
  choices: Choice[];
}

function usePullRequestGroups(state: AppState | null): Group[] | null {
  const { api } = useConnection();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const repos = state?.repos;
  useEffect(() => {
    if (!repos) return;
    let current = true;
    const list = (search: string) =>
      Promise.all(
        repos.map(async (repo) =>
          (await api.listPullRequests(repo.id, search)).map((pr) => ({
            repo,
            pr,
          })),
        ),
      ).then((perRepo) => perRepo.flat());
    void Promise.all([list(REVIEW_REQUESTED), list(OPENED_BY_ME)])
      .then(([requested, mine]) => {
        if (current)
          setGroups([
            { title: 'Waiting for your review', choices: requested },
            { title: 'Opened by you', choices: mine },
          ]);
      })
      .catch(() => current && setGroups([]));
    return () => {
      current = false;
    };
  }, [api, repos]);
  return groups;
}

export default function ExplainPullRequestScreen() {
  const { api } = useConnection();
  const state = useAppState();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const groups = usePullRequestGroups(state);
  const [starting, setStarting] = useState<string | null>(null);
  if (!groups) return <Loading style={styles.loading} />;

  const explain = async ({ repo, pr }: Choice) => {
    setStarting(`${repo.id}:${pr.number}`);
    await attempt('Korev could not explain the pull request', async () => {
      const started = await api.startExplainer({
        kind: 'pr',
        repoId: repo.id,
        number: pr.number,
      });
      if (started.ok && started.value.askChatId)
        router.replace({
          pathname: '/ask/[id]',
          params: { id: started.value.askChatId },
        });
      return started;
    });
    setStarting(null);
  };

  const shown = groups.filter((group) => group.choices.length);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.intro}>
        Korev reads the pull request and explains it in plain words, step by
        step. Nothing is checked out or changed.
      </Text>
      {shown.length ? null : (
        <Text style={styles.empty}>No pull requests wait for you.</Text>
      )}
      {shown.map((group) => (
        <View key={group.title}>
          <Text accessibilityRole="header" style={styles.groupTitle}>
            {group.title}
          </Text>
          {group.choices.map((choice) => {
            const key = `${choice.repo.id}:${choice.pr.number}`;
            return (
              <ListRow
                key={`${group.title}:${key}`}
                accessibilityLabel={`Explain #${choice.pr.number} ${choice.pr.title}`}
                icon={
                  starting === key ? (
                    <ActivityIndicator size="small" color={theme.accentText} />
                  ) : (
                    <GitPullRequest size={ROW_ICON_SIZE} color={theme.fg4} />
                  )
                }
                title={`#${choice.pr.number} ${choice.pr.title}`}
                subtitle={`${choice.repo.name} · @${choice.pr.author}`}
                onPress={() => {
                  if (starting === null) void explain(choice);
                }}
              />
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    loading: { marginTop: 40 },
    page: { padding: 8, paddingBottom: 32, gap: 12 },
    intro: {
      paddingHorizontal: 8,
      paddingTop: 8,
      color: theme.fg3,
      fontSize: 14,
    },
    empty: { padding: 24, color: theme.fg3, textAlign: 'center' },
    groupTitle: {
      paddingHorizontal: 8,
      paddingBottom: 4,
      color: theme.fg3,
      fontSize: 13,
      fontWeight: '600',
    },
  });
}
