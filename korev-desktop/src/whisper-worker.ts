import { initWhisper, initWhisperVad } from '@fugood/whisper.node';
import { errorMessage } from './main/context';
import type { TranscribeReply, TranscribeRequest } from './main/whisper';

const [speechPath, voiceActivityPath] = process.argv.slice(2);

const models = Promise.all([
  initWhisper({ filePath: speechPath, useGpu: true }),
  initWhisperVad({ filePath: voiceActivityPath, useGpu: false }),
]);

async function transcribe({ wavPath, language }: TranscribeRequest) {
  const [whisper, voiceActivity] = await models;
  const speech = await voiceActivity.detectSpeechFile(wavPath);
  if (!speech.length) return '';
  const { promise } = whisper.transcribeFile(wavPath, {
    language,
    temperature: 0,
  });
  return (await promise).result;
}

function reply(message: TranscribeReply) {
  process.parentPort.postMessage(message);
}

process.parentPort.on('message', ({ data }: { data: TranscribeRequest }) => {
  transcribe(data).then(
    (text) => reply({ id: data.id, text }),
    (error: unknown) => reply({ id: data.id, error: errorMessage(error) }),
  );
});
