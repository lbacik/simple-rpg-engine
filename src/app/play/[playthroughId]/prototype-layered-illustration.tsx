// PROTOTYPE (#209), throwaway. A layered Illustration rendered strictly from
// the Motion spec on map #193: the timeline semantics (#200), the authoring
// syntax (#201) and the motion accessibility policy (#195).
//
// - The Still is the server-rendered <img>; without JavaScript nothing else
//   happens.
// - One overlay Play/Pause control sets a global preference in localStorage;
//   with no stored choice the OS reduced-motion setting decides.
// - While Motion is on, every Layer file is fetched; Motion starts (t = 0)
//   only once all have loaded. Any failure abandons Motion for this Showing
//   and hides the control.
// - Pause shows the Still (Layers unmounted, Camera reset); Play restarts
//   from zero.
// - Off-screen or in a hidden tab the timeline freezes and resumes.

'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { LayerView, MotionView } from '@/engine/index';
import styles from './prototype-layered-illustration.module.css';

const PREFERENCE_KEY = 'illustration-motion';
// The engine-fixed Flicker shape: one 4 s cycle of uneven dips, every change
// slower than 2 Hz (far below the WCAG 2.3.1 flash threshold). Each value is
// the fraction of `depth` dipped at that point.
const FLICKER_SECONDS = 4;
const FLICKER_DIPS = [0, 0.6, 0.2, 1, 0.4, 0.8, 0.1, 0];

function readPreference(): 'on' | 'off' | null {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    return value === 'on' || value === 'off' ? value : null;
  } catch {
    return null;
  }
}

const preferenceListeners = new Set<() => void>();

function subscribePreference(listener: () => void) {
  preferenceListeners.add(listener);
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', listener);
  window.addEventListener('storage', listener);
  return () => {
    preferenceListeners.delete(listener);
    media.removeEventListener('change', listener);
    window.removeEventListener('storage', listener);
  };
}

function motionOnSnapshot(): boolean {
  const stored = readPreference();
  if (stored !== null) return stored === 'on';
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setPreference(value: 'on' | 'off') {
  try {
    localStorage.setItem(PREFERENCE_KEY, value);
  } catch {
    // Storage unavailable: the choice lasts until the next render only.
  }
  preferenceListeners.forEach((listener) => listener());
}

function loadAll(sources: string[]): Promise<void> {
  return Promise.all(
    [...new Set(sources)].map(
      (src) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(src));
          image.src = src;
        }),
    ),
  ).then(() => undefined);
}

type Phase = 'idle' | 'loading' | 'running' | 'failed';

export function LayeredIllustration({
  src,
  width,
  height,
  alt,
  motion,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  motion: MotionView;
}) {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const motionOn = useSyncExternalStore(subscribePreference, motionOnSnapshot, () => false);
  const [stillFailed, setStillFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  // Bumped on every (re)start so the composition remounts at t = 0.
  const [run, setRun] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);

  // Fetch the Layer files whenever Motion turns on; start once all loaded.
  useEffect(() => {
    if (!motionOn || phase === 'failed') return;
    let cancelled = false;
    setPhase('loading');
    loadAll(motion.layers.map((layer) => layer.src)).then(
      () => {
        if (cancelled) return;
        setRun((value) => value + 1);
        setPhase('running');
      },
      () => {
        if (!cancelled) setPhase('failed');
      },
    );
    return () => {
      cancelled = true;
      setPhase((current) => (current === 'failed' ? current : 'idle'));
    };
    // `phase` is deliberately left out: it is this effect's own output.
  }, [motionOn, motion]);

  const running = motionOn && phase === 'running';

  // Camera: one transform on the box holding the Still and every Layer.
  useEffect(() => {
    const box = cameraRef.current;
    const camera = motion.camera;
    if (!running || box === null || camera === undefined) return;
    const animation = box.animate([framing(camera.from), framing(camera.to)], {
      duration: camera.duration * 1000,
      delay: camera.delay * 1000,
      easing: 'ease-in-out',
      fill: 'both',
      iterations: camera.loop ? Infinity : 1,
      direction: camera.loop ? 'alternate' : 'normal',
    });
    return () => animation.cancel();
  }, [running, run, motion.camera]);

  // Freeze the timeline off-screen and in a hidden tab, then resume.
  useEffect(() => {
    const frame = frameRef.current;
    if (!running || frame === null) return;
    let onScreen = true;
    const apply = () => {
      const visible = onScreen && document.visibilityState === 'visible';
      for (const animation of frame.getAnimations({ subtree: true })) {
        if (visible) animation.play();
        else animation.pause();
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      apply();
    });
    observer.observe(frame);
    document.addEventListener('visibilitychange', apply);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', apply);
    };
  }, [running, run]);

  if (stillFailed) return null;

  const showControl = hydrated && phase !== 'failed';
  return (
    <div ref={frameRef} className={styles.frame} data-motion={running ? 'running' : motionOn ? phase : 'off'}>
      <div ref={cameraRef} className={styles.camera}>
        <img
          src={src}
          width={width}
          height={height}
          alt={alt}
          className={`illustration ${styles.still}`}
          onError={() => setStillFailed(true)}
        />
        {running
          ? motion.layers.map((layer, index) => (
              <Layer key={`${run}-${index}`} layer={layer} stillAspect={width / height} />
            ))
          : null}
      </div>
      {showControl ? (
        <button
          type="button"
          className={styles.control}
          aria-pressed={!motionOn}
          aria-label={motionOn ? 'Pause animation' : 'Play animation'}
          onClick={() => setPreference(motionOn ? 'off' : 'on')}
        >
          {motionOn ? '❚❚' : '▶'}
        </button>
      ) : null}
    </div>
  );
}

/** A Camera framing as a transform: the fixed point (x, y) stays in place. */
function framing({ zoom, x, y }: { zoom: number; x: number; y: number }): Keyframe {
  const scale = zoom / 100;
  return { transform: `translate(${(1 - scale) * x}%, ${(1 - scale) * y}%) scale(${scale})` };
}

function Layer({ layer, stillAspect }: { layer: LayerView; stillAspect: number }) {
  const moverRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLImageElement>(null);

  const frames = layer.frames ?? 1;
  const frameAspect = layer.pxWidth / frames / layer.pxHeight;
  // `width` is in percent of the Still's width; the height follows from one
  // frame's aspect ratio, expressed in percent of the Still's height.
  const widthPct = layer.width;
  const heightPct = (layer.width * stillAspect) / frameAspect;
  const centre = layer.drift?.from ?? layer.at ?? { x: 50, y: 50 };

  useEffect(() => {
    const animations: Animation[] = [];
    if (layer.frames !== undefined && layer.fps !== undefined && stripRef.current) {
      animations.push(
        stripRef.current.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], {
          duration: (layer.frames / layer.fps) * 1000,
          easing: `steps(${layer.frames}, end)`,
          iterations: Infinity,
        }),
      );
    }
    if (layer.drift !== undefined && moverRef.current) {
      const { from, to, duration, delay, loop } = layer.drift;
      animations.push(
        moverRef.current.animate(
          [{ transform: 'translate(0, 0)' }, { transform: `translate(${to.x - from.x}%, ${to.y - from.y}%)` }],
          { duration: duration * 1000, delay: delay * 1000, easing: 'linear', fill: 'both', iterations: loop ? Infinity : 1 },
        ),
      );
    }
    if (layer.flicker !== undefined && boxRef.current) {
      const depth = layer.flicker.depth / 100;
      animations.push(
        boxRef.current.animate(
          FLICKER_DIPS.map((dip) => ({ opacity: 1 - dip * depth })),
          { duration: FLICKER_SECONDS * 1000, easing: 'ease-in-out', iterations: Infinity },
        ),
      );
    }
    return () => animations.forEach((animation) => animation.cancel());
  }, [layer]);

  const box: CSSProperties = {
    left: `${centre.x - widthPct / 2}%`,
    top: `${centre.y - heightPct / 2}%`,
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    mixBlendMode: layer.blend === 'normal' ? undefined : layer.blend,
  };
  return (
    <div ref={moverRef} className={styles.mover}>
      <div ref={boxRef} className={styles.layer} style={box}>
        <img ref={stripRef} src={layer.src} alt="" className={styles.strip} style={{ width: `${frames * 100}%` }} />
      </div>
    </div>
  );
}
