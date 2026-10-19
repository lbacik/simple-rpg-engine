// Illustration (docs/spec/ui.md, scene and location illustration): the Still
// as a plain server-rendered `<img>` with the registry width, height and alt,
// filling the reading column without cropping. It serves Scenes and Locations
// alike. A browser load error removes the element — no frame, no alt-text box,
// no retry — and play continues.
//
// An Illustration with `motion` adds its Layers and Camera as a JavaScript
// enhancement (docs/spec/ui.md, motion): after hydration the client fetches
// every distinct Layer file once, and once the Still and every Layer file have
// loaded it composes the Layers over the Still in list order with a linear
// 1 s fade-in. A Layer with `drift` moves its anchor from `from` to `to` on
// the Web Animations API from the shared timeline t = 0, clipped to the box
// by the composition's overflow. A flickering Layer varies its opacity along
// the engine's fixed Flicker curve on the same API and timeline. A Camera
// moves the Still and every Layer together with one transform of the same
// stage, from the same t = 0, so the Layers stay aligned with the painting.
// Any Layer failure leaves the Still for this Showing. Under
// `prefers-reduced-motion: reduce` Motion stays off and no Layer file is
// fetched. Without JavaScript only the Still shows.

'use client';

import { useEffect, useRef, useState } from 'react';

/** One Motion Layer as the Illustration view carries it: declaration (with defaults applied), asset URL and pixel size. A sprite-strip Layer also carries `frames` and `fps`; a flickering Layer also carries `flicker`. */
export type IllustrationMotionLayer = {
  src: string;
  at: { x: number; y: number };
  anchor: { x: number; y: number };
  width: number;
  /** The sprite strip frame count; present exactly when `fps` is. */
  frames?: number;
  /** Frames per second; present exactly when `frames` is. */
  fps?: number;
  /** The Flicker depth, the deepest opacity dip in percent; present only when the Layer flickers. */
  flicker?: { depth: number };
  blend: 'normal' | 'multiply' | 'screen';
  drift?: IllustrationMotionDrift;
  pixelWidth: number;
  pixelHeight: number;
};

/** A Layer's Drift as the Illustration view carries it, with defaults applied. */
export type IllustrationMotionDrift = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  duration: number;
  delay: number;
  loop: boolean;
};

/** One Camera framing: the magnification in percent and its fixed point. */
export type IllustrationCameraFraming = {
  zoom: number;
  x: number;
  y: number;
};

/** An Illustration's Camera as the Illustration view carries it, with defaults applied. */
export type IllustrationMotionCamera = {
  from: IllustrationCameraFraming;
  to: IllustrationCameraFraming;
  duration: number;
  delay: number;
  loop: boolean;
};

function formatCameraNumber(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return `${rounded === 0 ? 0 : rounded}`;
}

/**
 * A Camera framing as a CSS transform (docs/spec/ui.md, camera): with scale
 * `s = zoom / 100`, `translate((1 − s) · x%, (1 − s) · y%) scale(s)` of the
 * box from its top-left corner, so the point (x, y) of the Still stays in
 * place and the view never leaves the Still.
 */
export function cameraTransform(framing: IllustrationCameraFraming): string {
  const scale = framing.zoom / 100;
  const x = formatCameraNumber((1 - scale) * framing.x);
  const y = formatCameraNumber((1 - scale) * framing.y);
  return `translate(${x}%, ${y}%) scale(${formatCameraNumber(scale)})`;
}

function cameraEaseInOut(progress: number): number {
  return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
}

