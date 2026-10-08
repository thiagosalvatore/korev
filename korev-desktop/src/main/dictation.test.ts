import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDictation,
  type ModelFile,
  type SpeechModels,
} from './dictation';

const MODEL_BYTES = Buffer.from('fake whisper weights');
const MODEL_SHA256 = createHash('sha256').update(MODEL_BYTES).digest('hex');

function modelFile(name: string): ModelFile {
  return {
    url: `https://example.test/${name}`,
    fileName: name,
    sha256: MODEL_SHA256,
    bytes: MODEL_BYTES.length,
  };
}

const MODELS: SpeechModels<ModelFile> = {
  speech: modelFile('speech.bin'),
  voiceActivity: modelFile('vad.bin'),
};

let modelsDir: string;

beforeEach(async () => {
  modelsDir = await mkdtemp(path.join(tmpdir(), 'korev-dictation-'));
});

afterEach(async () => {
  await rm(modelsDir, { recursive: true, force: true });
});

function serving(bytes: Buffer) {
  return vi.fn(async () => new Response(new Uint8Array(bytes)));
}

function dictationWith(download: typeof fetch) {
  const onChange = vi.fn();
  const loadModel = vi.fn(async () => ({
    transcribe: async () => '',
    release: async () => undefined,
  }));
  const dictation = createDictation({
    modelsDir,
    models: MODELS,
    download,
    loadModel,
    onChange,
  });
  return { dictation, onChange, loadModel };
}

async function settled(
  dictation: ReturnType<typeof dictationWith>['dictation'],
) {
  await vi.waitFor(() =>
    expect(dictation.status().status).not.toBe('downloading'),
  );
}

describe('dictation model', () => {
  it('is ready after a download that matches the checksum', async () => {
    const { dictation, onChange } = dictationWith(serving(MODEL_BYTES));
    expect(dictation.status()).toEqual({ status: 'missing' });

    dictation.prepare();
    await settled(dictation);

    expect(dictation.status()).toEqual({ status: 'ready' });
    expect(existsSync(path.join(modelsDir, MODELS.speech.fileName))).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it('keeps no model file when the download does not match the checksum', async () => {
    const { dictation } = dictationWith(serving(MODEL_BYTES.subarray(0, 4)));

    dictation.prepare();
    await settled(dictation);

    expect(dictation.status().status).toBe('failed');
    expect(existsSync(path.join(modelsDir, MODELS.speech.fileName))).toBe(
      false,
    );
  });

  it('reports progress across all model files, not per file', async () => {
    const { dictation, onChange } = dictationWith(serving(MODEL_BYTES));
    const progress: number[] = [];
    onChange.mockImplementation(() => {
      const status = dictation.status();
      if (status.status === 'downloading') progress.push(status.progress);
    });

    dictation.prepare();
    await settled(dictation);

    expect(progress).toEqual([0, 50, 100]);
  });

  it('downloads each model once when asked again during a download', async () => {
    const download = serving(MODEL_BYTES);
    const { dictation } = dictationWith(download);

    dictation.prepare();
    dictation.prepare();
    await settled(dictation);
    dictation.prepare();

    expect(download).toHaveBeenCalledTimes(2);
  });

  it('loads the model when asked to prepare after the download', async () => {
    const { dictation, loadModel } = dictationWith(serving(MODEL_BYTES));
    dictation.prepare();
    await settled(dictation);
    expect(loadModel).not.toHaveBeenCalled();

    dictation.prepare();

    expect(loadModel).toHaveBeenCalledOnce();
    await dictation.close();
  });
});
