// Illustration (docs/spec/ui.md, scene and location illustration): the Still
// as a plain server-rendered `<img>` with the registry width, height and alt,
// filling the reading column without cropping. It serves Scenes and Locations
// alike. A browser load error removes the element — no frame, no alt-text box,
// no retry — and play continues.
//
// An Illustration with `motion` adds its Layers as a JavaScript enhancement
// (docs/spec/ui.md, motion): after hydration the client fetches every distinct
// Layer file once, and once the Still and every Layer file have loaded it
// composes the Layers over the Still in list order with a linear 1 s fade-in.
// A Layer with `drift` moves its anchor from `from` to `to` on the
// Web Animations API from the shared timeline t = 0, clipped to the box by
// the composition's overflow. Any Layer failure leaves the Still for this
// Showing. Under `prefers-reduced-motion: reduce` Motion stays off and no
// Layer file is fetched. Without JavaScript only the Still shows.

'use client';

import { useEffect, useRef, useState } from 'react';

/** One Motion Layer as the Illustration view carries it: declaration (with defaults applied), asset URL and pixel size. A sprite-strip Layer also carries `frames` and `fps`. */
export type IllustrationMotionLayer = {
  src: string;
  at: { x: number; y: number };
  anchor: { x: number; y: number };
  width: number;
  /** The sprite strip frame count; present exactly when `fps` is. */
  frames?: number;
  /** Frames per second; present exactly when `frames` is. */
  fps?: number;
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
  showingKey,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Present only when the image has Motion. */
  layers?: IllustrationMotionLayer[];
  /** `scene:<id>` or `location:<id>`; present only with `layers`. */
  showingKey?: string;
}) {
  const [layersLoaded, setLayersLoaded] = useState(false);
  const [stillLoaded, setStillLoaded] = useState(false);
  const [stillFailed, setStillFailed] = useState(false);
  const stillRef = useRef<HTMLImageElement>(null);
  const layerRefs = useRef<(HTMLElement | null)[]>([]);
  // A file shared by several Layers is fetched once.
  const distinctSrcs = [...new Set((layers ?? []).map((layer) => layer.src))];
  const srcKey = distinctSrcs.join('\n');
  // The Drift animation inputs of this Showing, as a stable key: the engine
  // view rebuilds the Layer array on every render, but the declarations only
  // change with the Showing (or the image). The key covers the Drift and the
  // anchor and width its endpoints are computed from, so a changed endpoint
  // restarts the animation.
  const driftAnimKey = JSON.stringify(
    (layers ?? []).map((layer) => ({
      drift: layer.drift ?? null,
      anchor: layer.anchor,
      width: layer.width,
    })),
  );

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
  // runs only when the key (or the Layer set) changes, and the Layer
  // composition is keyed by it so React remounts it on a new Showing.
  useEffect(() => {
    setLayersLoaded(false);
    if (layers === undefined || layers.length === 0 || showingKey === undefined) {
      return;
    }
    // Motion stays off under reduced motion, and no Layer file is fetched.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
    // `srcKey` stands in for the Layer set: the fetch restarts only when the
    // Showing or the distinct Layer files change, never on a re-render with
    // the same key (which continues the Showing).
  }, [showingKey, srcKey]);

  // Motion starts only once the Still and every Layer file have loaded
  // (docs/spec/ui.md, start and fade-in). Fading the Layer composition over
  // the plain Still is that composition fading in: the Still over itself is
  // the Still.
  const motionReady =
    layersLoaded &&
    stillLoaded &&
    !stillFailed &&
    layers !== undefined &&
    layers.length > 0 &&
    showingKey !== undefined;

  // Drift runs on the Web Animations API from the shared timeline t = 0: the
  // composition mounts when Motion starts (keyed by the Showing key), so an
  // animation with `delay`, linear easing and a forwards fill waits at `from`,
  // moves to `to` and holds there; a looping Drift repeats at once, since
  // the delay applies only before the first pass. The effect keys on the
  // Showing, never on the Layer array identity, so a re-render with the same
  // key continues the Showing instead of restarting it. Freezing the timeline
  // while the Illustration is off-screen or the tab is hidden (docs/spec/ui.md,
  // timeline) is a follow-up: these animations keep wall-clock time.
  useEffect(() => {
    if (!motionReady || layers === undefined || showingKey === undefined) {
      return;
    }
    const animations: Animation[] = [];
    layers.forEach((layer, index) => {
      if (layer.drift === undefined) return;
      const img = layerRefs.current[index];
      if (!img || typeof img.animate !== 'function') return;
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
    });
    return () => {
      for (const animation of animations) {
        try {
          animation.cancel();
        } catch {
          // Already finished or never started; nothing to stop.
        }
      }
    };
  }, [motionReady, showingKey, driftAnimKey, width, height]);

  return (
    <span
      className="illustration-box"
      style={{ display: 'block', position: 'relative', isolation: 'isolate' }}
    >
      <img
        ref={stillRef}
        src={src}
        width={width}
        height={height}
        alt={alt}
        className="illustration"
        style={{ maxWidth: '100%', height: 'auto' }}
        onLoad={() => {
          setStillLoaded(true);
        }}
        onError={(event) => {
          // A Still that fails to load fetches no Layers and shows nothing.
          setStillFailed(true);
          event.currentTarget.remove();
        }}
      />
      {motionReady && layers !== undefined && layers.length > 0 && showingKey !== undefined ? (
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
          {layers.map((layer, index) => (
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
  );
}

/**
 * One Layer of the Motion composition (docs/spec/ui.md, motion): a plain
 * picture renders as one positioned image; a sprite strip renders as a
 * one-frame window with the full strip inside it, stepping through the frames.
 * Pure, so the frame markup is testable without hydration.
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
