// PROTOTYPE (#196), throwaway. The same Scene Illustration rendered with four
// competing animation approaches, switchable with `?anim=` and the floating
// bar. Every variant follows the motion accessibility policy (#195): the
// server renders only the still, the overlay Play/Pause control sets a global
// preference, reduced motion and pause show the still, and a failed animation
// falls back to the still.

'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { PrototypeSwitcher } from '../../../prototype-switcher';
import { PRESETS, flicker, type Geometry } from './effects';
import geometryFile from './geometry.json';
import {
  VARIANTS,
  setLab,
  setPreference,
  setVariant,
  useMotion,
  type MotionState,
  type VariantKey,
} from './motion';
import styles from './prototype.module.css';

const ASSETS = '/prototype-animated-illustration';
const MISSING = `${ASSETS}/missing`;
const LOOP = geometryFile.loopSeconds;
const ILLUSTRATIONS = geometryFile.illustrations as Record<string, Geometry>;
const BIRDS = [
  { band: 0.25, phase: 0 },
  { band: 0.6, phase: 0.35 },
  { band: 0.85, phase: 0.7 },
];

function illustrationId(src: string) {
  return (src.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
}

function useOnScreen(ref: RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return onScreen;
}

export function AnimatedIllustrationPrototype({
  src,
  width,
  height,
  alt,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
}) {
  const motion = useMotion();
  const id = illustrationId(src);
  const geometry = ILLUSTRATIONS[id];
  const frameRef = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(frameRef);
  const [stillFailed, setStillFailed] = useState(false);
  // The browser refused to animate (iOS Low Power Mode, autoplay disallowed).
  // Not stored as the player's preference.
  const [refused, setRefused] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);

  useEffect(() => {
    setRefused(false);
    setAnimationFailed(false);
  }, [motion.variant, motion.lab.failAnimation, motion.lab.refuseAutoplay]);

  const animated = motion.variant !== 'static' && geometry !== undefined;
  const playing = animated && motion.motionOn && !refused && !animationFailed;
  const base = `${ASSETS}/${id}`;
  const fail = motion.lab.failAnimation;

  const toggle = () => {
    if (playing) {
      setPreference('off');
    } else {
      setRefused(false);
      setAnimationFailed(false);
      setPreference('on');
    }
  };

  // Still failed: remove everything, as today (no frame, no alt box, no retry).
  if (stillFailed) return null;
  return (
    <>
      <div ref={frameRef} className={styles.frame}>
        <img
          src={src}
          width={width}
          height={height}
          alt={alt}
          className="illustration"
          style={{ maxWidth: '100%', height: 'auto' }}
          onError={() => setStillFailed(true)}
        />
        {playing && motion.variant === 'A' ? (
          <VideoLayer
            key={fail ? 'missing' : 'file'}
            base={fail ? MISSING : base}
            refuse={motion.lab.refuseAutoplay}
            onScreen={onScreen}
            onRefused={setRefused}
            onFailed={setAnimationFailed}
          />
        ) : null}
        {playing && motion.variant === 'B' ? (
          <AvifLayer src={fail ? `${MISSING}.avif` : `${base}.avif`} onFailed={setAnimationFailed} />
        ) : null}
        {playing && motion.variant === 'C' ? <EffectsLayer geometry={geometry} onScreen={onScreen} /> : null}
        {playing && motion.variant === 'D' ? (
          <LayersLayer
            id={id}
            geometry={geometry}
            aspect={width / height}
            fail={fail}
            onScreen={onScreen}
            onFailed={setAnimationFailed}
          />
        ) : null}
        {animated ? (
          <button
            type="button"
            className={styles.control}
            aria-label={playing ? 'Pause animation' : 'Play animation'}
            onClick={toggle}
          >
            <span aria-hidden="true">{playing ? '⏸︎' : '▶︎'}</span>
          </button>
        ) : null}
      </div>
      {process.env.NODE_ENV !== 'production' ? (
        <>
          <PrototypeSwitcher variants={VARIANTS} current={motion.variant} onChange={setVariant} />
          <LabPanel
            id={id}
            configured={geometry !== undefined}
            motion={motion}
            playing={playing}
            refused={refused}
            animationFailed={animationFailed}
          />
        </>
      ) : null}
    </>
  );
}

/* ---------- A: whole file, muted looping video ---------- */

