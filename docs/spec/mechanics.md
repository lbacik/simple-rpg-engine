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
- **Narrative rules read effective Attributes**: Conditions and narrative Tests. Attributes have no Combat role under the MVP 1.0 rules. The Character sheet shows exactly the values the game uses.
- Enemies have no Attributes of their own: their numbers come from their Combat profile ([Combat](#combat)).

## Dice

The only die roll is **2d6** (2–12). Production rolls each die with `crypto.randomInt(1, 7)`; the random source is injected into the engine (see [architecture.md](architecture.md#engine-contract)). There is no automatic success or failure on any roll, and no critical hits. Combat itself is fully deterministic: no dice and no randomness.

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
- Every Character has **40 maximum Health** (the hero profile's maximum) and starts at full Health. Might does not change Health.
- There is no progression during a Playthrough (no experience or levels).

## Items

Every item is held in a quantity. Inventory has no capacity limit. There are three kinds.

### Equipment

- Three slots: **weapon**, **outfit** and **talisman**. At most one item is equipped per slot.
- An equipped item may grant **+1 to one Attribute** (subject to the +2 cap).
- Weapons keep their slot and optional Attribute `bonus`. Weapon Damage and Reach are retired and have no Combat role ([combat-contract.md](combat-contract.md)). A weapon without a `bonus` is flavour only.
- Outfits do not reduce Damage; like any Equipment they may grant an Attribute bonus.
- A second copy of an equipped item gives no extra benefit.
- Equipment can be changed only **outside Combat** (in the Location view or during an active Scene), and only by the player. Content can never equip or unequip an item, except that removing the last copy of an equipped item unequips it.

### Consumables

- A Consumable restores its declared Health (1–40), capped at maximum Health, and one copy is consumed.
- It can be used only **outside Combat**. The inventory stays disabled during Combat, with the reason `in-combat` (see [combat-contract.md](combat-contract.md#reason-codes)).
- Using a Consumable at **full Health** is rejected: no item is consumed. Using one at partial Health consumes the whole item even if part of the healing is wasted.
- Using an item the Character does not hold is likewise rejected. The UI disables unavailable actions, and the server validates them independently.

### Key Items

A Key Item has no mechanics. It exists to satisfy Conditions and to be given or taken by Effects.

### Magic

`magic: true` is a presentation marker on an item of any kind. Magic items use only the mechanisms above (passive Equipment bonuses and single-use healing). There are no charges, temporary bonuses, spells or other magic effects.

## Health and death

- Character Health is always 0–40. There is no automatic regeneration; content may heal explicitly (for example, a Scene where the Character rests).
- Damage is a fixed amount; there is no Damage roll.
- A combatant at 0 Health is dead. **Character death ends the Playthrough** on the Scenario's death Ending. There are no checkpoints, no resurrection and no rollback; the ended Playthrough stays viewable, and the player can start a new one.

## Enemies

An **Enemy** is a reusable, Scenario-defined, named kind of opponent bound to one fixed Combat profile (`raider`, `brute`, `sentinel` or `archer`). It has no Attributes or statistics of its own: all numbers come from the profile in the versioned rules table. See the [Combat contract](combat-contract.md#profiles) and the normative rules ([rules §8.1](../sources/combat-mvp-1.0/rules.md#81-starting-profiles)).

## Combat

Combat is fought under the MVP 1.0 stance, card and range rules:

- the normative rules: [`docs/sources/combat-mvp-1.0/rules.md`](../sources/combat-mvp-1.0/rules.md);
- the public core contract (actor ids, reason codes, event types, document shapes, named deviations from MVP 1.0): [combat-contract.md](combat-contract.md).

In brief: one standalone MVP Combat per Encounter (or Arena Setup) — the hero and at most one Companion against 1–5 enemies — with stances, cards, stamina and cooldowns, Melee/Near/Far range as a relation between two characters, engagements and proximity groups, frozen enemy and Companion plans, and results `WIN` / `LOSS` / `LOSS_SURRENDER` / `DRAW_LIMIT`. Only the Character's Health, the participants' wounds and the Companion's presence cross the Combat boundary ([ADR 0010](../adr/0010-campaign-health-is-the-hero-combat-hp.md)).

The tactical rules formerly described here (Speed/Agility order, Reach, Behaviour, escape, Near/Far-only Range, Guarded/Wary, counterattacks, preparation, per-participant Range) are retired; the [tactical Combat handoff](tactical-combat-handoff.md) is historical.

## Sources

- [Core mechanics: attributes, die, tests, combat resolution, character creation](https://github.com/lbacik/simple-rpg-engine/issues/2#issuecomment-6098918991)
- [Combat presentation: abstract exchange vs simple grid board](https://github.com/lbacik/simple-rpg-engine/issues/9#issuecomment-6099395150)
- [Scenario content model: Locations, Scenes, choices, conditions, effects](https://github.com/lbacik/simple-rpg-engine/issues/3#issuecomment-6099088394) (item kinds)
- [Playthrough state: exploration, inventory, persistent encounters and endings](https://github.com/lbacik/simple-rpg-engine/issues/13#issuecomment-6099619014) (effective Attributes everywhere)
- [Normative Scenario YAML syntax and walk-through gaps](https://github.com/lbacik/simple-rpg-engine/issues/16#issuecomment-6100076156) (`very-hard`)
- [Map: adapt Combat to simple-rpg-engine MVP with command-panel UI](https://github.com/lbacik/simple-rpg-engine/issues/179) (MVP 1.0 rules, contract and deviations: [#181](https://github.com/lbacik/simple-rpg-engine/issues/181), [#182](https://github.com/lbacik/simple-rpg-engine/issues/182), [#183](https://github.com/lbacik/simple-rpg-engine/issues/183), [#184](https://github.com/lbacik/simple-rpg-engine/issues/184))
