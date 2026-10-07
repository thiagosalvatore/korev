import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { Repo } from '../../korev-desktop/src/shared/model';
import { RepoAvatar } from './RepoAvatar';
import { useTheme, type Theme } from './theme';

export function RepoPicker({
  repos,
  selected,
  onToggle,
}: {
  repos: Repo[];
  selected: string[];
  onToggle: (repoId: string) => void;
}) {
  const styles = makeStyles(useTheme());
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.repos}
    >
      {repos.map((repo) => {
        const checked = selected.includes(repo.id);
        return (
          <Pressable
            key={repo.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            style={[styles.repo, checked && styles.repoSelected]}
            onPress={() => onToggle(repo.id)}
          >
            <RepoAvatar repo={repo} />
            <Text style={styles.repoName}>{repo.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    repos: { gap: 8 },
    repo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border2,
    },
    repoSelected: {
      borderColor: theme.accent,
      backgroundColor: theme.accentSubtle,
    },
    repoName: { color: theme.fg1, fontSize: 14, fontWeight: '600' },
  });
}
