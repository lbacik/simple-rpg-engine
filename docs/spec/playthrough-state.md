# Playthrough state

The domain state of a Playthrough and the semantics of every player action. Storage, transactions and Session ownership are in [architecture.md](architecture.md); content meaning is in [content-semantics.md](content-semantics.md).

## Model

- The Playthrough's **current state snapshot is the source of truth**. Each successful player action replaces it atomically.
- Alongside it, the **Journal** is an append-only, read-only record of what was presented. It never drives play. Event sourcing with replay was rejected because replay depends on unchanged Scenario content.
- Stored state refers to Scenario content **only by ID** (Location, Scene, (Scene, Choice), Encounter, item, slot, Flag, Character Template, Ending). This keeps the compatibility check of [ADR 0001](../adr/0001-content-compatibility-by-reference-check.md) mechanical.

## Lifecycle

- Two statuses: **`active`** and **`ended(endingId)`**. The kind (victory or defeat) comes from the Ending. Death is ending on the Scenario's death Ending.
- A Playthrough is created only when the player confirms a Character Template and a name. There is no draft state.
- There is no "abandoned" status. Starting another Playthrough leaves earlier ones `active`. A Session may hold any number of Playthroughs.
- Playthroughs cannot be deleted.
- **Incompatible** (content changed so that a stored ID no longer exists, or the Scenario left the collection) is derived when the Playthrough is read; it is not a status (see [architecture.md](architecture.md#content-compatibility)).

## Stored and derived state

| Area | Stored | Derived |
|---|---|---|
| Identity | Scenario id; content `version` and content hash pinned at creation (updated when a reference check passes); status; `step` counter | |
| Character | Template id, name, **copy of the base Attributes at creation**, current Health | effective Attributes (base + Equipment, +2 cap per Attribute); maximum Health (12); attack Damage and Reach (equipped weapon, or 2 / `melee`) |
| Inventory | item id → quantity ≥ 1 (entries at zero are removed) | |
| Equipment | slot → item id, pointing at a held item | Attribute bonuses |
| Position | one of: **Location view** (Location); **Scene active** (Location, Scene); **Combat** (Location, Combat); **Ended**. The current Location is always stored. | |
| Exploration | `visited` Location set; `revealed` Location set | map nodes, drawn Connections, highlighted travel targets |
| Scenes and Choices | set of fired Scene ids; set of taken `once` Choices as (Scene id, Choice id) | on-demand Scenes on offer; visible Choices |
| Flags | set of Flags currently true | |
| Encounters | per Encounter id, created on its first `start-combat`: **Damage taken per participant id** | each participant's remaining Health (its Enemy's maximum − taken) and defeated (remaining ≤ 0); the Encounter is defeated when every participant is. An Encounter or participant without a record is at full Health. |
| Active Combat | Encounter id, the Range to each Enemy participant, round number, the current Round's committed Intents, each participant's prepared state, temporary effects that outlast the step (a Wary participant and the Round its Wary ends) | each participant's Health (from the Encounter record); the Round's order; available Character actions with their Speed |
| Journal | append-only entries: Scenario text as presented, engine events, and the language of each | the result panel; the intro display; all Interface Text in it |

Notes:

- **Equipment is a pointer, not a copy.** An equipped item counts towards its held quantity. Removing one of two copies leaves it equipped; removing the last copy unequips it first.
- **Participant identity is (Encounter id, participant id).** Two Encounters with the same Enemy are independent, and so are two participants of the same Enemy kind in one Encounter. Storing only Damage taken makes "defeated" impossible to desynchronise, for a participant and for the Encounter.
- **Round-scoped effects are never stored** (for example Guarded, and the once-per-Round counterattack). A whole Round resolves in one step, so an effect that expires at the end of its own Round never outlives it. The committed Intents, prepared states and effects lasting into the next Round are stored, so reading or reloading never re-selects or changes them. Their exact shape is set with the tactical Combat state migration.
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
| **Combat action** (defend, distract, attack, advance, use item, escape, fall back; with a target Enemy participant for distract, attack and advance) | Combat; the action is available in the current state, including its target (see [mechanics.md](mechanics.md#character-actions)) | one Combat Round (see [mechanics.md](mechanics.md#rounds)) |

Travel identifies a Connection by its target: every visible Connection to the same target has the same effect. Equip, Unequip and Use item outside Combat each advance `step` and append an inventory Journal entry.

### Two kinds of "Continue"

- The **implicit Continue** of a Scene with no visible Choice is a domain action: it advances `step`.
- The **Continue after reading a Test or Outcome result** is client-side only: a plain link to the same game page carrying the current `step` (for example `?seen=<step>`). The Outcome was already applied when the Choice was made, so following the link changes no game state and does not advance `step`. When the parameter equals the Playthrough's current `step`, the server skips the result panel and renders the position; a value that does not match is ignored. After a reload without the parameter the result panel may be shown again, which is harmless. There is no persisted "awaiting Continue" state.

### Result panel

The result panel is derived from the Journal entries of the **latest step**, taking only these types, in order: intro, Test, Outcome narration, state change, Combat end and the Enemy-defeated notice. Scene narration, travel, Combat start and Combat rounds are not part of it; they are shown by the new position itself (the Scene, the Location view or the Combat panel). If the latest step produced none of these types (for example an empty Outcome), there is no result panel, and the new position is shown directly. A step that ended the Playthrough shows the Ending screen instead.

While the result panel is shown, the reading column shows **only** the panel and its Continue: the Location view, Scene, Combat panel and the "View journal" link are not rendered until the player continues. The side panel (map, Character, Inventory) and any transient notice stay visible throughout. This applies to every result panel: after a Choice or Test, after Combat ends, and to the intro at the start of a Playthrough.

The panel renders its entries as the Journal does. When the Interface Language changed after the step (for example a switch before Continue, then a reload), its narration stays in the language it was presented in, with that `lang`, while its Test and state changes follow the new Interface Language. Narration is not re-read from content.

## Transitions

### Starting a Playthrough (one atomic step)

1. Create the Character from the Template: name, a copy of the base Attributes, Health 12, the starting items with quantities, and the Template's Equipment equipped.
2. Set `step` to 0, the current Location to the starting Location, and empty Flags.
3. Append the intro to the Journal, if the Scenario has one. (It is displayed like any other result panel.)
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
  - otherwise create E's record if absent, set the position to Combat {E, each surviving participant at E's `startRange`, round 1}, select and store the first Round's Intents, and append the opening narration to the Journal. Re-entry after an escape starts again at `startRange` with freshly selected Intents and no prepared states or temporary effects, shows the opening narration again, and keeps the Damage taken.
- **Each Combat Round** (the Character's action and every surviving Enemy participant's Intent, resolved by Speed and Agility per [mechanics.md](mechanics.md#rounds)) is one `step`. Unless the Combat or the Playthrough ends, it increments the round and stores the next Round's Intents. It appends one Combat round entry, which records the actions in resolved order, including dropped and cancelled ones.
- A **rejected** Combat action changes nothing: the round, the Intents and `step` stay as they were.
- **Victory** (every participant's Damage taken ≥ its Enemy's maximum Health): the Combat ends and a Combat end entry is appended. Then the `victory` Outcome is applied, or, when there is none, an Enemy-defeated notice is appended and the position becomes Location view in the Location where the fight happened.
- **Escape**: the Combat ends, the Ranges and temporary effects are discarded, the Encounter record keeps each participant's Damage taken, including defeated participants, and the `escape` Outcome is applied.
- **Character death**: Health 0, then `ended(death Ending)`, appending the Ending entry.

## Journal

Recorded in [ADR 0004](../adr/0004-journal-stores-events-and-scenario-text-as-presented.md).

- Each entry stores its type, the `step` that produced it, and the **language of the Scenario text in effect** when it was presented (`lang`: the `language` of the Translation shown, or the Base Language). Every entry records it, including entries that hold no Scenario text, since the language cannot change within a step.
- **Scenario text is stored as presented**: narration with `{name}` substituted, Choice wording, an Ending's title and closing narration, and the Scenario names an engine event mentions (item, Enemy, Location, weapon). It stays in the language it was shown in, and so stays true when Scenario content or the Interface Language changes later. After a language switch the Journal holds Scenario text in more than one language.
- **Engine-generated entries are stored as structured events**: a kind, the content ids, the numbers, and the names as presented. They are never stored as Interface Text. They are rendered when read, through the catalogue of the current Interface Language ([architecture.md](architecture.md#interface-text)), so all Interface Text in the Journal follows the current Interface Language, including in old entries.
- Rendering an entry needs only the entry and the catalogue, never the Scenario content. Ids are kept for mechanical use, such as the Combat panel's guard marker, and are never resolved to names when read.
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
  | Combat start | opening narration, Enemy name | Encounter id |
  | Combat round | Enemy name, weapon and item names | Encounter id, round, action, rolls, Damage, Range before and after, guard |
  | Combat end | Enemy name | Encounter id, how it ended (victory or escape) |
  | Enemy-defeated notice, when the Encounter has no victory Outcome | Enemy name | Encounter id |
  | inventory action outside Combat | item name | kind (equipped, unequipped, used), item id, Health restored |
  | Ending, appended whenever the Playthrough ends, by `end` or by death | title, closing narration | Ending id, kind (victory or defeat) |

## Ended Playthroughs

`ended` is **frozen**: every action is rejected, which also rules out healing a dead Character. These views remain, read-only:

- the Ending (kind, title and closing narration);
- the final Character sheet and inventory;
- the Journal;
- the map.

## Invariants

- Health is always 0–12, and Health 0 always goes with `ended(death Ending)`.
- Every equipped item is held and fits its slot.
- A defeated Encounter never re-enters Combat, and its `victory` Outcome applies at most once.
- A non-repeatable Scene activates at most once, and a `once` Choice is taken at most once.
- An Outcome is applied once, by exactly one step-guarded action. A stale or duplicate submission is rejected.
- Nothing changes after `ended`.
- A committed Intent changes only by resolving or being cancelled within its Round; reading, reloading or a rejected action never re-selects it.

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
