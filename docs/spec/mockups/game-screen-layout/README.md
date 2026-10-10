# Game screen layout prototype

Throwaway primary source for [Game screen layout: narration, choices, Character sheet, inventory](https://github.com/lbacik/simple-rpg-engine/issues/10), within the RPG platform wayfinder map. This is a discussion artifact, not the engine, final spec, or example Scenario.

## Run

```sh
python3 docs/spec/mockups/game-screen-layout/serve.py
```

Open http://127.0.0.1:4310/?variant=A. No dependencies or build step. Alternatively, open `index.html` directly. The preview toolbar and floating variant switcher are restricted to localhost/file access; this prototype has no production build target.

## Confirmed direction

The driving developer accepted these recommendations on 2026-10-10:

- Support desktop and phone layouts.
- Use a neutral, lightly book-inspired visual style suitable for different Scenario genres.
- Show the current Scene in the main view, with a separate journal of previous narration, choices, and outcomes.
- Select **A — Book & character** as the layout direction.
- Support an optional illustration per Scene, directly below its title and before narration. If a Scene has no illustration, render no image element or reserved space.

The illustration preview uses a neutral, explicitly labelled placeholder, not final artwork. Use the **Scene illustration** checkbox in the prototype toolbar to compare the same Scene with and without it. The image fills the narrative column on desktop and phone; its intrinsic proportions are preserved, with no cropping. The fixture is 16:9; this is a preview choice, not an authoring-format constraint. Location views remain text-only. The Scene fixture's `illustration` object is demonstrative, not an agreed YAML field schema.

## Compare

- **A — Book & character:** narrative and Choices in a reading column, with the Character sheet/inventory beside them on desktop and in a modal on phones.
- **B — Focused reader:** a single reading column; compact Health summary; Character details and inventory in a modal on every screen size.
- **C — Decision desk:** narrative and Choices in separate columns, with a compact Attribute bar; columns stack on phones.

Use the floating arrows or left/right keyboard arrows to cycle `?variant=A|B|C`. The URL is reload-stable. Text inputs and modal panels keep their normal keyboard behavior. The top toolbar selects sample screens and a fixed failed-Test fixture. The state inspector exposes all relevant in-memory state.

Compare Collection, Character creation, Play, and Ending in each variant. Try a Choice and Continue, use an item, change Equipment, read the journal, visit a connected Location, and inspect victory/death previews. All text and actions are fixtures; only The Letter at Dusk is interactive. The other Scenario covers are explicitly disabled placeholders. Reload resets the fixture. No data is sent to a backend.

## Accepted interaction baseline

- Show Attribute and named/numeric Difficulty before a Test; immediately show fixed fixture dice, modifier, total, and success/failure beside Outcome narration. Continue returns to the Location view.
- Character and Inventory are tabs within the same panel. Item details and actions are inline. Magic is a presentation badge, not another item kind.
- Collection has a resume/view entry separate from starting a new Playthrough. Creation selects a Character Template and name.
- Endings show closing narration, read-only Character/journal access, and a new-Playthrough action.

The developer approved the amended prototype in live review. The [resolution comment](https://github.com/lbacik/simple-rpg-engine/issues/10#issuecomment-6099406829) is the canonical decision; this source is its supporting artifact. The sample's journal data and transitions do not specify the storage model, Scene scheduling, or complete engine semantics. Starting a new fixture replaces the old one in memory; production must support the already-decided multiple Playthroughs per Session.

## Boundaries

Combat presentation, Location-map layout/travel interactions, and authoritative Playthrough-state rules belong to other tickets. This prototype does not resolve them. No combat or map widget is invented here. Prototype controls can jump to states without performing game transitions. Item quantities, narration, and the fixed Test rolls are illustrative.

The decision ticket is resolved. This source is kept as a spec mockup (see `docs/spec/ui.md`); do not import the throwaway implementation into the production application. The remaining illustration-asset contract is tracked in [Scene illustration assets: authoring, references and loading contract](https://github.com/lbacik/simple-rpg-engine/issues/14).

## Preview verification

JavaScript syntax and whitespace checks passed; the local server returned HTTP 200. Variant A was visually inspected in Safari on desktop. Full interaction and phone visual checks remain pending: browser control was interrupted by concurrent human activity, so automated browser interaction was stopped to avoid disrupting that session.
