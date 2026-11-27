import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AppState } from '../../../../../korev-desktop/src/shared/model';
import { workspaceLabel } from '../../../../../korev-desktop/src/shared/workspaces';
import { useAppState, useReconnect } from '../../../hooks';
import {
  homeSections,
  type HomeEntry,
  type HomeSection,
  type HomeSectionId,
} from '../../../inbox';
import { Loading } from '../../../Offline';
import { MONO_FONT, TYPE, useTheme, type Theme } from '../../../theme';
import { CHROME_FONT_SCALE, MIN_TOUCH_TARGET } from '../../../ui';
import {
  ARCHIVE_ACTION,
  StatusIcon,
  SwipeToArchive,
  useArchive,
} from '../../../WorkspaceStatus';

const SECTION_TITLES: Record<HomeSectionId, string> = {
  'needs-you': 'Needs you',
  working: 'Working',
  ready: 'Ready to merge',
  other: 'Everything else',
};

const ICON_COLUMN = 28;
const SEARCH_ICON_SIZE = 17;
const SEARCH_HEIGHT = 38;
const ROW_PADDING = 16;
const ROW_GAP = 12;

type Styles = ReturnType<typeof makeStyles>;

function repoName(state: AppState, entry: HomeEntry): string {
  return (
    state.repos.find((repo) => repo.id === entry.workspace.repoId)?.name ?? ''
  );
}

function matches(state: AppState, entry: HomeEntry, query: string): boolean {
  const { workspace } = entry;
  return [workspaceLabel(workspace), workspace.branch, repoName(state, entry)]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

function filtered(
  state: AppState,
  sections: HomeSection[],
  query: string,
): HomeSection[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sections;
  return sections
    .map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => matches(state, entry, needle)),
    }))
    .filter((section) => section.entries.length > 0);
}

function HomeRow({
  state,
  entry,
  section,
  first,
  styles,
}: {
  state: AppState;
  entry: HomeEntry;
  section: HomeSectionId;
  first: boolean;
  styles: Styles;
}) {
  const theme = useTheme();
  const { workspace, runtime, status } = entry;
  const archive = useArchive(workspace);
  const label = workspaceLabel(workspace);
  const stats = runtime?.stats;
  const hasStats = stats && (stats.additions > 0 || stats.deletions > 0);
  const failed = runtime?.status === 'failed' || Boolean(runtime?.setupError);
  return (
    <SwipeToArchive archive={archive} background={theme.bgSurface}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Workspace ${label}, ${status}`}
        accessibilityActions={[{ name: ARCHIVE_ACTION, label: 'Archive' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === ARCHIVE_ACTION) void archive();
        }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() =>
          router.push({
            pathname: '/workspace/[id]',
            params: { id: workspace.id },
          })
        }
      >
        <View style={styles.icon}>
          {runtime ? (
            <StatusIcon workspace={workspace} runtime={runtime} />
          ) : null}
        </View>
        <View style={[styles.body, !first && styles.divider]}>
          <View style={styles.text}>
            <Text
              style={[
                styles.title,
                (runtime?.unread || section === 'needs-you') &&
                  styles.titleStrong,
              ]}
              numberOfLines={2}
            >
              {label}
            </Text>
            <Text
              style={[styles.status, failed && styles.statusFailed]}
              numberOfLines={2}
            >
              {status}
            </Text>
          </View>
          <View style={styles.end}>
            <Text
              maxFontSizeMultiplier={CHROME_FONT_SCALE}
              style={styles.repo}
              numberOfLines={1}
            >
              {repoName(state, entry)}
            </Text>
            {hasStats ? (
              <Text
                maxFontSizeMultiplier={CHROME_FONT_SCALE}
                style={styles.stats}
              >
                <Text style={styles.additions}>+{stats.additions}</Text>{' '}
                <Text style={styles.deletions}>−{stats.deletions}</Text>
              </Text>
            ) : null}
            {runtime?.unread ? <View style={styles.dot} /> : null}
          </View>
        </View>
      </Pressable>
    </SwipeToArchive>
  );
}

function SearchField({
  value,
  onChangeText,
  styles,
}: {
  value: string;
  onChangeText: (text: string) => void;
  styles: Styles;
}) {
  const theme = useTheme();
  return (
    <View style={styles.search}>
      <Search size={SEARCH_ICON_SIZE} color={theme.fg3} />
      <TextInput
        accessibilityLabel="Search workspaces"
        maxFontSizeMultiplier={CHROME_FONT_SCALE}
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder="Search"
        placeholderTextColor={theme.fg3}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
      />
    </View>
  );
}

function sectionTitleColor(theme: Theme, id: HomeSectionId): string {
  if (id === 'needs-you') return theme.warningText;
  if (id === 'ready') return theme.successText;
  return theme.fg3;
}

export default function HomeScreen() {
  const state = useAppState();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { refreshing, refresh } = useReconnect();
  const [query, setQuery] = useState('');
  if (!state) return <Loading />;
  const sections = filtered(state, homeSections(state), query);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
      keyboardDismissMode="on-drag"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <SearchField value={query} onChangeText={setQuery} styles={styles} />
      {sections.map((section) => (
        <View key={section.id} style={styles.section}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={CHROME_FONT_SCALE}
            style={[
              styles.sectionTitle,
              { color: sectionTitleColor(theme, section.id) },
            ]}
          >
            {SECTION_TITLES[section.id]}
          </Text>
          <View style={styles.group}>
            {section.entries.map((entry, index) => (
              <HomeRow
                key={entry.workspace.id}
                state={state}
                entry={entry}
                section={section.id}
                first={index === 0}
                styles={styles}
              />
            ))}
          </View>
        </View>
      ))}
      {sections.length === 0 ? (
        <Text style={styles.empty}>
          {query
            ? 'No workspace matches your search.'
            : 'Add a repository in Korev on your Mac to start.'}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    page: { paddingHorizontal: 16, paddingBottom: 32, gap: 22 },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: SEARCH_HEIGHT,
      paddingHorizontal: 10,
      borderRadius: SEARCH_HEIGHT / 2,
      backgroundColor: theme.bgActive,
    },
    searchInput: { ...TYPE.body, flex: 1, padding: 0, color: theme.fg1 },
    section: { gap: 6 },
    sectionTitle: {
      ...TYPE.footnote,
      paddingHorizontal: ROW_PADDING,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    group: {
      overflow: 'hidden',
      borderRadius: 14,
      backgroundColor: theme.bgSurface,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: ROW_GAP,
      paddingLeft: ROW_PADDING,
      backgroundColor: theme.bgSurface,
    },
    pressed: { backgroundColor: theme.bgHover },
    icon: {
      width: ICON_COLUMN,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: ROW_GAP,
      minHeight: MIN_TOUCH_TARGET + 18,
      paddingVertical: 10,
      paddingRight: ROW_PADDING,
    },
    divider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border2,
    },
    text: { flex: 1, gap: 2 },
    title: { ...TYPE.headline, fontWeight: '500', color: theme.fg1 },
    titleStrong: { fontWeight: '600' },
    status: { ...TYPE.subhead, color: theme.fg2 },
    statusFailed: { color: theme.dangerText },
    end: { alignItems: 'flex-end', gap: 4, maxWidth: '40%' },
    repo: { ...TYPE.footnote, color: theme.fg3 },
    stats: { fontFamily: MONO_FONT, fontSize: 11 },
    additions: { color: theme.diffAdd },
    deletions: { color: theme.diffDel },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.accent,
    },
    empty: { ...TYPE.body, padding: 24, color: theme.fg3, textAlign: 'center' },
  });
}
