import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { duration } from '../../../korev-desktop/src/shared/format';
import { MONO_FONT, useTheme, type Theme } from '../theme';

const TICK_MS = 1000;

function Elapsed({ since, styles }: { since: number; styles: Styles }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text style={styles.elapsed}>{duration(Math.max(0, now - since))}</Text>
  );
}

export function WorkingIndicator({
  label,
  since,
}: {
  label: string;
  since?: number;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.row} accessibilityRole="progressbar">
      <ActivityIndicator size="small" color={theme.accentText} />
      <Text style={styles.label}>{label}</Text>
      {since === undefined ? null : <Elapsed since={since} styles={styles} />}
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { color: theme.fg3, fontSize: 13 },
    elapsed: { color: theme.fg4, fontFamily: MONO_FONT, fontSize: 12 },
  });
}
