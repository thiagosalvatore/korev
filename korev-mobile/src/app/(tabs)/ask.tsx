import { router } from 'expo-router';
import { MessageCircleQuestion, MessageSquare } from 'lucide-react-native';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { timeAgo } from '../../../../korev-desktop/src/shared/format';
import type {
  AppState,
  AskChat,
} from '../../../../korev-desktop/src/shared/model';
import {
  askSections,
  repoSections,
} from '../../../../korev-desktop/src/shared/workspaces';
import { NewAskForm } from '../../ask/NewAskForm';
import { useAppState, useReconnect } from '../../hooks';
import { Loading } from '../../Offline';
import { ListRow, ROW_ICON_SIZE } from '../../ListRow';
import { useTheme, type Theme } from '../../theme';
import { CHROME_FONT_SCALE } from '../../ui';

const ACROSS_REPOS = 'Across repos';
const NO_REPOSITORY = 'No repository';

interface AskSection {
  title: string;
  asks: AskChat[];
}

function repoNames(state: AppState, ask: AskChat): string {
  return ask.repoIds
    .map((id) => state.repos.find((repo) => repo.id === id)?.name)
    .filter(Boolean)
    .join(', ');
}

function openAskChat(ask: AskChat) {
  router.push({ pathname: '/ask/[id]', params: { id: ask.id } });
}

function AskChatIcon({ state, ask }: { state: AppState; ask: AskChat }) {
  const theme = useTheme();
  if (state.waitingSessions.includes(ask.session.id))
    return (
      <MessageCircleQuestion size={ROW_ICON_SIZE} color={theme.warningText} />
    );
  if (state.runningSessions.includes(ask.session.id))
    return <ActivityIndicator size="small" color={theme.accentText} />;
  return <MessageSquare size={ROW_ICON_SIZE} color={theme.fg4} />;
}

function AskChatRow({ state, ask }: { state: AppState; ask: AskChat }) {
  const styles = makeStyles(useTheme());
  return (
    <ListRow
      accessibilityLabel={`Ask ${ask.session.title}`}
      icon={<AskChatIcon state={state} ask={ask} />}
      title={ask.session.title}
      highlighted={state.waitingSessions.includes(ask.session.id)}
      subtitle={repoNames(state, ask)}
      end={<Text style={styles.age}>{timeAgo(ask.lastMessageAt)}</Text>}
      onPress={() => openAskChat(ask)}
    />
  );
}

function sectionsOf(state: AppState): AskSection[] {
  const { acrossRepos, byRepo, noRepo } = askSections(state);
  const repos = repoSections(state).flatMap((section) => section.repos);
  return [
    { title: ACROSS_REPOS, asks: acrossRepos },
    ...repos.map((repo) => ({
      title: repo.name,
      asks: byRepo.get(repo.id) ?? [],
    })),
    { title: NO_REPOSITORY, asks: noRepo },
  ].filter((section) => section.asks.length > 0);
}

export default function AskChatsScreen() {
  const state = useAppState();
  const styles = makeStyles(useTheme());
  const { refreshing, refresh } = useReconnect();
  if (!state) return <Loading style={styles.loading} />;
  const sections = sectionsOf(state);
  if (!sections.length)
    return <NewAskForm state={state} autoFocus={false} onAsked={openAskChat} />;
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={CHROME_FONT_SCALE}
            style={styles.sectionTitle}
          >
            {section.title}
          </Text>
          {section.asks.map((ask) => (
            <AskChatRow key={ask.id} state={state} ask={ask} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    loading: { marginTop: 40 },
    page: { padding: 8, paddingBottom: 32 },
    section: { marginBottom: 12 },
    sectionTitle: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: theme.fg4,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    age: { color: theme.fg4, fontSize: 11 },
  });
}
