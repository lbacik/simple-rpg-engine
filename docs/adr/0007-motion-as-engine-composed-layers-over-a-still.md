# Illustration Motion is engine-composed Layers over a Still, not an animated file

An Illustration may carry Motion: transparent Layers (single pictures or strips of frames) that the engine composes over the Still and animates with Drifts and Flickers, plus an optional Camera over the Still and all Layers together. Motion is part of the Illustration, not a separate concept: Layers are placed relative to the Still, the Camera moves them with it, they share one `alt` and one size budget, and a shared image animates identically wherever it is shown. Every asset stays a PNG, JPEG or WebP still image, so the asset route, its MIME types and its security posture do not change. This reverses the earlier contract that "Animation is not a feature" ([Scene illustration assets: authoring, references and loading contract](https://github.com/lbacik/simple-rpg-engine/issues/14)). The comparison is in [Prototype: one Scene rendered with competing animation approaches](https://github.com/lbacik/simple-rpg-engine/issues/196#issuecomment-6250531255).

## Considered Options

- **A whole looping file (muted video or animated AVIF)**: the easiest output of AI video tools, but video needs HTTP Range and video MIME types on the asset route and shows a native play button in iOS Low Power Mode. Both formats are opaque, so a Condition-driven variant would need a whole extra file.
- **Engine effect presets over the Still (`fire`, `birds`, `light-flicker`)**: no asset bytes, but a generic look that clashed with the ink line-art of the existing Illustrations.
- **Lottie, Rive or SVG**: script risk from the app's origin or a tooling mismatch with the expected authors.

## Consequences

- The Still exists by construction, so the motion accessibility policy (the Still under reduced motion, while paused, without JavaScript and on failure) needs no extra asset.
- Separate Layers leave room for Condition-driven Layers later without re-authoring the whole Illustration.
- Authors produce Layers instead of one generated clip, which costs more work per Illustration.
- Flicker is an engine primitive whose frequency and amplitude the engine clamps, so authors cannot exceed flash thresholds through it.
