# UI C with real interaction states — throwaway prototype (#185)

Question: does the accepted command-panel hierarchy (prototype C, commit `819a0c0`) stay understandable with real resolver output and the complete MVP 1.0 interaction surface?

Run: `npm run prototype:ui-c`, then open http://localhost:3012/arena/prototype-ui-c. The route returns 404 in production.

- The layout is prototype C: hero, companion and inventory on the left; open intents and target/ranges in the centre; stance, cards and the round forecast on the right. Below 760 px the order becomes hero, intents, companion, stance, cards, target, forecast, and a sticky threat strip keeps the attack-slot intents in view.
- The bottom bar cycles **review states**, not layouts (`?state=`; ← / → when nothing has focus). Every state stays playable.
- `engine.ts` is a prototype-only copy of the MVP resolver (sections 3–10, 13). The preview and the commit call the same function, so forecasts include cancellations, Cover redirection, Counter parry and riposte, terminal cutoffs and regeneration. It reproduces references 11.1, 11.3 and 11.4. It is not the production core from #181.
- `fixtures.ts` builds every review state by playing commands through that resolver: presets T1–T7, the migrated `harek-and-guard` Encounter (Scenario Combat: 27/40 HP carried in, Astrid as `c01`, `startRange: far`), and states for terminal results, low stamina, stale or rejected commands, import or export, an imported fight, planned-state restore and an unreadable save.
- `text.ts` is a local typed Polish/English catalogue shaped like `src/i18n` (ADR 0003). The PL/EN toggle switches it.
- The prototype controls panel decides what the simulated server does with the next commit (accept, stale step, rule rejection, slow) and can simulate reopening the save.

Not covered: animation beyond step-by-step log replay, real persistence, the Journal, and the production Arena Setup form (presets only, plus phase offsets).

Verified: `tsc`, ESLint, the reference sequences above, and a headless Chromium pass over all 22 states at 1440 and 390 px (no console errors, no horizontal overflow, intents above the cards on narrow screens). A human review is still required (#185).