function lerpFraming(
  from: IllustrationCameraFraming,
  to: IllustrationCameraFraming,
  progress: number,
): IllustrationCameraFraming {
  return {
    zoom: from.zoom + (to.zoom - from.zoom) * progress,
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

/**
 * A Camera's framing `timeSec` seconds into the shared timeline
 * (docs/spec/ui.md, camera and timeline; t = 0 is the start of the fade): it
 * holds `from` until `delay` ends, then moves to `to` in `duration` seconds
 * with a fixed ease-in-out. A one-shot Camera then holds at `to`; a looping
 * Camera goes back and forth, `duration` seconds each way, its `delay`
 * applying only before the first pass. Interpolating keeps every
 * intermediate a valid framing, so the view never leaves the Still.
 */
export function cameraFramingAt(
  camera: Pick<IllustrationMotionCamera, 'from' | 'to' | 'duration' | 'delay' | 'loop'>,
  timeSec: number,
): IllustrationCameraFraming {
  const elapsed = timeSec - camera.delay;
  if (elapsed <= 0) return { ...camera.from };
  if (!camera.loop) {
    if (elapsed >= camera.duration) return { ...camera.to };
    return lerpFraming(camera.from, camera.to, cameraEaseInOut(elapsed / camera.duration));
  }
  const cycle = elapsed % (2 * camera.duration);
  if (cycle <= camera.duration) return lerpFraming(camera.from, camera.to, cameraEaseInOut(cycle / camera.duration));
  return lerpFraming(camera.from, camera.to, cameraEaseInOut(1 - (cycle - camera.duration) / camera.duration));
}

function geometryForPoint(
  point: { x: number; y: number },
  layer: Pick<IllustrationMotionLayer, 'anchor' | 'width'> & { frames?: number },
  file: Pick<IllustrationMotionLayer, 'pixelWidth' | 'pixelHeight'>,
  still: { width: number; height: number },
): { widthPct: number; leftPct: number; topPct: number } {
  const frameWidth = layer.frames === undefined ? file.pixelWidth : file.pixelWidth / layer.frames;
  const widthPct = layer.width;
  const leftPct = point.x - (layer.anchor.x * layer.width) / 100;
  const heightPctOfBoxHeight =
    layer.width * (file.pixelHeight / frameWidth) * (still.width / still.height);
  const topPct = point.y - (layer.anchor.y * heightPctOfBoxHeight) / 100;
  return { widthPct, leftPct, topPct };
}

/**
 * The engine's fixed Flicker curve (docs/spec/ui.md, flicker), defined once:
 * one cycle lasts 4 s with 8 keyframes at equal 4/7 s intervals, eased
 * in-out between keyframes, repeating from t = 0. The author controls only
 * `depth`; the rate is the engine's, below the WCAG 2.3.1 threshold by
 * construction.
 */

/** One Flicker cycle lasts 4 s. */
export const FLICKER_CYCLE_SEC = 4;

/** The opacity dip at each of the 8 keyframes, from t = 0 to t = 4 s. */
export const FLICKER_DIPS = [0, 0.6, 0.2, 1, 0.4, 0.8, 0.1, 0] as const;

/** Seconds between two Flicker keyframes: 8 keyframes over the 4 s cycle. */
const FLICKER_KEYFRAME_SEC = FLICKER_CYCLE_SEC / (FLICKER_DIPS.length - 1);

/**
 * The y of `cubic-bezier(x1, y1, x2, y2)` at x: Newton–Raphson on the
 * x-projection with a bisection fallback, the scheme browsers use for CSS
 * timing functions.
 */
function cubicBezierY(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
): number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const error = sampleX(t) - x;
    if (Math.abs(error) < 1e-7) return sampleY(t);
    const derivative = sampleDX(t);
    if (Math.abs(derivative) < 1e-7) break;
    t -= error / derivative;
  }
  let low = 0;
  let high = 1;
  t = x;
  while (high - low > 1e-7) {
    const value = sampleX(t);
    if (Math.abs(value - x) < 1e-7) break;
    if (value < x) low = t;
    else high = t;
    t = (high + low) / 2;
  }
  return sampleY(t);
}

/**
 * Ease a 0–1 segment progress in-out: the CSS `ease-in-out` timing function,
 * `cubic-bezier(0.42, 0, 0.58, 1)` — the same easing the browser applies
 * between Flicker keyframes — so the pure helper below traces exactly the
 * curve the Web Animations API animates.
 */
function easeInOut(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return cubicBezierY(0.42, 0, 0.58, 1, progress);
}

/**
 * A flickering Layer's opacity `timeSec` seconds into the shared timeline
 * (docs/spec/ui.md, flicker and timeline; t = 0 is the start of the fade):
 * `1 − dip × depth / 100` along the fixed curve, repeating every 4 s from
 * t = 0. Pure, so the curve the browser animates is testable without
 * hydration.
 */
export function flickerOpacity(depth: number, timeSec: number): number {
  const cycle = ((timeSec % FLICKER_CYCLE_SEC) + FLICKER_CYCLE_SEC) % FLICKER_CYCLE_SEC;
  const segment = cycle / FLICKER_KEYFRAME_SEC;
  const floored = Math.floor(segment);
  const from = FLICKER_DIPS[floored % FLICKER_DIPS.length] as number;
  const to = FLICKER_DIPS[(floored + 1) % FLICKER_DIPS.length] as number;
  const dip = from + (to - from) * easeInOut(segment - floored);
  return 1 - (dip * depth) / 100;
}

