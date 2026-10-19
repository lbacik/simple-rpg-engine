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
// Any Layer failure leaves the Still for this Showing. Under
// `prefers-reduced-motion: reduce` Motion stays off and no Layer file is
// fetched. Without JavaScript only the Still shows.

'use client';

import { useEffect, useRef, useState } from 'react';

/** One Motion Layer as the Illustration view carries it: declaration (with defaults applied), asset URL and pixel size. */
export type IllustrationMotionLayer = {
  src: string;
  at: { x: number; y: number };
  anchor: { x: number; y: number };
  width: number;
  blend: 'normal' | 'multiply' | 'screen';
  pixelWidth: number;
  pixelHeight: number;
};

/**
 * A Layer's geometry over the Still's box, in percent
 * (docs/spec/ui.md, a Layer's size and place): the Layer's width is `width`
 * percent of the Still's width with its height following from the file's
 * aspect ratio, and the Layer's `anchor` point sits on `at`. `leftPct` is a
 * percent of the box width, `topPct` a percent of the box height.
 */
export function layerGeometry(
  layer: Pick<IllustrationMotionLayer, 'at' | 'anchor' | 'width'>,
  file: Pick<IllustrationMotionLayer, 'pixelWidth' | 'pixelHeight'>,
  still: { width: number; height: number },
): { widthPct: number; leftPct: number; topPct: number } {
  const widthPct = layer.width;
  const leftPct = layer.at.x - (layer.anchor.x * layer.width) / 100;
  const heightPctOfBoxHeight =
    layer.width * (file.pixelHeight / file.pixelWidth) * (still.width / still.height);
  const topPct = layer.at.y - (layer.anchor.y * heightPctOfBoxHeight) / 100;
  return { widthPct, leftPct, topPct };
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
  // A file shared by several Layers is fetched once.
  const distinctSrcs = [...new Set((layers ?? []).map((layer) => layer.src))];
  const srcKey = distinctSrcs.join('\n');

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
          {layers.map((layer, index) => {
            const geometry = layerGeometry(layer, layer, { width, height });
            return (
              <img
                // Layers have no id; the list order is the draw order.
                key={`${layer.src}#${index}`}
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
                  ...(layer.blend === 'normal' ? {} : { mixBlendMode: layer.blend }),
                }}
              />
            );
          })}
        </span>
      ) : null}
    </span>
  );
}
