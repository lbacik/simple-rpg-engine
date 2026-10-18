// Scene illustration (docs/spec/ui.md, scene illustration): a plain `<img>`
// with the registry width, height and alt, filling the reading column without
// cropping. A browser load error removes the element — no frame, no alt-text
// box, no retry — and play continues.

'use client';

// PROTOTYPE (#196): animated Illustration variants, development builds only.
import { AnimatedIllustrationPrototype } from './_prototype-animated-illustration/variants';

export function SceneIllustration({
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
  if (process.env.NODE_ENV !== 'production') {
    return <AnimatedIllustrationPrototype src={src} width={width} height={height} alt={alt} />;
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
