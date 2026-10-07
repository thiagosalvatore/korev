'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { prefersReducedMotion } from '@/components/landing/useTick';
import { Panel, Sidebar } from './parts';
import { SCENES } from './scenes';

const WINDOW_WIDTH = 1200;
const WINDOW_HEIGHT = 720;
const MAX_SCALE = 1.15;
const FALLBACK_SCALE = 0.5;
const FRAME_MS = 60;
const HOLD_LAST_FRAME_MS = 1400;

function Scaled({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const observer = new ResizeObserver(() =>
      setContainerWidth(el.clientWidth),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale =
    containerWidth == null
      ? FALLBACK_SCALE
      : Math.min(MAX_SCALE, containerWidth / WINDOW_WIDTH);
  const left = Math.max(0, ((containerWidth ?? 0) - WINDOW_WIDTH * scale) / 2);
  return (
    <div
      ref={ref}
      className="km-scaler"
      style={{ height: WINDOW_HEIGHT * scale }}
    >
      <div
        style={{
          width: WINDOW_WIDTH,
          height: WINDOW_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          position: 'absolute',
          left,
          top: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function KorevWindow({
  sceneIndex,
  t,
}: {
  sceneIndex: number;
  t: number;
}) {
  const s = SCENES[sceneIndex].render(t);
  return (
    <div className={`km-win${s.panel ? '' : ' nopanel'}`}>
      <Sidebar
        repos={s.repos}
        selected={s.selected}
        askSelected={s.askSelected}
        askChats={s.askChats}
      />
      <main className="km-main">
        {s.center}
        {s.keys && (
          <div className="km-keycast" key={s.keys.join('')}>
            {s.keys.map((key, i) => (
              <span key={i}>{key}</span>
            ))}
          </div>
        )}
      </main>
      {s.panel && <Panel {...s.panel} />}
    </div>
  );
}

function useSceneClock() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [clock, setClock] = useState({ sceneIndex, t: 0 });
  const box = useRef<HTMLDivElement>(null);
  const visible = useRef(true);
  const duration = SCENES[sceneIndex].duration;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
    });
    observer.observe(box.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setClock({ sceneIndex, t: duration });
      return;
    }
    let start = performance.now();
    let last = start;
    const id = setInterval(() => {
      const now = performance.now();
      if (!visible.current) start += now - last;
      last = now;
      const elapsed = now - start;
      if (elapsed < duration + HOLD_LAST_FRAME_MS) {
        setClock({ sceneIndex, t: Math.min(elapsed, duration) });
        return;
      }
      clearInterval(id);
      setSceneIndex((i) => (i + 1) % SCENES.length);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [sceneIndex, duration]);

  const t = clock.sceneIndex === sceneIndex ? clock.t : 0;
  return { sceneIndex, setSceneIndex, t, box };
}

export function KorevDemo() {
  const { sceneIndex, setSceneIndex, t, box } = useSceneClock();
  const progress = (i: number) => {
    if (i < sceneIndex) return '100%';
    if (i > sceneIndex) return '0%';
    return `${(t / SCENES[i].duration) * 100}%`;
  };

  return (
    <div ref={box}>
      <Scaled>
        <KorevWindow sceneIndex={sceneIndex} t={t} />
      </Scaled>
      <div className="km-strip">
        {SCENES.map((scene, i) => (
          <button
            key={scene.id}
            className={i === sceneIndex ? 'on' : ''}
            onClick={() => setSceneIndex(i)}
          >
            <span className="tr">
              <i style={{ width: progress(i) }} />
            </span>
            <span>
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              {scene.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
