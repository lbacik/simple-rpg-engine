# Mechanics

The engine owns the rules. A Scenario supplies content only in terms of the Attributes, Tests, items, Enemies and Effects defined here; it cannot add Attributes, change the dice, or introduce new kinds of items or Effects.

Terms are defined in [`CONTEXT.md`](../../CONTEXT.md). Content syntax is in [scenario-format.md](scenario-format.md); how the rules change Playthrough state is in [playthrough-state.md](playthrough-state.md).

## Attributes

There are four Attributes and no separate skill list:

| Attribute | Token | Covers |
|---|---|---|
| Might | `might` | strength and endurance |
| Agility | `agility` | dexterity and stealth |
| Wits | `wits` | perception and reasoning |
| Presence | `presence` | persuasion and intimidation |

- A Character's **base** Attributes range from 0 to 3.
- A Character's **effective** Attribute is its base value plus Equipment bonuses, with the total Equipment bonus to any one Attribute capped at **+2**. Bonuses beyond the cap have no effect. An effective Attribute is therefore 0–5.
- **Every rule reads effective Attributes**: Conditions, narrative Tests and Combat alike. The Character sheet shows exactly the values the game uses.
- Enemies have the same four Attributes, 0–3 each, and no Equipment.

## Dice

The only die roll is **2d6** (2–12). Production rolls each die with `crypto.randomInt(1, 7)`; the random source is injected into the engine (see [architecture.md](architecture.md#engine-contract)). There is no automatic success or failure on any roll, and no critical hits.

## Tests

A Test is attached to a Choice. It names an Attribute and a Difficulty:

| Difficulty token | Target |
|---|---|
| `easy` | 7 |
| `ordinary` | 9 |
| `hard` | 11 |
| `very-hard` | 13 |

- A Test **succeeds when 2d6 + the effective Attribute ≥ the target**, and fails otherwise. There is no success-with-a-cost result.
- Before choosing, the player sees the Attribute and the Difficulty (name and number). After the roll, the player sees both dice, the modifier, the total and the result.
- The Choice's `success` or `failure` Outcome is applied.

## Characters

- A Character is created from one of the Scenario's **Character Templates**. The player picks a Template and enters a name. There is no point allocation and no Attribute rolling.
- The name is trimmed and must then be 1–40 characters long. It is stored and shown literally (it is substituted for `{name}` as plain text, never as Markdown).
- A Template's base Attributes are 0–3 each and sum to **exactly 6** (for example `3/2/1/0` or `2/2/1/1`).
- A Template lists starting items with quantities. Its Equipment starts equipped, at most one item per slot.
- Every Character has **12 maximum Health** and starts at full Health. Might does not change Health.
- There is no progression during a Playthrough (no experience or levels).

## Items

Every item is held in a quantity. Inventory has no capacity limit. There are three kinds.

### Equipment

- Three slots: **weapon**, **outfit** and **talisman**. At most one item is equipped per slot.
- An equipped item may grant **+1 to one Attribute** (subject to the +2 cap).
- A **weapon** declares its Reach (`melee` or `ranged`, default `melee`) and its Damage, which **replaces** the basic attack's Damage:
  - `melee` weapons: 2–4 Damage;
  - `ranged` weapons: 2–3 Damage.
- Without a weapon equipped, the Character's basic attack deals **2 Damage** with `melee` Reach.
- Outfits do not reduce Damage; like any Equipment they may grant an Attribute bonus.
- A second copy of an equipped item gives no extra benefit.
- Equipment can be changed only **outside Combat** (in the Location view or during an active Scene), and only by the player. Content can never equip or unequip an item, except that removing the last copy of an equipped item unequips it.

### Consumables

- A Consumable restores its declared Health (1–12), capped at maximum Health, and one copy is consumed.
- It can be used inside or outside Combat. In Combat, using it consumes the Character's turn.
- Using a Consumable at **full Health** is rejected: no item is consumed, no turn passes, the Enemy does not attack. Using one at partial Health consumes the whole item even if part of the healing is wasted.
- Using an item the Character does not hold is likewise rejected. The UI disables unavailable actions, and the server validates them independently.

### Key Items

A Key Item has no mechanics. It exists to satisfy Conditions and to be given or taken by Effects.

### Magic

`magic: true` is a presentation marker on an item of any kind. Magic items use only the mechanisms above (passive Equipment bonuses and single-use healing). There are no charges, temporary bonuses, spells or other magic effects.

## Health and death

- Health is always 0–12. There is no automatic regeneration; content may heal explicitly (for example, a Scene where the Character rests).
- Damage is a fixed amount; there is no Damage roll.
- A combatant at 0 Health is dead. **Character death ends the Playthrough** on the Scenario's death Ending. There are no checkpoints, no resurrection and no rollback; the ended Playthrough stays viewable, and the player can start a new one.

## Enemies

An Enemy is a reusable definition, fought through Encounters. Authors choose integer values within these limits:

| Property | Range |
|---|---|
| each Attribute | 0–3 (no point budget) |
| maximum Health | 1–30 |
| attack Damage | 1–6 |
| Reach | `melee` or `ranged` (default `melee`) |

These limits keep content valid; they do not guarantee that a fight can be won.

## Combat

A Combat is a fight between the Character and **one** Enemy, placed by an Encounter. A Scenario arranges successive fights through content.

### Range and Reach

- Every Combat has a **Range**: **Near** or **Far**. It starts at the Encounter's `startRange` (default `far`) and exists only during Combat.
- A `melee` attack requires Near. A `ranged` attack works at either Range, with no penalty at Near.

### Hitting

Both sides hit when **2d6 + attacker's Might ≥ 7 + defender's Agility** (effective values for the Character). Ranged attacks also use Might; Agility is never the attack Attribute. A miss deals no Damage. A hit deals the attacker's Damage.

### Rounds

A Combat proceeds in **Rounds**. In each Round the Character takes exactly one action and every surviving Enemy participant carries out exactly one **Intent**. A Round is one player action and one `step` (see [playthrough-state.md](playthrough-state.md#combat)). There is no initiative roll.

> **Transition note.** This Round contract replaces the earlier "the Character always acts first" turn. The action table, the Enemy response and the single-Enemy wording below still describe the earlier rules until [Tactical Character actions](https://github.com/lbacik/simple-rpg-engine/issues/78), [Enemy intent profiles](https://github.com/lbacik/simple-rpg-engine/issues/79) and [Encounter participants](https://github.com/lbacik/simple-rpg-engine/issues/80) are resolved; those decisions assign the concrete Speeds, Intents, effects and participants that use this contract.

#### Speed and order

- Every Character action and every Intent has a **Speed**: `fast`, `normal` or `slow`.
- Within a Round all `fast` actions resolve first, then `normal`, then `slow`.
- Within one Speed, **higher Agility acts first**: the Character's effective Agility, an Enemy's Agility.
- Ties: the Character acts before an Enemy with equal Agility. Enemy participants with equal Agility, including two of the same Enemy kind, act in the Encounter's stable participant order. Nothing is rolled for order.
- The order is fixed when the Character commits. Nothing that happens during the Round reorders it.

#### Before the Character commits

- The Round's Intents are chosen and stored before the Round is shown. For each surviving Enemy participant the player sees its Intent, the Intent's Speed and its place in the order.
- Each available Character action shows its Speed, so the player sees exactly where it would fall among the Intents. Ordering involves no roll, so the shown order is exact; only the rolls inside actions are unknown.
- Reading, reloading or a rejected action never re-selects or changes an Intent. A selected Intent is committed: it resolves as announced or is cancelled, and is never swapped for another action.

#### Resolving a Round

A legal Character action resolves the whole Round in one atomic step:

1. **Commit.** The Character's action takes its place in the order among the Round's Intents.
2. **Resolve in order.** For each action in turn:
   1. If its actor has been defeated, the action is **dropped**.
   2. If it has been interrupted, it is **cancelled**.
   3. If it is no longer valid (its target has been defeated, its Range or Reach requirement no longer holds), it is **cancelled**.
   4. Otherwise it executes: its rolls, its result, then any reaction it triggers.
   5. After the action and after each reaction, the end of the sequence is checked (below).

   A cancelled or dropped action is never replaced by another action and never retargeted, and its costs (such as a consumed item) are not paid. The Journal records each cancellation with its reason.
3. **End of the Round.** Round-scoped effects expire, the round number increases, and the next Round's Intents are selected and stored for every surviving Enemy participant.

Every roll of the step, in resolution order and then for Intent selection, comes from the injected random source.

#### Stopping the sequence

The sequence stops at the first of these. The remaining actions do not resolve, and no next Intents are selected:

- **Character death**: the Character's Health reaches 0, and the Playthrough ends on the death Ending.
- **Victory**: every Enemy participant has been defeated.
- **Escape**: the Character's Escape succeeds. Enemies whose actions come later in the order do not act; those earlier have already acted.

An Enemy participant defeated while another survives does not end the Round: it loses its own action, if it has not yet acted, and the Round continues.

#### Rejected versus cancelled

- A submitted Character action must be legal in the state the player was shown: available at the current Range, aimed at a surviving target, with a held Consumable below full Health, and so on. An illegal action is **rejected**: nothing changes, `step` does not advance, no Intent resolves and no Intent is re-selected.
- A legal action that becomes invalid before its place in the order is **cancelled**: the Round still resolves and the Character's action for the Round is spent.

#### Preparation across Rounds

- No action spans Rounds; every action resolves within its own Round.
- A multi-Round behaviour is a **preparing** Intent in one Round, which leaves the participant **prepared**, followed by the Intent it prepares, selected and shown at the end of that Round like any Intent. An interruption of either Intent clears the prepared state, and the next Intent is selected from the cleared state.
- Character actions take no preparation unless a later decision introduces one under this same rule.

#### Timing hooks

Concrete actions and Intents may hook into a Round only at these points:

- **Before an action resolves**: the interruption and validity checks (steps 2.2 and 2.3).
- **When an attack resolves against a target**: modifiers from the target's active effects, such as a defence, apply.
- **After an action resolves**: a **reaction**, such as a counterattack, resolves at once inside the triggering action's place in the order. A reaction is not an action: it has no Speed, cannot be interrupted, triggers no further reaction and costs nobody their action.
- **End of the Round**: effects expire.

Temporary effects:

- take effect when the action that creates them resolves, and never apply to actions that resolved earlier in the order;
- last until the end of the current Round or until the end of the next Round;
- do not stack with themselves; reapplying an effect refreshes its expiry.

### Character actions

| Group | Action | Available when | Effect |
|---|---|---|---|
| Position | **Advance** | Range is Far | Range becomes Near. No roll. |
| Position | **Fall back** | Range is Near | Roll 2d6 + Character's Agility ≥ 7 + Enemy's Agility. Success: Range becomes Far. Failure: stays Near. |
| Fight | **Attack** | the Character's Reach allows it at the current Range | Hit roll as above. |
| Fight | **Defend** | always | For the rest of this turn the Enemy needs **2d6 + its Might ≥ 9 + the Character's Agility** to hit (+2). If the Enemy actually attacks and misses, it takes **1 Damage** from a counterattack. The bonus expires at the end of this Enemy turn, even if the Enemy only moved. |
| Items | **Use a Consumable** | a held Consumable, Character below full Health | Heals as described under Consumables. |
| Leave | **Escape** | always | Roll 2d6 + Character's Agility ≥ 7 + Enemy's Agility, with **+2 to the roll at Far**. Success ends the Combat. |

Every action except a successful Escape, or one that kills the Enemy, is followed by the Enemy's response. A rejected action (for example a Consumable at full Health) consumes nothing.

### Enemy response

- A `melee` Enemy at Far spends its turn **closing to Near** and does not attack.
- Otherwise the Enemy attacks (a `ranged` Enemy never moves).
- There are no other Enemy behaviours.

### End of Combat

- **Victory**: the Enemy's Health reaches 0, including from a counterattack. The Enemy does not respond.
- **Escape**: a successful Escape ends the Combat; the Enemy does not respond.
- **Death**: the Character's Health reaches 0, and the Playthrough ends on the death Ending.

What follows a victory or an escape is authored on the Encounter (see [content-semantics.md](content-semantics.md#encounters-and-combat)).

### Persistence of wounds

- Damage dealt to an Enemy belongs to its **Encounter**. If the Character escapes and later fights the same Encounter again, the Enemy keeps its remaining Health, and the Combat starts again at `startRange`.
- A defeated Encounter stays defeated.
- A different Encounter with the same Enemy is independent and starts at full Health.

### Tactical notes (consequences, not extra rules)

- Against a `melee` Enemy, Advancing is never better than waiting, because the Enemy closes in by itself. Advance matters against `ranged` Enemies, which get free shots while the Character approaches.
- A successful Fall back against a `melee` Enemy costs the Enemy one attack, but also costs the Character's action.
- No fight is unwinnable by construction: the worst hit chance (Might 0 against Agility 3) is 1/6, Damage is at least 2, Enemy Health is at most 30, a `melee` Character can always Advance without a roll, and Escape is always available.

## Sources

- [Core mechanics: attributes, die, tests, combat resolution, character creation](https://github.com/lbacik/simple-rpg-engine/issues/2#issuecomment-6098918991)
- [Combat presentation: abstract exchange vs simple grid board](https://github.com/lbacik/simple-rpg-engine/issues/9#issuecomment-6099395150)
- [Scenario content model: Locations, Scenes, choices, conditions, effects](https://github.com/lbacik/simple-rpg-engine/issues/3#issuecomment-6099088394) (item kinds)
- [Playthrough state: exploration, inventory, persistent encounters and endings](https://github.com/lbacik/simple-rpg-engine/issues/13#issuecomment-6099619014) (effective Attributes everywhere)
- [Normative Scenario YAML syntax and walk-through gaps](https://github.com/lbacik/simple-rpg-engine/issues/16#issuecomment-6100076156) (`very-hard`)
- [Combat round lifecycle: visible intents and action-speed initiative](https://github.com/lbacik/simple-rpg-engine/issues/77#issuecomment-6130653596) (Rounds, Speed, Intents)
