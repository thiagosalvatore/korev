import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { pickerLabel } from '../../korev-desktop/src/shared/format';
import type { Repo } from '../../korev-desktop/src/shared/model';
import { ROW_ICON_SIZE } from './ListRow';
import { PickerSheet } from './PickerSheet';
import { RepoAvatar } from './RepoAvatar';
import { useTheme, type Theme } from './theme';
import { CHROME_FONT_SCALE } from './ui';

export function RepoPicker({
  repos,
  selected,
  multiple = false,
  onToggle,
}: {
  repos: Repo[];
  selected: string[];
  multiple?: boolean;
  onToggle: (repoId: string) => void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [open, setOpen] = useState(false);
  const picked = repos.filter((repo) => selected.includes(repo.id));

  function pick(repoId: string) {
    onToggle(repoId);
    if (!multiple) setOpen(false);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Repositories"
        style={styles.button}
        onPress={() => setOpen(true)}
      >
        {picked[0] ? <RepoAvatar repo={picked[0]} /> : null}
        <Text
          maxFontSizeMultiplier={CHROME_FONT_SCALE}
          style={styles.label}
          numberOfLines={1}
        >
          {pickerLabel(picked)}
        </Text>
        <ChevronDown size={ROW_ICON_SIZE} color={theme.fg4} />
      </Pressable>
      <PickerSheet
        title={multiple ? 'Choose repositories' : 'Choose a repository'}
        visible={open}
        options={repos.map((repo) => ({
          key: repo.id,
          label: repo.name,
          icon: <RepoAvatar repo={repo} />,
          selected: selected.includes(repo.id),
        }))}
        onSelect={pick}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border2,
    },
    label: { flexShrink: 1, color: theme.fg1, fontSize: 14, fontWeight: '600' },
  });
}
