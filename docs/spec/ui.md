# UI

The screens, layout and interaction model. This document is normative; the [mockups](mockups/) are throwaway supporting artifacts. Where a mockup and this document differ, this document wins: the mockups' fixture data, fixed dice, simplified transitions and single in-memory Playthrough are not rules.

## Shared presentation

- Desktop and phone layouts.
- A neutral, lightly book-inspired style that suits Scenarios of different genres. The UI does not change per Scenario.
- The UI is in a single language. Scenario text is shown in the Scenario's declared `language` (set as the page's `lang` for Scenario content).
- The main view shows the **current** Scene or Location, not a growing conversation. Earlier narration lives in the separate, read-only Journal.
- Content gated by an unmet Condition (Choices, Connections, on-demand Scenes) is hidden. Unavailable inventory and Combat actions are shown disabled, with the reason. The server validates every action independently.

## Collection (`/`)

- One card per valid Scenario: `title`, `description`, `author` and language, with a **new Playthrough** action.
- The current Session's existing Playthroughs are reachable separately (resume an `active` one, view an `ended` or incompatible one), distinct from starting a new one. `/playthroughs` lists them all. A Session may have any number of Playthroughs, including several of the same Scenario.

## Character creation (`/scenarios/[scenarioId]`)

- The Scenario description, then the Character Templates to choose from. For each: `name`, `description`, base Attributes, Health (12) and starting Equipment and items.
- A name field. Confirming the Template and name starts the Playthrough (and creates the Session if needed), then opens the game screen.

## Game screen (`/play/[playthroughId]`)

Layout **A, "Book & character"**:

- **Desktop**: a reading column with the current narration and its actions, beside a side panel. The side panel holds the **map** at the top, always visible, and below it the **Character** and **Inventory** tabs.
- **Phone**: a single reading column, with a compact Character/Health summary that opens a panel with three tabs: **Character**, **Inventory** and **Map**.

### Reading column

The order within the column is always:

1. Title (Scene `title`, or the Location `name` in the Location view);
2. the Scene's Illustration, when present;
3. narration (Scene `text`, or the Location `description`);
4. actions or the result panel.