function VideoLayer({
  base,
  refuse,
  onScreen,
  onRefused,
  onFailed,
}: {
  base: string;
  refuse: boolean;
  onScreen: boolean;
  onRefused: (value: boolean) => void;
  onFailed: (value: boolean) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!onScreen) {
      video.pause();
      return;
    }
    const attempt = refuse
      ? Promise.reject(new DOMException('Simulated refusal', 'NotAllowedError'))
      : video.play();
    attempt.catch((error: DOMException) => {
      if (error.name === 'NotAllowedError') onRefused(true);
    });
  }, [onScreen, refuse, onRefused]);
  return (
    <video
      ref={ref}
      className={`${styles.overlay} ${styles.video}`}
      data-ready={ready}
      muted
      loop
      playsInline
      disablePictureInPicture
      disableRemotePlayback
      preload="auto"
      aria-hidden="true"
      onPlaying={() => setReady(true)}
      onError={() => onFailed(true)}
    >
      <source src={`${base}.webm`} type="video/webm" />
      <source src={`${base}.mp4`} type="video/mp4" onError={() => onFailed(true)} />
    </video>
  );
}

/* ---------- B: whole file, animated AVIF in <img> ---------- */

function AvifLayer({ src, onFailed }: { src: string; onFailed: (value: boolean) => void }) {
  const [ready, setReady] = useState(false);
  // <img> has no pause API: pausing unmounts this layer and shows the still;
  // Play mounts it again and the loop restarts from its first frame.
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={styles.overlay}
      data-ready={ready}
      onLoad={() => setReady(true)}
      onError={() => onFailed(true)}
    />
  );
}

/* ---------- C: still + engine effect presets (canvas) ---------- */

function EffectsLayer({ geometry, onScreen }: { geometry: Geometry; onScreen: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !onScreen) return;
    let frame = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const W = Math.round(canvas.clientWidth * dpr);
      const H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      ctx.clearRect(0, 0, W, H);
      const t = (now - start) / 1000;
      PRESETS['light-flicker'](ctx, W, H, geometry, t);
      PRESETS.fire(ctx, W, H, geometry, t);
      PRESETS.birds(ctx, W, H, geometry, t);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [geometry, onScreen]);
  return <canvas ref={ref} className={`${styles.overlay} ${styles.multiply}`} data-ready="true" aria-hidden="true" />;
}

/* ---------- D: still + author-supplied layers (CSS/WAAPI composition) ---------- */

