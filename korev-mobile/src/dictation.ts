import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Alert } from 'react-native';
import { attempt } from './attempt';
import { useConnection } from './korev';

const SPEECH_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 32_000,
  isMeteringEnabled: true,
};
const METERING_INTERVAL_MS = 50;

export type DictationPhase = 'idle' | 'recording' | 'transcribing';

export function useDictation(onText: (text: string) => void) {
  const { api } = useConnection();
  const recorder = useAudioRecorder(SPEECH_RECORDING);
  const recording = useAudioRecorderState(recorder, METERING_INTERVAL_MS);
  const [transcribing, setTranscribing] = useState(false);
  const [locked, setLocked] = useState(false);

  async function start() {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Korev cannot use the microphone',
        'Allow microphone access for Korev in Settings to use voice input.',
      );
      return;
    }
    void api.prepareDictation().catch(() => undefined);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stopRecording(): Promise<File | null> {
    setLocked(false);
    if (!recorder.isRecording) return null;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    return recorder.uri ? new File(recorder.uri) : null;
  }

  async function done() {
    const recordingFile = await stopRecording();
    if (!recordingFile) return;
    setTranscribing(true);
    await attempt('Korev could not turn your speech into text', async () => {
      const text = await api.transcribe(await recordingFile.base64());
      if (text) onText(text);
    });
    recordingFile.delete();
    setTranscribing(false);
  }

  async function cancel() {
    (await stopRecording())?.delete();
  }

  let phase: DictationPhase = 'idle';
  if (transcribing) phase = 'transcribing';
  else if (recording.isRecording) phase = 'recording';

  return {
    phase,
    locked,
    metering: recording.metering,
    durationMillis: recording.durationMillis,
    start: () => attempt('Korev could not start recording', start),
    lock: () => setLocked(recorder.isRecording),
    done: () => void done(),
    cancel: () => void cancel(),
  };
}

export type Dictation = ReturnType<typeof useDictation>;
