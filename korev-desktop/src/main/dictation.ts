import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { promisify } from 'node:util';
import type { DictationLanguage, DictationStatus } from '../shared/model';
import { errorMessage } from './context';

const run = promisify(execFile);

const IDLE_RELEASE_MS = 10 * 60 * 1000;
const PERCENT = 100;
const PARTIAL_SUFFIX = '.part';

export interface ModelFile {
  url: string;
  fileName: string;
  sha256: string;
  bytes: number;
}

export interface SpeechModels<T> {
  speech: T;
  voiceActivity: T;
}

export const WHISPER_MODELS: SpeechModels<ModelFile> = {
  speech: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    fileName: 'ggml-large-v3-turbo-q5_0.bin',
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    bytes: 574_041_195,
  },
  voiceActivity: {
    url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
    fileName: 'ggml-silero-v6.2.0.bin',
    sha256: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987',
    bytes: 885_098,
  },
};

export interface SpeechModel {
  transcribe(wavPath: string, language: DictationLanguage): Promise<string>;
  release(): Promise<void>;
}

export interface DictationOptions {
  modelsDir: string;
  models: SpeechModels<ModelFile>;
  download: typeof fetch;
  loadModel(paths: SpeechModels<string>): Promise<SpeechModel>;
  onChange(): void;
}

export interface Dictation {
  status(): DictationStatus;
  prepare(): void;
  transcribe(audioBase64: string, language: DictationLanguage): Promise<string>;
  close(): Promise<void>;
}

async function toSpeechWav(input: string, output: string) {
  await run('afconvert', [
    '-f',
    'WAVE',
    '-d',
    'LEI16@16000',
    '-c',
    '1',
    input,
    output,
  ]);
}

export function createDictation(options: DictationOptions): Dictation {
  const files = [options.models.voiceActivity, options.models.speech];
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const pathOf = (file: ModelFile) =>
    path.join(options.modelsDir, file.fileName);
  const paths: SpeechModels<string> = {
    speech: pathOf(options.models.speech),
    voiceActivity: pathOf(options.models.voiceActivity),
  };
  let status: DictationStatus = files.every((file) => existsSync(pathOf(file)))
    ? { status: 'ready' }
    : { status: 'missing' };
  let loaded: Promise<SpeechModel> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let idleTimer: NodeJS.Timeout | null = null;

  function setStatus(next: DictationStatus) {
    status = next;
    options.onChange();
  }

  function reportProgress(received: number) {
    const progress = Math.floor((received / totalBytes) * PERCENT);
    if (status.status === 'downloading' && status.progress === progress) return;
    setStatus({ status: 'downloading', progress });
  }

  async function downloadFile(file: ModelFile, bytesBefore: number) {
    const target = pathOf(file);
    if (existsSync(target)) return;
    const partialPath = target + PARTIAL_SUFFIX;
    const response = await options.download(file.url);
    if (!response.ok || !response.body)
      throw new Error(`Model download failed (HTTP ${response.status})`);
    const hash = createHash('sha256');
    let received = bytesBefore;
    await mkdir(options.modelsDir, { recursive: true });
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          hash.update(chunk);
          received += chunk.length;
          reportProgress(received);
          yield chunk;
        }
      },
      createWriteStream(partialPath),
    );
    if (hash.digest('hex') !== file.sha256) {
      await rm(partialPath, { force: true });
      throw new Error('The downloaded voice model is corrupt. Try again.');
    }
    await rename(partialPath, target);
  }

  async function downloadAll() {
    let bytesBefore = 0;
    for (const file of files) {
      await downloadFile(file, bytesBefore);
      bytesBefore += file.bytes;
    }
  }

  function prepare() {
    if (status.status === 'ready') {
      void loadedModel().catch(() => undefined);
      return;
    }
    if (status.status === 'downloading') return;
    setStatus({ status: 'downloading', progress: 0 });
    downloadAll().then(
      () => setStatus({ status: 'ready' }),
      (error) => setStatus({ status: 'failed', error: errorMessage(error) }),
    );
  }

  async function release() {
    const model = loaded;
    loaded = null;
    await (await model?.catch(() => null))?.release();
  }

  function keepLoadedForAWhile() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void release(), IDLE_RELEASE_MS);
    idleTimer.unref();
  }

  function loadedModel(): Promise<SpeechModel> {
    loaded ??= options.loadModel(paths);
    keepLoadedForAWhile();
    return loaded;
  }

  async function transcribeWav(wav: string, language: DictationLanguage) {
    try {
      return (await (await loadedModel()).transcribe(wav, language)).trim();
    } catch (error) {
      await release();
      throw error;
    }
  }

  async function transcribeNow(
    audioBase64: string,
    language: DictationLanguage,
  ) {
    if (status.status !== 'ready')
      throw new Error('The voice model is not downloaded yet.');
    const workDir = await mkdtemp(path.join(tmpdir(), 'korev-dictation-'));
    try {
      const recording = path.join(workDir, 'recording');
      const wav = path.join(workDir, 'speech.wav');
      await writeFile(recording, Buffer.from(audioBase64, 'base64'));
      await toSpeechWav(recording, wav);
      return await transcribeWav(wav, language);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  function transcribe(audioBase64: string, language: DictationLanguage) {
    const next = queue.then(() => transcribeNow(audioBase64, language));
    queue = next.catch(() => undefined);
    return next;
  }

  return {
    status: () => status,
    prepare,
    transcribe,
    async close() {
      if (idleTimer) clearTimeout(idleTimer);
      await release();
    },
  };
}
