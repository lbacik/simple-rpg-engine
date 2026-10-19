# UI

The screens, layout and interaction model. This document is normative; the [mockups](mockups/) are throwaway supporting artifacts. Where a mockup and this document differ, this document wins: the mockups' fixture data, fixed dice, simplified transitions and single in-memory Playthrough are not rules.

## Shared presentation

- Desktop and phone layouts.
- A neutral, lightly book-inspired style that suits Scenarios of different genres. The UI does not change per Scenario.
- All Interface Text is shown in the Interface Language (`en` or `pl`), from the catalogue ([Interface Text](#interface-text)). Scenario text is shown from the Translation that the Interface Language selects, or else in the Base Language ([scenario-format.md](scenario-format.md#language-tags)).
- `<html lang>` is the Interface Language. Each element holding Scenario text carries the `lang` of the text shown (the Translation's or the Base Language's `language`); Interface Text around it is not wrapped in that `lang`.
- A Scenario's text is **shown in the Interface Language** when its Base Language or one of its Translations matches the Interface Language by primary language subtag; otherwise it **falls back** to the Base Language ([scenario-format.md](scenario-format.md#language-tags)).
- The main view shows the **current** Scene or Location, not a growing conversation. Earlier narration lives in the separate, read-only Journal.
- Content gated by an unmet Condition (Choices, Connections, on-demand Scenes) is hidden. Unavailable inventory and Combat actions are shown disabled, with the reason. The server validates every action independently.

## Language switcher

- A **language menu** at the right end of the top navigation, on every page (collection, Character creation, game screen, Journal, Endings, read-only Playthroughs).
- Closed, it shows the current Interface Language's [flag](#language-flags) and its name in that language ("English", "Polski") with a disclosure arrow; on phone width, the flag and the arrow only. Its accessible name is "Language: <name>" from the catalogue.
- Open, it lists every Interface Language as its flag and its name in that language, each item carrying that `lang`, with a check mark on the current one.
- It is a `<details>` disclosure whose items are submit buttons of a form posting to the switching Server Action ([architecture.md](architecture.md#interface-language)), so it works without JavaScript. Choosing the current language does nothing.

### Language flags

Languages are marked with small flag icons:

- `en` is the flag of the United Kingdom, `pl` the flag of Poland. A language is matched by its primary language subtag, so `en-US` is marked with the United Kingdom flag too.
- A Base Language with no flag in this list is marked with its primary language subtag in capitals, in a box of the flag's size.
- Flags are inline SVG, not emoji (some platforms render flag emoji as two letters). They are decorative next to a language's name; where a flag stands alone it has an accessible name: the language's name in the Interface Language, followed by "(original)" for a Scenario's Base Language.

## Collection (`/`)

- One card per valid Scenario: `title`, `description` and `author`, with the Scenario's [language flags](#scenario-language-flags) after the author, and a **new Playthrough** action. Title and description are shown in the Interface Language or in the fallback. The raw BCP 47 tag is not shown.
- The cards are in **two groups**, each keeping the collection order: "In <Interface Language>" (for example "Po polsku") for the Scenarios shown in the Interface Language, then "In other languages" for those that fall back, introduced by one sentence: they are not translated into the Interface Language yet and are played in their original language. An empty group is omitted with its heading. Switching the Interface Language may move a Scenario between the groups.
- The current Session's existing Playthroughs are reachable separately (resume an `active` one, view an `ended` or incompatible one), distinct from starting a new one. `/playthroughs` lists them all. A Session may have any number of Playthroughs, including several of the same Scenario.

## Character creation (`/scenarios/[scenarioId]`)

- The Scenario title, `author` and [language flags](#scenario-language-flags); when the Scenario falls back, one sentence after the flags: it is not translated into the Interface Language and is shown in its Base Language (for example "Not translated into Polish. Shown in English.").
- The Scenario description, then the Character Templates to choose from. For each: `name`, `description`, base Attributes, Health (12) and starting Equipment and items.
- A name field. Confirming the Template and name starts the Playthrough (and creates the Session if needed), then opens the game screen.

## Game screen (`/play/[playthroughId]`)

Layout **A, "Illustrated chronicle"** (selected from the [light UI prototype](https://github.com/lbacik/simple-rpg-engine/tree/codex/prototype-light-ui); the prototype branch stays archived and none of its variant switching, demo data, preview-only Choices or launch tooling ships):

- **Desktop**: a light reading surface (a white card with the title block, the Scenario Illustration, the narration and the real actions) beside a side panel. The side panel orders the **Character status** first, the **Character**, **Inventory**, **Journal** and **Map** launchers second, and the **compact Location map** last. A scenario brand (Interface-Language eyebrow plus Scenario title) and the current-Location badge sit above the grid.
- **Phone**: a single reading column, with the status card and the launchers below the narration. The map moves behind the **Map** launcher that opens it in a modal.

Explicit amendments to the prototype's variant A:

- The Character and inventory modals keep their current content, structure and behaviour; their shared visual styling (light palette, typography, borders, spacing, icon treatment, focus styles and modal surface) follows the selected A layout.
- The compact map card exposes an **Expand map** link, and the **Map** launcher opens the same enlarged map modal, so it is reachable on desktop and phones alike while the compact map stays visible on desktop.
- The map keeps its current plain surface with authored/fallback coordinates, discovery and Connection semantics; the prototype's decorative terrain background is deferred.
- The compact map and the expanded modal each expose the app-level **"Show unseen exits" / "Hide unseen exits"** button-style toggle (off by default), staying consistent through the shared URL setting.
- The Journal launcher opens the Journal in a modal over the game screen, with the standalone page as its new-tab fallback.

### Scenario language flags

The collection card and Character creation show one flag per language the Scenario can be shown in: its Base Language first, then its Translations into Interface Languages (a Translation into any other language is never shown, so it is not listed). The flag of the language the text is shown in now is ringed; the others are dimmed.

### Reading column

The order within the column is always:

1. Title (Scene `title`, or the Location `name` in the Location view);
2. the Scene's Illustration, when present;
3. narration (Scene `text`, or the Location `description`);
4. actions; after a Choice or Combat end, the Outcome shows in a modal above the Location instead.

**Location view** actions: the on-demand Scenes on offer (labelled with their Scene `title`, in the order the Location lists them) and the exits (one button per visible Connection, labelled with its `label` or the target's name, in authored order).

**Scene active** actions: the visible Choices below the narration, or the single implicit "Continue" when none is visible. While a Scene is active, there are no exits and no map travel.

### Language fallback on the game screen

- When the Scenario falls back, the reading column's title (Scene title, Location name, the Encounter name in the Combat panel, the Ending title) is followed by a small badge: the Base Language's flag and "Text: <language>" (for example "Tekst: angielski"). It is shown for as long as the Scenario falls back. Nothing is shown when the text is in the Interface Language.
- **Switching mid-Playthrough** is the same Server Action as anywhere else: the page is refreshed in the new Interface Language, with the Scenario's text from the Translation it now selects, or the fallback with the badge. No notice is shown and nothing is confirmed, since the switch changes no Playthrough state. An outcome modal shown again after the switch mixes languages as described in [playthrough-state.md](playthrough-state.md#outcome-modal).

### Tests and results

- A Choice with a Test shows the tested Attribute and the Difficulty, by name and number, before it is taken.
- After a Choice, an outcome modal over the Location shows the Test (both dice, the modifier, the total, success or failure) when there was one, the Outcome narration and the state changes. While it is shown, the reading column holds the destination Location (after a `move`, the new Location; otherwise the current one) with its actions inert and no map travel, and the modal holds the entries with its client-side **Continue**: the following Scene, Combat panel or Ending screen is not rendered until the player continues. Continue then "returns" the player to the current position, for example the Location card they are standing in. The side panel (status card, launchers, compact map) and any transient notice stay visible throughout. Which Journal entries make up the modal, and when there is none, is defined in [playthrough-state.md](playthrough-state.md#outcome-modal); after a reload it may appear again.
- Continue is a plain link to the same game page carrying the current `step` (for example `?seen=<step>`). When the parameter equals the Playthrough's current `step`, the server skips the outcome modal and renders the position; a value that does not match is ignored, so the outcome modal of the actual latest step is shown. With JavaScript it is a soft navigation with no full page reload; without JavaScript it is a plain link navigation, and nothing that should be hidden flashes on screen. Continue changes no game state and does not advance `step`. Any other dismissal of the modal (the close control, the Escape key, a backdrop click) acknowledges the same way.
- The Scenario intro shows in a modal over the starting Location at the start of a Playthrough: the Location's name, description and Illustration render beneath, with no actionable Location forms behind the modal and no map travel, and the modal's Continue (or any dismissal of it: the Escape key, a backdrop click) is the same client-side `?seen=<step>` acknowledgement as above. A Scenario without an intro opens directly in its normal initial position with no modal. The victory, surrender or draw Outcome is shown in the same outcome modal after Combat ends.

### Scene and location illustration

- An Illustration sits directly below the Scene title or Location name and before the narration/description. It fills the width of the reading column and scales proportionally without cropping.
- Its Still is rendered by the server as a plain `<img>` with `width` and `height` from the registry (so the layout does not shift), `alt` from the image catalog, and CSS `max-width: 100%; height: auto`. Its URL is the hashed asset route.
- A Scene or Location without an Illustration renders **no image element and no reserved space**.
- If the Still fails to load in the browser, the element is removed: no frame, no alt-text box, no retry, and no Layers are fetched or shown. Play continues.
- Encounters and Endings have no images.

An Illustration with `motion` ([scenario-format.md](scenario-format.md#illustration-motion)) adds Motion on top of this, as a JavaScript enhancement. A Scene or Location stays complete on every path below, and Motion never blocks play.

#### Motion

The engine composes Motion from the Still and its Layers:

- **The box.** The Illustration's box has the Still's size. Layers are drawn over the Still in list order, the first at the back, and are clipped to the box, so a Drift may start or end outside the Still. Layer pictures are decorative (`alt=""`); the Still's `alt` describes the whole Illustration.
- **A Layer's size and place.** Its width is `width` percent of the Still's width, and its height follows from one frame's aspect ratio. The point `anchor` of the Layer (in percent of one frame) sits on `at`, or on the Drift's current point.
- **Frames.** A strip of `frames` frames shows frame 0 at t = 0 and steps to the next frame every 1/`fps` seconds, looping for as long as the Layer is shown.
- **Drift.** The Layer's anchor moves linearly from `from` to `to` in `duration` seconds, starting after `delay`. Before the delay ends it waits at `from`. A one-shot Drift then holds at `to`. A looping Drift jumps back to `from` at the end of each pass and starts again at once; its `delay` applies only before the first pass.
- **Flicker.** The Layer's opacity is `1 − dip × depth / 100`. One cycle lasts **4 s** and has 8 keyframes at equal intervals of 4/7 s (about 0.57 s), whose dips are `0, 0.6, 0.2, 1, 0.4, 0.8, 0.1, 0`, eased (ease-in-out) between keyframes; the cycle repeats from t = 0. Every change takes longer than 0.5 s (under 2 Hz), far below the WCAG 2.3.1 flash threshold, so Flicker complies by construction. Every Flicker of one Illustration runs **in unison**, so a flame and its glow pulse together.
- **Blend.** `multiply` and `screen` blend a Layer with everything drawn beneath it within the box (the Still and the earlier Layers), never with the page around it.
- **Camera.** One transform scales the Still and every Layer together, so the Layers stay aligned with the painting. A framing `{ zoom, x, y }` with scale `s = zoom / 100` is `translate((1 − s) · x%, (1 − s) · y%) scale(s)` of the box, with its origin at the top-left corner, so the point (x, y) of the Still stays in place. The Camera holds `from` until its `delay` ends, then moves to `to` in `duration` seconds with a fixed ease-in-out. Interpolating between two framings keeps every intermediate a valid framing, so the view never leaves the Still and nothing is clamped. A one-shot Camera holds `to`. A looping Camera goes from `from` to `to` and back again, `duration` seconds each way, for as long as Motion runs; its `delay` applies only before the first pass.
- Motion animates only `transform`, `opacity` and the frame steps. Its implementation technique (CSS animations, the Web Animations API) is the implementer's choice.

#### Timeline

- **Showing.** Motion starts afresh with every Showing ([`CONTEXT.md`](../../CONTEXT.md)). The engine view carries the Illustration's **Showing key**, the Scene or Location it is shown with: `scene:<id>` while a Scene is active, otherwise `location:<id>` ([architecture.md](architecture.md#engine-contract)). The UI keys the Illustration by it: a new key starts a new Showing, and a re-render with the same key continues it. A page load or reload always starts a new Showing.
  - A Showing continues across re-renders that stay on the same Scene or Location: an Outcome that stays there, the outcome modal, the side-panel modals (Character, Inventory, Journal, Map), a language switch, a rejection notice.
  - Every arrival from another Scene or Location starts a new one, even when that one shows the same image. Location A → Scene X → Location A starts a new Showing of A, and so does a return to A after Combat, since the key changes along the way.
  - Re-entering without leaving **continues** the Showing: a `move` to the current Location, or a repeatable Scene whose `next` leads back to itself.
  - Nothing is remembered between Showings, neither in the Playthrough nor in browser storage, so a one-shot Drift or Camera replays on a return visit and on a reload.
- **Start and fade-in.** Motion starts only once the Still and every Layer file have loaded. The composition (the Still and every Layer, at the Camera's `from` framing) then fades in over the plain Still: opacity 0 → 1, linear, over **1 s**. Timeline t = 0 is the start of the fade: frames, Drifts, delays, Flickers and the Camera all count from it.
- **Off-screen and hidden tab.** While no part of the Illustration is in the viewport, or the tab is hidden, the timeline freezes; it resumes where it stopped when the Illustration is visible again. This is not Motion off: the Still is not swapped in, the Layers stay and the control does not change. An Illustration covered by a modal counts as visible. Timeline time is therefore the time the Illustration has been visible with Motion on since Motion last started.
- **End state.** When every one-shot Drift and Camera has ended, the final composition holds: a one-shot Drift's Layer stays at its end point and a one-shot Camera at its end framing. Frames, Flickers and looping Drifts and Cameras keep running. The control stays: Pause shows the Still, and Play replays Motion from t = 0.
- **Pause and Play.** Pause shows the Still **at once**, with no fade-out: the composition is removed and the Layers may be unmounted. Play restarts Motion from t = 0, fade-in included, never resuming where it stopped. The same holds whenever Motion turns off and on within a Showing for any other reason, such as a live change of the OS reduced-motion setting.

#### Loading and failure

- The Still loads as above, with the page. Layer files are fetched by the client after hydration, and only while Motion is on. If Motion is off when the Showing begins, they are fetched on the first Play. They are never preloaded in the HTML, and other Scenes' or Locations' Layers are never prefetched. A file used by several Layers is fetched once.
- **All or nothing.** Until every Layer file has loaded, the Still shows alone, never a half-assembled composition. There is no timeout: a slow load only starts Motion later. Pausing before the Layers have loaded keeps Motion from starting.
- **Layer failure.** If any Layer file fails to load, Motion is abandoned for this Showing: the Still stays and the control is hidden, since there is nothing to play. The next Showing tries again.
- **The browser refuses to animate.** Motion that cannot start for any other reason leaves the Still shown and the control showing Play. Play retries; if Motion still cannot start, the Still stays. The refusal is never stored as the player's preference.

#### Play/Pause control and reduced motion

- **Reduced motion.** Under `prefers-reduced-motion: reduce`, with no stored choice, Motion is off: the player sees the Still, and the Layer files are not fetched. The player can still start Motion with Play.
- **The control.** Every Illustration with Motion has one engine-provided Play/Pause button, overlaid in the bottom-right corner of the Illustration's box and not moved by the Camera. It is always visible (not on hover only), its touch target is at least 44×44 px, and it shows a ⏸ or ▶ icon with the accessible name "Pause animation" or "Play animation" from the Interface Text catalogue. The phone layout uses the same control. It is rendered only with JavaScript, appears with the Still on hydration and reflects the preference before the Layers have loaded. It is not rendered for an Illustration without Motion, and is hidden after a Layer failure.
- **A global preference.** The control sets one preference for every Illustration: after Pause, every later Illustration starts with Motion off, and Play turns Motion back on everywhere.
- **Precedence.** An explicit choice from the control wins in both directions. Without one, the OS `prefers-reduced-motion` setting decides, including a live change while the page is open.
- **Persistence.** The choice is kept in `localStorage`, per browser and device. It is not stored with the Session or the Playthrough. When storage is unavailable or empty, the OS setting decides.
- **Scope.** The preference governs Illustration Motion only. Other UI motion, such as a Range change on the Combat lane arena, keeps honouring `prefers-reduced-motion` alone.
- WCAG 2.2.2 (Pause, Stop, Hide) is met by the control. There is no automatic stop after a number of seconds or loops.
- **Without JavaScript** the player sees the Still, with no control and no Layers fetched.

### Character and inventory panel

The side panel holds, top to bottom: a status card, four launchers in a row, and the compact Location map (as above) with an Expand link to the enlarged modal.

- **Status card**: a medallion with the Character's initial inside a ring that fills with the Health fraction (as in the Combat arena; red when Health is low), the Character's name, the Template, a readable "Health N / 12" line, a 12-segment Health bar, and the four effective Attribute values.
- **Launchers**: **Character** (sublabel "Health 9/12"), **Inventory** (sublabel "3 items"), **Journal** (sublabel "34 entries") and **Map** (sublabel "Travel"), each with an icon, a label and a sublabel. The Journal launcher opens the Journal in a modal over the game screen; its trigger is this launcher. The Map launcher opens the enlarged map modal on desktop and phones alike.
- **Character** modal (the Character sheet): a header with a large Health medal (the Character's initial inside the Health ring, red when Health is low), the Character's name, the Template name, the current Location, and the Template description in italics; the four Attributes, each with five pips (● per point of base, then ◆ gold per counted Equipment bonus, so the filled pips equal the **effective** value), the effective value as a large number, and, when Equipment contributes, a source line (for example "base 2 · +1 Harbour Blade · +1 Padded Watch Coat"; bonuses beyond the +2 cap are struck through with a "bonus capped at +2" explanation), followed by the legend "● base ◆ equipment bonus (max +2)"; Health as a large "9 / 12" with a 12-segment bar (red when Health is low, labelled "Health N of 12"); and the equipped Weapon, Outfit and Talisman, each with an icon and the item's name, or "—" when empty. Two columns on desktop, one on phones. The pips are decorative: each Attribute's value and explanation are plain text.
- **Inventory** modal: an **Equipped** "paper doll" of the three slots (Weapon, Outfit, Talisman) beside the **Carried** item tiles, with a detail pane for the selected tile below the tiles. A filled slot shows a dark icon tile, the slot name, the item name, its Attribute bonus and **Unequip**; an empty slot shows a dashed outline and "Empty" in italics. Each carried tile is a button (`aria-pressed`) showing an icon by kind (weapon, outfit, talisman, Consumable, key item) and the name, "×N" when the quantity is above 1, a ✦ marker for magic items and an "equipped" ribbon for items in a slot. The detail pane shows the selected tile (the first item by default): the name, quantity and magic marker, the description in italics, chips for kind/slot, bonus or healing, and the item's real action (Equip, Unequip or Use); a disabled action shows its reason, and key items have no action. The selected tile rides in the URL (`?panel=inventory&item=`), so Equip, Unequip and Use — and their rejection notices — land back with the modal still open and the same tile selected (or the first item, when the selected one is gone). Two columns on desktop, stacked on phones; focus order is slots, then tiles, then the pane.
- **Magic** items carry a visual marker. It is not a separate kind or category.
- Equip and unequip are available in the Location view and during a Scene, never in Combat. Using a Consumable outside Combat is available below full Health.

The Character, Inventory and map modals open over the game screen. Each closes with a close button, Escape or a backdrop click; focus is trapped while open, returns to its launcher on close, and the background does not scroll. The open modal is part of the URL (for example `?panel=character|inventory|map`), replacing the previous `?tab=`: Equip, Unequip and Use, and their rejection notices, land back on the game screen with the Inventory modal still open and the notice visible. Without JavaScript the launchers are plain links and the requested panel renders open from the URL.

On phones the status card and the launchers replace the compact summary, and the **Map** launcher opens the map in a modal. Map travel from that modal works as from the inline map. Modals are full-screen on phones.

There is no "View journal" link above the narration in the reading column; the Ending screen keeps its "View journal" button.

### Location map

- Nodes are placed by the Locations' `map` coordinates (0–100, origin top left, y down), scaled into a map area with a **fixed aspect ratio** set by the engine. A Location without coordinates gets a fallback placement: near the average position of the Locations it connects with in either direction, or the centre if none has coordinates.
- The map is drawn on a plain surface. There is no background image.
- **Nodes**: visited Locations, plus Locations revealed by `reveal`. A revealed but unvisited Location is drawn as "heard of" (dashed, muted label) and has no line to it until a known Connection leads there. Unvisited targets of Connections are not drawn unless the "Show unseen exits" setting is on.
- **Lines**: one for each currently visible Connection from a **visited** Location to a Location on the map. A pair of opposite Connections is one plain line; a lone one-way Connection is an arrow. Connections hidden by an unmet Condition are not drawn.
- **Current Location**: a pulsing ring and a "You are here" label.
- **Travel**: in the Location view, the targets of visible Connections from the current Location are highlighted and clickable, in the compact map and in the expanded modal alike. A map click is exactly equivalent to the matching exit button, including on-enter Scene evaluation. No fast travel to non-adjacent Locations. No travel while a Scene or Combat is active.
- **Option, off by default**: an app-level URL setting (`?unknown=1`) that draws unvisited targets of currently visible exits as "?" nodes. It never discloses Connections hidden by unmet Conditions and never marks Locations as visited or revealed. Both map presentations expose it as a button-style **"Show unseen exits" / "Hide unseen exits"** toggle with a clear current state. It is not a Scenario field.

### Combat panel

> **Historical.** This section describes the retired tactical Combat panel (lane arena with per-participant Near/Far labels, Speed order strip, Distract/Escape actions, 2d6 thresholds). It is kept for provenance pending the production command-panel UI, which is built anew under [ADR 0011](../adr/0011-combat-interface-text-as-client-catalogue-slice.md) against the [Combat contract](combat-contract.md). Do not implement from this section.

During Combat, the reading column shows the Combat panel, while the side panel (status card, launchers, compact map) stays visible. It works with one or two Enemy participants (retired tactical rules). The arena has a lane for each participant who started this Combat, including one defeated since; only survivors have Intents and can be targets. A Combat started or re-entered with one survivor has one lane, one bubble and an implicit target. Top to bottom:

- a **header**: a small uppercase kicker (`Combat · <Location name> · Round <n>`), the Encounter name as `h1`, then the opening narration (muted italic) and a bottom rule;
- the **lane arena**;
- the **order strip**;
- the **target picker**, only while two participants survive;
- the **actions** in four columns;
- the **log**.

**Participant names.** A participant is shown by its Enemy's name. When its Encounter has two participants of the same Enemy kind, the name is followed by a capital letter from its ordinal ([playthrough-state.md](playthrough-state.md#combat-events)): "Grey Wolf A", "Grey Wolf B" ("Szary Wilk A" in Polish, with no inflection). Letters, not numbers, so they never read as places in the order. A participant whose kind is unique in the Encounter has no letter. Participant ids are author-internal and never shown.

#### Lane arena

- A bordered card. The Character's medallion stands in a left column spanning the whole height. To its right, **one lane per participant**, in participant order, separated by a dashed rule. Each lane has its own ground line and its own Range label (`NEAR` / `FAR`) at the bottom centre, because each participant has its own Range.
- A medallion is an initial in a coloured disc inside a Health ring (red at low Health), with the name, `health/max` and a detail line below: the Character's weapon, Reach and Damage; the participant's Reach and Damage. A participant with a letter shows it as a small badge on its ring.
- **Near**: the participant stands at the start of its lane, next to the Character's column, with a crossed-swords mark between them. **Far**: it stands at the far end of its lane, with a `‹ — — Far — — ›` marker in the middle. A Range change moves only that lane's medallion; the movement is animated, honouring `prefers-reduced-motion`.
- **Intent bubble** above each surviving participant: its place in the Round's order (a numbered disc), its Speed tag, the Intent's name and, for an attack, its Damage and "hits you on N+, M+ if you Defend" (2d6 thresholds). A Prepare bubble has a dashed border and a second line naming what it prepares: "next round: Heavy blow, slow, 6 Damage" (for an Enemy with 3 Damage, plus the Heavy attack's +3).
- **Intent names** depend on the Reach: Strike / Shoot, Close in, Wind up / Take aim, Heavy blow / Aimed shot (`melee` / `ranged`).
- **State badges** next to the participant's Health: "Wound up" (`melee`) or "Aiming" (`ranged`) while it is prepared; "Wary · to round N" while it is Wary, N being the last round of the effect. Guarded is round-scoped and never shown on the arena: it appears only in the log of the round it applied to. Nothing in the arena is derived from the Journal.
- A participant defeated during this Combat keeps its lane, with a grey medallion, a "Defeated" badge, no bubble and no Range label, until the Combat ends. The engine's arena projection includes it from the Combat's stored starting participant ids and Encounter wounds, even after a reload; it has no active action state and cannot be a target. On re-entry after an Escape the arena has lanes only for the surviving participants, which form the new Combat's starting membership.
- For screen readers the arena carries a text summary per surviving participant: name, Range, Health, Intent with its Speed and effect, and place among the Enemies' actions. The drawing itself is decorative.

#### Order strip

- One line under the arena, labelled "This round": the Round's actions as numbered chips, grouped by Speed (`FAST`, `NORMAL`, `SLOW`), each naming the actor and its Intent ("Grey Wolf A: Strike"). It is an ordered list.
- Without a chosen action it lists the Intents only, followed by a dashed hint chip. Pointing at or focusing an action button inserts the Character's action at its place and renumbers the bubbles. This preview is a client-side enhancement only: it reads nothing the server did not render, sends nothing, and is never authoritative.
- Every action button shows the same information as plain text (below), so the order is readable without JavaScript or a pointer.
- The order strip and Intent positions use the engine's saved participant tie-break order for this Round. A content reorder may change arena lane order, but it does not change the announced Round's equal-priority order; the next Round uses the new content order.

#### Target picker

- Shown only while two participants survive. A row labelled "Target" with one link per surviving participant, in participant order, each showing its name and a Near/Far badge. The current target is marked (◉, `aria-current`); the others show ○. A note says it is used by Attack, Distract and Advance.
- The picker is part of the URL, like the modals: `?target=<participant id>`. The server renders every targeted action's availability, reason and target name for that participant and posts it as the form's hidden `target`. Without the parameter, or when it names no surviving participant, the target is the first surviving participant. With JavaScript, choosing a target is a soft navigation; without it, a plain link. The parameter is not game state: it changes nothing and does not advance `step`, and the server validates the posted target independently ([playthrough-state.md](playthrough-state.md#actions-and-the-step-guard)).
- With one surviving participant there is no picker and targeted actions post that participant.

#### Actions

- Four columns: **Position** (Advance, Fall back), **Fight** (Attack, Defend, Distract), **Items** (one button per held Consumable, or "No Consumables held.") and **Leave** (Escape). On phone width the columns become a 2×2 grid.
- Each button is a plain form posting `combat`, `target` (targeted actions) and `item` (Consumables), with the `step`. Below its label it shows: the Speed; its place in the Round's order ("acts 2nd of 3"), which depends only on the Speed and so is exact before the target is chosen; for a rolled action, the 2d6 threshold ("needs 9+"); and for a targeted action, the target ("→ Grey Wolf B"). Thresholds read the current state; Escape's +2 is retained from the Round as shown when the Character commits, while the opposing Agility of Escape and Fall back was re-read when the action resolved (retired tactical rules). No percentages are shown.
- Unavailable actions are disabled with the reason in player language, from the engine's reason code: "Your Sword needs Near Range; Grey Wolf B is Far.", "You are already Near Grey Wolf A.", "Grey Wolf A is wary of tricks until the end of round 5.", "Nothing is Near you.", "You are at full Health.".

#### Log

The rolls of the current Combat, newest first:

- a "Last round · `<n>`" callout listing **every action of that round in order**, one numbered line each (the Character's number ringed): the actor, the action or Intent with its target and Speed tag, then
  - for an executed action, its roll as a chip (`d1+d2+mod = total vs target`) and its result: "hit, N Damage", "miss", "success", "failure", "+3 Health", "now Near Grey Wolf A", "Guarded until the end of the round", "prepares; its heavy attack comes next round", "success — Grey Wolf A's action is interrupted; it is Wary until the end of round 5", a defeat ("— Grey Wolf A falls."), and "(your guard held)" / "(through your guard)" on attacks against a Guarded Character;
  - a counterattack as an indented "↳ Counterattack:" line inside the action it answers;
  - a cancelled action as "Cancelled: …" with its reason (interrupted by your distraction, the target had already fallen, out of Reach, already Near, nothing was Near any more), a dropped one as "Did not act: defeated earlier this round.", one not reached as "Did not happen: the fight was already over.";
  - when the sequence stopped, a closing line: escaped, every enemy has fallen, or you fell;
- the older rounds as a compact muted list, one line per round: "`<n>`. Idris: Attack Grey Wolf A — miss · Grey Wolf A: Strike — hit 2 · Grey Wolf B: Close in — cancelled".
- "No rolls yet." before the first round.

After Combat, the victory, surrender or draw Outcome is shown in the outcome modal. The last round's callout is part of that modal, so the round that ended the fight is readable without opening the Journal.

The Combat panel renders legacy single-Enemy rounds of an already-started Combat (migrated, [playthrough-state.md](playthrough-state.md#state-versions-and-migration)) in the log as their stored text, verbatim, one line per round; the legacy guard marker is not shown.

## Journal (`/play/[playthroughId]/journal`)

A read-only list of the Journal entries, newest first: intro, narration, Choices taken, Tests with dice, Outcomes, state changes, travel, Combat start, rounds and end, and the Ending. It is text-only. It is available during play and after the end. Each entry shows its label and the step that produced it, and the header shows the total entry count, or "Nothing has happened yet." for an empty Journal.

Every "View journal" link that sits next to play opens the Journal in a modal over the current screen instead of navigating away, so the reader can look back and return to play exactly where they were: the game screen, the Ending screen, and the read-only screen of an incompatible Playthrough whose Scenario is still in the collection. The modal header names the Journal, shows the total entry count and offers an "Open in new tab" link to the standalone Journal page. Inside the modal the Journal behaves as on the full page: newest first, older entries loading automatically towards the first entry, and the sticky position indicator, all scrolling within the modal. The modal closes on its close button, the Escape key and a backdrop click; it traps focus while open and returns focus to the "View journal" control on close, and the background scroll is locked while it is open. The game screen underneath is never reloaded and keeps its state, including an undismissed outcome modal: closing the Journal (however it is dismissed) never acknowledges the presentation beneath it. The "View journal" control itself is a plain link to the Journal URL, so navigating directly to that URL, reloading it, or following the link without JavaScript all show the full standalone Journal page.

Opening the Journal (in the modal or on the standalone page) shows the newest batch of entries at the top. Scrolling towards the bottom loads older entries automatically and appends them below, with a visible loading state, until the very first entry (the intro) is reached; there loading stops and the list says the start of the Journal has been reached. Batches are addressed by a cursor on the entry sequence ("entries older than X"), not by page number or offset, so entries appended during play never shift or duplicate what is already on screen. Without JavaScript, an "Older entries" link at the bottom of the list walks the whole Journal batch by batch.

A sticky position indicator stays visible at the top of the list's scroll container (the modal body in the modal, the window on the standalone page). It names the step and the sequence position (out of the total entry count) of the entry at the top of the viewport (for example "Step 12 · entry 37 of 134"), with a thin progress bar showing how far into the Journal the reader has scrolled by entry count against the total, not the number loaded so far. The indicator stays correct as older batches are appended; an empty Journal shows no indicator and reads "Nothing has happened yet.". The position is plain text (not a live region, so scrolling does not flood screen readers) and the bar is decorative. Without JavaScript the page still renders; the indicator keeps its server-rendered first entry.

- Entry type labels and the wording of engine-generated entries come from the catalogue of the **current** Interface Language, so after a switch the whole Journal's Interface Text is in the new language ([playthrough-state.md](playthrough-state.md#journal)).
- Scenario text (narration, Choice wording, Ending title and narration, and names inside engine messages) is shown as it was presented, so after a switch the Journal shows Scenario text in more than one language. Each element holding it carries the entry's recorded `lang`; a name inside an engine message is wrapped in its own element with that `lang`.
- Entries stored before Interface Languages existed are shown verbatim, in English, with only their type label from the catalogue.
- A **Combat round** entry (`version: 3`) reads like the command panel's round report: the Round's typed events with the actor-to-participant mapping, rendered from the catalogue ([playthrough-state.md](playthrough-state.md#journal)). The tactical rendering below it (one numbered line per action with Speed, roll, counterattack and ordinal letters) is historical, as is the verbatim display of pre-tactical single-Enemy entries; pre-v0.6.0 entries are discarded by the release.
- An entry holding Scenario text whose recorded `lang` (`en` for the entries above) differs from the Interface Language by primary language subtag has that language's [flag](#language-flags) after its type label, so the mixed languages are visibly marked. Engine-generated entries carry no flag; a name inside them only carries its `lang`.

## Endings

- The Ending's kind (victory or defeat), `title` and closing narration.
- Read-only access to the final Character sheet, inventory, map and Journal.
- Actions: start a new Playthrough of the same Scenario, or return to the collection.

## Read-only Playthroughs

An `ended` or incompatible Playthrough opens in the same game screen with no actions. An incompatible one explains that the Scenario has changed since it was played (or is no longer available) and offers a new Playthrough when the Scenario is still in the collection. Its Character sheet, inventory and map are best effort, and when the Scenario is gone only the Journal and the Ending from it are shown (see [architecture.md](architecture.md#content-compatibility)).

## Interface Text

Everything the UI shows that does not come from a Scenario goes through the catalogue of the Interface Language ([architecture.md](architecture.md#interface-text), [ADR 0003](../adr/0003-interface-text-from-a-typed-catalogue.md)):

- UI chrome: navigation, headings, buttons, form labels and errors, empty states, tab names, `aria-label`s and other accessible names, the page title and description;
- notices after rejected actions;
- Journal entry type labels and the wording of engine-generated entries;
- Test descriptions (the Attribute, Difficulty, dice, modifier, total, success or failure) and the Test shown on a Choice;
- Combat messages from the typed catalogue slice ([ADR 0011](../adr/0011-combat-interface-text-as-client-catalogue-slice.md)): disabled reasons, forecast and log events, results and notices. The retired tactical panel vocabulary below (Speeds, order places, 2d6 thresholds, Wary) is historical;
- the accessible names of the Illustration's Play/Pause control ("Pause animation", "Play animation");
- inventory and state-change wording ("received", "lost", Health gained or lost, …);
- disabled-action reasons, in inventory and in Combat;
- the names of the engine's own vocabulary: Attributes, Difficulty levels, Stances, Ranges, Equipment slots, Combat results, Victory and Defeat. These are never shown as raw ids;
- the not-found and error pages (the app defines its own instead of Next.js's built-in English ones).

Rules:

- A message places a Scenario-provided name only where its language needs no inflection: as a label, after a colon, or in the nominative. In Polish, "Atak: Miecz — trafienie, 3 obrażenia" rather than a sentence that would need "mieczem"; "Nowa rozgrywka: Szepczące Lasy" rather than "…Szepczących Lasów". Names are never lower-cased or otherwise transformed.
- Counts use the language's plural forms (Polish `one`/`few`/`many`/`other`: "1 obrażenie", "3 obrażenia", "5 obrażeń").
- Numbers are formatted with `Intl` in the Interface Language.
- Flag ids are author-internal and are never shown to the player ([playthrough-state.md](playthrough-state.md#applying-an-outcome)).

### Polish terms

The Polish catalogue uses these terms for the engine's vocabulary. Scenario authors writing in Polish or translating into it should use them too, so that narration and Interface Text agree. Other Polish wording is UI copy.

| Term | Polish |
|---|---|
| Attribute: Might, Agility, Wits, Presence | Atrybut: Krzepa, Zręczność, Spryt, Prezencja |
| Health | Zdrowie |
| Damage | Obrażenia |
| Test | Test |
| Difficulty: Easy, Ordinary, Hard, Very hard | Trudność: Łatwa, Zwykła, Trudna, Bardzo trudna |
| Range: Melee, Near, Far | Dystans: Zwarcie, Blisko, Daleko |
| Reach: melee, ranged | (retired from Combat; no longer shown) |
| Equipment slots: weapon, outfit, talisman | Broń, Strój, Talizman |
| Equipment | Ekwipunek |
| Consumable | Przedmiot jednorazowy |
| Key Item | Przedmiot fabularny |
| Combat | Walka |
| Journal | Dziennik |
| Ending; Victory, Defeat | Zakończenie; Zwycięstwo, Porażka |
| Character; Character Template | Postać; Szablon postaci |
| Playthrough | Rozgrywka |
| Scenario | Scenariusz |

Exact Polish wording for the MVP Combat vocabulary (Stances, Cards, Intents, Guard, Exposed, Counter, Cover, Companion) is implementer's discretion under the Interface Text rules, as accepted in [Validate production UI C with real simple-rpg-engine interaction states](https://github.com/lbacik/simple-rpg-engine/issues/185). Use it consistently across the typed catalogue slice, command panel, forecast and Journal, and use any canonical terms settled by the separate Interface Language effort. Selecting the wording does not block the Combat implementation plan or add Scenario Translation fields.

## Notices

Rejected actions refresh the current state and show a transient notice, such as "The game was advanced in another tab; this is its current state" or "That action is no longer available". There is no error page.

## Mockups

| Mockup | Shows | Run |
|---|---|---|
| [Game screen layout](mockups/game-screen-layout/) | Collection, Character creation, play, inventory, Test feedback, Journal, Endings, Illustration on/off; variants A (selected), B, C | `python3 docs/spec/mockups/game-screen-layout/serve.py`, then open `http://127.0.0.1:4310/?variant=A` |
| [Combat presentation](mockups/combat-presentation/combat-presentation.prototype.html) | historical single-Enemy presentations and rules; formerly selected B (Range zones), superseded by tactical Combat A and now by the MVP 1.0 rules | open the file; `?variant=A\|B\|C` or the arrow keys |
| [Location map](mockups/location-map/location-map.prototype.html) | four map presentations; **B** (author coordinates) is selected | open the file; `?variant=A\|B\|C\|D` |
| [Tactical Combat](mockups/tactical-combat/tactical-combat.prototype.html) | historical: three tactical Combat presentations with one or two Enemies (duel, two melee, melee/ranged, same kind), a rules engine, the round report and Journal; **A** (lanes and target picker) was selected | open the file; `?variant=A\|B\|C` or the arrow keys |
| [Language switcher](mockups/language-switcher/language-switcher.prototype.html) | three switcher and availability presentations; **B** (language menu, with flags) is selected | open the file; `?variant=A\|B\|C` or the arrow keys |

The mockups are throwaway specification artifacts, not application code, and must not be imported into `src/`. The current normative text governs rules, accepted balance tuning and state compatibility when a prototype predates those decisions.

## Sources

- [Game screen layout: narration, choices, Character sheet, inventory](https://github.com/lbacik/simple-rpg-engine/issues/10#issuecomment-6099406829)
- [Combat presentation: abstract exchange vs simple grid board](https://github.com/lbacik/simple-rpg-engine/issues/9#issuecomment-6099395150)
- [Location map: auto-laid-out graph vs author-provided coordinates](https://github.com/lbacik/simple-rpg-engine/issues/11#issuecomment-6099544434)
- [Scene illustration assets: authoring, references and loading contract](https://github.com/lbacik/simple-rpg-engine/issues/14#issuecomment-6099824478)
- [Motion accessibility policy for animated Illustrations](https://github.com/lbacik/simple-rpg-engine/issues/195#issuecomment-6250154872) (the Still, the Play/Pause control, the global preference, the fallback chain)
- [Prototype: one Scene rendered with competing animation approaches](https://github.com/lbacik/simple-rpg-engine/issues/196#issuecomment-6250531255) (composition of Layers and Camera)
- [Timeline semantics for layered Illustrations](https://github.com/lbacik/simple-rpg-engine/issues/200#issuecomment-6250649432) (Showing, Pause and Play, off-screen freezing, loading, end state)
- [Clarify the Motion spec gaps found by the example](https://github.com/lbacik/simple-rpg-engine/issues/212#issuecomment-6261254575) (Showing key, fade-in, Flicker curve, `anchor`)
- [Architecture: engine boundaries, persistence and Session handling in Next.js](https://github.com/lbacik/simple-rpg-engine/issues/8#issuecomment-6099767575) (routes, rejection notices)
- [Interface text catalogue](https://github.com/lbacik/simple-rpg-engine/issues/60) (Interface Text, `lang`, Polish terms)
- [Journal across languages](https://github.com/lbacik/simple-rpg-engine/issues/61) (Journal rendering after a language switch)
- [Language switcher and availability UX](https://github.com/lbacik/simple-rpg-engine/issues/62) (language menu, flags, collection groups, fallback badge)
- [Prototype: readable intents, targets and action order for two Enemies](https://github.com/lbacik/simple-rpg-engine/issues/82) (lane arena, Intent bubbles, order strip, target picker, round report, Combat Journal entries)
- [Active Combat roster and compatibility after participant reordering or revival](https://github.com/lbacik/simple-rpg-engine/issues/116) (persistent defeated lanes and saved Round ties)
- [Prototype: tactical Combat balance and meaningful action trade-offs](https://github.com/lbacik/simple-rpg-engine/issues/83) (Heavy attack +3 and commitment-time Escape bonus)
- [Tactical Combat specification and dependency-ordered implementation handoff](https://github.com/lbacik/simple-rpg-engine/issues/84) (copy discretion and historical prototype clarification)
