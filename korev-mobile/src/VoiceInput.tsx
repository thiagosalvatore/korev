import { Check, Mic, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { DictationStatus } from '../../korev-desktop/src/shared/model';
import { attempt } from './attempt';
import type { Dictation } from './dictation';
import { useConnection } from './korev';
import { useTheme, type Theme } from './theme';

const BAR_COUNT = 48;
const SILENT_DB = -60;
const MIN_BAR_HEIGHT = 0.08;
const ICON_SIZE = 20;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

const SILENCE: number[] = Array.from({ length: BAR_COUNT }, () => 0);

function levelFromDecibels(decibels: number | undefined): number {
  if (decibels === undefined) return 0;
  return Math.min(1, Math.max(0, (decibels - SILENT_DB) / -SILENT_DB));
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / MS_PER_SECOND);
  const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, '0');
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${rest}`;
}

export function MicButton({
  status,
  dictation,
}: {
  status: DictationStatus | undefined;
  dictation: Dictation;
}) {
  const { api } = useConnection();
  const theme = useTheme();
  const styles = makeStyles(theme);

  async function downloadModel() {
    const started = await attempt('Korev could not start the download', () =>
      api.prepareDictation(),
    );
    if (started)
      Alert.alert(
        'Downloading the voice model',
        'Your Mac is downloading the voice model (550 MB). Voice input works when it finishes.',
      );
  }

  if (!status) return null;
  if (status.status === 'downloading')
    return <Text style={styles.progress}>{status.progress}%</Text>;
  if (dictation.phase === 'transcribing') return <ActivityIndicator />;
  if (dictation.phase === 'recording')
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop and insert text"
        style={styles.done}
        onPress={dictation.done}
      >
        <Check size={ICON_SIZE} color={theme.fgOnAccent} />
      </Pressable>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voice input"
      hitSlop={8}
      onPress={
        status.status === 'ready' ? dictation.start : () => void downloadModel()
      }
    >
      <Mic size={ICON_SIZE} color={theme.fg2} />
    </Pressable>
  );
}

function useLevels(dictation: Dictation): number[] {
  const [levels, setLevels] = useState(SILENCE);
  const { metering, durationMillis } = dictation;
  useEffect(() => {
    if (dictation.phase !== 'recording') return;
    setLevels((current) => [...current.slice(1), levelFromDecibels(metering)]);
  }, [dictation.phase, metering, durationMillis]);
  return levels;
}

export function RecordingBar({
  dictation,
  style,
}: {
  dictation: Dictation;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const levels = useLevels(dictation);
  const transcribing = dictation.phase === 'transcribing';
  return (
    <View style={[styles.bar, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Discard recording"
        disabled={transcribing}
        hitSlop={8}
        onPress={dictation.cancel}
      >
        <Trash2 size={ICON_SIZE} color={transcribing ? theme.fg4 : theme.fg2} />
      </Pressable>
      {transcribing ? (
        <Text style={styles.meta}>Transcribing…</Text>
      ) : (
        <View style={styles.timer}>
          <View style={styles.dot} />
          <Text style={styles.meta}>
            {formatElapsed(dictation.durationMillis)}
          </Text>
        </View>
      )}
      <View style={styles.wave}>
        {levels.map((level, index) => (
          <View
            key={index}
            style={[
              styles.waveBar,
              { height: `${Math.max(MIN_BAR_HEIGHT, level) * 100}%` },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    timer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.danger,
    },
    meta: { color: theme.fg2, fontSize: 13, fontVariant: ['tabular-nums'] },
    wave: {
      flex: 1,
      height: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 2,
      overflow: 'hidden',
    },
    waveBar: { width: 3, borderRadius: 2, backgroundColor: theme.fg3 },
    progress: { color: theme.fg3, fontSize: 13 },
    done: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.danger,
    },
  });
}
