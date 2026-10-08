import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, IconButton } from '../../design-system';
import type { DictationPhase } from './dictation';
import { isDictationShortcut } from './DictationButton';

const BAR_COUNT = 160;
const SAMPLE_MS = 50;
const ANALYSER_SIZE = 1024;
const LEVEL_GAIN = 1.8;
const MIN_BAR_HEIGHT = 0.08;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

const SILENCE: number[] = Array.from({ length: BAR_COUNT }, () => 0);

function loudness(samples: Float32Array): number {
  const power =
    samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
  return Math.min(1, Math.sqrt(Math.sqrt(power)) * LEVEL_GAIN);
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / MS_PER_SECOND);
  const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, '0');
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${rest}`;
}

function useMicrophoneLevels(stream: MediaStream | null) {
  const [levels, setLevels] = useState(SILENCE);
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!stream) return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = ANALYSER_SIZE;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();
    setLevels(SILENCE);
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const level = loudness(samples);
      setLevels((current) => [...current.slice(1), level]);
      setElapsedMs(Date.now() - startedAt);
    }, SAMPLE_MS);
    return () => {
      clearInterval(timer);
      void context.close();
    };
  }, [stream]);
  return { levels, elapsedMs };
}

interface RecordingBarProps {
  stream: MediaStream | null;
  phase: DictationPhase;
  onDone(): void;
  onCancel(): void;
}

export function RecordingBar(props: RecordingBarProps) {
  const { levels, elapsedMs } = useMicrophoneLevels(props.stream);
  const bar = useRef<HTMLDivElement>(null);
  const transcribing = props.phase === 'transcribing';

  useEffect(() => bar.current?.focus(), []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (transcribing) return;
    if (event.key === 'Escape') props.onCancel();
    else if (event.key === 'Enter' || isDictationShortcut(event))
      props.onDone();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      ref={bar}
      role="group"
      aria-label="Voice input"
      tabIndex={-1}
      className="flex min-h-14 items-center gap-3 px-2 pt-3 pb-1 outline-none focus-visible:shadow-none"
      onKeyDown={onKeyDown}
    >
      <IconButton
        icon="trash-2"
        label="Discard recording (Esc)"
        size="sm"
        disabled={transcribing}
        onClick={props.onCancel}
      />
      {transcribing ? (
        <span className="flex items-center gap-1.5 text-xs text-fg-3">
          <Icon name="loader-circle" size={14} className="animate-spin" />
          Transcribing…
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs text-fg-2 tabular-nums">
          <span className="size-2 animate-pulse rounded-full bg-danger" />
          {formatElapsed(elapsedMs)}
        </span>
      )}
      <div
        aria-hidden="true"
        className="flex h-8 min-w-0 flex-1 items-center justify-end gap-0.5 overflow-hidden"
      >
        {levels.map((level, index) => (
          <span
            key={index}
            className="w-0.75 flex-none rounded-full bg-fg-3"
            style={{ height: `${Math.max(MIN_BAR_HEIGHT, level) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
