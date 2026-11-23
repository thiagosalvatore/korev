import { Stack, useLocalSearchParams } from 'expo-router';
import { Check, CircleDashed, Minus, X } from 'lucide-react-native';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  primaryPr,
  type CheckState,
  type PrCheck,
} from '../../../../korev-desktop/src/shared/model';
import { useAppState } from '../../hooks';
import { useTheme, type Theme } from '../../theme';
import { MIN_TOUCH_TARGET } from '../../ui';

const ICON_SIZE = 16;

const CHECK_ICONS: Record<CheckState, typeof Check> = {
  success: Check,
  failure: X,
  pending: CircleDashed,
  skipped: Minus,
};

function checkColor(theme: Theme, state: CheckState): string {
  if (state === 'success') return theme.successText;
  if (state === 'failure') return theme.dangerText;
  if (state === 'pending') return theme.warningText;
  return theme.fg4;
}

function CheckRow({ check }: { check: PrCheck }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const Icon = CHECK_ICONS[check.state];
  return (
    <Pressable
      accessibilityRole={check.url ? 'link' : 'text'}
      disabled={!check.url}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => check.url && void Linking.openURL(check.url)}
    >
      <Icon size={ICON_SIZE} color={checkColor(theme, check.state)} />
      <Text style={styles.name}>{check.name}</Text>
      {check.required ? null : <Text style={styles.optional}>Optional</Text>}
    </Pressable>
  );
}

export default function ChecksSheet() {
  const { id, pr: prUrl } = useLocalSearchParams<{ id: string; pr?: string }>();
  const state = useAppState();
  const styles = makeStyles(useTheme());
  const workspace = state?.workspaces.find((entry) => entry.id === id);
  const pr = workspace && primaryPr(workspace, state?.runtime[id], prUrl);
  const checks = pr?.checks ?? [];
  return (
    <ScrollView style={styles.sheet} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen
        options={{ title: pr ? `Checks on #${pr.number}` : 'Checks' }}
      />
      {checks.map((check, index) => (
        <View key={check.name}>
          {index ? <View style={styles.separator} /> : null}
          <CheckRow check={check} />
        </View>
      ))}
      {checks.length ? null : (
        <Text style={styles.empty}>This pull request has no checks.</Text>
      )}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    sheet: { backgroundColor: theme.bgApp },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    pressed: { backgroundColor: theme.bgHover },
    name: { flex: 1, color: theme.fg1, fontSize: 16 },
    optional: { color: theme.fg4, fontSize: 13 },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 48,
      backgroundColor: theme.border1,
    },
    empty: { padding: 24, color: theme.fg3, textAlign: 'center' },
  });
}