/**
 * The Web Animations API keyframes for one Flicker cycle at `depth`: the 8
 * dips as opacities, evenly spaced over the cycle by the browser, eased
 * in-out between keyframes. Built from the one fixed curve, so every Flicker
 * of one Illustration shares the same list for the same depth.
 */
export function flickerKeyframes(depth: number): Keyframe[] {
  return FLICKER_DIPS.map((dip) => ({
    opacity: 1 - (dip * depth) / 100,
    easing: 'ease-in-out',
  }));
}

/**
 * Start every Flicker animation of one Illustration together
 * (docs/spec/ui.md, flicker): sharing one start time on the timeline they
 * mounted on keeps a flame and its glow pulsing together. A still-pending
 * first animation has no start time yet; the animations then keep their own
 * same-tick starts on the same timeline. Pure over the animation handles, so
 * unison is testable without a browser.
 */
export function syncAnimationStartTimes(animations: readonly Pick<Animation, 'startTime'>[]): void {
  const startTime = animations[0]?.startTime;
  if (startTime === undefined || startTime === null) return;
  for (const animation of animations) {
    try {
      animation.startTime = startTime;
    } catch {
      // Already finished or never started; it keeps its own start.
    }
  }
}

/**
 * A Layer's geometry over the Still's box, in percent
 * (docs/spec/ui.md, a Layer's size and place): the Layer's width is `width`
 * percent of the Still's width with its height following from the aspect ratio
 * of one frame (the file's pixel width divided by `frames` for a sprite
 * strip), and the Layer's `anchor` point sits on `at`, or on the Drift's
 * `from` point while it drifts (so a Layer entering the picture starts
 * outside the box, clipped by the composition). `leftPct` is a percent of the
 * box width, `topPct` a percent of the box height.
 */
export function layerGeometry(
  layer: Pick<IllustrationMotionLayer, 'at' | 'anchor' | 'width' | 'drift'> & { frames?: number },
  file: Pick<IllustrationMotionLayer, 'pixelWidth' | 'pixelHeight'>,
  still: { width: number; height: number },
): { widthPct: number; leftPct: number; topPct: number } {
  return geometryForPoint(
    layer.drift === undefined ? layer.at : layer.drift.from,
    layer,
    file,
    still,
  );
}

function lerpPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number,
): { x: number; y: number } {
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
}

/**
 * A drifting anchor's point on the Still `timeSec` seconds into the shared
 * timeline (docs/spec/ui.md, drift and timeline; t = 0 is the start of the
 * fade): it waits at `from` until `delay` ends, then moves linearly to `to`
 * in `duration` seconds. A one-shot Drift then holds at `to`; a looping Drift
 * jumps back to `from` at the end of each pass and starts again at once, its
 * `delay` applying only before the first pass.
 */
export function driftPosition(
  drift: Pick<IllustrationMotionDrift, 'from' | 'to' | 'duration' | 'delay' | 'loop'>,
  timeSec: number,
): { x: number; y: number } {
  const elapsed = timeSec - drift.delay;
  if (elapsed <= 0) return { ...drift.from };
  if (!drift.loop) {
    if (elapsed >= drift.duration) return { ...drift.to };
    return lerpPoint(drift.from, drift.to, elapsed / drift.duration);
  }
  const cycle = elapsed % drift.duration;
  if (cycle === 0) return { ...drift.from };
  return lerpPoint(drift.from, drift.to, cycle / drift.duration);
}

/**
 * One frame of a sprite strip, in pixels: the strip is a horizontal row of
 * `frames` equal-width frames, so one frame is the file's width divided by
 * `frames` with the file's height.
 */
export function spriteFrame(
  layer: Pick<IllustrationMotionLayer, 'frames' | 'pixelWidth' | 'pixelHeight'>,
): { frameWidth: number; frameHeight: number } {
  const frames = layer.frames ?? 1;
  return { frameWidth: layer.pixelWidth / frames, frameHeight: layer.pixelHeight };
}

/**
 * How long one loop of a sprite strip lasts, in seconds: `frames` frames at
 * `fps` frames per second (docs/spec/ui.md, frames).
 */
export function spriteDuration(layer: Pick<IllustrationMotionLayer, 'frames' | 'fps'>): number {
  return (layer.frames ?? 1) / (layer.fps ?? 1);
}

