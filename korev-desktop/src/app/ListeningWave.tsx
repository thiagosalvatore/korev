import { useEffect, useRef, useState } from 'react';
import type { ListeningPhase, ListeningState } from '../shared/model';
import { on } from './bridge';

const WIDTH = 240;
const HEIGHT = 56;
const MIDDLE = HEIGHT / 2;
const STEP_PX = 2;
const EASE = 0.18;
const FILL_ALPHA = 0.6;
const MS_PER_SECOND = 1000;

const CURVES = [
  { color: '47, 128, 255', frequency: 1.6, scale: 1, drift: 1 },
  { color: '255, 56, 150', frequency: 2.3, scale: 0.8, drift: -1.3 },
  { color: '40, 220, 190', frequency: 3.1, scale: 0.6, drift: 1.7 },
];

const MOTION: Record<
  ListeningPhase,
  { amplitude: number; speed: number; pulse: number; pulseHz: number }
> = {
  hidden: { amplitude: 0, speed: 0, pulse: 0, pulseHz: 0 },
  listening: { amplitude: 0.2, speed: 3, pulse: 0, pulseHz: 0 },
  thinking: { amplitude: 0.45, speed: 1.2, pulse: 0.35, pulseHz: 0.8 },
  speaking: { amplitude: 0.75, speed: 4, pulse: 0.4, pulseHz: 3 },
};

function targetAmplitude(state: ListeningState, seconds: number): number {
  const motion = MOTION[state.phase];
  const pulse =
    1 -
    motion.pulse +
    motion.pulse * Math.sin(seconds * motion.pulseHz * 2 * Math.PI);
  const base = motion.amplitude * pulse;
  return state.phase === 'listening' ? Math.max(base, state.level) : base;
}

function curveHeight(x: number, frequency: number, offset: number): number {
  const across = (x / WIDTH) * 2 - 1;
  const envelope = (1 - across * across) ** 2;
  return envelope * Math.sin(frequency * Math.PI * across + offset);
}

function drawCurve(
  context: CanvasRenderingContext2D,
  curve: (typeof CURVES)[number],
  amplitude: number,
  offset: number,
) {
  const height = amplitude * curve.scale * MIDDLE;
  context.beginPath();
  context.moveTo(0, MIDDLE);
  for (let x = 0; x <= WIDTH; x += STEP_PX)
    context.lineTo(
      x,
      MIDDLE - height * curveHeight(x, curve.frequency, offset),
    );
  for (let x = WIDTH; x >= 0; x -= STEP_PX)
    context.lineTo(
      x,
      MIDDLE + height * curveHeight(x, curve.frequency, offset),
    );
  context.closePath();
  context.fillStyle = `rgba(${curve.color}, ${FILL_ALPHA})`;
  context.fill();
}

function useWave(
  canvas: React.RefObject<HTMLCanvasElement | null>,
  state: React.RefObject<ListeningState>,
) {
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = window.devicePixelRatio;
    element.width = WIDTH * ratio;
    element.height = HEIGHT * ratio;
    context.scale(ratio, ratio);
    context.globalCompositeOperation = 'lighter';
    let amplitude = 0;
    let travelled = 0;
    let last = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      const seconds = now / MS_PER_SECOND;
      const elapsed = (now - last) / MS_PER_SECOND;
      last = now;
      amplitude += (targetAmplitude(state.current, seconds) - amplitude) * EASE;
      travelled += elapsed * MOTION[state.current.phase].speed;
      context.clearRect(0, 0, WIDTH, HEIGHT);
      for (const curve of CURVES)
        drawCurve(context, curve, amplitude, travelled * curve.drift);
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [canvas, state]);
}

export function ListeningWave() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<ListeningState>({ phase: 'hidden', level: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return on('listening', (next) => {
      state.current = next;
      setVisible(next.phase !== 'hidden');
    });
  }, []);
  useWave(canvas, state);

  return (
    <div className="flex h-screen items-center justify-center">
      <div
        className={`rounded-[999px] bg-[rgba(10,10,14,0.85)] px-5 py-2 shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <canvas ref={canvas} style={{ width: WIDTH, height: HEIGHT }} />
      </div>
    </div>
  );
}