**Location view** actions: the on-demand Scenes on offer (labelled with their Scene `title`, in the order the Location lists them) and the exits (one button per visible Connection, labelled with its `label` or the target's name, in authored order).

**Scene active** actions: the visible Choices below the narration, or the single implicit "Continue" when none is visible. While a Scene is active, there are no exits and no map travel.

### Tests and results

- A Choice with a Test shows the tested Attribute and the Difficulty, by name and number, before it is taken.
- After a Choice, the result panel shows the Test (both dice, the modifier, the total, success or failure) when there was one, the Outcome narration and the state changes. While it is shown, the reading column shows **only** the result panel and its client-side **Continue**: the Location view, Scene, Combat panel and the "View journal" link are not rendered until the player continues. Continue then "returns" the player to the current position, for example the Location card they are standing in. The side panel (map, Character, Inventory) and any transient notice stay visible throughout. Which Journal entries make up the panel, and when there is none, is defined in [playthrough-state.md](playthrough-state.md#result-panel); after a reload it may appear again.
- Continue is a plain link to the same game page carrying the current `step` (for example `?seen=<step>`). When the parameter equals the Playthrough's current `step`, the server skips the result panel and renders the position; a value that does not match is ignored, so the result panel of the actual latest step is shown. With JavaScript it is a soft navigation with no full page reload; without JavaScript it is a plain link navigation, and nothing that should be hidden flashes on screen. Continue changes no game state and does not advance `step`.
- The Scenario intro is shown the same way at the start of a Playthrough, and the victory or escape Outcome (or the brief Enemy-defeated notice) the same way after Combat ends.

### Scene and location illustration

- An Illustration sits directly below the Scene title or Location name and before the narration/description. It fills the width of the reading column and scales proportionally without cropping.
- It is rendered as a plain `<img>` with `width` and `height` from the registry (so the layout does not shift), `alt` from the image catalog, and CSS `max-width: 100%; height: auto`. Its URL is the hashed asset route.
- A Scene or Location without an Illustration renders **no image element and no reserved space**.
- If the image fails to load in the browser, the element is removed: no frame, no alt-text box, no retry. Play continues.
- Encounters and Endings have no images.

### Character and inventory panel

- **Character** tab: name, Template, Health out of 12, and the four **effective** Attributes, explaining Equipment bonuses (for example "Agility 3 (2 + 1 Hunter's Cloak)").
- **Inventory** tab: held items with quantities, inline item information (name, description, kind, slot, bonus, Damage and Reach for weapons, healing for Consumables) and the available actions: equip, unequip, use.
- **Magic** items carry a visual marker. It is not a separate kind or category.
- Equip and unequip are available in the Location view and during a Scene, never in Combat. Using a Consumable outside Combat is available below full Health.

### Location map

- Nodes are placed by the Locations' `map` coordinates (0–100, origin top left, y down), scaled into a map area with a **fixed aspect ratio** set by the engine. A Location without coordinates gets a fallback placement: near the average position of the Locations it connects with in either direction, or the centre if none has coordinates.
- The map is drawn on a plain surface. There is no background image.
- **Nodes**: visited Locations, plus Locations revealed by `reveal`. A revealed but unvisited Location is drawn as "heard of" (dashed, muted label) and has no line to it until a known Connection leads there. Unvisited targets of Connections are not drawn.
- **Lines**: one for each currently visible Connection from a **visited** Location to a Location on the map. A pair of opposite Connections is one plain line; a lone one-way Connection is an arrow. Connections hidden by an unmet Condition are not drawn.
- **Current Location**: a pulsing ring and a "You are here" label.
- **Travel**: in the Location view, the targets of visible Connections from the current Location are highlighted and clickable. A map click is exactly equivalent to the matching exit button, including on-enter Scene evaluation. No fast travel to non-adjacent Locations. No travel while a Scene or Combat is active.
- **Option, off by default**: an app-level setting that draws unvisited targets of visible exits as "?" nodes. Whether to enable it will be decided after the first playtests. It is not a Scenario field.

### Combat panel

During Combat, the reading column shows the Encounter's opening narration and the Combat panel (mockup variant B):

- a **Range strip** with the two combatants' tokens at Near or Far, each with Health, weapon and Reach (the Enemy's `name`), and a "guard up" marker on the Character's token when the latest round was a Defend. The marker is derived from that round's Journal entry: the Defend bonus is never stored, because it expires within the turn it was chosen, so the marker shows the guard that was in effect during the Enemy's response just resolved;
- actions grouped as **Position** (Advance, Fall back), **Fight** (Attack, Defend), **Items** (Consumables) and **Leave** (Escape), with unavailable ones disabled and the reason given (for example "Your sword needs Near Range");
- a log of the rolls of the current Combat.

After Combat, the victory or escape Outcome is shown as a result panel, or the brief Enemy-defeated notice when the Encounter has no victory Outcome.

## Journal (`/play/[playthroughId]/journal`)

A paginated, read-only list of the Journal entries in order: intro, narration, Choices taken, Tests with dice, Outcomes, state changes, travel, Combat start, rounds and end, and the Ending. It is text-only. It is available during play and after the end.

## Endings

- The Ending's kind (victory or defeat), `title` and closing narration.
- Read-only access to the final Character sheet, inventory, map and Journal.
- Actions: start a new Playthrough of the same Scenario, or return to the collection.

## Read-only Playthroughs

An `ended` or incompatible Playthrough opens in the same game screen with no actions. An incompatible one explains that the Scenario has changed since it was played (or is no longer available) and offers a new Playthrough when the Scenario is still in the collection. Its Character sheet, inventory and map are best effort, and when the Scenario is gone only the Journal and the Ending from it are shown (see [architecture.md](architecture.md#content-compatibility)).

## Notices

Rejected actions refresh the current state and show a transient notice, such as "The game was advanced in another tab; this is its current state" or "That action is no longer available". There is no error page.

## Mockups

| Mockup | Shows | Run |
|---|---|---|
| [Game screen layout](mockups/game-screen-layout/) | Collection, Character creation, play, inventory, Test feedback, Journal, Endings, Illustration on/off; variants A (selected), B, C | `python3 docs/spec/mockups/game-screen-layout/serve.py`, then open `http://127.0.0.1:4310/?variant=A` |
| [Combat presentation](mockups/combat-presentation/combat-presentation.prototype.html) | three Combat presentations; **B** (Range zones) is selected; its `CombatCore` module implements the Combat rules | open the file; `?variant=A\|B\|C` or the arrow keys |
| [Location map](mockups/location-map/location-map.prototype.html) | four map presentations; **B** (author coordinates) is selected | open the file; `?variant=A\|B\|C\|D` |

The mockups are throwaway specification artifacts, not application code, and must not be imported into `src/`.

## Sources

- [Game screen layout: narration, choices, Character sheet, inventory](https://github.com/lbacik/simple-rpg-engine/issues/10#issuecomment-6099406829)
- [Combat presentation: abstract exchange vs simple grid board](https://github.com/lbacik/simple-rpg-engine/issues/9#issuecomment-6099395150)
- [Location map: auto-laid-out graph vs author-provided coordinates](https://github.com/lbacik/simple-rpg-engine/issues/11#issuecomment-6099544434)
- [Scene illustration assets: authoring, references and loading contract](https://github.com/lbacik/simple-rpg-engine/issues/14#issuecomment-6099824478)
- [Architecture: engine boundaries, persistence and Session handling in Next.js](https://github.com/lbacik/simple-rpg-engine/issues/8#issuecomment-6099767575) (routes, rejection notices)
