import { utilityProcess } from 'electron';
import path from 'node:path';
import type { DictationLanguage } from '../shared/model';
import type { SpeechModel, SpeechModels } from './dictation';

const WORKER_FILE = 'whisper-worker.cjs';
const WORKER_NAME = 'Korev voice input';

export interface TranscribeRequest {
  id: number;
  wavPath: string;
  language: DictationLanguage;
}

export type TranscribeReply =
  | { id: number; text: string }
  | { id: number; error: string };

interface Pending {
  resolve(text: string): void;
  reject(error: Error): void;
}

export async function loadWhisper(
  paths: SpeechModels<string>,
): Promise<SpeechModel> {
  const worker = utilityProcess.fork(
    path.join(__dirname, WORKER_FILE),
    [paths.speech, paths.voiceActivity],
    { serviceName: WORKER_NAME },
  );
  const pending = new Map<number, Pending>();
  let nextId = 0;

  worker.on('message', (reply: TranscribeReply) => {
    const request = pending.get(reply.id);
    pending.delete(reply.id);
    if ('error' in reply) request?.reject(new Error(reply.error));
    else request?.resolve(reply.text);
  });
  worker.on('exit', () => {
    for (const request of pending.values())
      request.reject(new Error('Voice input stopped. Try again.'));
    pending.clear();
  });

  return {
    transcribe(wavPath, language) {
      const id = nextId++;
      const request: TranscribeRequest = { id, wavPath, language };
      worker.postMessage(request);
      return new Promise((resolve, reject) =>
        pending.set(id, { resolve, reject }),
      );
    },
    release: async () => {
      worker.kill();
    },
  };
}
