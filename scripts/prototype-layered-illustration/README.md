# PROTOTYPE: example layered Illustration (#209)

Throwaway. Lives only on the `prototype/layered-illustration-example` branch.

Question: is the Motion spec of map #193 sufficient to build a real layered
Illustration, and does the result read well in play? `loc-hunters-camp` in
`scenarios/whispering-woods/images.yaml` carries a `motion` block written
strictly from the authoring syntax (#201), validated by the rules of #202 and
rendered with the timeline semantics of #200.

The camp is abandoned in the story, so nothing burns: sun shafts through the
pines (multiply, Flicker), a crow on the left stump (sprite strip, `at`), one
one-shot and one looping bird (sprite strip, Drift) sharing one file, and a
one-shot Camera push-in towards the lean-to.

## What is prototype code

- `src/content/schema.ts`: `MotionSchema` (ranges of #202).
- `src/content/structure.ts`: `schema/empty-motion`, `schema/drift-and-at`, `schema/frames-fps`.
- `src/content/integrity.ts`: Layer files through the `ref/` image codes,
  `ref/illustration-too-large`, `ref/sprite-strip-width`, and the `play/`
  warnings (reported in Phase 3 here, Phase 4 in the spec).
- `src/content/images.ts`: VP8X (WebP with alpha) dimension fix, a real bug on main.
- `src/engine/index.ts`: `illustrationView` carries the Motion to the UI.
- Asset route: also serves Layer files.
- `src/app/play/[playthroughId]/prototype-layered-illustration.tsx`: the renderer.

Generated JSON Schemas and content-hash fixtures are not updated, so four
unit tests fail on this branch.

## Run

1. `node scripts/prototype-layered-illustration/make-assets.mjs` regenerates the
   stand-in Still (1600×900 Lanczos upscale of main's 640×360) and Layer files.
2. `npm run validate -- scenarios/whispering-woods`: 0 errors, 0 warnings.
3. `npm run dev`, start a whispering-woods Playthrough, accept Brenna's quest,
   take the cart track, ignore the voices. At the Forest Edge, skip the bandit:
   `sqlite3 data.sqlite "update playthroughs set state = json_insert(state, '$.flags[#]', 'bandit-gone') where id = '<playthrough id>'"`,
   reload, and follow the trampled trail north.
