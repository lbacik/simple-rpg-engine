# Playthrough state

The domain state of a Playthrough and the semantics of every player action. Storage, transactions and Session ownership are in [architecture.md](architecture.md); content meaning is in [content-semantics.md](content-semantics.md).

## Model

- The Playthrough's **current state snapshot is the source of truth**. Each successful player action replaces it atomically.
- Alongside it, the **Journal** is an append-only, read-only record of what was presented. It never drives play. Event sourcing with replay was rejected because replay depends on unchanged Scenario content.
- Stored state refers to Scenario content **only by ID** (Location, Scene, (Scene, Choice), Encounter, (Encounter, participant), item, slot, Flag, Character Template, Ending). This keeps the compatibility check of [ADR 0001](../adr/0001-content-compatibility-by-reference-check.md) mechanical.

## Lifecycle

- Two statuses: **`active`** and **`ended(endingId)`**. The kind (victory or defeat) comes from the Ending. Death is ending on the Scenario's death Ending.
- A Playthrough is created only when the player confirms a Character Template and a name. There is no draft state.
- There is no "abandoned" status. Starting another Playthrough leaves earlier ones `active`. A Session may hold any number of Playthroughs.
- Playthroughs cannot be deleted.
- **Incompatible** (content changed so that a stored ID no longer exists, or the Scenario left the collection) is derived when the Playthrough is read; it is not a status (see [architecture.md](architecture.md#content-compatibility)).

## Stored and derived state

| Area | Stored | Derived |
|---|---|---|
| Identity | `schemaVersion` (3); Scenario id; content `version` and content hash pinned at creation (updated when a reference check passes); status; `step` counter | |
| Character | Template id, name, **copy of the base Attributes at creation**, current Health | effective Attributes (base + Equipment, +2 cap per Attribute); maximum Health (40, the hero profile's) |
| Inventory | item id → quantity ≥ 1 (entries at zero are removed) | |
| Equipment | slot → item id, pointing at a held item | Attribute bonuses |
| Position | one of: **Location view** (Location); **Scene active** (Location, Scene); **Combat** (Location, Combat); **Ended**. The current Location is always stored. | |
| Exploration | `visited` Location set; `revealed` Location set | map nodes, drawn Connections, highlighted travel targets |
| Scenes and Choices | set of fired Scene ids; set of taken `once` Choices as (Scene id, Choice id) | on-demand Scenes on offer; visible Choices |
| Flags | set of Flags currently true | |
| Encounters | per Encounter id, created on its first `start-combat`: **Damage taken per participant id**, with an entry, 0 included, for every participant the Encounter had at creation | each participant's remaining Health (its profile's maximum − taken) and defeated (remaining ≤ 0); the Encounter is defeated when every participant is. An Encounter without a record is at full Health, and so is a participant without an entry (one added to the content later). |
| Active Combat | Encounter id and the active `CombatState` ([combat-contract.md](combat-contract.md)): actors `h01`/`c01`/`e01`–`e05` with an opaque `ref` each, engagements, frozen plans and the log | arena membership, Health, frozen plans and legal options from the Combat state; `h01.hp` is authoritative during Combat, and `character.health` and wounds are written once, when the Combat ends |
| Companion | the Companion id, if one is present; the ids of lost Companions | |
| Journal | append-only entries: Scenario text as presented, engine events, and the language of each | the outcome modal; the intro display; all Interface Text in it |

Notes:

- **Equipment is a pointer, not a copy.** An equipped item counts towards its held quantity. Removing one of two copies leaves it equipped; removing the last copy unequips it first.
- **Participant identity is (Encounter id, participant id).** Two Encounters with the same Enemy are independent, and so are two participants of the same Enemy kind in one Encounter. Storing only Damage taken makes "defeated" impossible to desynchronise, for a participant and for the Encounter.
- **Only `CHOOSE` and `FINISHED` are persisted**, with their frozen plans. Round effects never leave the core. Reading or importing `CHOOSE` recomputes the plans and requires exact equality; a mismatch is rejected and plans are never replaced.
- **No display text is stored in Combat state.** Actors carry an opaque `ref` the rules never read: participant ids for enemies, the Companion id for `c01`, null for `h01`. Names come from content at render.
- **Actor ids are positional**: `h01`, `c01`, `e01`–`e05`, assigned in the explicit authored order of the opponents. Targets, wounds and stored Combat state refer to participants by id via `ref`, never by position.
- **An Encounter record lists every participant from its creation**, so a participant added to the content later is recognisable as new ([Content compatibility](architecture.md#content-compatibility)). A participant with 0 Damage taken is at full Health.
- **Flags all start false.** There are no counters.
- The base Attributes are copied so that later Template edits do not change an existing Character.

## Actions and the `step` guard

- `step` starts at 0 and increases by one with every successful player action.
- Every action carries the **expected `step`**. If it does not equal the stored `step`, the action is rejected as stale.
- Every action must also be legal in the **current position**. Otherwise it is rejected. A rejected action changes nothing and does not advance `step`.
- Conditions are evaluated live: when rendering and again when an action is submitted.
- Nothing is accepted once the Playthrough is `ended` or incompatible.

| Action | Legal when | Result |
|---|---|---|
| **Choose** (Choice id) | Scene active; the Choice belongs to it and is visible (its `when` holds, and it is not a taken `once` Choice) | records a taken `once` Choice, resolves the Test if any, applies the Outcome |
| **Continue** | Scene active and no Choice is visible (implicit Continue) | applies the empty Outcome: back to the Location view |
| **Travel** (target Location id) | Location view; a visible Connection from the current Location leads there | enters the target Location |
| **Open Scene** (Scene id) | Location view; an `on-demand` Scene of the current Location whose `when` holds and which is repeatable or not yet fired | activates the Scene |
| **Equip** (item id) | Location view or Scene active; the item is held Equipment | puts it in its slot, replacing whatever was there |
| **Unequip** (slot) | Location view or Scene active; the slot is occupied | empties the slot |
| **Use item** (item id) | Location view or Scene active; a held Consumable; Health below maximum | heals, consumes one copy; position unchanged |
| **Combat command** (round, stance, action, target actor id) | Combat in `CHOOSE`; the command is legal per `listOptions` ([combat-contract.md](combat-contract.md)) | resolves one Combat Round; a rejection returns a reason code and changes nothing, without advancing `step` |
| **Surrender** | Combat in `CHOOSE` | ends the Combat as `LOSS_SURRENDER` |

A Combat command carries the Round, the stance, the action and the target actor id; the core derives the movement variant (`JOIN`/`ENGAGE`) from range at choice time. Surrender is available in `CHOOSE` only.

Travel identifies a Connection by its target: every visible Connection to the same target has the same effect. Equip, Unequip and Use item outside Combat each advance `step` and append an inventory Journal entry.

### Two kinds of "Continue"

- The **implicit Continue** of a Scene with no visible Choice is a domain action: it advances `step`.
- The **Continue after reading a Test or Outcome result** is client-side only: a plain link to the same game page carrying the current `step` (for example `?seen=<step>`). The Outcome was already applied when the Choice was made, so following the link changes no game state and does not advance `step`. When the parameter equals the Playthrough's current `step`, the server skips the outcome modal and renders the position; a value that does not match is ignored. After a reload without the parameter the outcome modal may be shown again, which is harmless. There is no persisted "awaiting Continue" state.

### Outcome modal

The outcome presentation is derived from the Journal entries of the **latest step**, taking only these types, in order: Test, Outcome narration, state change, the Combat round that ended a Combat (win, surrender or draw), and Combat end. Scene narration, travel, Combat start and the other Combat rounds are not part of it; they are revealed after acknowledgement through the existing engine sequence (the Scene, the Location view or the Combat panel). The intro is not part of it either: at the start of a Playthrough it shows in a modal over the starting Location instead (see below). If the latest step produced none of these types (for example an empty Outcome), there is no outcome modal, and the new position is shown directly. A step that ended the Playthrough keeps its presentation: the modal shows it over the Location, and acknowledgement reveals the Ending screen through the existing engine sequence.

While the outcome presentation is unacknowledged, it shows in a modal over the Playthrough's current Location: the reading column holds the destination Location (after a `move`, the new Location; otherwise the current one) with its actions inert and no map travel, and the modal holds the entries with Continue. The following Scene, Combat panel or Ending screen is not rendered until the player continues. The side panel (map, Character, Inventory) and any transient notice stay visible throughout. This applies to every Outcome presentation: after a Choice or Test, and after Combat ends. Any dismissal of the modal (Continue, the close control, the Escape key, a backdrop click) is the same acknowledgement: it changes no game state, repeats no Effects, rerolls no Test and appends no Journal entries.

At the start of a Playthrough with an intro, the starting Location renders beneath an intro modal holding the intro narration, with no actionable Location forms behind it and no map travel. The modal's Continue (and any dismissal of it: the Escape key, a backdrop click) is the same client-side `?seen=<step>` acknowledgement as the outcome modal's Continue: it changes no game state, repeats no Effects and appends no Journal entries, and a reload without the parameter shows the modal again. A pending on-enter Scene of the starting Location stays in state and renders after acknowledgement through the existing engine sequence. A Scenario without an intro opens directly in its normal initial position with no modal.

The modal renders its entries as the Journal does. When the Interface Language changed after the step (for example a switch before Continue, then a reload), its narration stays in the language it was presented in, with that `lang`, while its Test and state changes follow the new Interface Language. Narration is not re-read from content.

## Transitions

### Starting a Playthrough (one atomic step)

1. Create the Character from the Template: name, a copy of the base Attributes, Health 12, the starting items with quantities, and the Template's Equipment equipped.
2. Set `step` to 0, the current Location to the starting Location, and empty Flags.
3. Append the intro to the Journal, if the Scenario has one. (It is displayed in a modal over the starting Location.)
4. Enter the starting Location (below).

### Entering a Location

At start, by Travel, or by `move` (including `move` to the current Location):

1. Set the current Location and add it to `visited`.
2. Append a travel entry to the Journal (except at start).
3. Activate the first `on-enter` Scene of the Location, in listed order, whose `when` holds and which is repeatable or not yet fired. With none, the position is Location view.

### Activating a Scene

On entering (on-enter), by Open Scene (on-demand), or by `next` (follow-on):

- `next` to a non-repeatable Scene that has already fired is a **no-op**: the position becomes Location view.
- Otherwise the Scene is added to the fired set **at activation**, so a reload cannot fire it twice. The position becomes Scene active, and the Scene narration is appended to the Journal.

### Applying an Outcome

1. Append the Outcome narration, if any, to the Journal.
2. Apply the Effects in order:

   | Effect | State change |
   |---|---|
   | `set-flag` / `clear-flag` | add to / remove from the true set (idempotent) |
   | `give-item` | quantity + n; never equips |
   | `take-item` | quantity − min(n, held); at zero, unequip first, then remove the entry |
   | `heal` | Health = min(12, Health + n); a no-op at full Health |
   | `damage` | Health − n; at ≤ 0, set Health to 0, skip the remaining Effects and the transition, and end on the death Ending (appending the Ending entry) |
   | `reveal` | add the Location to `revealed` (a no-op if visited) |

   Each state change is appended to the Journal (for example "received: rope", "−3 Health"), except a Flag change: Flags are the author's internal memory, their ids are not text, and they are never presented to the player. The engine reports every state change as a structured value (kind, content ids, numbers), the Journal stores it as such ([Journal](#journal)), and its wording comes from the Interface Text catalogue when it is shown ([architecture.md](architecture.md#interface-text)).
3. Apply the transition:

   | Transition | Result |
   |---|---|
   | `next` | activate the Scene |
   | `move` | enter the Location |
   | `start-combat` | start the Combat (below) |
   | `end` | `ended(endingId)`; append the Ending to the Journal |
   | none | Location view of the current Location; on-enter Scenes are not re-evaluated |

### Combat

One standalone MVP Combat per Encounter ([combat-contract.md](combat-contract.md), [ADR 0010](../adr/0010-campaign-health-is-the-hero-combat-hp.md)):

- **`start-combat: E`**:
  - if E is defeated, it is a no-op: no fight, no victory Outcome, Location view;
  - otherwise create E's record if absent, add an entry of 0 for each participant without one, build the initial Combat state from the Encounter's authored arrangement and the Playthrough (Health enters at its current value; the Companion, if present, enters at full HP and stamina in the hero's group), and append the opening narration to the Journal. A repeat fight after surrender or draw includes only the survivors, in the authored arrangement, keeping their wounds; everything else (groups, engagements, `phaseOffset`, `power`, `waitAge`, stance, Prepare) restarts.
- **Each Combat Round** is one `step`. Unless the Combat or the Playthrough ends, the Round resolves through the core and the next Round's plans are stored. It appends one `combat-round` entry (`version: 3`) with the core's typed events for that Round plus the actor-to-`ref` mapping ([Journal](#journal)).
- A **rejected** Combat command changes nothing: the Round, the frozen plans and `step` stay as they were.
- **Result routing**: `WIN` applies the `victory` Outcome (or, when there is none, play returns to the Location view); `LOSS` ends the Playthrough on the death Ending; `LOSS_SURRENDER` applies the required `surrender` Outcome; `DRAW_LIMIT` applies the required `draw` Outcome. Surrender and draw leave the Encounter undefeated, writing Health and wounds back exactly as a surrender does.
- **Character death**: Health 0, then `ended(death Ending)`, appending the Ending entry. A Companion at 0 HP in Combat is lost permanently instead: removed from the Playthrough, recorded as lost, and the fight continues.

An Arena fight is not Playthrough state: it runs from an Arena Setup in its own versioned run document, never in a Playthrough row, and its `WIN` / `LOSS` / `LOSS_SURRENDER` / `DRAW_LIMIT` applies no Outcome and reaches no Ending. There is no Combat restart in a Playthrough; Scenario play offers export of the current Combat state for Arena replay instead.

Defeat and victory are derived from wounds and the current content, not a stored victory marker. With unchanged content an Encounter stays defeated and its victory Outcome is applied at most once. Outside an active Combat, a content change that raises a profile's maximum above a participant's Damage taken may revive it; a later `start-combat` then fights the survivors, and defeating the Encounter applies its victory Outcome again, including its Effects. This does not reopen an ended Playthrough. A participant of an active Combat that disappears from the content makes the Playthrough incompatible instead ([architecture.md](architecture.md#content-compatibility)).

## State versions and migration

Recorded in [ADR 0005](../adr/0005-playthrough-state-migrated-by-the-engine-on-read.md), as amended for the MVP 1.0 rules.

- The state document carries a **`schemaVersion`**. The current Playthrough document is **`schemaVersion` 3** ([combat-contract.md](combat-contract.md#playthrough-schemaversion-3)). The key `stateVersion` is never written again.
- Each stored version is validated **strictly against its own schema**, then migrated one version at a time to the current one, then validated against the current schema. A document with an unknown or newer version is an error, never downgraded or guessed. A wrong `rulesVersion` or a frozen-plan mismatch makes the Playthrough read-only with its Journal; plans are never repaired.
- Migration is a **deterministic** engine function of the stored document and the current Scenario. It draws no randomness, so repeating it gives the same result, and a current document is returned unchanged.
- It runs when a Playthrough is read (page or action), before the reference check and before `applyAction`. A migrated Playthrough that is compatible is written back with the pin, in the same `step`-guarded update, without advancing `step` and without a Journal entry. An incompatible one is never written back, so it recovers if the content is restored. If a turn commits between the read and the write-back, the fresh row is used instead.
- The database schema does not change for a state version: the state stays in the `state` JSON column ([architecture.md](architecture.md#persistence)).
- Pre-v0.6.0 game data is **discarded, not migrated**: the v0.6.0 release deletes every Playthrough and Journal entry ([ADR 0009](../adr/0009-game-data-from-earlier-combat-rules-is-discarded-at-release.md)). There are no retired Playthroughs and no v1/v2 Combat renderers. The v1→v2 migration and the tactical compatibility examples below are historical.

### Version 1 to version 2 (historical)

Kept for provenance only. The v1 single-Enemy state mapped onto the tactical v2 state; both are discarded by the v0.6.0 release and never migrated. Do not implement from this section.

| Version 1 | Version 2 |
|---|---|
| Damage taken `n` for Encounter E | E's record `{ p: n }`, where `p` is E's only participant in the current content |
| active Combat {E, Range r, round k} | active Combat {E, round k, starting membership [`p`], Round tie-break order [`p`], participant `p`: Range r, an Intent selected now, not prepared, not Wary} |
| everything else | unchanged |

- The participant id comes from the current content, because version 1 stores no Enemy id. It is unambiguous while E has one participant. If E no longer exists, or now has two participants, the stored Damage cannot be assigned and the Playthrough is **incompatible**. Its read-only views use the parts that need no assignment (Character, inventory, map, Ending) and its Journal.
- The migrated Combat's Intent is selected by the ordinary rules **without rule 3**: a `heavy` Enemy does not draw to Prepare in this first Round, so the selection needs no randomness. From the end of that Round on, selection is unchanged.
- Nothing resolves during migration: the Character gets no free action and the Enemy no free attack. The next Combat action resolves round k as an ordinary tactical Round, with the Character's Health, inventory, wounds, round number and `step` as they were. The old Defend bonus expired within its own turn, so nothing of it carries over.
- Version 1 Playthroughs in other positions (Location view, Scene, ended) only have their Encounter records mapped. A Playthrough whose Scenario has left the collection is not migrated: only its Journal is shown.

Example, a Playthrough in a Combat with the wolf, before and after:

```jsonc
// version 1
{ "stateVersion": 1, "step": 41, "encounterDamage": { "hollow-wolf": 3, "camp-bandit": 0 },
  "activeCombat": { "encounterId": "hollow-wolf", "range": "near", "round": 4 }, … }
// version 2 (layout illustrative; the contents are normative)
{ "stateVersion": 2, "step": 41,
  "encounters": { "hollow-wolf": { "grey-wolf": 3 }, "camp-bandit": { "bandit-archer": 0 } },
  "activeCombat": { "encounterId": "hollow-wolf", "round": 4,
    "startedParticipants": ["grey-wolf"], "roundParticipantOrder": ["grey-wolf"],
    "participants": { "grey-wolf": { "range": "near", "intent": "strike", "prepared": false } } }, … }
```

### Combat compatibility acceptance examples (historical)

These tactical examples are kept for provenance only; the release discards pre-v0.6.0 saves instead of migrating them. Field names remain illustrative; the v3 compatibility rules are in [architecture.md](architecture.md#content-compatibility).

| Case | Required result |
|---|---|
| Two wolves start; `wolf-a` falls while `wolf-b` survives; reload | Starting membership still contains both ids. Only `wolf-b` has active action state and is targetable; `wolf-a` has a grey defeated lane, reconstructed without the Journal. |
| Escape from that Combat, then re-enter | Both wounds are kept; starting membership, active state and Round tie-break order contain only `wolf-b`. No lane for `wolf-a`. |
| Reverse two equal-priority participants in content after their Intents were selected | The current Round uses its saved tie-break order, including after a reload or rejection. Cleanup selects next Intents in the new content order and saves that order for the next Round. |
| Raise a defeated participant's maximum Health above its Damage taken while another participant is still fighting | The current living participant set no longer matches active action state: incompatible, read-only, no rewritten state or Journal and no new action or Intent. Restoring content restores compatibility. |
| Revive a defeated Encounter by changing content outside Combat in an active Playthrough | A later start fights only current survivors with recorded wounds. Its next victory applies the victory Outcome and Effects again. No persistent reward/victory marker is introduced. |
| Migrate a version 1 active Combat with one participant in current content | Starting membership and Round tie-break order are both [`p`]. Preserve Range, round, Health, wounds, inventory and `step`; select the deterministic initial Intent without a Prepare draw. No action resolves and no Journal entry is appended. |

## Journal

Recorded in [ADR 0004](../adr/0004-journal-stores-events-and-scenario-text-as-presented.md).

- Each entry stores its type, the `step` that produced it, and the **language of the Scenario text in effect** when it was presented (`lang`: the `language` of the Translation shown, or the Base Language). Every entry records it, including entries that hold no Scenario text, since the language cannot change within a step.
- **Scenario text is stored as presented**: narration with `{name}` substituted, Choice wording, an Ending's title and closing narration, and the Scenario names an engine event mentions (item, Enemy, Location, weapon). It stays in the language it was shown in, and so stays true when Scenario content or the Interface Language changes later. After a language switch the Journal holds Scenario text in more than one language.
- **Engine-generated entries are stored as structured events**: a kind, the content ids, the numbers, and the names as presented. They are never stored as Interface Text. They are rendered when read, through the catalogue of the current Interface Language ([architecture.md](architecture.md#interface-text)), so all Interface Text in the Journal follows the current Interface Language, including in old entries.
- Rendering an entry needs only the entry and the catalogue, never the Scenario content. Ids are kept for mechanical use, such as telling the actors of a Combat round apart, and are never resolved to names when read.
- An event shape changes only together with a migration that rewrites the stored rows, so every stored entry stays renderable.
- **Entries stored before this rule** hold English text and no language. They are kept, tagged `en` (the Base Language of every Scenario at the time), and shown verbatim, with only their type label from the catalogue.
- Adding, changing, rejecting or outdating a Translation never changes stored entries.
- The Journal is text-only; it records no Illustrations.
- Entry types, with what each stores beyond type, `step` and `lang`:

  | Type | Scenario text as presented | Event data |
  |---|---|---|
  | intro | narration | |
  | Scene narration | narration | Scene id |
  | Choice taken | Choice wording | Scene id, Choice id |
  | Test | | Attribute, Difficulty, both dice, modifier, total, success or failure |
  | Outcome narration | narration | |
  | state change from an Effect, other than a Flag change | item name, for item changes | kind (item received or lost, Health gained or lost), item id, amount |
  | travel | target Location name | target Location id |
  | Combat start | opening narration; the name of each participant taking part, and the Companion if present | Encounter id; the participants taking part, in participant order |
  | Combat round (`version: 3`) | participant names | Encounter id, round; the core's typed events for that Round plus the actor-to-`ref` mapping, rendered from the catalogue on read (below) |
  | Combat end | the participant names | Encounter id, how it ended (`win`, `surrender` or `draw`); a `LOSS` is followed by an `ending` entry, as death is today |
  | Companion joined / left / lost | the Companion name | Companion id |
  | inventory action outside Combat | item name | kind (equipped, unequipped, used), item id, Health restored |
  | Ending, appended whenever the Playthrough ends, by `end` or by death | title, closing narration | Ending id, kind (victory or defeat) |

### Combat events

The v3 Combat entries above project the core's typed events ([combat-contract.md](combat-contract.md#event-types)) into the Journal; text is rendered from the catalogue on read. The tactical event shape below (Speeds, 2d6 thresholds, Guarded/Wary, counterattacks, ordinals) is historical and kept for provenance only; pre-v0.6.0 entries are discarded by the release ([ADR 0009](../adr/0009-game-data-from-earlier-combat-rules-is-discarded-at-release.md)).

- A **participant reference** in an event is the participant id, its Enemy id, the Enemy name as presented and an **ordinal**: its 1-based position among the participants of the same Enemy kind in its Encounter, or none when the kind is unique there. The ordinal lets the Interface Text tell two grey wolves apart without authored names; how it is worded is presentation.
- Each action of a Combat round records:
  - its **actor** (the Character or a participant reference), its action or Intent kind and its Speed, in the Round's order;
  - its **target**, for a targeted Character action (Intents always target the Character);
  - its **status**: executed; cancelled with a reason (interrupted, target defeated, out of Reach, already Near, none Near); dropped (actor defeated); or not reached (the sequence stopped earlier);
  - for an executed action, what it did: the roll (both dice, modifier, total, target number, success), Damage dealt and to whom, Range changes (participant, before, after), Health restored and the item used, effects applied (Guarded, Wary with its last round, prepared, a target's Intent interrupted), participants defeated by it, and Escape success;
  - a **counterattack** reaction inside the action it answers, with its roll, its Damage and any defeat.
- Display text is not stored in these events, only names as presented ([ADR 0004](../adr/0004-journal-stores-events-and-scenario-text-as-presented.md)).
- Single-Enemy Combat entries already stored (`combat-start`, `combat-round`, `combat-end`, `enemy-defeated` with an English `text`, one Range and a `guard` marker) were kept unchanged and shown verbatim under the retired rules. They are discarded by the v0.6.0 release together with every other pre-v0.6.0 Journal entry, so no legacy renderer is kept. Entries written from v0.6.0 carry the v3 shape above.

## Ended Playthroughs

`ended` is **frozen**: every action is rejected, which also rules out healing a dead Character. These views remain, read-only:

- the Ending (kind, title and closing narration);
- the final Character sheet and inventory;
- the Journal;
- the map.

## Invariants

- Character Health is always 0–40, and Character Health 0 always goes with `ended(death Ending)`.
- Every equipped item is held and fits its slot.
- With unchanged content, a defeated Encounter never re-enters Combat and its `victory` Outcome applies at most once. Content-driven revival outside Combat follows the exception above.
- A non-repeatable Scene activates at most once, and a `once` Choice is taken at most once.
- Each Outcome application belongs to exactly one step-guarded action. A stale or duplicate submission cannot apply it twice; this does not prohibit a later victory after content-driven revival outside Combat.
- Nothing changes after `ended`.
- A frozen plan changes only by resolving or being cancelled within its Round; reading, reloading or a rejected action never re-selects it.
- Migrating a stored state resolves nothing and never advances `step`; migrating it again gives the same state.

## Sources

- [Playthrough state: exploration, inventory, persistent encounters and endings](https://github.com/lbacik/simple-rpg-engine/issues/13#issuecomment-6099619014)
- [Scenario validation rules and playability checks](https://github.com/lbacik/simple-rpg-engine/issues/7#issuecomment-6099876109) (implicit Continue when every Choice is hidden)
- [Normative Scenario YAML syntax and walk-through gaps](https://github.com/lbacik/simple-rpg-engine/issues/16#issuecomment-6100076156) (empty Outcome)
- [Architecture: engine boundaries, persistence and Session handling in Next.js](https://github.com/lbacik/simple-rpg-engine/issues/8#issuecomment-6099767575) (content hash pin)
- [ADR 0001: content compatibility by reference check](../adr/0001-content-compatibility-by-reference-check.md)
- [Journal across languages](https://github.com/lbacik/simple-rpg-engine/issues/61) (events, names and `lang` per entry, legacy rows)
- [ADR 0004: the Journal stores engine events and Scenario text as presented](../adr/0004-journal-stores-events-and-scenario-text-as-presented.md)
- [Encounter participants: stable identity, individual wounds and partial victory](https://github.com/lbacik/simple-rpg-engine/issues/80) (per-participant Damage taken, Encounter defeat — still current; its tactical ordering notes are superseded)
- [Tactical Combat content, state migration and compatibility contracts](https://github.com/lbacik/simple-rpg-engine/issues/81) (historical: stored tactical Combat, state versions and migration, action targets, Combat events)
- [ADR 0005: Playthrough state is migrated by the engine on read](../adr/0005-playthrough-state-migrated-by-the-engine-on-read.md)
- [Map: adapt Combat to simple-rpg-engine MVP with command-panel UI](https://github.com/lbacik/simple-rpg-engine/issues/179) (MVP Combat state, result routing and Journal: [#181](https://github.com/lbacik/simple-rpg-engine/issues/181), [#182](https://github.com/lbacik/simple-rpg-engine/issues/182), [#183](https://github.com/lbacik/simple-rpg-engine/issues/183); the tactical issues #77–#81, #84 and #116 below it are superseded)
