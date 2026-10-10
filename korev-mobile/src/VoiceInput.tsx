import { useKeepAwake } from 'expo-keep-awake';
import {
  Check,
  ChevronLeft,
  ChevronUp,
  Lock,
  Mic,
  Trash2,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { DictationStatus } from '../../korev-desktop/src/shared/model';
import { attempt } from './attempt';
import type { Dictation } from './dictation';
import { releaseAction, slideAction } from './holdToRecord';
import { useConnection } from './korev';
import { useTheme, type Theme } from './theme';
import { ICON_BUTTON_SIZE, IconButton, touchSlop } from './ui';

const BAR_COUNT = 48;
const SILENT_DB = -60;
const MIN_BAR_HEIGHT = 0.08;
const ICON_SIZE = 20;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const HINT_MS = 1500;
const SMALL_ICON_SIZE = 14;
const POPOVER_GAP = 8;
const HINT_WIDTH = 240;
const ACTIVATE_ACTION = 'activate';

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
    return (
      <View style={styles.slot}>
        <Text style={styles.progress}>{status.progress}%</Text>
      </View>
    );
  if (dictation.phase === 'transcribing')
    return (
      <View style={styles.slot}>
        <ActivityIndicator />
      </View>
    );
  if (status.status !== 'ready')
    return (
      <IconButton
        label="Voice input"
        icon={<Mic size={ICON_SIZE} color={theme.fg2} />}
        background={theme.bgActive}
        onPress={() => void downloadModel()}
      />
    );
  if (dictation.locked)
    return (
      <IconButton
        label="Stop and insert text"
        icon={<Check size={ICON_SIZE} color={theme.fgOnAccent} />}
        background={theme.danger}
        onPress={dictation.done}
      />
    );
  return <HoldToRecordButton dictation={dictation} />;
}

function useHint() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [visible]);
  return { visible, show: () => setVisible(true) };
}

function HoldToRecordButton({ dictation }: { dictation: Dictation }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const hint = useHint();
  const press = useRef({ x: 0, y: 0, at: 0, settled: false });
  const starting = useRef(Promise.resolve(false));
  const holding = dictation.phase === 'recording';

  function afterStart(action: () => void) {
    void starting.current.then(action);
  }

  function grant(event: GestureResponderEvent) {
    const { pageX, pageY } = event.nativeEvent;
    press.current = { x: pageX, y: pageY, at: Date.now(), settled: false };
    starting.current = dictation.start();
  }

  function settle(action: () => void) {
    if (press.current.settled) return;
    press.current.settled = true;
    afterStart(action);
  }

  function move(event: GestureResponderEvent) {
    const { pageX, pageY } = event.nativeEvent;
    const slide = slideAction(pageX - press.current.x, pageY - press.current.y);
    if (slide === 'cancel') settle(dictation.cancel);
    if (slide === 'lock') settle(dictation.lock);
  }

  function release() {
    if (press.current.settled) return;
    if (releaseAction(Date.now() - press.current.at) === 'done')
      return settle(dictation.done);
    settle(dictation.cancel);
    hint.show();
  }

  function startHandsFree(event: AccessibilityActionEvent) {
    if (event.nativeEvent.actionName !== ACTIVATE_ACTION) return;
    starting.current = dictation.start();
    afterStart(dictation.lock);
  }

  return (
    <View>
      {holding ? (
        <View style={[styles.popover, styles.lock]}>
          <Lock size={SMALL_ICON_SIZE} color={theme.fg2} />
          <ChevronUp size={SMALL_ICON_SIZE} color={theme.fg3} />
        </View>
      ) : null}
      {hint.visible ? (
        <View style={[styles.popover, styles.hint]}>
          <Text style={styles.hintText}>Hold to record, release to insert</Text>
        </View>
      ) : null}
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel="Voice input"
        accessibilityHint="Hold to record, release to insert the text"
        accessibilityActions={[{ name: ACTIVATE_ACTION }]}
        onAccessibilityAction={startHandsFree}
        hitSlop={touchSlop(ICON_BUTTON_SIZE)}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={grant}
        onResponderMove={move}
        onResponderRelease={release}
        onResponderTerminate={() => settle(dictation.cancel)}
        style={[
          styles.holdButton,
          { backgroundColor: holding ? theme.danger : theme.bgActive },
        ]}
      >
        <Mic size={ICON_SIZE} color={holding ? theme.fgOnAccent : theme.fg2} />
      </View>
    </View>
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

function DiscardButton({ dictation }: { dictation: Dictation }) {
  const theme = useTheme();
  const transcribing = dictation.phase === 'transcribing';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Discard recording"
      disabled={transcribing}
      hitSlop={8}
      onPress={dictation.cancel}
    >
      <Trash2 size={ICON_SIZE} color={transcribing ? theme.fg4 : theme.fg2} />
    </Pressable>
  );
}

function SlideToCancel() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.slideToCancel}>
      <ChevronLeft size={SMALL_ICON_SIZE} color={theme.fg3} />
      <Text style={styles.meta}>Slide to cancel</Text>
    </View>
  );
}

export function RecordingBar({
  dictation,
  style,
}: {
  dictation: Dictation;
  style?: StyleProp<ViewStyle>;
}) {
  useKeepAwake();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const levels = useLevels(dictation);
  const transcribing = dictation.phase === 'transcribing';
  const holding = dictation.phase === 'recording' && !dictation.locked;
  return (
    <View style={[styles.bar, style]}>
      {holding ? <SlideToCancel /> : <DiscardButton dictation={dictation} />}
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
    slideToCancel: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    holdButton: {
      width: ICON_BUTTON_SIZE,
      height: ICON_BUTTON_SIZE,
      borderRadius: ICON_BUTTON_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    popover: {
      position: 'absolute',
      bottom: ICON_BUTTON_SIZE + POPOVER_GAP,
      backgroundColor: theme.bgSurface,
      borderColor: theme.border2,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
    },
    lock: {
      left: 0,
      width: ICON_BUTTON_SIZE,
      paddingVertical: 8,
      borderRadius: ICON_BUTTON_SIZE / 2,
      gap: 4,
    },
    hint: {
      right: 0,
      width: HINT_WIDTH,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    hintText: { color: theme.fg1, fontSize: 13, textAlign: 'center' },
    slot: {
      width: ICON_BUTTON_SIZE,
      height: ICON_BUTTON_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
