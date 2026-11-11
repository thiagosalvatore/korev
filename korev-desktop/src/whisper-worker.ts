import { initWhisper, initWhisperVad } from '@fugood/whisper.node';
import { errorMessage } from './main/context';
import type {
  TranscribeReply,
  TranscribeRequest,
  WorkerRequest,
} from './main/whisper';

const [speechPath, voiceActivityPath] = process.argv.slice(2);

const models = Promise.all([
  initWhisper({ filePath: speechPath, useGpu: true }),
  initWhisperVad({ filePath: voiceActivityPath, useGpu: false }),
]);

let stopRequested = false;
let stopRunning: (() => Promise<void>) | null = null;

async function transcribe({ wavPath, language }: TranscribeRequest) {
  stopRequested = false;
  const [whisper, voiceActivity] = await models;
  const speech = await voiceActivity.detectSpeechFile(wavPath);
  if (!speech.length || stopRequested) return '';
  const { stop, promise } = whisper.transcribeFile(wavPath, {
    language,
    temperature: 0,
  });
  stopRunning = stop;
  try {
    const result = await promise;
    return result.isAborted ? '' : result.result;
  } finally {
    stopRunning = null;
  }
}

function stopTranscribing() {
  stopRequested = true;
  void stopRunning?.();
}

function reply(message: TranscribeReply) {
  process.parentPort.postMessage(message);
}

process.parentPort.on('message', ({ data }: { data: WorkerRequest }) => {
  if ('stop' in data) {
    stopTranscribing();
    return;
  }
  transcribe(data).then(
    (text) => reply({ id: data.id, text }),
    (error: unknown) => reply({ id: data.id, error: errorMessage(error) }),
  );
});