export function Illustration({
  src,
  width,
  height,
  alt,
  layers,
  camera,
  showingKey,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Present only when the image has Motion. */
  layers?: IllustrationMotionLayer[];
  /** Present only when the image has a Camera. */
  camera?: IllustrationMotionCamera;
  /** `scene:<id>` or `location:<id>`; present only with Motion (Layers or a Camera). */
  showingKey?: string;
}) {
  const [layersLoaded, setLayersLoaded] = useState(false);
  const [stillLoaded, setStillLoaded] = useState(false);
  const [stillFailed, setStillFailed] = useState(false);
  // A Camera-only Illustration fetches no Layer file, so nothing sets
  // `layersLoaded` for it: this Showing's Motion is live as soon as it is
  // allowed (not under reduced motion).
  const [cameraLive, setCameraLive] = useState(false);
  const stillRef = useRef<HTMLImageElement>(null);
  const layerRefs = useRef<(HTMLElement | null)[]>([]);
  const cameraRef = useRef<HTMLElement>(null);
  // A file shared by several Layers is fetched once.
  const distinctSrcs = [...new Set((layers ?? []).map((layer) => layer.src))];
  const srcKey = distinctSrcs.join('\n');
  // The animation inputs of this Showing (Drift and Flicker), as a stable key:
  // the engine view rebuilds the Layer array on every render, but the
  // declarations only change with the Showing (or the image). The key covers
  // the Drift and the anchor and width its endpoints are computed from, so a
  // changed endpoint restarts the animation. The animation effect keys on the
  // Showing and this key, never on the Layer array identity, so a re-render
  // with the same key continues the Showing instead of restarting it.
  const animKey = JSON.stringify(
    (layers ?? []).map((layer) => ({
      drift: layer.drift ?? null,
      flicker: layer.flicker ?? null,
      anchor: layer.anchor,
      width: layer.width,
    })),
  );
  // The Camera animation input of this Showing, as a stable key: same
  // rebuild-on-every-render story as the Drift key above.
  const cameraAnimKey = JSON.stringify(camera ?? null);

  // A new Still restarts Motion's start conditions. A Still already in the
  // browser cache reports `complete`, since its `load` event fired before
  // hydration and will not fire again.
  useEffect(() => {
    setStillLoaded(false);
    setStillFailed(false);
    const still = stillRef.current;
    if (still !== null && still.complete && still.naturalWidth > 0) {
      setStillLoaded(true);
    }
  }, [src]);

  // A new Showing restarts Motion; the same key continues it: the fetch below
  // runs only when the key (or the Layer set, or the Camera) changes, and the
  // Layer composition is keyed by it so React remounts it on a new Showing.
  // A Camera-only Illustration sets no fetch in motion: its Motion goes live
  // at once, with no Layer fetches.
  useEffect(() => {
    setLayersLoaded(false);
    setCameraLive(false);
    if ((layers === undefined || layers.length === 0) && camera === undefined) {
      return;
    }
    if (showingKey === undefined) {
      return;
    }
    // Motion stays off under reduced motion, and no Layer file is fetched.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    if (layers === undefined || layers.length === 0) {
      setCameraLive(true);
      return;
    }
    let cancelled = false;
    const pending = distinctSrcs.map(
      (layerSrc) =>
        new Promise<void>((resolve, reject) => {
          const loader = new Image();
          loader.onload = () => resolve();
          loader.onerror = () => reject(new Error(`layer failed to load: ${layerSrc}`));
          loader.src = layerSrc;
        }),
    );
    // All or nothing: the Still shows alone until every Layer file has loaded,
    // and a failed Layer abandons Motion for this Showing, leaving the Still.
    void Promise.all(pending).then(
      () => {
        if (!cancelled) setLayersLoaded(true);
      },
      () => {
        if (!cancelled) setLayersLoaded(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // `srcKey` stands in for the Layer set and `cameraAnimKey` for the
    // Camera: the fetch restarts only when the Showing, the distinct Layer
    // files or the Camera change, never on a re-render with the same key
    // (which continues the Showing).
  }, [showingKey, srcKey, cameraAnimKey]);

  // Motion starts only once the Still and every Layer file have loaded
  // (docs/spec/ui.md, start and fade-in). Fading the Layer composition over
  // the plain Still is that composition fading in: the Still over itself is
  // the Still. A Camera-only Illustration has no Layer file to wait for, so
  // its Motion starts once the Still has loaded.
  const hasLayers = layers !== undefined && layers.length > 0;
  const motionReady =
    stillLoaded &&
    !stillFailed &&
    showingKey !== undefined &&
    (camera !== undefined || hasLayers) &&
    (hasLayers ? layersLoaded : cameraLive);

  // Drift and Flicker run on the Web Animations API from the shared timeline
  // t = 0: the composition mounts when Motion starts (keyed by the Showing
  // key), so every animation created here counts from the same start. A Drift
  // animation with `delay`, linear easing and a forwards fill waits at `from`,
  // moves to `to` and holds there; a looping Drift repeats at once, since the
  // delay applies only before the first pass. A Flicker animation loops the
  // one fixed 4 s curve forever; its keyframes carry the Layer's depth, so a
  // flame and its glow pulse together. Freezing the timeline while the
  // Illustration is off-screen or the tab is hidden (docs/spec/ui.md,
  // timeline) is a follow-up: these animations keep wall-clock time.
  useEffect(() => {
    if (!motionReady || layers === undefined || showingKey === undefined) {
      return;
    }
    const animations: Animation[] = [];
    const flickers: Animation[] = [];
    layers.forEach((layer, index) => {
      const img = layerRefs.current[index];
      if (!img || typeof img.animate !== 'function') return;
      if (layer.drift !== undefined) {
        const fromGeometry = geometryForPoint(layer.drift.from, layer, layer, { width, height });
        const toGeometry = geometryForPoint(layer.drift.to, layer, layer, { width, height });
        try {
          animations.push(
            img.animate(
              [
                { left: `${fromGeometry.leftPct}%`, top: `${fromGeometry.topPct}%` },
                { left: `${toGeometry.leftPct}%`, top: `${toGeometry.topPct}%` },
              ],
              {
                duration: layer.drift.duration * 1000,
                delay: layer.drift.delay * 1000,
                easing: 'linear',
                fill: 'forwards',
                ...(layer.drift.loop ? { iterations: Infinity } : {}),
              },
            ),
          );
        } catch {
          // The browser refuses to animate: the Layer stays at its from point
          // over the Still (docs/spec/ui.md, the browser refuses to animate).
        }
      }
      if (layer.flicker !== undefined) {
        try {
          flickers.push(
            img.animate(flickerKeyframes(layer.flicker.depth), {
              duration: FLICKER_CYCLE_SEC * 1000,
              iterations: Infinity,
            }),
          );
        } catch {
          // The browser refuses to animate: the Layer stays fully opaque over
          // the Still (docs/spec/ui.md, the browser refuses to animate).
        }
      }
    });
    // Every Flicker of one Illustration runs in unison (docs/spec/ui.md,
    // flicker): the animations share one start time on the timeline they
    // mounted on.
    syncAnimationStartTimes(flickers);
    animations.push(...flickers);
    return () => {
      for (const animation of animations) {
        try {
          animation.cancel();
        } catch {
          // Already finished or never started; nothing to stop.
        }
      }
    };
  }, [motionReady, showingKey, animKey, width, height]);

  // The Camera runs on the Web Animations API from the same shared timeline
  // t = 0 as the fade: one transform on the Camera stage moves the Still and
  // every Layer together, so the Layers stay aligned with the painting. The
  // stage holds the `from` framing until `delay` ends, then eases in and out
  // to `to` and holds there; a looping Camera alternates back and forth,
  // `duration` seconds each way, since the delay applies only before the
  // first pass. The effect keys on the Showing, never on the Layer array
  // identity, so a re-render with the same key continues the Showing instead
  // of restarting it.
  useEffect(() => {
    if (!motionReady || camera === undefined) {
      return;
    }
    const stage = cameraRef.current;
    if (!stage || typeof stage.animate !== 'function') return;
    let animation: Animation | null = null;
    try {
      animation = stage.animate(
        [{ transform: cameraTransform(camera.from) }, { transform: cameraTransform(camera.to) }],
        {
          duration: camera.duration * 1000,
          delay: camera.delay * 1000,
          easing: 'ease-in-out',
          fill: 'forwards',
          ...(camera.loop ? { direction: 'alternate', iterations: Infinity } : {}),
        },
      );
    } catch {
      // The browser refuses to animate: the Still stays at the from framing
      // (docs/spec/ui.md, the browser refuses to animate).
    }
    return () => {
      try {
        animation?.cancel();
      } catch {
        // Already finished or never started; nothing to stop.
      }
    };
  }, [motionReady, showingKey, cameraAnimKey]);

  return (
    <span
      className="illustration-box"
      style={{ display: 'block', position: 'relative', isolation: 'isolate' }}
    >
      {/* The Camera stage carries the Still and the Layer composition
        together, so one transform keeps them aligned. The stage is clipped
        to the Still's box; the Play/Pause control lives in this outer box,
        outside the stage, so the Camera never moves it. */}
      <span
        ref={cameraRef}
        className="illustration-camera-stage"
        style={{
          display: 'block',
          position: 'relative',
          overflow: 'hidden',
          transformOrigin: '0 0',
          ...(motionReady && camera !== undefined ? { transform: cameraTransform(camera.from) } : {}),
          // A Camera-only Illustration fades its framed Still over the plain
          // Still, like the Layer composition does (docs/spec/ui.md, start
          // and fade-in): the Still over itself is the Still. With Layers the
          // composition below carries the fade instead, so the stage itself
          // never fades twice.
          ...(motionReady && camera !== undefined && !hasLayers
            ? { animation: 'illustration-motion-fade-in 1s linear' }
            : {}),
        }}
      >
        <img
          ref={stillRef}
          src={src}
          width={width}
          height={height}
          alt={alt}
          className="illustration"
          style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
          onLoad={() => {
            setStillLoaded(true);
          }}
          onError={(event) => {
            // A Still that fails to load fetches no Layers and shows nothing.
            setStillFailed(true);
            event.currentTarget.remove();
          }}
        />
        {motionReady && hasLayers && showingKey !== undefined ? (
          <span
            key={showingKey}
            aria-hidden="true"
            className="illustration-motion"
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              animation: 'illustration-motion-fade-in 1s linear',
            }}
          >
            {(layers ?? []).map((layer, index) => (
              <MotionLayer
                key={`${layer.src}#${index}`}
                layer={layer}
                still={{ width, height }}
                index={index}
                elementRef={(element) => {
                  layerRefs.current[index] = element;
                }}
              />
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * One Layer of the Motion composition (docs/spec/ui.md, motion): a plain
 * picture renders as one positioned image; a sprite strip renders as a
 * one-frame window with the full strip inside it, stepping through the frames.
 * A flickering Layer's opacity is animated by the parent on its outer element
 * (the window for a strip, the image for a plain picture), so `frames` and
 * `flicker` combine freely. Pure, so the frame markup is testable without
 * hydration.
 */
export function MotionLayer({
  layer,
  still,
  index,
  elementRef,
}: {
  layer: IllustrationMotionLayer;
  still: { width: number; height: number };
  /** The Layer's position in list order (Layers have no id); disambiguates shared files. */
  index: number;
  /** Receives the positioned element, the one a Drift animates. */
  elementRef?: (element: HTMLElement | null) => void;
}) {
  const geometry = layerGeometry(layer, layer, still);
  const blend = layer.blend === 'normal' ? {} : { mixBlendMode: layer.blend };
  // Layers have no id; the list order is the draw order.
  const key = `${layer.src}#${index}`;
  // A sprite strip shows one frame at a time: the window is sized and
  // anchored by one frame, and the full strip inside it steps from frame 0
  // through every frame, looping for as long as the Layer is shown
  // (docs/spec/ui.md, frames). The strip is `frames` times wider than the
  // window, so translating it by its own -100% in `frames` steps lands exactly
  // on each frame, one step every 1/`fps` seconds. Strips mounted together
  // start together, so two Layers sharing one file run in unison when their
  // `fps` match; the shared file is fetched once (see above).
  if (layer.frames !== undefined && layer.fps !== undefined) {
    const frame = spriteFrame(layer);
    return (
      <span
        key={key}
        ref={elementRef}
        style={{
          position: 'absolute',
          width: `${geometry.widthPct}%`,
          left: `${geometry.leftPct}%`,
          top: `${geometry.topPct}%`,
          aspectRatio: `${frame.frameWidth} / ${frame.frameHeight}`,
          overflow: 'hidden',
          ...blend,
        }}
      >
        <img
          src={layer.src}
          alt=""
          draggable={false}
          style={{
            display: 'block',
            width: `${layer.frames * 100}%`,
            maxWidth: 'none',
            height: 'auto',
            animation: `illustration-sprite-step ${spriteDuration(layer)}s steps(${layer.frames}) infinite`,
          }}
        />
      </span>
    );
  }
  return (
    <img
      key={key}
      ref={elementRef}
      src={layer.src}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        width: `${geometry.widthPct}%`,
        left: `${geometry.leftPct}%`,
        top: `${geometry.topPct}%`,
        aspectRatio: `${layer.pixelWidth} / ${layer.pixelHeight}`,
        height: 'auto',
        ...blend,
      }}
    />
  );
}
