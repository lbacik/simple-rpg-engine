// Illustration (docs/spec/ui.md, scene and location illustration): a plain
// `<img>` with the registry width, height and alt, filling the reading column
// without cropping. It serves Scenes and Locations alike. A browser load error
// removes the element — no frame, no alt-text box, no retry — and play
// continues.

'use client';

export function Illustration({
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
