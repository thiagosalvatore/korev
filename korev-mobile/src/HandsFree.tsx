import {
  setAudioModeAsync,
  useAudioRecorder,
  type AudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { Mic } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  AppState as PhoneAppState,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import type { KorevApi } from '../../korev-desktop/src/shared/api';
import type { DictationStatus } from '../../korev-desktop/src/shared/model';
import { allowMicrophone, SPEECH_RECORDING } from './dictation';
import { useConnection } from './korev';
import { openWorkspace } from './navigation';
import { createSentenceDetector, type Heard } from './sentence';
import { useTheme, type Theme } from './theme';
import { CHROME_FONT_SCALE } from './ui';
import { downloadVoiceModel } from './VoiceInput';

const METER_POLL_MS = 50;
const AWAKE_MS = 8000;
const RETRY_MS = 2000;
const AWAKE_PROMPT = 'Yes?';
const ICON_SIZE = 18;

const OFF_TEXT = 'Talk to Korev. Works while this app is open.';
const STATUS = {
  starting: 'Starting the microphone…',
  listening: 'Listening. Start with “Korev”.',
  awake: 'Listening for your command.',
  thinking: 'Working on it…',
  speaking: 'Speaking…',
};

interface Listener {
  api: KorevApi;
  recorder: AudioRecorder;
  toSay: string[];
  stopped: boolean;
  awakeUntil: number;
  show(status: string): void;
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const isAwake = (listener: Listener) => Date.now() < listener.awakeUntil;

function speak(text: string) {
  return new Promise<void>((resolve) =>
    Speech.speak(text, {
      onDone: resolve,
      onStopped: resolve,
      onError: () => resolve(),
    }),
  );
}

async function say(listener: Listener, text: string) {
  listener.show(STATUS.speaking);
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  await speak(text);
}

async function recordSentence(listener: Listener): Promise<File | null> {
  const { recorder } = listener;
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  await recorder.prepareToRecordAsync();
  recorder.record();
  listener.show(isAwake(listener) ? STATUS.awake : STATUS.listening);
  const heard = createSentenceDetector(Date.now());
  let result: Heard = 'waiting';
  while (result === 'waiting' && !listener.stopped && !listener.toSay.length) {
    await pause(METER_POLL_MS);
    result = heard(recorder.getStatus().metering, Date.now());
  }
  await recorder.stop();
  const clip = recorder.uri ? new File(recorder.uri) : null;
  if (result === 'sentence') return clip;
  clip?.delete();
  return null;
}

async function obey(listener: Listener, clip: File) {
  listener.show(STATUS.thinking);
  const awake = isAwake(listener);
  const audio = await clip.base64();
  clip.delete();
  const spoken = await listener.api.transcribe(audio);
  if (!spoken || listener.stopped) return;
  listener.awakeUntil = 0;
  const answer = await listener.api.runVoiceCommand(spoken, { awake });
  if (listener.stopped) return;
  if (answer.openWorkspaceId) openWorkspace(answer.openWorkspaceId);
  if (answer.reply) await say(listener, answer.reply);
  if (!answer.listening) return;
  await say(listener, AWAKE_PROMPT);
  listener.awakeUntil = Date.now() + AWAKE_MS;
}

async function step(listener: Listener) {
  const next = listener.toSay.shift();
  if (next !== undefined) return say(listener, next);
  const clip = await recordSentence(listener);
  if (clip) await obey(listener, clip);
}

async function listen(listener: Listener) {
  while (!listener.stopped) {
    try {
      await step(listener);
    } catch (error) {
      listener.show(error instanceof Error ? error.message : String(error));
      await pause(RETRY_MS);
    }
  }
  await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
}

function useHandsFree(): string {
  const { api, on } = useConnection();
  const recorder = useAudioRecorder(SPEECH_RECORDING);
  const [status, setStatus] = useState(STATUS.starting);
  useKeepAwake();
  useEffect(() => {
    const listener: Listener = {
      api,
      recorder,
      toSay: [],
      stopped: false,
      awakeUntil: 0,
      show: setStatus,
    };
    const stopAnnouncing = on('announce', ({ text }) =>
      listener.toSay.push(text),
    );
    void listen(listener);
    return () => {
      listener.stopped = true;
      stopAnnouncing();
      void Speech.stop();
    };
  }, [api, on, recorder]);
  return status;
}

function useAppActive(): boolean {
  const [active, setActive] = useState(PhoneAppState.currentState === 'active');
  useEffect(() => {
    const change = PhoneAppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => change.remove();
  }, []);
  return active;
}

function HandsFreeStatus({ styles }: { styles: Styles }) {
  return <Text style={styles.detail}>{useHandsFree()}</Text>;
}

export function HandsFreeToggle({ dictation }: { dictation: DictationStatus }) {
  const { api } = useConnection();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [on, setOn] = useState(false);
  const active = useAppActive();

  async function toggle(next: boolean) {
    if (!next) return setOn(false);
    if (dictation.status !== 'ready') return downloadVoiceModel(api);
    setOn(await allowMicrophone());
  }

  return (
    <View style={styles.bar}>
      <Mic size={ICON_SIZE} color={on ? theme.accentText : theme.fg3} />
      <View style={styles.text}>
        <Text maxFontSizeMultiplier={CHROME_FONT_SCALE} style={styles.title}>
          Hands-free
        </Text>
        {on && active ? (
          <HandsFreeStatus styles={styles} />
        ) : (
          <Text style={styles.detail}>{OFF_TEXT}</Text>
        )}
      </View>
      <Switch
        accessibilityLabel="Hands-free"
        value={on}
        onValueChange={(next) => void toggle(next)}
      />
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: theme.bgSurface,
    },
    text: { flex: 1, gap: 2 },
    title: { color: theme.fg1, fontSize: 15, fontWeight: '600' },
    detail: { color: theme.fg3, fontSize: 13 },
  });
}
