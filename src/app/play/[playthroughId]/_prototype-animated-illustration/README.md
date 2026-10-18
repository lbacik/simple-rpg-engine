# PROTOTYPE: animated Illustration approaches (#196)

Throwaway. Lives only on the `prototype/animated-illustration-approaches` branch.

Question: which approach should animated Illustrations use? The same Scene
Illustration is rendered with four approaches on the real play page:

| `?anim=` | Approach |
| --- | --- |
| `static` | Today: plain `<img>` |
| `A` | Whole file: muted looping video (WebM VP9 + MP4 H.264) |
| `B` | Whole file: animated AVIF in `<img>` |
| `C` | Still + engine effect presets on a canvas (`light-flicker`, `fire`, `birds`) |
| `D` | Still + author-supplied layers (light layer, flame sprite, bird sprite) |

## Run

1. `npm run dev`
2. Start a whispering-woods Playthrough, accept Brenna's quest, take the cart
   track, ignore the voices, follow the trampled trail north. "An Arrow at the
   Ready" (`camp-standoff`) and, once the bandit is gone, the Hunters' Camp
   location (`loc-hunters-camp`) animate.
3. Flip variants with the bottom bar or ← / →. The lab panel (right) shows the
   declaration sketch, bytes, the motion state and simulation toggles.

Only development builds render the prototype; production keeps the plain `<img>`.

## Assets

`node scripts/prototype-animated-illustration/render.mjs` (needs ffmpeg)
regenerates `public/prototype-animated-illustration/`: the D layers, and the
A/B whole files baked from those layers plus a slow camera drift (a stand-in
for AI image-to-video output). Drop a real AI MP4/WebM at
`public/prototype-animated-illustration/<id>.mp4|.webm` to compare.
