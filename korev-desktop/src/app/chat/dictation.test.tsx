import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDictation } from './dictation';

class FakeRecorder {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  }
}

let finishTranscribing: ((text: string) => void) | null;
let call: ReturnType<typeof vi.fn>;

beforeEach(() => {
  finishTranscribing = null;
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [] }) },
  });
  call = vi.fn((method: string) =>
    method === 'transcribe'
      ? new Promise<string>((resolve) => (finishTranscribing = resolve))
      : Promise.resolve(),
  );
  window.korev = { call, on: () => () => {} } as unknown as Window['korev'];
});

async function startTranscribing(onText: (text: string) => void) {
  const { result } = renderHook(() => useDictation(onText));
  await act(async () => result.current.toggle());
  await waitFor(() => expect(result.current.phase).toBe('recording'));
  act(() => result.current.done());
  await waitFor(() => expect(finishTranscribing).not.toBeNull());
  expect(result.current.phase).toBe('transcribing');
  return result;
}

describe('useDictation', () => {
  it('inserts the transcribed text when finished', async () => {
    const onText = vi.fn();
    const result = await startTranscribing(onText);

    await act(async () => finishTranscribing?.('hello'));

    expect(onText).toHaveBeenCalledWith('hello');
    expect(result.current.phase).toBe('idle');
  });

  it('drops the text when cancelled while transcribing', async () => {
    const onText = vi.fn();
    const result = await startTranscribing(onText);

    act(() => result.current.cancel());
    expect(result.current.phase).toBe('idle');
    expect(call).toHaveBeenCalledWith('cancelDictation', []);
    await act(async () => finishTranscribing?.('hello'));

    expect(onText).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });
});
