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
- **Character** modal: name, Template, Health out of 12, and the four **effective** Attributes, explaining Equipment bonuses (for example "Agility 3 (2 + 1 Hunter's Cloak)").
- **Inventory** modal: held items with quantities, inline item information (name, description, kind, slot, bonus, Damage and Reach for weapons, healing for Consumables) and the available actions: equip, unequip, use.
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

During Combat, the reading column shows the Combat panel, while the side panel (map, status card, launchers) stays visible:

- a **header**: a small uppercase kicker (`Combat · <Location name> · Round <n>`), the Encounter name as `h1`, then the opening narration (muted italic) and a bottom rule;
- a one-line **Range arena**: a bordered card with a ground line and the Range label (`NEAR` / `FAR`) at the bottom. Character and Enemy sit on one line as medallions (an initial in a coloured disc surrounded by a Health ring, red at low Health; name, `health/max` and the weapon/Reach/Damage line below, the Enemy's Reach and Damage). At **Near** the medallions stand side by side in the centre with a crossed-swords mark between them; at **Far** they sit at opposite edges with a `‹ — — Far — — ›` marker in the middle. A small "guard up" badge on the Character's ring shows when the latest round was a Defend. The marker is derived from that round's Journal entry: the Defend bonus is never stored, because it expires within the turn it was chosen, so the marker shows the guard that was in effect during the Enemy's response just resolved. Medallions animate on a Range change, honouring `prefers-reduced-motion`;
- actions in four columns: **Position** (Advance, Fall back), **Fight** (Attack, Defend), **Items** (one button per held Consumable, or "No Consumables held.") and **Leave** (Escape), with unavailable ones disabled and the reason given (for example "Your sword needs Near Range"). On phone width the columns become a 2×2 grid;
- a log of the rolls of the current Combat, newest first: a "Last round · `<n>`" callout holding that round's text and its rolls as chips, then the older rounds as a compact muted list ("No rolls yet." before the first roll). A roll reads `<name>: d1+d2+mod = total vs target — hit, N Damage | success | miss`; a hit that deals no Damage (Fall back, Escape) reads "success".

After Combat, the victory or escape Outcome is shown as a result panel, or the brief Enemy-defeated notice when the Encounter has no victory Outcome.

## Journal (`/play/[playthroughId]/journal`)

A read-only list of the Journal entries, newest first: intro, narration, Choices taken, Tests with dice, Outcomes, state changes, travel, Combat start, rounds and end, and the Ending. It is text-only. It is available during play and after the end. Each entry shows its label and the step that produced it, and the header shows the total entry count, or "Nothing has happened yet." for an empty Journal.

Every "View journal" link that sits next to play opens the Journal in a modal over the current screen instead of navigating away, so the reader can look back and return to play exactly where they were: the game screen, the Ending screen, and the read-only screen of an incompatible Playthrough whose Scenario is still in the collection. The modal header names the Journal, shows the total entry count and offers an "Open in new tab" link to the standalone Journal page. Inside the modal the Journal behaves as on the full page: newest first, older entries loading automatically towards the first entry, and the sticky position indicator, all scrolling within the modal. The modal closes on its close button, the Escape key and a backdrop click; it traps focus while open and returns focus to the "View journal" control on close, and the background scroll is locked while it is open. The game screen underneath is never reloaded and keeps its state, including an undismissed result panel. The "View journal" control itself is a plain link to the Journal URL, so navigating directly to that URL, reloading it, or following the link without JavaScript all show the full standalone Journal page.

Opening the Journal (in the modal or on the standalone page) shows the newest batch of entries at the top. Scrolling towards the bottom loads older entries automatically and appends them below, with a visible loading state, until the very first entry (the intro) is reached; there loading stops and the list says the start of the Journal has been reached. Batches are addressed by a cursor on the entry sequence ("entries older than X"), not by page number or offset, so entries appended during play never shift or duplicate what is already on screen. Without JavaScript, an "Older entries" link at the bottom of the list walks the whole Journal batch by batch.

A sticky position indicator stays visible at the top of the list's scroll container (the modal body in the modal, the window on the standalone page). It names the step and the sequence position (out of the total entry count) of the entry at the top of the viewport (for example "Step 12 · entry 37 of 134"), with a thin progress bar showing how far into the Journal the reader has scrolled by entry count against the total, not the number loaded so far. The indicator stays correct as older batches are appended; an empty Journal shows no indicator and reads "Nothing has happened yet.". The position is plain text (not a live region, so scrolling does not flood screen readers) and the bar is decorative. Without JavaScript the page still renders; the indicator keeps its server-rendered first entry.

- Entry type labels and the wording of engine-generated entries come from the catalogue of the **current** Interface Language, so after a switch the whole Journal's Interface Text is in the new language ([playthrough-state.md](playthrough-state.md#journal)).
- Scenario text (narration, Choice wording, Ending title and narration, and names inside engine messages) is shown as it was presented, so after a switch the Journal shows Scenario text in more than one language. Each element holding it carries the entry's recorded `lang`; a name inside an engine message is wrapped in its own element with that `lang`.
- Entries stored before Interface Languages existed are shown verbatim, in English, with only their type label from the catalogue.
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
- Combat round messages, roll lines, the Combat panel's labels, and the Range arena;
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

## Notices

Rejected actions refresh the current state and show a transient notice, such as "The game was advanced in another tab; this is its current state" or "That action is no longer available". There is no error page.

## Mockups

| Mockup | Shows | Run |
|---|---|---|
| [Game screen layout](mockups/game-screen-layout/) | Collection, Character creation, play, inventory, Test feedback, Journal, Endings, Illustration on/off; variants A (selected), B, C | `python3 docs/spec/mockups/game-screen-layout/serve.py`, then open `http://127.0.0.1:4310/?variant=A` |
| [Combat presentation](mockups/combat-presentation/combat-presentation.prototype.html) | three Combat presentations; **B** (Range zones) is selected; its `CombatCore` module implements the Combat rules | open the file; `?variant=A\|B\|C` or the arrow keys |
| [Location map](mockups/location-map/location-map.prototype.html) | four map presentations; **B** (author coordinates) is selected | open the file; `?variant=A\|B\|C\|D` |
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
