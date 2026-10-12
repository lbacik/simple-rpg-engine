# Content semantics

How the engine interprets a Scenario during play. Syntax is in [scenario-format.md](scenario-format.md); the state these rules read and write, and the exact order of updates, are in [playthrough-state.md](playthrough-state.md).

## Narrative model

A Scenario is a **graph of Locations** joined by Connections. Within a Location, **Scenes** fire, each a single passage of pre-written narration with Choices. NPC dialogue is a graph of Scenes linked by `next`. All narration is pre-written; nothing is generated.

The Character is always in exactly one Location. At any moment play is in one of these positions:

- **Location view**: the Location's description, its visible Connections and its available on-demand Scenes;
- **Scene active**: a Scene's narration and its visible Choices;
- **Combat**: a fight with the surviving participants of one Encounter;
- **Ended**: the Playthrough has reached an Ending.

## Scenario start

The Scenario `intro`, if present, is shown before the starting Location. Any interactive opening is an `on-enter` Scene in the starting Location, not part of the metadata.

## Locations and Connections

- A Location's `description` is static. Changes to the world are shown through `on-enter` Scenes or Connection labels.
- A Connection is **one-way**, declared on its source Location. A return path is a separate Connection on the other Location.
- A Connection whose `when` does not hold is hidden. A Connection's label defaults to the target's name.
- The player moves the Character along a visible Connection only from the Location view (exit button or map click; see [ui.md](ui.md#location-map)). Content moves the Character with the `move` transition.

### Entering a Location

A Location is **entered** at Playthrough start, by travelling along a Connection, or by `move`. A `move` to the current Location also counts as entering.

On entering:

1. The Location is marked visited.
2. Its Scenes with `trigger: on-enter` are checked **in the order the Location lists them**. The first one whose `when` holds and which is repeatable or has not yet fired becomes active.
3. If none qualifies, play is in the Location view.

On-enter Scenes are evaluated **only** on entering, never when play returns to the Location view.

### Discovery

The player's map shows Locations that have been **visited**, plus Locations **revealed** by the `reveal` Effect. Unvisited targets of Connections are not shown (see [ui.md](ui.md#location-map) for drawing rules).

## Scenes

Each Scene has one trigger kind:

| `trigger` | Fires | Belongs to |
|---|---|---|
| `on-enter` | on entering its Location, first eligible in listed order | exactly one Location |
| `on-demand` | when the player picks it in the Location view; offered while its `when` holds | exactly one Location |
| omitted (**follow-on**) | only through `next` from an Outcome | no Location |

- Scenes fire **once by default**. `repeatable: true` must be stated. This applies to every trigger kind, follow-on Scenes included.
- A Scene counts as **fired when it is activated** (shown), not when a Choice is made. Repeatable Scenes are recorded as fired too (for the `fired` Condition), but they are not blocked.
- An on-demand Scene's `when` is checked when it is activated. If the Condition stops holding while the Scene is active, the Scene continues.
- A follow-on Scene has **no `when`**. To gate it, put the Condition on the Choice whose Outcome has the `next`. A follow-on Scene reached through `next` from a Scene in any Location runs in whatever Location the player is in.
- `next` to a non-repeatable Scene that has already fired is a **no-op**: play returns to the Location view.
- `next` may target only follow-on Scenes. Reaching an on-enter or on-demand Scene through `next` would mark it fired and silently remove it from its Location, so it is a validation error.

### Choices

- A Choice whose `when` does not hold is **hidden**.
- A `once` Choice disappears after it is taken, including within a repeatable Scene.
- A Choice resolves through either an `outcome` or a `test` (see [mechanics.md](mechanics.md#tests)). With neither, it applies the **empty Outcome**: no narration, no Effects, back to the Location view.
- **Implicit "Continue"**: when a Scene has no Choices, **or none of its Choices is visible** in the current state, the engine offers a single "Continue". It applies the empty Outcome. Play can therefore never deadlock inside a Scene.

## Outcomes

An Outcome has optional narration, an ordered list of Effects, and at most one transition, applied last.

| Transition | Meaning |
|---|---|
| `next: <scene>` | activate that follow-on Scene |
| `move: <location>` | enter that Location |
| `start-combat: <encounter>` | start a Combat with that Encounter |
| `end: <ending>` | end the Playthrough on that Ending |
| none | back to the Location view of the current Location; on-enter Scenes are not re-evaluated |

- Effects run in authored order.
- If an Effect kills the Character, the remaining Effects and the transition are skipped, and the Playthrough ends on the death Ending.
- An Outcome is applied exactly once, by the action that chose it.

## Effects

The vocabulary is closed.

| Effect | Meaning |
|---|---|
| `set-flag: F` / `clear-flag: F` | make the Flag true / false (idempotent) |
| `give-item: { item, quantity }` | add that many; never equips |
| `take-item: { item, quantity }` | remove up to that many, without error if fewer are held; removing the last copy of an equipped item unequips it first |
| `heal: n` | restore up to n Health, capped at 12; a no-op at full Health |
| `damage: n` | lose n Health; can kill |
| `reveal: L` | put the Location on the player's map (a no-op if already visited) |

There is no Effect that equips or unequips an item, and none that changes Attributes. Content-driven `heal` at full Health is a silent no-op, unlike the player's use of a Consumable, which is rejected (see [mechanics.md](mechanics.md#consumables)).

## Conditions

Conditions are structured predicates combined with `all`, `any` and `not`. There is no expression language.

| Fact | True when |
|---|---|
| `flag: F` | the Flag is currently true (all Flags start false) |
| `has: { item, atLeast }` | the Character holds at least that many of the item (equipped copies count) |
| `attribute: { name, atLeast \| atMost }` | the **effective** Attribute meets the bound |
| `health: { atLeast \| atMost }` | current Health meets the bound |
| `visited: L` | the Location has been entered at least once |
| `fired: S` | the Scene has been activated at least once |
| `defeated: E` | every participant's recorded Damage taken reaches its Enemy's current maximum Health |

Conditions are evaluated live: when rendering a view and again when an action is submitted. Author-defined state is Flags only; there are no counters.

## Encounters and Combat

An **Enemy** is a reusable definition. An **Encounter** is a named placement of one or two Enemies as **participants** (see [mechanics.md](mechanics.md#participants)), with opening narration, a required `escape` Outcome and an optional `victory` Outcome. Each participant carries its own wounds under the persistence rules in [mechanics.md](mechanics.md#persistence-of-wounds).

- `start-combat: E` on an Encounter that is **not defeated** starts a Combat against its surviving participants at E's `startRange` and shows E's opening narration. This also happens again when the player returns after an escape; each surviving participant keeps its wounds, and with unchanged content a participant defeated earlier does not return.
- `start-combat: E` on an Encounter that is **already defeated** is a **no-op**: no fight, the victory Outcome is not applied again, play returns to the Location view.
- **Victory** (the last participant defeated) applies the `victory` Outcome. Defeating one of two participants is not a victory and applies nothing. Without one, the engine shows a brief **Enemy-defeated notice**, and play returns to the Location view of the Location where the fight happened.
- **Escape** applies the `escape` Outcome.
- **Character death** is not an Encounter Outcome. It always ends the Playthrough on the Scenario's death Ending.

Defeat is checked against current content, not remembered as a separate victory flag. A content change outside Combat may revive a previously defeated participant by increasing its maximum Health above its recorded Damage. In an active Playthrough, a later `start-combat` then fights the current survivors, and the next victory applies the `victory` Outcome and its Effects again. The usual once-only guarantee holds while content remains unchanged. Revival that changes the surviving membership of an active Combat makes the Playthrough incompatible instead ([architecture.md](architecture.md#content-compatibility)); content edits never reopen an ended Playthrough or automatically start a Combat.

### Authoring pattern: re-offering an escapable fight

An on-enter Scene that starts a fight is once-only by default, so after an escape the fight would not be offered again. To re-offer it, either:

- add an on-demand Scene gated by the Condition `not: { defeated: E }` (the example's `wolf-again`), or
- make the on-enter Scene `repeatable: true` with that Condition in its `when` (the example's `camp-standoff`).

## Items in content

- Templates list starting items; their Equipment starts equipped.
- Content gives and takes items only through `give-item` and `take-item`, and checks them with `has`.
- A Key Item is meaningful only through those Effects and Conditions. Template-specific content is written as a Key Item in the Template's starting items plus a `has` Condition (the example's `scholar` with `old-almanac`).

## Endings

- An Ending has a kind (`victory` or `defeat`), a title and closing narration.
- The `end` transition leads to an Ending; Character death leads to the Scenario's death Ending.
- Every Scenario declares exactly one **death Ending**, of kind `defeat`, in its manifest. Content may also `end` there explicitly.

## Sources

- [Scenario content model: Locations, Scenes, choices, conditions, effects](https://github.com/lbacik/simple-rpg-engine/issues/3#issuecomment-6099088394)
- [Playthrough state: exploration, inventory, persistent encounters and endings](https://github.com/lbacik/simple-rpg-engine/issues/13#issuecomment-6099619014) (activation-time firing, `next` no-op, `move` to self)
- [Scenario validation rules and playability checks](https://github.com/lbacik/simple-rpg-engine/issues/7#issuecomment-6099876109) (implicit Continue when every Choice is hidden)
- [Normative Scenario YAML syntax and walk-through gaps](https://github.com/lbacik/simple-rpg-engine/issues/16#issuecomment-6100076156) (empty Outcome, follow-on Scenes without `when`, `next` only to follow-on Scenes)
- [Write the example Scenario and check it against the validation rules](https://github.com/lbacik/simple-rpg-engine/issues/12#issuecomment-6099995494) (re-offering pattern)
- [Encounter participants: stable identity, individual wounds and partial victory](https://github.com/lbacik/simple-rpg-engine/issues/80) (participants, `defeated`)
- [Tactical Combat content, state migration and compatibility contracts](https://github.com/lbacik/simple-rpg-engine/issues/81) (Combat position)
- [Active Combat roster and compatibility after participant reordering or revival](https://github.com/lbacik/simple-rpg-engine/issues/116) (content-driven revival and victory Outcomes)