function LayersLayer({
  id,
  geometry,
  aspect,
  fail,
  onScreen,
  onFailed,
}: {
  id: string;
  geometry: Geometry;
  aspect: number;
  fail: boolean;
  onScreen: boolean;
  onFailed: (value: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(0);
  const layerCount = 2 + BIRDS.length;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const animations: Animation[] = [];
    const light = root.querySelector('[data-layer="light"]');
    light?.animate(
      Array.from({ length: 49 }, (_, i) => ({ opacity: Math.min(1, flicker((i / 48) * LOOP)) })),
      { duration: LOOP * 1000, iterations: Infinity },
    );
    root.querySelector('[data-layer="flame"] img')?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }],
      { duration: 800, iterations: Infinity, easing: 'steps(8)' },
    );
    root.querySelectorAll('[data-layer="bird"]').forEach((mover, k) => {
      mover.animate([{ transform: 'translateX(-12%)' }, { transform: 'translateX(110%)' }], {
        duration: LOOP * 1000,
        iterations: Infinity,
        delay: -BIRDS[k].phase * LOOP * 1000,
      });
      mover.querySelector('img')?.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }],
        { duration: 500, iterations: Infinity, easing: 'steps(4)', delay: -k * 125 },
      );
    });
    animations.push(...root.getAnimations({ subtree: true }));
    return () => animations.forEach((animation) => animation.cancel());
  }, []);

  useEffect(() => {
    ref.current
      ?.getAnimations({ subtree: true })
      .forEach((animation) => (onScreen ? animation.play() : animation.pause()));
  }, [onScreen]);

  const file = (name: string) => (fail ? `${MISSING}.webp` : `${ASSETS}/${name}`);
  const layerProps = {
    alt: '',
    'aria-hidden': true,
    onLoad: () => setLoaded((n) => n + 1),
    onError: () => onFailed(true),
  };
  const { hearth } = geometry;
  const flameHeight = hearth.width * aspect * (200 / 160);
  return (
    <div ref={ref} className={styles.overlay} data-ready={loaded >= layerCount}>
      <img
        {...layerProps}
        data-layer="light"
        src={file(`${id}-light.webp`)}
        className={styles.multiply}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <div
        data-layer="flame"
        className={styles.clip}
        style={{
          left: `${(hearth.x - hearth.width / 2) * 100}%`,
          width: `${hearth.width * 100}%`,
          top: `${(hearth.y - flameHeight * (190 / 200)) * 100}%`,
          height: `${flameHeight * 100}%`,
        }}
      >
        <img {...layerProps} src={file('flame-sprite.webp')} className={styles.strip} style={{ width: '800%' }} />
      </div>
      {BIRDS.map((bird, k) => (
        <div
          key={k}
          data-layer="bird"
          className={styles.mover}
          style={{ top: `${(geometry.sky.top + (geometry.sky.bottom - geometry.sky.top) * bird.band) * 100}%` }}
        >
          <div className={styles.clip} style={{ position: 'relative', width: '3.2%', aspectRatio: '48 / 28' }}>
            <img {...layerProps} src={file('bird-sprite.webp')} className={styles.strip} style={{ width: '400%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Lab panel (prototype chrome, not part of any variant) ---------- */

const ABOUT: Record<VariantKey, { summary: string; authoring: string; files: (id: string) => string[] }> = {
  static: {
    summary: 'Baseline: the plain <img> shipped today.',
    authoring: 'One image from an AI image tool.',
    files: () => [],
  },
  A: {
    summary:
      '<video muted loop playsinline> over the still. WebM (VP9) first, MP4 (H.264) fallback. Needs HTTP Range (206) on the asset route for Safari/iOS and new video MIME types.',
    authoring:
      'AI image-to-video (Midjourney --loop, Kling/Luma end frame = start frame) → ffmpeg crop/scale, strip audio, encode WebM + MP4. Here the file is baked from the D layers plus a slow camera drift, as a stand-in: drop a real AI MP4/WebM at public/prototype-animated-illustration/<id>.mp4|.webm to compare.',
    files: (id) => [`${id}.webm`, `${id}.mp4`],
  },
  B: {
    summary:
      'Animated AVIF in an <img> over the still. No new route work (no Range). No pause API: pause swaps back to the still and Play restarts the loop from frame 0.',
    authoring: 'Same MP4 as A → one ffmpeg transcode (libaom-av1). Animated WebP of the same loop shown for comparison.',
    files: (id) => [`${id}.avif`, `${id}.anim.webp`],
  },
  C: {
    summary:
      'Engine-drawn presets on a <canvas> over the still (light-flicker, fire, birds). No new media type; no per-Illustration animation bytes.',
    authoring: 'Only the still. The author picks presets and anchor points in YAML; the look is the engine’s, the same in every Scenario.',
    files: () => [],
  },
  D: {
    summary:
      'Author-supplied transparent layers composed by the engine: a light layer (multiply, flicker), a flame sprite strip (steps), bird sprite strips moving across. WebP only, so the route and security posture stay as they are.',
    authoring:
      'The author makes every layer: transparent flame frames, bird frames, a painted light layer. Cut-outs, aligned sprite frames and anchor points are manual work with AI tools.',
    files: (id) => [`${id}-light.webp`, 'flame-sprite.webp', 'bird-sprite.webp'],
  },
};

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

function declaration(variant: VariantKey, id: string, g: Geometry | undefined) {
  const head = `- id: ${id}\n  path: images/${id}.png   # the still (mandatory)\n  alt: >-\n    …one alt for still and motion…\n`;
  if (!g || variant === 'static') return head;
  if (variant === 'A') return `${head}  animation:\n    - images/${id}.webm\n    - images/${id}.mp4\n`;
  if (variant === 'B') return `${head}  animation: images/${id}.avif\n`;
  if (variant === 'C')
    return (
      `${head}  effects:\n` +
      `    - light-flicker: { at: [${pct(g.light.x)}, ${pct(g.light.y)}], radius: ${pct(g.light.radius)} }\n` +
      `    - fire: { at: [${pct(g.hearth.x)}, ${pct(g.hearth.y)}], width: ${pct(g.hearth.width)} }\n` +
      `    - birds: { band: [${pct(g.sky.top)}, ${pct(g.sky.bottom)}], count: 3 }\n`
    );
  return (
    `${head}  layers:\n` +
    `    - path: images/anim/${id}-light.webp\n      blend: multiply\n      motion: flicker\n` +
    `    - path: images/anim/flame-sprite.webp\n      frames: 8\n      fps: 10\n      at: [${pct(g.hearth.x)}, ${pct(g.hearth.y)}]\n      width: ${pct(g.hearth.width)}\n` +
    `    - path: images/anim/bird-sprite.webp\n      frames: 4\n      fps: 8\n      count: 3\n      across: { band: [${pct(g.sky.top)}, ${pct(g.sky.bottom)}], duration: ${LOOP}s }\n`
  );
}

const kib = (bytes: number) => `${(bytes / 1024).toFixed(0)} KiB`;

function LabPanel({
  id,
  configured,
  motion,
  playing,
  refused,
  animationFailed,
}: {
  id: string;
  configured: boolean;
  motion: MotionState;
  playing: boolean;
  refused: boolean;
  animationFailed: boolean;
}) {
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [fetched, setFetched] = useState<{ name: string; transfer: number; body: number }[]>([]);

  useEffect(() => {
    fetch(`${ASSETS}/sizes.json`)
      .then((response) => response.json())
      .then(setSizes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const read = () =>
      setFetched(
        performance
          .getEntriesByType('resource')
          .filter((entry) => entry.name.includes(ASSETS) || entry.name.includes(`/${id}.`))
          .filter((entry) => !entry.name.endsWith('sizes.json'))
          .map((entry) => {
            const resource = entry as PerformanceResourceTiming;
            return {
              name: resource.name.split('/').pop() ?? resource.name,
              transfer: resource.transferSize,
              body: resource.encodedBodySize,
            };
          }),
      );
    read();
    const timer = window.setInterval(read, 1000);
    return () => window.clearInterval(timer);
  }, [id]);

  const about = ABOUT[motion.variant];
  const files = about.files(id);
  return (
    <details className={styles.lab} open>
      <summary>Prototype #196 · {motion.variant} · {id}</summary>
      <div className={styles.labBody}>
        {configured ? null : <p>No prototype geometry for this Illustration: only loc-hunters-camp and camp-standoff animate.</p>}
        <p>{about.summary}</p>
        <h4>Authoring</h4>
        <p>{about.authoring}</p>
        <h4>Declaration in images.yaml (sketch)</h4>
        <pre>{declaration(motion.variant, id, configured ? ILLUSTRATIONS[id] : undefined)}</pre>
        <h4>Bytes on disk (640×360, 8 s loop)</h4>
        <table>
          <tbody>
            <tr>
              <td>{id}.png (still)</td>
              <td>{sizes[`${id}.png`] ? kib(sizes[`${id}.png`]) : '–'}</td>
            </tr>
            {files.map((name) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{sizes[name] ? kib(sizes[name]) : '–'}</td>
              </tr>
            ))}
            {motion.variant === 'C' ? (
              <tr>
                <td>engine preset code (shared)</td>
                <td>~3 KiB</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <h4>Fetched by this page (transfer / body)</h4>
        <table>
          <tbody>
            {fetched.length === 0 ? (
              <tr>
                <td>nothing yet</td>
                <td />
              </tr>
            ) : (
              fetched.map((entry, i) => (
                <tr key={`${entry.name}-${i}`}>
                  <td>{entry.name}</td>
                  <td>
                    {kib(entry.transfer)} / {kib(entry.body)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <h4>Motion state (policy #195)</h4>
        <table>
          <tbody>
            <tr>
              <td>OS prefers-reduced-motion</td>
              <td>{motion.osReduced ? 'reduce' : 'no-preference'}</td>
            </tr>
            <tr>
              <td>Stored player choice (localStorage)</td>
              <td>{motion.stored ?? 'none'}</td>
            </tr>
            <tr>
              <td>Effective motion</td>
              <td>{motion.motionOn ? 'on' : 'off'}</td>
            </tr>
            <tr>
              <td>Browser refused to animate</td>
              <td>{refused ? 'yes' : 'no'}</td>
            </tr>
            <tr>
              <td>Animation failed → still</td>
              <td>{animationFailed ? 'yes' : 'no'}</td>
            </tr>
            <tr>
              <td>Animating now</td>
              <td>{playing ? 'yes' : 'no'}</td>
            </tr>
          </tbody>
        </table>
        <h4>Simulate</h4>
        <label>
          <input
            type="checkbox"
            checked={motion.lab.simulateReducedMotion}
            onChange={(event) => setLab({ simulateReducedMotion: event.target.checked })}
          />{' '}
          OS reduced motion (only when no stored choice)
        </label>
        <label>
          <input
            type="checkbox"
            checked={motion.lab.failAnimation}
            onChange={(event) => setLab({ failAnimation: event.target.checked })}
          />{' '}
          Animation file fails to load
        </label>
        <label>
          <input
            type="checkbox"
            checked={motion.lab.refuseAutoplay}
            onChange={(event) => setLab({ refuseAutoplay: event.target.checked })}
          />{' '}
          Browser refuses autoplay (A only: iOS Low Power Mode)
        </label>
        <button type="button" onClick={() => setPreference(null)}>
          Clear stored Play/Pause choice
        </button>
      </div>
    </details>
  );
}
