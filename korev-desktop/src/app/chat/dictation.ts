import { useRef, useState } from 'react';
import { api } from '../bridge';
import { toast } from '../ui/toast';
import { readAsBase64 } from './attachments';

const RECORDING_TYPE = 'audio/mp4;codecs=mp4a.40.2';

export type DictationPhase = 'idle' | 'recording' | 'transcribing';

function failed(error: unknown) {
  toast(error instanceof Error ? error.message : String(error), 'danger');
}

export function useDictation(onText: (text: string) => void) {
  const [phase, setPhase] = useState<DictationPhase>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const discard = useRef(false);

  async function transcribe(recording: Blob) {
    setPhase('transcribing');
    try {
      const text = await api.transcribe(await readAsBase64(recording));
      if (text) onText(text);
    } catch (error) {
      failed(error);
    } finally {
      setPhase('idle');
    }
  }

  function finish(microphone: MediaStream, chunks: Blob[]) {
    microphone.getTracks().forEach((track) => track.stop());
    setStream(null);
    if (discard.current) setPhase('idle');
    else void transcribe(new Blob(chunks, { type: RECORDING_TYPE }));
  }

  async function start() {
    void api.prepareDictation();
    const microphone = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const media = new MediaRecorder(microphone, { mimeType: RECORDING_TYPE });
    const chunks: Blob[] = [];
    media.ondataavailable = (event) => chunks.push(event.data);
    media.onstop = () => finish(microphone, chunks);
    discard.current = false;
    media.start();
    recorder.current = media;
    setStream(microphone);
    setPhase('recording');
  }

  function stop({ keep }: { keep: boolean }) {
    discard.current = !keep;
    recorder.current?.stop();
  }

  function toggle() {
    if (phase === 'recording') stop({ keep: true });
    else if (phase === 'idle') start().catch(failed);
  }

  return {
    phase,
    stream,
    toggle,
    done: () => stop({ keep: true }),
    cancel: () => stop({ keep: false }),
  };
}
