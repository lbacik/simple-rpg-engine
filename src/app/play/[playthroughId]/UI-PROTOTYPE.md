# THROWAWAY: light, illustrated game-screen UI

Question: which layout makes illustrated play readable and keeps the Journal available without leaving the game screen?

Primary-source branch: `codex/prototype-light-ui`.

Design decision / implementation issue: [#155](https://github.com/lbacik/simple-rpg-engine/issues/155).

## Run

```sh
npm run prototype
```

Open http://localhost:3000/play/prototype?variant=A. Use the floating arrows or keyboard ←/→ to switch. Each variant has a shareable URL:

- `?variant=A`: illustrated chronicle; narration and Choices with a persistent Character sheet and small map.
- `?variant=B`: travel atlas; large map, compact Character rail, narration and Choices in a separate reading column.
- `?variant=C`: scene and decisions; large Illustration, narration beneath it, Choices in a separate side column.

The existing `/play/<playthroughId>` route also accepts these parameters in development. Its Session ownership and data resolution stay in place. No prototype is rendered in production. Opening a modal keeps the current URL, reading position and selected preview Choice.

## Data and behaviour

The demo uses the localized `the-drowned-ledger` Scenario, its actual opening Scene, illustrations, Character Template, items and engine-generated Journal, all in memory. Mira and four revealed Locations are explicitly seeded example state. No Session, Playthrough or Journal is saved. Real Playthrough previews use the existing derived view and stored Journal, and reuse `JournalEntries` for pagination.

Prototype Choices only highlight the selected Choice. Character, inventory, map and Journal open in native dialogs, with focus containment, Escape, backdrop click, return focus and background scroll lock. Map and inventory are read-only. Cartographic contours are decorative; node positions are fitted to the visible map bounds. Images are cropped in the visual proposals, a presentation choice to revisit when implementing the winner.

The state disclosure shows the variant, open panel, selected preview Choice and relevant engine state. Prototype copy is bilingual and local to this throwaway surface; implementation must fold final Interface Text into the typed catalogue (ADR 0003). Journal text reuses the existing renderer (ADR 0004).

## Findings and verdict

All three distinct light layouts can host the current Scenario content and present the Journal over the game screen. An existing Journal modal was already implemented, but the normal side-panel launcher still navigates to the full Journal page. This prototype demonstrates the requested modal interaction from the primary launcher.

**Selection pending:** no visual winner has been validated by the user. Preserve all variants on this branch. After selection, rewrite the winning presentation for production, connect actual actions, verify Location / Scene / result / Combat / Ending screens, update the side-panel Journal launcher, then remove prototype code and launcher from the implementation branch. Do not merge this prototype directly into main.

Verification: TypeScript check and lint for changed source files; manual browser checks of A/B/C at desktop and phone widths, modal behaviour, URL switching and read-only Choice selection. Repository-wide lint reports pre-existing undefined browser globals in a nested `.claude/worktrees/...` mockup; modified files pass lint. No prototype tests added, per the prototype skill.
