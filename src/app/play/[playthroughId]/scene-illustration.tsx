// Scene illustration (docs/spec/ui.md, scene illustration): a plain `<img>`
// with the registry width, height and alt, filling the reading column without
// cropping. A browser load error removes the element — no frame, no alt-text
// box, no retry — and play continues.

'use client';

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
