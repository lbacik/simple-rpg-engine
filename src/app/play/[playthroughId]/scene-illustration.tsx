// Scene illustration (docs/spec/ui.md, scene illustration): a plain `<img>`
// with the registry width, height and alt, filling the reading column without
// cropping. A browser load error removes the element — no frame, no alt-text
// box, no retry — and play continues.

'use client';

import type { MotionView } from '@/engine/index';
import { LayeredIllustration } from './prototype-layered-illustration';

export function SceneIllustration({
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
  motion?: MotionView;
}) {
  // PROTOTYPE (#209): a layered Illustration. Keyed by the Still, so another
  // Illustration starts a new Showing.
  if (motion !== undefined) {
    return <LayeredIllustration key={src} src={src} width={width} height={height} alt={alt} motion={motion} />;
  }
  return (
    <img
      src={src}
      width={width}
      height={height}
      alt={alt}
      className="illustration"
      style={{ maxWidth: '100%', height: 'auto' }}
      onError={(event) => {
        event.currentTarget.remove();
      }}
    />
  );
}
