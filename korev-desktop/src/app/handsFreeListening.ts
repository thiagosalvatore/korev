import { useEffect } from 'react';
import type { ListeningPhase } from '../shared/model';
import { stripWakeWord } from '../shared/voice';
import { selectWorkspace } from './actions';
import { api, on } from './bridge';
import { readAsBase64 } from './chat/attachments';
import { failed, RECORDING_TYPE } from './chat/dictation';
import { ANALYSER_SIZE, loudness, SAMPLE_MS } from './chat/RecordingBar';
import { setUi } from './ui-store';

export const SPEECH_LEVEL = 0.2;
export const END_SILENCE_MS = 800;
export const MAX_QUIET_MS = 10_000;
export const MAX_SENTENCE_MS = 15_000;
const AWAKE_MS = 8_000;
const CHIME_HZ = 880;
const CHIME_VOLUME = 0.2;
const CHIME_FADE_TO = 0.001;
const CHIME_SECONDS = 0.25;

export interface Sentence {
  startedAt: number;
  lastSpeechAt: number | null;
}

export type ListenAction = 'keep' | 'send' | 'drop';

export function listenStep(
  sentence: Sentence,
  level: number,
  now: number,
): { sentence: Sentence; action: ListenAction } {
  const heard =
    level >= SPEECH_LEVEL ? { ...sentence, lastSpeechAt: now } : sentence;
  return { sentence: heard, action: sentenceAction(heard, now) };
}

function sentenceAction(sentence: Sentence, now: number): ListenAction {
  if (sentence.lastSpeechAt === null)
    return now - sentence.startedAt >= MAX_QUIET_MS ? 'drop' : 'keep';
  if (now - sentence.startedAt >= MAX_SENTENCE_MS) return 'send';
  return now - sentence.lastSpeechAt >= END_SILENCE_MS ? 'send' : 'keep';
}

function playChime(context: AudioContext) {
  const tone = context.createOscillator();
  const volume = context.createGain();
  const end = context.currentTime + CHIME_SECONDS;
  tone.frequency.value = CHIME_HZ;
  volume.gain.setValueAtTime(CHIME_VOLUME, context.currentTime);
  volume.gain.exponentialRampToValueAtTime(CHIME_FADE_TO, end);
  tone.connect(volume).connect(context.destination);
  tone.start();
  tone.stop(end);
}

function listen(microphone: MediaStream): () => void {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = ANALYSER_SIZE;
  context.createMediaStreamSource(microphone).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let sentence: Sentence = { startedAt: 0, lastSpeechAt: null };
  let handling = false;
  let speaking = 0;
  let awakeUntil = 0;
  let sentenceAwake = false;
  let phase: ListeningPhase = 'hidden';
  let stopped = false;
  const utterances = new Set<SpeechSynthesisUtterance>();

  function show(next: ListeningPhase, level = 0) {
    if (next === phase && next !== 'listening') return;
    phase = next;
    void api.showListening({ phase: next, level });
  }

  function settle() {
    if (speaking > 0 || handling) return;
    show(Date.now() < awakeUntil ? 'listening' : 'hidden');
  }

  function record() {
    if (stopped || handling || speaking > 0 || recorder) return;
    const media = new MediaRecorder(microphone, { mimeType: RECORDING_TYPE });
    chunks = [];
    media.ondataavailable = (event) => chunks.push(event.data);
    sentence = { startedAt: Date.now(), lastSpeechAt: null };
    sentenceAwake = false;
    media.start();
    recorder = media;
  }

  function stopRecording(after: (recording: Blob) => void) {
    const media = recorder;
    if (!media) return;
    recorder = null;
    const recorded = chunks;
    media.onstop = () => after(new Blob(recorded, { type: RECORDING_TYPE }));
    media.stop();
  }

  function say(text: string): Promise<void> {
    speaking += 1;
    stopRecording(() => undefined);
    show('speaking');
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const done = () => {
        utterances.delete(utterance);
        speaking -= 1;
        settle();
        record();
        resolve();
      };
      utterance.onend = done;
      utterance.onerror = done;
      utterances.add(utterance);
      speechSynthesis.speak(utterance);
    });
  }

  async function runSentence(recording: Blob, awake: boolean) {
    const spoken = await api.transcribe(await readAsBase64(recording));
    if (!spoken) return;
    if (!awake && stripWakeWord(spoken) === null) return;
    show('thinking');
    const answer = await api.runVoiceCommand(spoken, { awake });
    if (answer.listening) {
      playChime(context);
      awakeUntil = Date.now() + AWAKE_MS;
    }
    if (answer.openWorkspaceId) selectWorkspace(answer.openWorkspaceId);
    if (answer.reply) await say(answer.reply);
  }

  function handle(recording: Blob, awake: boolean) {
    runSentence(recording, awake)
      .catch(failed)
      .finally(() => {
        handling = false;
        settle();
        record();
      });
  }

  function noticeFirstSpeech(now: number) {
    sentenceAwake = now < awakeUntil;
    if (sentenceAwake) awakeUntil = 0;
  }

  function sample() {
    if (!recorder) return;
    analyser.getFloatTimeDomainData(samples);
    const level = loudness(samples);
    const now = Date.now();
    const wasQuiet = sentence.lastSpeechAt === null;
    const step = listenStep(sentence, level, now);
    sentence = step.sentence;
    if (wasQuiet && sentence.lastSpeechAt !== null) noticeFirstSpeech(now);
    const awaitingCommand = sentenceAwake || now < awakeUntil;
    show(awaitingCommand ? 'listening' : 'hidden', level);
    if (step.action === 'drop') stopRecording(record);
    if (step.action !== 'send') return;
    handling = true;
    const awake = sentenceAwake;
    stopRecording((recording) => handle(recording, awake));
  }

  const timer = setInterval(sample, SAMPLE_MS);
  const stopAnnouncing = on('announce', ({ text }) => void say(text));
  record();

  return () => {
    stopped = true;
    show('hidden');
    clearInterval(timer);
    stopAnnouncing();
    stopRecording(() => undefined);
    speechSynthesis.cancel();
    microphone.getTracks().forEach((track) => track.stop());
    void context.close();
  };
}

export function useHandsFree(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void api.prepareDictation();
    void api.setHandsFree(true);
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((microphone) => {
        if (cancelled) microphone.getTracks().forEach((track) => track.stop());
        else stop = listen(microphone);
      })
      .catch((error: unknown) => {
        failed(error);
        setUi({ handsFree: false });
      });
    return () => {
      cancelled = true;
      stop?.();
      void api.setHandsFree(false);
    };
  }, [enabled]);
}
