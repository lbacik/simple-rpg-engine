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
| Identity | `stateVersion`; Scenario id; content `version` and content hash pinned at creation (updated when a reference check passes); status; `step` counter | |
| Character | Template id, name, **copy of the base Attributes at creation**, current Health | effective Attributes (base + Equipment, +2 cap per Attribute); maximum Health (12); attack Damage and Reach (equipped weapon, or 2 / `melee`) |
| Inventory | item id → quantity ≥ 1 (entries at zero are removed) | |
| Equipment | slot → item id, pointing at a held item | Attribute bonuses |
| Position | one of: **Location view** (Location); **Scene active** (Location, Scene); **Combat** (Location, Combat); **Ended**. The current Location is always stored. | |
| Exploration | `visited` Location set; `revealed` Location set | map nodes, drawn Connections, highlighted travel targets |
| Scenes and Choices | set of fired Scene ids; set of taken `once` Choices as (Scene id, Choice id) | on-demand Scenes on offer; visible Choices |
| Flags | set of Flags currently true | |
| Encounters | per Encounter id, created on its first `start-combat`: **Damage taken per participant id**, with an entry, 0 included, for every participant the Encounter had at creation | each participant's remaining Health (its Enemy's maximum − taken) and defeated (remaining ≤ 0); the Encounter is defeated when every participant is. An Encounter without a record is at full Health, and so is a participant without an entry (one added to the content later). |
| Active Combat | Encounter id, round number; the participant ids that started this Combat; the participant-id tie-break order captured when the current Round's Intents were selected; and for each surviving participant: the Range to it, its committed Intent (the Intent kind only), whether it is prepared, and the last round of its Wary, if any | arena membership from the starting ids; each participant's Health and defeated state (from the Encounter record); each Intent's Speed, Damage and what a Prepare prepares (from the rules and the Enemy); the Round's order using the stored tie-break order; available Character actions with their Speed and targets |
| Journal | append-only entries: Scenario text as presented, engine events, and the language of each | the result panel; the intro display; all Interface Text in it |

Notes:

- **Equipment is a pointer, not a copy.** An equipped item counts towards its held quantity. Removing one of two copies leaves it equipped; removing the last copy unequips it first.
- **Participant identity is (Encounter id, participant id).** Two Encounters with the same Enemy are independent, and so are two participants of the same Enemy kind in one Encounter. Storing only Damage taken makes "defeated" impossible to desynchronise, for a participant and for the Encounter.
- **Round-scoped effects are never stored** (for example Guarded, and the once-per-Round counterattack). A whole Round resolves in one step, so an effect that expires at the end of its own Round never outlives it. The committed Intents, prepared states and effects lasting into the next Round are stored, so reading or reloading never re-selects or changes them.
- **No display text is stored in Combat state.** An Intent is stored as its kind (Strike, Close in, Prepare, Heavy attack); its Speed, Damage and wording are derived. A defeated participant loses its Range, Intent, prepared state and Wary, but its id remains in this Combat's starting membership until the Combat ends. Its Damage taken stays in the Encounter record. The engine projects its defeated arena lane from these ids and wounds, never from the Journal.
- **Round tie-break order is stored by participant id.** It lists the surviving participants in the content order used to select this Round's Intents. Reading, reloading, a rejected action or a content reorder does not replace it. Cleanup captures the current content order for the next Round's surviving participants before selecting their Intents. Speed and Agility remain derived, and the complete action order is fixed at commitment; the snapshot preserves participant ties, not old Enemy statistics.
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
| **Combat action** (defend, distract, attack, advance, use item, escape, fall back; with a target participant id for distract, attack and advance) | Combat; the action is available in the current state, including its target (see [mechanics.md](mechanics.md#character-actions)) | one Combat Round (see [mechanics.md](mechanics.md#rounds)) |

A Combat action's target is a participant id of the active Combat. With one surviving participant it may be omitted, and is then that participant; with two it is required for distract, attack and advance. A missing, unknown or defeated target, or a target on an action that takes none, is rejected. A submission rendered before this change (an action without a target, against a single participant) therefore stays valid, and the `step` guard rejects anything older than the current state.

Travel identifies a Connection by its target: every visible Connection to the same target has the same effect. Equip, Unequip and Use item outside Combat each advance `step` and append an inventory Journal entry.

### Two kinds of "Continue"

- The **implicit Continue** of a Scene with no visible Choice is a domain action: it advances `step`.
- The **Continue after reading a Test or Outcome result** is client-side only: a plain link to the same game page carrying the current `step` (for example `?seen=<step>`). The Outcome was already applied when the Choice was made, so following the link changes no game state and does not advance `step`. When the parameter equals the Playthrough's current `step`, the server skips the result panel and renders the position; a value that does not match is ignored. After a reload without the parameter the result panel may be shown again, which is harmless. There is no persisted "awaiting Continue" state.

### Result panel

The result panel is derived from the Journal entries of the **latest step**, taking only these types, in order: Test, Outcome narration, state change, the Combat round that ended a Combat (victory or escape), Combat end and the Enemy-defeated notice. Scene narration, travel, Combat start and the other Combat rounds are not part of it; they are shown by the new position itself (the Scene, the Location view or the Combat panel). The intro is not part of it either: at the start of a Playthrough it shows in a modal over the starting Location instead (see below). If the latest step produced none of these types (for example an empty Outcome), there is no result panel, and the new position is shown directly. A step that ended the Playthrough shows the Ending screen instead.

While the result panel is shown, the reading column shows **only** the panel and its Continue: the Location view, Scene, Combat panel and the "View journal" link are not rendered until the player continues. The side panel (map, Character, Inventory) and any transient notice stay visible throughout. This applies to every result panel: after a Choice or Test, and after Combat ends.

At the start of a Playthrough with an intro, the starting Location renders beneath an intro modal holding the intro narration, with no actionable Location forms behind it and no map travel. The modal's Continue (and any dismissal of it: the Escape key, a backdrop click) is the same client-side `?seen=<step>` acknowledgement as the result panel's Continue: it changes no game state, repeats no Effects and appends no Journal entries, and a reload without the parameter shows the modal again. A pending on-enter Scene of the starting Location stays in state and renders after acknowledgement through the existing engine sequence. A Scenario without an intro opens directly in its normal initial position with no modal.

The panel renders its entries as the Journal does. When the Interface Language changed after the step (for example a switch before Continue, then a reload), its narration stays in the language it was presented in, with that `lang`, while its Test and state changes follow the new Interface Language. Narration is not re-read from content.

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

- **`start-combat: E`**:
  - if E is defeated, it is a no-op: no fight, no victory Outcome, Location view;
  - otherwise create E's record if absent, add an entry of 0 for each participant without one, set the position to Combat {E, each surviving participant at E's `startRange`, round 1}, store those participants' ids as this Combat's starting membership, capture their current content order, select and store the first Round's Intents, and append the opening narration to the Journal. Re-entry after an escape starts again at `startRange` with freshly selected Intents and no prepared states or temporary effects, shows the opening narration again, and keeps the Damage taken. It creates a new starting membership containing only the participants surviving on re-entry.
- **Each Combat Round** (the Character's action and every surviving Enemy participant's Intent, resolved by Speed and Agility per [mechanics.md](mechanics.md#rounds)) is one `step`. Unless the Combat or the Playthrough ends, it increments the round, captures the surviving participants' current content order and stores the next Round's Intents. It appends one Combat round entry, which records every action of the Round in order: executed, cancelled, dropped, or not reached because the sequence stopped ([Journal](#journal)).
- A **rejected** Combat action changes nothing: the round, the Intents and `step` stay as they were.
- **Victory** (every participant's Damage taken ≥ its Enemy's maximum Health): the Combat ends and a Combat end entry is appended. Then the `victory` Outcome is applied, or, when there is none, an Enemy-defeated notice is appended and the position becomes Location view in the Location where the fight happened.
- **Escape**: the Combat ends, its starting membership, tie-break order, Ranges and temporary effects are discarded, the Encounter record keeps each participant's Damage taken, including defeated participants, and the `escape` Outcome is applied.
- **Character death**: Health 0, then `ended(death Ending)`, appending the Ending entry.

An Arena fight is not Playthrough state: it runs from an Arena Setup in its own state document (`kind: 'arena'`), never in a Playthrough row, and its victory, escape and death apply no Outcome and reach no Ending.

Defeat and victory are derived from wounds and the current content, not a stored victory marker. With unchanged content an Encounter stays defeated and its victory Outcome is applied at most once. Outside an active Combat, a content change that increases a participant's maximum Health above its Damage taken may revive it; a later `start-combat` then fights the survivors, and defeating the Encounter applies its victory Outcome again, including its Effects. This does not reopen an ended Playthrough. Revival that changes the surviving membership of an active Combat instead makes the Playthrough incompatible ([architecture.md](architecture.md#content-compatibility)).

## State versions and migration

Recorded in [ADR 0005](../adr/0005-playthrough-state-migrated-by-the-engine-on-read.md).

- The state document carries a **`stateVersion`**. Version 1 is the single-Enemy state (one Damage taken per Encounter id, one Range per Combat). Version 2 is the tactical state described above. A version is a frozen contract: its schema never changes once released.
- Each stored version is validated **strictly against its own schema**, then migrated one version at a time to the current one, then validated against the current schema. A document with an unknown or newer version is an error, never downgraded or guessed.
- Migration is a **deterministic** engine function of the stored document and the current Scenario. It draws no randomness, so repeating it gives the same result, and a current document is returned unchanged.
- It runs when a Playthrough is read (page or action), before the reference check and before `applyAction`. A migrated Playthrough that is compatible is written back with the pin, in the same `step`-guarded update, without advancing `step` and without a Journal entry. An incompatible one is never written back, so it recovers if the content is restored. If a turn commits between the read and the write-back, the fresh row is used instead.
- The database schema does not change for a state version: the state stays in the `state` JSON column ([architecture.md](architecture.md#persistence)).

### Version 1 to version 2

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

### Combat compatibility acceptance examples

These examples also belong in the final implementation handoff's migration, compatibility and view checks. Field names above remain illustrative; membership and timing are normative.

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
  | Combat start | opening narration; the name of each participant taking part | Encounter id; the participants taking part, in participant order |
  | Combat round | participant names, weapon and item names | Encounter id, round; every action of the Round in order (below); how the sequence stopped, if it did (death, victory, escape) |
  | Combat end | the participant names | Encounter id, how it ended (victory or escape) |
  | Enemy-defeated notice, when the Encounter has no victory Outcome | the participant names | Encounter id; every participant of the Encounter, in participant order |
  | inventory action outside Combat | item name | kind (equipped, unequipped, used), item id, Health restored |
  | Ending, appended whenever the Playthrough ends, by `end` or by death | title, closing narration | Ending id, kind (victory or defeat) |

### Combat events

- A **participant reference** in an event is the participant id, its Enemy id, the Enemy name as presented and an **ordinal**: its 1-based position among the participants of the same Enemy kind in its Encounter, or none when the kind is unique there. The ordinal lets the Interface Text tell two grey wolves apart without authored names; how it is worded is presentation.
- Each action of a Combat round records:
  - its **actor** (the Character or a participant reference), its action or Intent kind and its Speed, in the Round's order;
  - its **target**, for a targeted Character action (Intents always target the Character);
  - its **status**: executed; cancelled with a reason (interrupted, target defeated, out of Reach, already Near, none Near); dropped (actor defeated); or not reached (the sequence stopped earlier);
  - for an executed action, what it did: the roll (both dice, modifier, total, target number, success), Damage dealt and to whom, Range changes (participant, before, after), Health restored and the item used, effects applied (Guarded, Wary with its last round, prepared, a target's Intent interrupted), participants defeated by it, and Escape success;
  - a **counterattack** reaction inside the action it answers, with its roll, its Damage and any defeat.
- Display text is not stored in these events, only names as presented ([ADR 0004](../adr/0004-journal-stores-events-and-scenario-text-as-presented.md)).
- **Single-Enemy Combat entries already stored** (`combat-start`, `combat-round`, `combat-end`, `enemy-defeated` with an English `text`, one Range and a `guard` marker) are kept unchanged and shown verbatim, as the legacy rule above says. They are never rewritten into the tactical shape, which would invent Speeds, order and targets they never had. New entries carry the tactical shape under a payload version, so both shapes stay renderable and no stored shape changes. The legacy `guard` marker never drives the tactical Combat panel.

## Ended Playthroughs

`ended` is **frozen**: every action is rejected, which also rules out healing a dead Character. These views remain, read-only:

- the Ending (kind, title and closing narration);
- the final Character sheet and inventory;
- the Journal;
- the map.

## Invariants

- Character Health is always 0–12, and Character Health 0 always goes with `ended(death Ending)`.
- Every equipped item is held and fits its slot.
- With unchanged content, a defeated Encounter never re-enters Combat and its `victory` Outcome applies at most once. Content-driven revival outside Combat follows the exception above.
- A non-repeatable Scene activates at most once, and a `once` Choice is taken at most once.
- Each Outcome application belongs to exactly one step-guarded action. A stale or duplicate submission cannot apply it twice; this does not prohibit a later victory after content-driven revival outside Combat.
- Nothing changes after `ended`.
- A committed Intent changes only by resolving or being cancelled within its Round; reading, reloading or a rejected action never re-selects it.
- Migrating a stored state resolves nothing and never advances `step`; migrating it again gives the same state.
- At a persisted active Combat boundary, participants with action state are exactly the Encounter's currently surviving participants, are all in this Combat's starting membership, and appear exactly once in its current Round tie-break order. Starting ids may also include participants defeated during this Combat; those have no action state.

## Sources

- [Playthrough state: exploration, inventory, persistent encounters and endings](https://github.com/lbacik/simple-rpg-engine/issues/13#issuecomment-6099619014)
- [Scenario validation rules and playability checks](https://github.com/lbacik/simple-rpg-engine/issues/7#issuecomment-6099876109) (implicit Continue when every Choice is hidden)
- [Normative Scenario YAML syntax and walk-through gaps](https://github.com/lbacik/simple-rpg-engine/issues/16#issuecomment-6100076156) (empty Outcome)
- [Architecture: engine boundaries, persistence and Session handling in Next.js](https://github.com/lbacik/simple-rpg-engine/issues/8#issuecomment-6099767575) (content hash pin)
- [ADR 0001: content compatibility by reference check](../adr/0001-content-compatibility-by-reference-check.md)
- [Journal across languages](https://github.com/lbacik/simple-rpg-engine/issues/61) (events, names and `lang` per entry, legacy rows)
- [ADR 0004: the Journal stores engine events and Scenario text as presented](../adr/0004-journal-stores-events-and-scenario-text-as-presented.md)
- [Combat round lifecycle: visible intents and action-speed initiative](https://github.com/lbacik/simple-rpg-engine/issues/77#issuecomment-6130653596) (Rounds, Speed, Intents)
- [Tactical Character actions: defence, Wits disruption, Range and Escape](https://github.com/lbacik/simple-rpg-engine/issues/78) (action targets, per-participant Range, stored Wary)
- [Encounter participants: stable identity, individual wounds and partial victory](https://github.com/lbacik/simple-rpg-engine/issues/80) (per-participant Damage taken, Encounter defeat)
- [Tactical Combat content, state migration and compatibility contracts](https://github.com/lbacik/simple-rpg-engine/issues/81) (stored tactical Combat, state versions and migration, action targets, Combat events)
- [ADR 0005: Playthrough state is migrated by the engine on read](../adr/0005-playthrough-state-migrated-by-the-engine-on-read.md)
- [Active Combat roster and compatibility after participant reordering or revival](https://github.com/lbacik/simple-rpg-engine/issues/116) (starting membership, saved Round ties, active revival incompatibility and repeated victory after content changes)
- [Tactical Combat specification and dependency-ordered implementation handoff](https://github.com/lbacik/simple-rpg-engine/issues/84) (Outcome application scope and final acceptance)
