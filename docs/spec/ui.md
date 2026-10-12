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

Layout **A, "Book & character"**:

- **Desktop**: a reading column with the current narration and its actions, beside a side panel. The side panel holds the **map** at the top (always visible), a **status card**, and the **Character**, **Inventory** and **Journal** launchers.
- **Phone**: a single reading column, with the status card and the launchers below the narration. The map moves behind a fourth **Map** launcher.

### Scenario language flags

The collection card and Character creation show one flag per language the Scenario can be shown in: its Base Language first, then its Translations into Interface Languages (a Translation into any other language is never shown, so it is not listed). The flag of the language the text is shown in now is ringed; the others are dimmed.

### Reading column

The order within the column is always:

1. Title (Scene `title`, or the Location `name` in the Location view);
2. the Scene's Illustration, when present;
3. narration (Scene `text`, or the Location `description`);
4. actions or the result panel.

**Location view** actions: the on-demand Scenes on offer (labelled with their Scene `title`, in the order the Location lists them) and the exits (one button per visible Connection, labelled with its `label` or the target's name, in authored order).

**Scene active** actions: the visible Choices below the narration, or the single implicit "Continue" when none is visible. While a Scene is active, there are no exits and no map travel.

### Language fallback on the game screen

- When the Scenario falls back, the reading column's title (Scene title, Location name, the Encounter name in the Combat panel, the Ending title) is followed by a small badge: the Base Language's flag and "Text: <language>" (for example "Tekst: angielski"). It is shown for as long as the Scenario falls back. Nothing is shown when the text is in the Interface Language.
- **Switching mid-Playthrough** is the same Server Action as anywhere else: the page is refreshed in the new Interface Language, with the Scenario's text from the Translation it now selects, or the fallback with the badge. No notice is shown and nothing is confirmed, since the switch changes no Playthrough state. A result panel shown again after the switch mixes languages as described in [playthrough-state.md](playthrough-state.md#result-panel).

### Tests and results

- A Choice with a Test shows the tested Attribute and the Difficulty, by name and number, before it is taken.
- After a Choice, the result panel shows the Test (both dice, the modifier, the total, success or failure) when there was one, the Outcome narration and the state changes. While it is shown, the reading column shows **only** the result panel and its client-side **Continue**: the Location view, Scene and Combat panel are not rendered until the player continues. Continue then "returns" the player to the current position, for example the Location card they are standing in. The side panel (map, status card, launchers) and any transient notice stay visible throughout. Which Journal entries make up the panel, and when there is none, is defined in [playthrough-state.md](playthrough-state.md#result-panel); after a reload it may appear again.
- Continue is a plain link to the same game page carrying the current `step` (for example `?seen=<step>`). When the parameter equals the Playthrough's current `step`, the server skips the result panel and renders the position; a value that does not match is ignored, so the result panel of the actual latest step is shown. With JavaScript it is a soft navigation with no full page reload; without JavaScript it is a plain link navigation, and nothing that should be hidden flashes on screen. Continue changes no game state and does not advance `step`.
- The Scenario intro is shown the same way at the start of a Playthrough, and the victory or escape Outcome (or the brief Enemy-defeated notice) the same way after Combat ends.

### Scene and location illustration

- An Illustration sits directly below the Scene title or Location name and before the narration/description. It fills the width of the reading column and scales proportionally without cropping.
- It is rendered as a plain `<img>` with `width` and `height` from the registry (so the layout does not shift), `alt` from the image catalog, and CSS `max-width: 100%; height: auto`. Its URL is the hashed asset route.
- A Scene or Location without an Illustration renders **no image element and no reserved space**.
- If the image fails to load in the browser, the element is removed: no frame, no alt-text box, no retry. Play continues.
- Encounters and Endings have no images.

### Character and inventory panel

The side panel holds, top to bottom: the Location map (as above), a status card, and three launchers in a row.

- **Status card**: a medal with the Character's initial inside a ring that fills with the Health fraction (as in the Combat arena; red when Health is low), the Character's name, the Template, and a 12-segment Health bar.
- **Launchers**: **Character** (sublabel "Health 9/12"), **Inventory** (sublabel "3 items") and **Journal** (sublabel "34 entries"), each with an icon, a label and a sublabel. The Journal launcher goes to the full Journal page. (Once the Journal modal lands, it opens that modal instead; its trigger is this launcher.)
- **Character** modal (the Character sheet): a header with a large Health medal (the Character's initial inside the Health ring, red when Health is low), the Character's name, the Template name, the current Location, and the Template description in italics; the four Attributes, each with five pips (● per point of base, then ◆ gold per counted Equipment bonus, so the filled pips equal the **effective** value), the effective value as a large number, and, when Equipment contributes, a source line (for example "base 2 · +1 Harbour Blade · +1 Padded Watch Coat"; bonuses beyond the +2 cap are struck through with a "bonus capped at +2" explanation), followed by the legend "● base ◆ equipment bonus (max +2)"; Health as a large "9 / 12" with a 12-segment bar (red when Health is low, labelled "Health N of 12"); and the equipped Weapon, Outfit and Talisman, each with an icon and the item's name, or "—" when empty. Two columns on desktop, one on phones. The pips are decorative: each Attribute's value and explanation are plain text.
- **Inventory** modal: an **Equipped** "paper doll" of the three slots (Weapon, Outfit, Talisman) beside the **Carried** item tiles, with a detail pane for the selected tile below the tiles. A filled slot shows a dark icon tile, the slot name, the item name, its stats (bonus, Damage and Reach for weapons) and **Unequip**; an empty slot shows a dashed outline and "Empty" in italics. Each carried tile is a button (`aria-pressed`) showing an icon by kind (weapon, outfit, talisman, Consumable, key item) and the name, "×N" when the quantity is above 1, a ✦ marker for magic items and an "equipped" ribbon for items in a slot. The detail pane shows the selected tile (the first item by default): the name, quantity and magic marker, the description in italics, chips for kind/slot, bonus, Damage and Reach or healing, and the item's real action (Equip, Unequip or Use); a disabled action shows its reason, and key items have no action. The selected tile rides in the URL (`?panel=inventory&item=`), so Equip, Unequip and Use — and their rejection notices — land back with the modal still open and the same tile selected (or the first item, when the selected one is gone). Two columns on desktop, stacked on phones; focus order is slots, then tiles, then the pane.
- **Magic** items carry a visual marker. It is not a separate kind or category.
- Equip and unequip are available in the Location view and during a Scene, never in Combat. Using a Consumable outside Combat is available below full Health.

The Character and Inventory modals open over the game screen. Each closes with a close button, Escape or a backdrop click; focus is trapped while open, returns to its launcher on close, and the background does not scroll. The open modal is part of the URL (for example `?panel=character|inventory`), replacing the previous `?tab=`: Equip, Unequip and Use, and their rejection notices, land back on the game screen with the Inventory modal still open and the notice visible. Without JavaScript the launchers are plain links and the requested panel renders open from the URL.

On phones the status card and the launchers replace the compact summary, and a fourth **Map** launcher (phone only) opens the map in a modal. Map travel from that modal works as from the inline map. Modals are full-screen on phones.

There is no "View journal" link above the narration in the reading column; the Ending screen keeps its "View journal" button.

### Location map

- Nodes are placed by the Locations' `map` coordinates (0–100, origin top left, y down), scaled into a map area with a **fixed aspect ratio** set by the engine. A Location without coordinates gets a fallback placement: near the average position of the Locations it connects with in either direction, or the centre if none has coordinates.
- The map is drawn on a plain surface. There is no background image.
- **Nodes**: visited Locations, plus Locations revealed by `reveal`. A revealed but unvisited Location is drawn as "heard of" (dashed, muted label) and has no line to it until a known Connection leads there. Unvisited targets of Connections are not drawn.
- **Lines**: one for each currently visible Connection from a **visited** Location to a Location on the map. A pair of opposite Connections is one plain line; a lone one-way Connection is an arrow. Connections hidden by an unmet Condition are not drawn.
- **Current Location**: a pulsing ring and a "You are here" label.
- **Travel**: in the Location view, the targets of visible Connections from the current Location are highlighted and clickable. A map click is exactly equivalent to the matching exit button, including on-enter Scene evaluation. No fast travel to non-adjacent Locations. No travel while a Scene or Combat is active.
- **Option, off by default**: an app-level setting that draws unvisited targets of visible exits as "?" nodes. Whether to enable it will be decided after the first playtests. It is not a Scenario field.

### Combat panel

During Combat, the reading column shows the Combat panel, while the side panel (map, status card, launchers) stays visible. It works with one or two Enemy participants ([mechanics.md](mechanics.md#participants)). The arena has a lane for each participant who started this Combat, including one defeated since; only survivors have Intents and can be targets. A Combat started or re-entered with one survivor has one lane, one bubble and an implicit target. Top to bottom:

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
- Each button is a plain form posting `combat`, `target` (targeted actions) and `item` (Consumables), with the `step`. Below its label it shows: the Speed; its place in the Round's order ("acts 2nd of 3"), which depends only on the Speed and so is exact before the target is chosen; for a rolled action, the 2d6 threshold ("needs 9+"); and for a targeted action, the target ("→ Grey Wolf B"). Thresholds read the current state; Escape's +2 is retained from the Round as shown when the Character commits, while the opposing Agility of Escape and Fall back is re-read when the action resolves ([mechanics.md](mechanics.md#validity-when-the-actions-turn-comes)). No percentages are shown.
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

After Combat, the victory or escape Outcome is shown as a result panel, or the brief Enemy-defeated notice when the Encounter has no victory Outcome. The last round's callout is part of that result panel, so the round that ended the fight is readable without opening the Journal.

The Combat panel renders legacy single-Enemy rounds of an already-started Combat (migrated, [playthrough-state.md](playthrough-state.md#state-versions-and-migration)) in the log as their stored text, verbatim, one line per round; the legacy guard marker is not shown.

## Journal (`/play/[playthroughId]/journal`)

A read-only list of the Journal entries, newest first: intro, narration, Choices taken, Tests with dice, Outcomes, state changes, travel, Combat start, rounds and end, and the Ending. It is text-only. It is available during play and after the end. Each entry shows its label and the step that produced it, and the header shows the total entry count, or "Nothing has happened yet." for an empty Journal.

Every "View journal" link that sits next to play opens the Journal in a modal over the current screen instead of navigating away, so the reader can look back and return to play exactly where they were: the game screen, the Ending screen, and the read-only screen of an incompatible Playthrough whose Scenario is still in the collection. The modal header names the Journal, shows the total entry count and offers an "Open in new tab" link to the standalone Journal page. Inside the modal the Journal behaves as on the full page: newest first, older entries loading automatically towards the first entry, and the sticky position indicator, all scrolling within the modal. The modal closes on its close button, the Escape key and a backdrop click; it traps focus while open and returns focus to the "View journal" control on close, and the background scroll is locked while it is open. The game screen underneath is never reloaded and keeps its state, including an undismissed result panel. The "View journal" control itself is a plain link to the Journal URL, so navigating directly to that URL, reloading it, or following the link without JavaScript all show the full standalone Journal page.

Opening the Journal (in the modal or on the standalone page) shows the newest batch of entries at the top. Scrolling towards the bottom loads older entries automatically and appends them below, with a visible loading state, until the very first entry (the intro) is reached; there loading stops and the list says the start of the Journal has been reached. Batches are addressed by a cursor on the entry sequence ("entries older than X"), not by page number or offset, so entries appended during play never shift or duplicate what is already on screen. Without JavaScript, an "Older entries" link at the bottom of the list walks the whole Journal batch by batch.

A sticky position indicator stays visible at the top of the list's scroll container (the modal body in the modal, the window on the standalone page). It names the step and the sequence position (out of the total entry count) of the entry at the top of the viewport (for example "Step 12 · entry 37 of 134"), with a thin progress bar showing how far into the Journal the reader has scrolled by entry count against the total, not the number loaded so far. The indicator stays correct as older batches are appended; an empty Journal shows no indicator and reads "Nothing has happened yet.". The position is plain text (not a live region, so scrolling does not flood screen readers) and the bar is decorative. Without JavaScript the page still renders; the indicator keeps its server-rendered first entry.

- Entry type labels and the wording of engine-generated entries come from the catalogue of the **current** Interface Language, so after a switch the whole Journal's Interface Text is in the new language ([playthrough-state.md](playthrough-state.md#journal)).
- Scenario text (narration, Choice wording, Ending title and narration, and names inside engine messages) is shown as it was presented, so after a switch the Journal shows Scenario text in more than one language. Each element holding it carries the entry's recorded `lang`; a name inside an engine message is wrapped in its own element with that `lang`.
- Entries stored before Interface Languages existed are shown verbatim, in English, with only their type label from the catalogue.
- A **Combat round** entry reads like the Combat panel's "Last round" callout ([Log](#log)): one numbered line per action in Round order, with the actor, the action or Intent and its target, the Speed, the status, the roll and result and any nested counterattack, then how the sequence stopped. Participants are named as presented, with the letter from their ordinal. Combat start and Combat end list the participants in participant order. Single-Enemy Combat entries stored before the tactical rules (text, one Range, a guard marker) are shown verbatim, like the other legacy entries.
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
- Combat round messages, roll lines, the Combat panel's labels, the lane arena, Intent names and bubbles, Speeds, places in the order, target picker, state badges (prepared, Wary, Defeated), thresholds and cancellation reasons;
- inventory and state-change wording ("received", "lost", Health gained or lost, …);
- disabled-action reasons, in inventory and in Combat;
- the names of the engine's own vocabulary: Attributes, Difficulty levels, Ranges, Reach, Equipment slots, Victory and Defeat. These are never shown as raw ids;
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
| Range: Near, Far | Dystans: Blisko, Daleko |
| Reach: melee, ranged | Zasięg: wręcz, dystansowy |
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

Polish terms for the tactical Combat vocabulary (Speed and its three values, the Intents, Guarded, Wary, participant) are still to be chosen with the Interface Language effort and will be added to this table.

## Notices

Rejected actions refresh the current state and show a transient notice, such as "The game was advanced in another tab; this is its current state" or "That action is no longer available". There is no error page.

## Mockups

| Mockup | Shows | Run |
|---|---|---|
| [Game screen layout](mockups/game-screen-layout/) | Collection, Character creation, play, inventory, Test feedback, Journal, Endings, Illustration on/off; variants A (selected), B, C | `python3 docs/spec/mockups/game-screen-layout/serve.py`, then open `http://127.0.0.1:4310/?variant=A` |
| [Combat presentation](mockups/combat-presentation/combat-presentation.prototype.html) | three Combat presentations; **B** (Range zones) is selected; its `CombatCore` module implements the Combat rules | open the file; `?variant=A\|B\|C` or the arrow keys |
| [Location map](mockups/location-map/location-map.prototype.html) | four map presentations; **B** (author coordinates) is selected | open the file; `?variant=A\|B\|C\|D` |
| [Tactical Combat](mockups/tactical-combat/tactical-combat.prototype.html) | three tactical Combat presentations with one or two Enemies (duel, two melee, melee/ranged, same kind), a rules engine, the round report and Journal; **A** (lanes and target picker) is selected | open the file; `?variant=A\|B\|C` or the arrow keys |
| [Language switcher](mockups/language-switcher/language-switcher.prototype.html) | three switcher and availability presentations; **B** (language menu, with flags) is selected | open the file; `?variant=A\|B\|C` or the arrow keys |

The mockups are throwaway specification artifacts, not application code, and must not be imported into `src/`.

## Sources

- [Game screen layout: narration, choices, Character sheet, inventory](https://github.com/lbacik/simple-rpg-engine/issues/10#issuecomment-6099406829)
- [Combat presentation: abstract exchange vs simple grid board](https://github.com/lbacik/simple-rpg-engine/issues/9#issuecomment-6099395150)
- [Location map: auto-laid-out graph vs author-provided coordinates](https://github.com/lbacik/simple-rpg-engine/issues/11#issuecomment-6099544434)
- [Scene illustration assets: authoring, references and loading contract](https://github.com/lbacik/simple-rpg-engine/issues/14#issuecomment-6099824478)
- [Architecture: engine boundaries, persistence and Session handling in Next.js](https://github.com/lbacik/simple-rpg-engine/issues/8#issuecomment-6099767575) (routes, rejection notices)
- [Interface text catalogue](https://github.com/lbacik/simple-rpg-engine/issues/60) (Interface Text, `lang`, Polish terms)
- [Journal across languages](https://github.com/lbacik/simple-rpg-engine/issues/61) (Journal rendering after a language switch)
- [Language switcher and availability UX](https://github.com/lbacik/simple-rpg-engine/issues/62) (language menu, flags, collection groups, fallback badge)
- [Prototype: readable intents, targets and action order for two Enemies](https://github.com/lbacik/simple-rpg-engine/issues/82) (lane arena, Intent bubbles, order strip, target picker, round report, Combat Journal entries)
- [Active Combat roster and compatibility after participant reordering or revival](https://github.com/lbacik/simple-rpg-engine/issues/116) (persistent defeated lanes and saved Round ties)
- [Prototype: tactical Combat balance and meaningful action trade-offs](https://github.com/lbacik/simple-rpg-engine/issues/83) (Heavy attack +3 and commitment-time Escape bonus)
