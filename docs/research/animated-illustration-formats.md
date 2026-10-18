# Research: web formats and techniques for looping ambient Illustrations

Ticket: [#194](https://github.com/lbacik/simple-rpg-engine/issues/194) (child of map [#193](https://github.com/lbacik/simple-rpg-engine/issues/193)).
Date: 2026-10-18. Status: findings only. **No approach is chosen here**; the prototype ticket ([#196](https://github.com/lbacik/simple-rpg-engine/issues/196)) decides.

Vocabulary follows `CONTEXT.md`: Illustration, Scene, Location, Scenario, Condition.

## Question

Which web formats and techniques can deliver a looping, ambient **animated Illustration** (birds flying past, a burning campfire, flickering light and shadow), and what does each cost? The candidates are whole animated files, a static image plus engine-rendered effects, author-supplied layers, and runtime animation formats. For each one: browser support, file size for a ~1600×900 loop of 5–10 s, CPU/GPU and battery cost, reduced-motion and pause/poster support, risk when served from the app's own origin, server needs, room for later Condition-driven layers or variants, and authoring tooling (AI image-to-video in particular).

## Starting point in this repo

- An Illustration is a plain `<img>` with registry `width`/`height`, `max-width: 100%; height: auto`; an `onError` handler removes the element (`src/app/play/[playthroughId]/scene-illustration.tsx`). `next/image` is not used.
- The asset Route Handler (`src/app/scenarios/[scenarioId]/assets/[hash]/[...path]/route.ts`) reads the whole file and returns `200` with `Content-Type` from a fixed map (`image/png`, `image/jpeg`, `image/webp`), `X-Content-Type-Options: nosniff` and `Cache-Control: public, max-age=31536000, immutable`. It does **not** handle `Range` requests (no `206`, no `Accept-Ranges`).
- `next.config.ts` sets no headers and the app sends no Content-Security-Policy today.
- Limits from [#14](https://github.com/lbacik/simple-rpg-engine/issues/14): ≤ 2 MiB per file, ≤ 4096 px per side. SVG was excluded because, served from the app's origin, it can carry script.
- `globals.css` already has two `@media (prefers-reduced-motion: reduce)` blocks, and `ui.md` already requires honouring `prefers-reduced-motion` for the Combat lane animation.

---

## Comparison at a glance

Sizes are for a 1600×900, 8 s, 24 fps loop and come from the measured probe in [§ Size probe](#size-probe); treat them as orders of magnitude, not forecasts. "Origin risk" means risk when the file is served from the app's own origin by the existing asset route.

| Approach | Support (desktop + iOS/Android) | Size, 8 s @ 1600×900 | CPU / GPU / battery | Reduced motion, pause, poster | Origin risk | Server needs | Room for Condition-driven layers/variants | AI tooling fit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **GIF** | Universal | 20–200 MiB | CPU decode of every frame, 256 colours, no inter-frame coding | `<img>` has no pause API; swap to a static file via `<picture media>` or JS | None (image) | None new | Variant = another whole file | Poor: AI tools export MP4; GIF loses colour |
| **APNG** | Universal (Chrome 59, Safari 8, Firefox 3) | 35–415 MiB | CPU decode, lossless, huge frames | As GIF | None (image) | None new | Variant = another whole file | Poor |
| **Animated WebP** | All current engines; Safari 14+ / iOS 14+ (macOS 11+) | 4.4 MiB (small moving patch) to 20–50 MiB (every pixel changes) | CPU decode; lossy WebP decode ~2.2× GIF per frame (Google FAQ) | As GIF | None (image; already allowed format) | None new | Variant = another whole file | Poor-to-fair: needs a video→WebP transcode |
| **Animated AVIF** | Chrome 85+, Firefox 113+ (animation), Safari 16.4+ full (16.1 partial) | ~0.65 MiB in all three probe clips | AV1 decode inside the image pipeline; AV1 hardware decoders exist only on newer devices (MDN), and the image path has no play/pause | As GIF | None (image) | None new | Variant = another whole file | Fair: transcode from MP4 (ffmpeg/libaom) |
| **Muted looping video** (`<video autoplay muted loop playsinline>`): H.264/HEVC MP4, VP9/AV1 WebM | Universal for H.264 MP4; VP9 WebM in all current engines (Safari 16+, iOS 17.4+); AV1 in Safari only with a hardware decoder (M3+, iPhone 15 Pro+) | 0.5–4 MiB (H.264 0.65–4.0, HEVC 0.47–2.0, VP9 1.0–1.4, AV1 1.4–1.9) | Video decoders are commonly hardware-backed (MDN: VP9 hardware "fairly common"; AV1 on newer devices); autoplay paused off-screen on iOS and Chrome Android | `poster` attribute; `pause()`; `prefers-reduced-motion` via `matchMedia`; **iOS Low Power Mode blocks autoplay** and shows a play button | Low: media is not a scriptable document | **HTTP Range (206)** required by Safari/iOS; new MIME types | Variant = another whole file; alpha video possible but split by engine (VP9/VP8 alpha: not Safari; HEVC alpha: Safari only) | **Best**: native output of every AI video tool |
| **Static image + CSS effects** (opacity/transform keyframes, gradients, blend, masks) | Baseline everywhere (`mask-image` Baseline since Dec 2023) | Static image only (~0.4–0.6 MB today) + a few hundred bytes of CSS | Compositor-only if limited to `opacity`/`transform`; blur/shadow paint is costly | `@media (prefers-reduced-motion)` in CSS; `animation-play-state` | None (engine code) | None | **Strong**: effects are parameters, can later be keyed by Condition | AI makes the still; effect is parameters in YAML |
| **Static image + Canvas 2D / WebGL particles or shaders** | Canvas 2D universal; WebGL 2 Safari/iOS 15+, Chrome 56+, Firefox 51+ | Static image + engine JS (no per-Illustration media cost) | Per-frame JS/GPU work; rAF throttled to 30 fps in iOS Low Power Mode, paused in background tabs | Engine decides: stop loop on `reduce`, keep the still | None (engine code) | None | **Strong** | AI makes the still; effects are engine presets |
| **Author-supplied layers / sprite sheets / light mask** | Baseline (CSS `steps()` since 2015, `mask-image` since 2023) or Canvas | Still + small PNG/WebP layers (sprite strip of birds, flame frames, greyscale light mask) | Low if composited with transform/opacity | As CSS/Canvas | None if layers are PNG/WebP | None | **Strongest**: a layer can be shown/hidden per Condition | Mixed: AI can make layers, but cut-outs and sprite frames need cleanup |
| **Lottie JSON** (lottie-web) | Any browser with JS | Vector JSON small; raster art embedded as data URIs makes it large | JS rendering (SVG/canvas) every frame | Player API: `pause()`, `goToAndStop()` | **High** with the full player: After Effects expressions are evaluated as JS (`eval`), i.e. author content becomes script | JSON/zip MIME types; player bundle | Good (dotLottie themes/state machines) | Weak for painterly AI art: vector-first; LottieFiles AI tools are vector/keyframe tools |
| **dotLottie** (dotlottie-web, ThorVG WASM) | Any browser with WASM | ZIP of Lottie JSON + images | WASM + canvas/WebGL; "freeze on offscreen" built in | Player API | Lower: no `eval`; needs `wasm-unsafe-eval` under a strict CSP | Player + WASM; zip MIME | **Strong**: state machines, themes, multiple animations | As Lottie |
| **Rive** (.riv, WASM runtime) | Any browser with WASM; WebGL2 renderer recommended | .riv small for vector; raster meshes add image bytes; runtime 222–648 KB brotli | WASM + WebGL2/Canvas each frame | Runtime API (`pause`, state machine inputs) | Lower: WASM runtime; files may carry Luau scripts (Rive Scripting) | Runtime + WASM | **Strong**: state machines with inputs map naturally to Conditions | Proprietary editor (free tier exports with a splash screen); raster mesh deformation of AI stills is possible but manual |
| **Animated SVG / SMIL** | SMIL in all current engines | Small for vector; raster inside SVG = base64 bloat | Main-thread SVG paint | `<img>` has no pause API | **High**: SVG navigated directly runs script in the app origin (the reason for the #14 exclusion); safe only in `<img>` (secure animated mode) | `image/svg+xml` + sanitising or a `CSP: sandbox` response header | Fair | Weak for AI raster art |

---

## Cross-cutting facts

### Autoplay and power-saving policies (video and JS-driven animation)

- **iOS/Safari:** `<video>` with no audio track, or with `muted`, may autoplay without a gesture; `playsinline` is needed to play inline on iPhone. Autoplaying videos "will only begin playing when visible on-screen" and "will pause if they become non-visible". [WebKit: New video policies for iOS][webkit-ios-video]. MDN: "`playsinline` is required for autoplay in Safari." [MDN Autoplay guide][mdn-autoplay]
- **iOS Low Power Mode:** "Autoplay is disabled when in low power mode to conserve battery … we always show the 'play' button for videos with the `autoplay` attribute so it is possible for the user to start them" (WebKit engineer Eric Carlson, bug resolved WONTFIX). [WebKit bug 219889][webkit-219889]; also [bug 216887][webkit-216887]. So a muted looping video shows its `poster` plus a native play button in Low Power Mode; a page cannot hide that button (that was the bug's request).
- **iOS Low Power Mode and `requestAnimationFrame`:** throttled to 30 fps; WebKit: "This is intentional." [WebKit bug 215745][webkit-215745]. Canvas/WebGL effects keep running, at half rate.
- **Chrome:** "Muted autoplay is always allowed." [Chrome autoplay policy][chrome-autoplay]. On Android, since Chrome 58, "playback of videos with the `autoplay` attribute will be paused when offscreen and resumed when back in view" (not videos started with `play()`). [Chrome 58 media updates][chrome-58]
- **Chrome Energy Saver** (user setting, can run when unplugged) reduces "the display refresh rate, affecting scrolling and animation fidelity and video frame rates"; CSS animations and rAF adapt automatically, but JS that assumes a fixed 16.67 ms frame "will run twice as slow". [Chrome: Memory and Energy Saver modes][chrome-energy]
- **Background tabs:** "`requestAnimationFrame()` calls are paused in most browsers when running in background tabs or hidden `<iframe>`s". Animations must use the rAF timestamp, or they "run faster on high refresh-rate screens". [MDN requestAnimationFrame][mdn-raf]
- **Detecting blocked autoplay:** `video.play()` rejects with `NotAllowedError`; `navigator.getAutoplayPolicy("mediaelement")` returns `allowed` / `allowed-muted` / `disallowed` where supported. [MDN Autoplay guide][mdn-autoplay]
- **Lazy loading:** the WHATWG spec now has `loading` on media elements (lazy defers `poster` fetch, data fetch and autoplay) [HTML: media elements][whatwg-media], but caniuse shows it only in Chrome 148+ / Chrome Android 154+, not in Safari or Firefox. [caniuse: loading-lazy-media][caniuse-lazy-media]

### Motion accessibility

- **WCAG 2.2 SC 2.2.2 Pause, Stop, Hide (Level A):** moving content that "(1) starts automatically, (2) lasts more than five seconds, and (3) is presented in parallel with other content" needs a mechanism to pause, stop or hide it, unless the motion is essential. The Understanding doc has no exemption for decorative motion, and Note 2 says all content on the page must meet it. [W3C Understanding 2.2.2][wcag-222] A looping ambient Illustration next to Scene text meets all three conditions, so **every approach needs a user-facing pause/stop control** (an engine concern, not a format feature), in addition to `prefers-reduced-motion`.
- **`prefers-reduced-motion`:** supported since Chrome 74, Edge 79, Firefox 63, Safari 10.1. web.dev shows the `<picture>` pattern: an animated `<source media="(prefers-reduced-motion: no-preference)">` with a static `<img>` fallback, and a `matchMedia(...).addEventListener('change', …)` listener to stop JS animations. [web.dev: prefers-reduced-motion][webdev-prm]
- **Animated images in `<img>`** (GIF/APNG/WebP/AVIF) have no play/pause API in the DOM. Pausing means swapping the source to a still (`<picture media>` or JS). Safari has an OS-level "Animated Images" accessibility toggle and context-menu Play/Pause Animation items [Apple: animated images][apple-animated-images], [Safari 17.2 notes][webkit-17-2]; other engines have no equivalent. Video, CSS, Canvas, Lottie and Rive all have a programmatic pause.

### Origin and content-sniffing risk

- SVG used via `<img>` or a CSS image is processed in **secure animated mode**: scripts, external references and interactivity are disabled, declarative animation (SMIL, CSS) runs. [W3C SVG Integration §3.4][svg-integration] MDN: these restrictions "don't apply when SVG content is viewed directly". [MDN: SVG as an image][mdn-svg-img] A user who opens the asset URL directly gets a scriptable document in the app's origin; this is the #14 risk. Known mitigations are a `Content-Security-Policy: sandbox` response header on the asset (header only; ignored in `<meta>`), which gives the document an opaque origin and blocks scripts [MDN CSP sandbox][mdn-csp-sandbox], or sanitising, or a separate asset origin.
- Raster images and video (PNG/JPEG/WebP/AVIF/GIF/APNG, MP4/WebM) are not scriptable documents. With a signature-checked format, a fixed `Content-Type` and `nosniff` (already sent), serving them adds no script risk.
- Lottie JSON with the full `lottie-web` player: After Effects expressions are converted and evaluated as JavaScript (the wiki says it uses Esprima/Escodegen) [lottie-web wiki: Expressions][lottie-expr], and the player needs `unsafe-eval` under a CSP [lottie-web #323][lottie-323]. Author-supplied JSON therefore becomes script in the app origin. The light build (`lottie_light`, SVG renderer only) drops expressions [lottie-web #3122][lottie-3122]; the dotLottie player does not use `eval` but loads WASM, which needs `wasm-unsafe-eval` under a strict CSP [dotlottie-web #562][dotlottie-562].

### Server needs for video

- "HTTP servers hosting media files for iOS must support byte-range requests, which iOS uses to perform random access in media playback." Test: `curl --range 0-99 <url> -o /dev/null` must download 100 bytes. [Apple: Safari Web Content Guide][apple-range]
- Range semantics: `Accept-Ranges: bytes`, `206 Partial Content` with `Content-Range`, `416` when out of range, optional `If-Range` with an ETag or Last-Modified. [MDN: HTTP range requests][mdn-range]
- The current asset route answers every request with `200` and the whole body, so video on Safari/iOS needs a route change (a `206` path), not just a new MIME type. Animated images, CSS, Canvas and layer approaches need no Range support.

---

## Size probe

**Method.** A real Illustration from the repo (`scenarios/perun-stone/images/loc-deep-forest.webp`, 1536×1024, 559 KB as a still) was scaled and cropped to 1600×900 and turned into three lossless 8 s, 24 fps (192 frames) clips with ffmpeg:

1. **local**: the still with a flickering 320×320 "fire glow" patch and four small dark "birds" crossing the sky. Most pixels never change.
2. **flicker**: *local* plus a ±2–4 % whole-frame brightness flicker ("firelight on everything"). Every pixel changes every frame.
3. **drift**: a slow 4 % camera push-in over 8 s plus the birds. Every pixel moves every frame, which is typical of AI image-to-video output.

Each clip was encoded with default-ish quality settings: x264 `-preset slow -crf 23`; x265 `-preset slow -crf 26`; libvpx-vp9 `-crf 36 -b:v 0`; SVT-AV1 `-preset 6 -crf 35`; animated AVIF via libaom `-crf 35`; animated WebP `libwebp_anim -quality 75`; GIF with `palettegen`/`paletteuse`; APNG lossless. SSIM against the lossless source is reported where ffmpeg could decode the output. Tools: ffmpeg 7.1 (libx264, libx265, libvpx-vp9, SVT-AV1 2.3, libaom, libwebp) on Apple silicon. The synthetic motion is simpler than real fire or AI video, so real files will be larger; the ratios between formats are the useful part.

<details>
<summary>Commands used</summary>

```bash
BG=scenarios/perun-stone/images/loc-deep-forest.webp
BIRDS="drawbox=x='mod(t*200,1600)':y=120:w=14:h=6:color=black@0.8:t=fill,drawbox=x='mod(t*170+400,1600)':y=160:w=12:h=5:color=black@0.8:t=fill,drawbox=x='mod(t*230+900,1600)':y=90:w=16:h=6:color=black@0.8:t=fill,drawbox=x='mod(t*190+1200,1600)':y=200:w=12:h=5:color=black@0.8:t=fill"
GLOW="eq=brightness='0.08*sin(2*PI*t*1.7)+0.05*sin(2*PI*t*4.3)':saturation=1.2:eval=frame"
ffmpeg -loop 1 -i "$BG" -t 8 -r 24 -filter_complex \
 "[0]scale=1600:-2,crop=1600:900,format=yuv444p,split[b1][b2];[b2]crop=320:320:1100:500,$GLOW[g];[b1][g]overlay=1100:500,$BIRDS" -c:v ffv1 local.mkv
ffmpeg -i local.mkv -vf "eq=brightness='0.025*sin(2*PI*t*1.3)+0.015*sin(2*PI*t*3.1)':eval=frame" -c:v ffv1 flicker.mkv
ffmpeg -loop 1 -i "$BG" -t 8 -r 24 -filter_complex \
 "[0]scale=3200:-2,crop=3200:1800,zoompan=z='1+0.04*on/192':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=192:s=1600x900:fps=24,format=yuv444p,$BIRDS" -c:v ffv1 drift.mkv
# per clip $s:
ffmpeg -i $s.mkv -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart -an $s.h264.mp4
ffmpeg -i $s.mkv -c:v libx265 -preset slow -crf 26 -pix_fmt yuv420p -tag:v hvc1 -movflags +faststart -an $s.hevc.mp4
ffmpeg -i $s.mkv -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -pix_fmt yuv420p -an $s.vp9.webm
ffmpeg -i $s.mkv -c:v libsvtav1 -preset 6 -crf 35 -pix_fmt yuv420p -an $s.av1.webm
ffmpeg -i $s.mkv -c:v libaom-av1 -cpu-used 6 -crf 35 -row-mt 1 -pix_fmt yuv420p -an $s.avif
ffmpeg -i $s.mkv -c:v libwebp_anim -lossless 0 -quality 75 -loop 0 -pix_fmt yuv420p $s.webp
ffmpeg -i $s.mkv -vf "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:diff_mode=rectangle" -loop 0 $s.gif
ffmpeg -i $s.mkv -pix_fmt rgb24 -plays 0 -f apng $s.apng
# SSIM (for .avif use [0:v:1], the sequence track; v:0 is the still primary item):
ffmpeg -i $s.h264.mp4 -i $s.mkv -lavfi "[0]format=yuv420p,scale=1600:900[a];[1]format=yuv420p[b];[a][b]ssim" -f null -
```

</details>

For reference, the source still is 0.53 MiB as WebP (1536×1024).

| Format (settings) | *local* | *flicker* | *drift* | SSIM *local* / *flicker* / *drift* |
| --- | --- | --- | --- | --- |
| H.264 MP4 (crf 23) | 0.65 MiB | 0.84 MiB | **4.0 MiB** | 0.994 / 0.993 / 0.983 |
| HEVC MP4 (crf 26) | 0.47 MiB | 0.55 MiB | 2.0 MiB | 0.991 / 0.990 / 0.983 |
| VP9 WebM (crf 36) | 0.99 MiB | 1.10 MiB | 1.37 MiB | 0.993 / 0.993 / 0.991 |
| AV1 WebM (SVT-AV1 crf 35) | 1.38 MiB | 1.36 MiB | 1.95 MiB | 0.997 / 0.997 / 0.994 |
| Animated AVIF (libaom crf 35) | 0.63 MiB | 0.66 MiB | 0.66 MiB | 0.997 / 0.997 / 0.984 |
| Animated WebP (lossy, q 75) | **4.4 MiB** | **20.4 MiB** | **49.6 MiB** | not measured (ffmpeg 7.1 cannot decode animated WebP) |
| GIF (palettegen, bayer dither) | **19.8 MiB** | **184 MiB** | **200 MiB** | 0.969 / 0.970 / 0.965 |
| APNG (lossless) | **34.7 MiB** | **304 MiB** | **415 MiB** | 0.999 / 0.998 / 0.995 |

Bold = over the current 2 MiB limit.

**Reading the numbers.**

- The CRF values were not tuned to equal quality, so differences of tens of percent between the video codecs say little; each could be pushed down or up. What matters is the order of magnitude: every video codec and animated AVIF lands at **0.5–4 MiB**, and every video row except H.264 *drift* is inside 2 MiB at SSIM ≥ 0.98. H.264 for full-frame motion needs a higher CRF (lower quality) or a shorter/smaller loop to fit 2 MiB.
- Formats without inter-frame prediction scale with the area that changes per frame. Animated WebP stores only changed sub-rectangles (`webpmux -info` shows a 1600×900 first frame, then 320×320 patches for *local*), so it is "only" 4.4 MiB when a small patch moves, but 20–50 MiB as soon as light or the camera changes every pixel. GIF and APNG are one to two orders of magnitude worse still.
- Animated AVIF behaves like video (it is AV1 with inter prediction) and was the smallest file in all three cases at SSIM ≥ 0.98.
- AI image-to-video output is usually the *drift* case (camera motion, noise and texture change everywhere), so it fits video and animated AVIF, not animated WebP/GIF/APNG.

---

## Per-approach notes

### 1. Whole animated files

#### GIF (baseline)

- Supported everywhere; binary transparency only, 256-colour palette, LZW. MDN: "consider WebP, AVIF or APNG for animation sequences." [MDN image types][mdn-image-types]
- Chrome Lighthouse flags large GIFs and recommends "MPEG4/WebM videos for animations"; web.dev's example: GIF 3.7 MB → MP4 551 KB → WebM 341 KB. [Lighthouse: efficient animated content][lh-animated], [web.dev: replace GIFs with video][webdev-gif]
- Excluded by #14 "for simplicity". In the probe it is the worst option by one to two orders of magnitude.

#### APNG

- `image/apng`, lossless, full alpha; Chrome 59, Edge 12, Firefox 3, Safari 8. MDN: "ideal for basic animations"; "AVIF and WebP have better performance". [MDN image types][mdn-image-types]
- Lossless frames make photographic/painterly loops tens of MB.

#### Animated WebP

- Already an allowed format (`.webp`), so the current route and `<img>` would serve it unchanged; #14 states "the validator neither detects nor forbids" animation.
- Support: all current engines; macOS Safari needs Safari 14 and macOS 11+. [MDN image types][mdn-image-types]; caniuse lists iOS Safari 14+ as supported. [caniuse: webp][caniuse-webp]
- Lossy (VP8) or lossless; alpha; looping. Google: lossy animated WebP is 64 % smaller than the source GIF, lossless 19 %; decoding lossy WebP takes 2.2× the time of GIF (1.5× lossless) in straight-line playback. [WebP FAQ][webp-faq]
- Animated WebP frames are independently coded sub-rectangles with blending; there is no motion compensation, so file size grows with the changed area per frame (compare *local* vs *flicker* in the probe).

#### Animated AVIF

- An AVIF image sequence is "a set of AV1 Temporal Units stored in an AV1 track" (`avis` brand); alpha is an auxiliary sequence. [AVIF spec][avif-spec] Because it is AV1 video in an image container, it gets inter-frame compression, unlike WebP/GIF/APNG.
- Support: Chrome 85, Firefox 93 (animation from 113), Safari 16.1 (sequences) and fully from 16.4 ("animated images … are now fully supported"). [MDN image types][mdn-image-types], [WebKit: Safari 16.4][webkit-16-4]; caniuse: Safari 16.1–16.3 partial, iOS 16+. [caniuse: avif][caniuse-avif]
- Excluded by #14 "for simplicity"; would need a new `image/avif` format and signature check, nothing else on the route.
- Decoded inside the image pipeline like any `<img>` animation; no pause API, no poster (a still must be a separate file).

#### Muted looping video

- Markup: `<video autoplay muted loop playsinline poster="still.webp">`. web.dev: this "plays automatically, loops endlessly, plays no audio, and plays inline". [web.dev: replace GIFs with video][webdev-gif]
- Codecs and support [MDN video codecs][mdn-video-codecs]:
  - **H.264 in MP4**: every major browser; the universal fallback. MDN notes licensing requirements.
  - **HEVC in MP4**: Safari 13+/iOS 11+ fully; Chrome/Edge/Firefox only partial (hardware/OS dependent). [caniuse: hevc][caniuse-hevc]
  - **VP9 in WebM**: all current engines; caniuse marks Safari 16+ and iOS Safari 17.4+ as full support. [caniuse: webm][caniuse-webm]
  - **AV1**: "support in Safari is limited to devices that feature a hardware decoder, meaning M3 MacBooks and later, iPhone 15 Pro, and iPhone 16 and later." [MDN video codecs][mdn-video-codecs]
  - MDN's default recommendation: WebM/AV1 with an MP4/H.264 fallback.
- **Alpha:** VP8 and VP9 in WebM can carry alpha, but "Safari does not support alpha transparency" in either. [MDN video codecs][mdn-video-codecs] Safari supports **HEVC with alpha** (iOS 13, macOS Catalina), encoded via AVFoundation (`hevcWithAlpha`) from e.g. ProRes 4444. [WWDC19 session 506][wwdc-hevc-alpha] Transparent overlay video therefore needs two encodes (VP9-alpha WebM + HEVC-alpha MP4). An opaque full-frame Illustration needs no alpha.
- **Cost:** the Chrome team argued muted video beats GIFs and canvas hacks on power, bandwidth and memory. [Chrome: muted autoplay on mobile][chrome-autoplay-2] Playback pauses off-screen on iOS and Chrome Android (above). Google's WebP FAQ notes the Chromium video stack "assumes there's only one or two videos playing at a time", which matters if a page ever shows several. [WebP FAQ][webp-faq]
- **Poster and failure:** `poster` is shown "while no video data is available". [HTML: media elements][whatwg-media] It covers Low Power Mode (poster + play button), slow loads and reduced motion (do not autoplay; show poster). The current `onError → remove()` pattern has an analogue in the `<video>` `error` event.
- **Server:** needs Range/206 for Safari/iOS (above), new MIME types (`video/mp4`, `video/webm`), and a signature check. The `immutable` cache header works unchanged.
- **2 MiB limit:** 2 MiB over 8 s is a ~2.1 Mbit/s average budget, which the probe shows is enough for H.264/HEVC/VP9 at 1600×900 for low-motion content. Raw AI tool downloads are typically at a much higher bitrate and must be re-encoded.

### 2. Static image + engine-rendered effects

- **CSS:** web.dev: "restrict animations to `opacity` and `transform`" so they stay on the compositor; avoid properties that trigger layout or paint; anything with a blur "takes longer to paint". [web.dev: animations guide][webdev-anim] A light flicker can be an animated `opacity` on an overlay with a gradient or `mix-blend-mode`; `mask-image` is Baseline since December 2023 but animates only discretely, so animate the overlay, not the mask. [MDN mask-image][mdn-mask-image]
- **Canvas 2D:** MDN's optimisation tips: keep a static background in plain CSS under the canvas instead of redrawing it, pre-render repeated sprites to an offscreen canvas, avoid `shadowBlur`, round coordinates, scale by `devicePixelRatio`. [MDN: Optimizing canvas][mdn-canvas-opt]
- **WebGL 2:** Safari/iOS 15+, Chrome 56+, Firefox 51+, 97 % global. [caniuse: webgl2][caniuse-webgl2] Suits shader effects (heat shimmer, light falloff, many particles). Browsers cap WebGL contexts per page and drop the oldest (Rive docs note this for multiple instances). [Rive: Canvas vs WebGL2][rive-canvas-webgl]
- **Cost model:** per-frame work runs on the main thread (or a worker with `OffscreenCanvas`); rAF is paused in background tabs and throttled in iOS Low Power Mode and Chrome Energy Saver. Off-screen pausing (IntersectionObserver) and the `prefers-reduced-motion` stop are the engine's job.
- **Authoring:** the author supplies only the still (any AI image tool) plus declared parameters (e.g. effect preset, region, colour, intensity). Effects look generic unless regions/masks line up with the painting, which pushes toward approach 3.
- **Security/server:** none new; the effect code ships with the engine.

### 3. Author-supplied layers (static layers, sprite sheets, light mask)

- Composition of a still plus transparent PNG/WebP layers: a bird sprite strip animated with CSS `steps(n)` (Baseline since September 2015 [MDN animation-timing-function][mdn-steps]) or drawn on canvas; flame frames as a sprite sheet; a greyscale light mask that an engine flicker modulates (CSS overlay with `mask-image`, or a canvas/WebGL multiply).
- Files stay in the already-allowed PNG/WebP formats, so the route, MIME types and security posture do not change; the validator would need new catalog fields (layers, frame count, frame size, region).
- Sizes: a sprite strip of a few small frames is tens of KB; a full-frame alpha layer costs about as much as a still.
- This approach maps most directly to future Condition-driven visuals: a layer or effect can be toggled per Condition without re-rendering a whole loop.
- Authoring cost is higher per Illustration: AI generators produce whole images, so cut-outs (background removal), aligned sprite frames and masks need manual cleanup or extra tools.

### 4. Runtime animation formats

#### Lottie (JSON) and dotLottie

- Lottie is "a vector animation format, using JSON to represent its data". [Lottie docs][lottie-docs] The Lottie Animation Community (Linux Foundation / Joint Development Foundation) is developing a formal specification and integrating features progressively. [lottie.github.io][lac]
- `lottie-web` renders to SVG, canvas or HTML; `loop` and `autoplay` options. [airbnb/lottie-web][lottie-web] Expressions are evaluated as JS (see origin risk above).
- **dotLottie 2.0** is a Deflate ZIP (`application/zip+dotlottie`) with `manifest.json`, multiple animations, themes (`t/`), state machines (`s/`), images (`i/`) and fonts (`f/`). State machines have guards on numeric/string/boolean inputs and can switch themes. [dotLottie 2.0 spec][dotlottie-spec] That is a ready-made mechanism for variants driven by an input such as a Condition.
- `dotlottie-web`: Rust + WASM core on ThorVG; Canvas2D by default, WebGL2 and experimental WebGPU; "freeze on offscreen"; a worker variant on `OffscreenCanvas`. [dotlottie-web][dotlottie-web]
- **Fit for this project:** Lottie is vector-first. A painterly AI still would be an embedded raster with vector animation on top, i.e. a heavier version of approach 3 with a third-party player.
- **AI tooling:** LottieFiles' Lottie Creator has Motion Copilot (text prompt to editable keyframes), Prompt to Vector, Prompt to State Machine; exports dotLottie, Lottie JSON, GIF, MP4, WebM and animated SVG; the free tier allows five exports. [LottieFiles: Lottie Creator 2.0][lottie-creator]

#### Rive

- `.riv` files played by an open-source JS/WASM runtime; `@rive-app/webgl2` (the Rive Renderer, same as the editor) is recommended; `canvas` and `canvas-lite` use Canvas 2D. [Rive web runtime][rive-web] Sizes (brotli): canvas-lite 222 KB, canvas 567 KB, webgl2 648 KB. [Rive runtime sizes][rive-sizes]
- State machines with inputs are the core model (the runtime may play only the first linear animation if no state machine is given). [Rive web runtime][rive-web] Inputs map naturally onto future Condition-driven variants.
- Raster images can be deformed with meshes and bones [Rive: meshes][rive-meshes], so an AI still can be rigged (e.g. swaying branches) in the editor.
- Files can contain scripts (Rive Scripting, Luau interpreter in the runtime). [Rive: Scripting][rive-scripting], [Rive runtime sizes][rive-sizes] Its sandbox limits are not documented on the pages read here.
- Editor is proprietary: the free plan exports `.riv` "with a splash screen"; Cadet ($9/seat/month) removes it. [Rive pricing][rive-pricing]
- No generic AI image-to-Rive pipeline was found; Rive has an editor AI agent and MCP integration, but rigging an AI still remains manual work.

#### Animated SVG / SMIL

- SMIL in all current engines (97 % global). [caniuse: svg-smil][caniuse-smil] Inside `<img>` it runs in secure animated mode (no script). [W3C SVG Integration][svg-integration]
- Opening the asset URL directly runs it as a full document in the app's origin (scripts enabled). This is exactly the #14 exclusion; lifting it would need a `CSP: sandbox` header on the asset response, sanitising, or a separate origin.
- Raster art inside SVG is a base64 `data:` image, so it offers no size advantage for painterly Illustrations.

---

## Authoring tooling: AI image-to-video and animation generators

All the tools below output MP4 video; none was found to output animated WebP/AVIF, sprite sheets or Lottie from a raster still. Loop support means the tool can end on the start frame.

| Tool | Image-to-video | Loop / end frame | Length | Resolution / fps | Output | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Midjourney Video (V1) | Yes ("Animate", or upload a start frame) | `--loop` reuses the start image as the end frame; `--end <url>` sets an end frame | 5 s per clip, extend ~4 s up to 4 times | SD default, HD on Standard plan (higher cost) | MP4 (virtual upscale for higher quality) | [V1 video][mj-v1], [Looping and end frame][mj-loop], [New video options][mj-options] |
| Luma Dream Machine (Ray 2 / Ray3.14) | Yes (`keyframes.frame0`, `frame1`) | `loop: true` in the API; app loop toggle; Ray3.14 loop at 540p/720p/1080p, not Draft | API example 5 s; extend to ~30 s | 540p–1080p, upscale to 4K; 24 fps | MP4 | [Luma API: video generation][luma-api], [Ray3.14 guide][luma-ray314] |
| Google Veo 3.1 (Gemini API) | Yes (`image`) | `lastFrame` (interpolation) with `image`; same image twice gives a loop | 4, 6 or 8 s (8 s required for 1080p/4k) | 720p, 1080p, 4k; 24 fps; 16:9 or 9:16 | MP4; **audio always generated**; SynthID watermark | [Gemini API: Veo][veo] |
| Kling | Yes | "Add End Frame"; guide advises start and end images "as similar as possible" | 5 s or 10 s (model dependent) | — | MP4 | [Kling: start & end frames][kling-se], [Kling API updates][kling-api] |
| Runway (own Gen-4 Turbo / Gen-4.5) | Yes | No first/last keyframe documented for Gen-4 Turbo/Gen-4.5; the Runway API also hosts third-party models with first/last keyframes (Kling 2.5 Turbo Pro and 3.0, Veo 3.1, WAN 3.0, Seedance, MiniMax) | Kling via Runway: 5/10 s or 3–15 s | 1280:720, 1584:672, 960:960 … | MP4; ProRes or PNG sequence on Max/Enterprise plans | [Runway API inputs][runway-api], [Runway: ProRes and PNG sequence][runway-prores] |
| OpenAI Sora 2 (API) | Yes (`input_reference` anchors the first frame; must match the output size) | No end-frame or loop control | 4, 8, 12, 16, 20 s | `sora-2`: 1280×720; `sora-2-pro`: up to 1920×1080 | MP4 | [Sora 2 prompting guide][sora-guide] |
| LottieFiles Lottie Creator | No (vector) | Keyframe loops | — | — | dotLottie, JSON, GIF, MP4, WebM, animated SVG | [Lottie Creator 2.0][lottie-creator] |

How the output maps onto each approach:

- **Video:** direct. Re-encode (and usually downscale/crop from 720p/1080p 16:9) with ffmpeg; strip audio (Veo always adds it); check the loop seam. Tools with an end-frame/loop option close the loop at generation time; otherwise a crossfade of the tail into the head is a common post step.
- **Animated WebP/AVIF:** one transcode from the MP4 (ffmpeg `libwebp_anim` / `libaom-av1 -f avif`). Sizes follow the probe.
- **Static + effects / layers:** AI tools produce the still; effects are parameters; layers need background removal and manual alignment. Alpha from AI video tools is rare: Runway's former Remove Background is retired and its alpha output in Edit Studio exports was not confirmed. [Runway: Remove Background][runway-rb]
- **Lottie/Rive:** no direct path from an AI still or video; work happens in the vendor editor.
- Most tools generate 16:9 at 720p/1080p; the Illustration column is ~1600 px wide, so a 1080p source downscaled to 1600×900 fits; 720p output would be upscaled.

---

## Open points for the prototype ticket

- Whether one encode (H.264 MP4) or two (WebM + MP4) is needed for the chosen quality/size target, and how `poster` relates to the existing static `images` entry.
- What the pause control looks like (WCAG 2.2.2) and whether it persists across Scenes.
- Behaviour in iOS Low Power Mode (native play button over the poster) versus an engine-driven effect that keeps running at 30 fps.
- Whether a 2 MiB per-file limit still fits, or a separate video limit (bytes, duration, fps, dimensions) is needed.

---

## Sources

- `webkit-ios-video`: <https://webkit.org/blog/6784/new-video-policies-for-ios/>
- `mdn-autoplay`: <https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay>
- `webkit-219889`: <https://bugs.webkit.org/show_bug.cgi?id=219889>
- `webkit-216887`: <https://bugs.webkit.org/show_bug.cgi?id=216887>
- `webkit-215745`: <https://bugs.webkit.org/show_bug.cgi?id=215745>
- `chrome-autoplay`: <https://developer.chrome.com/blog/autoplay>
- `chrome-autoplay-2`: <https://developer.chrome.com/blog/autoplay-2>
- `chrome-58`: <https://developer.chrome.com/blog/chrome-58-media-updates>
- `chrome-energy`: <https://developer.chrome.com/blog/memory-and-energy-saver-mode>
- `mdn-raf`: <https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame>
- `whatwg-media`: <https://html.spec.whatwg.org/multipage/media.html>
- `caniuse-lazy-media`: <https://caniuse.com/loading-lazy-media>
- `wcag-222`: <https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html>
- `webdev-prm`: <https://web.dev/articles/prefers-reduced-motion>
- `apple-animated-images`: <https://developer.apple.com/documentation/accessibility/animated-images>
- `webkit-17-2`: <https://webkit.org/blog/14787/webkit-features-in-safari-17-2/>
- `svg-integration`: <https://www.w3.org/TR/svg-integration/>
- `mdn-svg-img`: <https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image>
- `mdn-csp-sandbox`: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox>
- `lottie-expr`: <https://github.com/airbnb/lottie-web/wiki/Expressions>
- `lottie-323`: <https://github.com/airbnb/lottie-web/issues/323>
- `lottie-3122`: <https://github.com/airbnb/lottie-web/issues/3122>
- `dotlottie-562`: <https://github.com/LottieFiles/dotlottie-web/issues/562>
- `apple-range`: <https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingVideoforSafarioniPhone/CreatingVideoforSafarioniPhone.html>
- `mdn-range`: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests>
- `mdn-image-types`: <https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types>
- `lh-animated`: <https://developer.chrome.com/docs/lighthouse/performance/efficient-animated-content>
- `webdev-gif`: <https://web.dev/articles/replace-gifs-with-videos>
- `caniuse-webp`: <https://caniuse.com/webp>
- `webp-faq`: <https://developers.google.com/speed/webp/faq>
- `avif-spec`: <https://aomediacodec.github.io/av1-avif/>
- `webkit-16-4`: <https://webkit.org/blog/13966/webkit-features-in-safari-16-4/>
- `caniuse-avif`: <https://caniuse.com/avif>
- `mdn-video-codecs`: <https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs>
- `caniuse-hevc`: <https://caniuse.com/hevc>
- `caniuse-webm`: <https://caniuse.com/webm>
- `wwdc-hevc-alpha`: <https://developer.apple.com/videos/play/wwdc2019/506/>
- `webdev-anim`: <https://web.dev/articles/animations-guide>
- `mdn-mask-image`: <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/mask-image>
- `mdn-canvas-opt`: <https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas>
- `caniuse-webgl2`: <https://caniuse.com/webgl2>
- `rive-canvas-webgl`: <https://rive.app/docs/runtimes/web/canvas-vs-webgl>
- `mdn-steps`: <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timing-function>
- `lottie-docs`: <https://lottiefiles.github.io/lottie-docs/>
- `lac`: <https://lottie.github.io/>
- `lottie-web`: <https://github.com/airbnb/lottie-web>
- `dotlottie-spec`: <https://dotlottie.io/spec/2.0/>
- `dotlottie-web`: <https://github.com/LottieFiles/dotlottie-web>
- `lottie-creator`: <https://lottiefiles.com/blog/working-with-lottie-animations/lottie-creator-a-powerful-web-based-lottie-animation-tool>
- `rive-web`: <https://rive.app/docs/runtimes/web/web-js>
- `rive-sizes`: <https://rive.app/docs/runtimes/runtime-sizes>
- `rive-meshes`: <https://rive.app/docs/editor/manipulating-shapes/meshes>
- `rive-scripting`: <https://rive.app/docs/scripting/getting-started>
- `rive-pricing`: <https://rive.app/pricing>
- `caniuse-smil`: <https://caniuse.com/svg-smil>
- `mj-v1`: <https://updates.midjourney.com/introducing-our-v1-video-model/>
- `mj-loop`: <https://updates.midjourney.com/looping-and-end-frame-for-video-video-in-the-discord-bot/>
- `mj-options`: <https://updates.midjourney.com/new-video-options-and-a-home-for-moodboards/>
- `luma-api`: <https://docs.lumalabs.ai/docs/video-generation>
- `luma-ray314`: <https://lumalabs.ai/learning-hub/ray314-user-guide>
- `veo`: <https://ai.google.dev/gemini-api/docs/veo>
- `kling-se`: <https://kling.ai/quickstart/ai-video-start-end-frames>
- `kling-api`: <https://app.klingai.com/global/dev/document-api/apiReference/updateNotice>
- `runway-api`: <https://docs.dev.runwayml.com/assets/inputs/>
- `runway-prores`: <https://help.runwayml.com/hc/en-us/articles/54396547993491-Exporting-Videos-in-ProRes-and-PNG-Sequence-Formats>
- `runway-rb`: <https://help.runwayml.com/hc/en-us/articles/19112532638995-Remove-Background>
- `sora-guide`: <https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide>

[webkit-ios-video]: https://webkit.org/blog/6784/new-video-policies-for-ios/
[mdn-autoplay]: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
[webkit-219889]: https://bugs.webkit.org/show_bug.cgi?id=219889
[webkit-216887]: https://bugs.webkit.org/show_bug.cgi?id=216887
[webkit-215745]: https://bugs.webkit.org/show_bug.cgi?id=215745
[chrome-autoplay]: https://developer.chrome.com/blog/autoplay
[chrome-autoplay-2]: https://developer.chrome.com/blog/autoplay-2
[chrome-58]: https://developer.chrome.com/blog/chrome-58-media-updates
[chrome-energy]: https://developer.chrome.com/blog/memory-and-energy-saver-mode
[mdn-raf]: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
[whatwg-media]: https://html.spec.whatwg.org/multipage/media.html
[caniuse-lazy-media]: https://caniuse.com/loading-lazy-media
[wcag-222]: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
[webdev-prm]: https://web.dev/articles/prefers-reduced-motion
[apple-animated-images]: https://developer.apple.com/documentation/accessibility/animated-images
[webkit-17-2]: https://webkit.org/blog/14787/webkit-features-in-safari-17-2/
[svg-integration]: https://www.w3.org/TR/svg-integration/
[mdn-svg-img]: https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image
[mdn-csp-sandbox]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox
[lottie-expr]: https://github.com/airbnb/lottie-web/wiki/Expressions
[lottie-323]: https://github.com/airbnb/lottie-web/issues/323
[lottie-3122]: https://github.com/airbnb/lottie-web/issues/3122
[dotlottie-562]: https://github.com/LottieFiles/dotlottie-web/issues/562
[apple-range]: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingVideoforSafarioniPhone/CreatingVideoforSafarioniPhone.html
[mdn-range]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests
[mdn-image-types]: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types
[lh-animated]: https://developer.chrome.com/docs/lighthouse/performance/efficient-animated-content
[webdev-gif]: https://web.dev/articles/replace-gifs-with-videos
[caniuse-webp]: https://caniuse.com/webp
[webp-faq]: https://developers.google.com/speed/webp/faq
[avif-spec]: https://aomediacodec.github.io/av1-avif/
[webkit-16-4]: https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
[caniuse-avif]: https://caniuse.com/avif
[mdn-video-codecs]: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs
[caniuse-hevc]: https://caniuse.com/hevc
[caniuse-webm]: https://caniuse.com/webm
[wwdc-hevc-alpha]: https://developer.apple.com/videos/play/wwdc2019/506/
[webdev-anim]: https://web.dev/articles/animations-guide
[mdn-mask-image]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/mask-image
[mdn-canvas-opt]: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
[caniuse-webgl2]: https://caniuse.com/webgl2
[rive-canvas-webgl]: https://rive.app/docs/runtimes/web/canvas-vs-webgl
[mdn-steps]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timing-function
[lottie-docs]: https://lottiefiles.github.io/lottie-docs/
[lac]: https://lottie.github.io/
[lottie-web]: https://github.com/airbnb/lottie-web
[dotlottie-spec]: https://dotlottie.io/spec/2.0/
[dotlottie-web]: https://github.com/LottieFiles/dotlottie-web
[lottie-creator]: https://lottiefiles.com/blog/working-with-lottie-animations/lottie-creator-a-powerful-web-based-lottie-animation-tool
[rive-web]: https://rive.app/docs/runtimes/web/web-js
[rive-sizes]: https://rive.app/docs/runtimes/runtime-sizes
[rive-meshes]: https://rive.app/docs/editor/manipulating-shapes/meshes
[rive-scripting]: https://rive.app/docs/scripting/getting-started
[rive-pricing]: https://rive.app/pricing
[caniuse-smil]: https://caniuse.com/svg-smil
[mj-v1]: https://updates.midjourney.com/introducing-our-v1-video-model/
[mj-loop]: https://updates.midjourney.com/looping-and-end-frame-for-video-video-in-the-discord-bot/
[mj-options]: https://updates.midjourney.com/new-video-options-and-a-home-for-moodboards/
[luma-api]: https://docs.lumalabs.ai/docs/video-generation
[luma-ray314]: https://lumalabs.ai/learning-hub/ray314-user-guide
[veo]: https://ai.google.dev/gemini-api/docs/veo
[kling-se]: https://kling.ai/quickstart/ai-video-start-end-frames
[kling-api]: https://app.klingai.com/global/dev/document-api/apiReference/updateNotice
[runway-api]: https://docs.dev.runwayml.com/assets/inputs/
[runway-prores]: https://help.runwayml.com/hc/en-us/articles/54396547993491-Exporting-Videos-in-ProRes-and-PNG-Sequence-Formats
[runway-rb]: https://help.runwayml.com/hc/en-us/articles/19112532638995-Remove-Background
[sora-guide]: https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide
