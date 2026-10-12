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
- It can be used inside or outside Combat. In Combat, using it is the Character's action for the Round, with Speed `normal` (see [Character actions](#character-actions)). If that action is dropped because the Character died earlier in the Round, no copy is consumed.
- Using a Consumable at **full Health** is rejected: no item is consumed and, in Combat, no Round resolves. Using one at partial Health consumes the whole item even if part of the healing is wasted.
- Using an item the Character does not hold is likewise rejected. The UI disables unavailable actions, and the server validates them independently.

### Key Items

A Key Item has no mechanics. It exists to satisfy Conditions and to be given or taken by Effects.

### Magic

`magic: true` is a presentation marker on an item of any kind. Magic items use only the mechanisms above (passive Equipment bonuses and single-use healing). There are no charges, temporary bonuses, spells or other magic effects.

## Health and death

- Character Health is always 0–12. There is no automatic regeneration; content may heal explicitly (for example, a Scene where the Character rests).
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
| Behaviour | `steady` or `heavy` (default `steady`; see [Enemy Intents](#enemy-intents)) |

These limits keep content valid; they do not guarantee that a fight can be won.

## Combat

A Combat is a fight between the Character and the **participants** of one Encounter: one or two Enemies. A Scenario arranges successive fights through content.

### Participants

- A **participant** is one placement of an Enemy in an Encounter. Its identity is the pair (Encounter id, participant id). The participant id is unique within its Encounter and defaults to its Enemy id. Two participants of the same Enemy kind therefore need explicit participant ids. The Enemy id alone, or a position in a list, is never an identity.
- The **participant order** is the order in which the Encounter lists its participants. It orders Intent selection and is captured by participant id when a Round's Intents are selected, to break Enemy Agility ties in that Round. A later content reorder takes effect at the next Round's selection, not in an already announced Round. Targets, wounds and stored Combat state refer to participants by id, never by position.
- Each participant has its own Health, Range, Intent, prepared state and effects. The Enemy kind supplies only its Attributes, maximum Health, Damage, Reach and Behaviour.

### Range and Reach

- The Character has a **Range** to each Enemy participant: **Near** or **Far**. Each starts at the Encounter's `startRange` (default `far`) and exists only during Combat. With two Enemy participants the two Ranges are independent: the Character can be Near one and Far from the other.
- An attack's Reach is checked against the Range to its target. A `melee` attack requires Near. A `ranged` attack works at either Range, with no penalty at Near.
- A Range changes only through a Character action (Advance, Fall back) or an Enemy's own Intent. A change to one Range never moves the other participant.

### Hitting

Both sides hit when **2d6 + attacker's Might ≥ 7 + defender's Agility** (effective values for the Character). Ranged attacks also use Might; Agility is never the attack Attribute. A miss deals no Damage. A hit deals the attacker's Damage. While the Character is **Guarded** (see [Temporary effects](#temporary-effects)), attacks against the Character need **≥ 9 + the Character's Agility** instead.

### Rounds

A Combat proceeds in **Rounds**. In each Round the Character takes exactly one action and every surviving Enemy participant carries out exactly one **Intent**. A Round is one player action and one `step` (see [playthrough-state.md](playthrough-state.md#combat)). There is no initiative roll.

#### Speed and order

- Every Character action and every Intent has a **Speed**: `fast`, `normal` or `slow`.
- Within a Round all `fast` actions resolve first, then `normal`, then `slow`.
- Within one Speed, **higher Agility acts first**: the Character's effective Agility, an Enemy's Agility.
- Ties: the Character acts before an Enemy with equal Agility. Enemy participants with equal Agility, including two of the same Enemy kind, act in the participant order saved when this Round's Intents were selected. Nothing is rolled for order.
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
3. **End of the Round.** Round-scoped effects expire, the round number increases, and the current content order of surviving participants is captured for the next Round. Their next Intents are selected in that order and stored with it.

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

The Character takes exactly one action per Round. An action that names a target names one surviving Enemy participant; with a single participant the target is implicit.

| Group | Action | Speed | Available when (checked on submission) | Resolution |
|---|---|---|---|---|
| Fight | **Defend** | `fast` | always | The Character becomes **Guarded** until the end of the Round. No roll. |
| Fight | **Distract** (target) | `fast` | the target is not **Wary**, and its Intent comes later in the Round's order than this action | Roll 2d6 + Character's Wits ≥ 7 + target's Wits. Success: the target's Intent is **interrupted** (cancelled when its turn comes), its prepared state clears, and the target becomes **Wary** until the end of the next Round. Failure: no effect. |
| Fight | **Attack** (target) | `normal` | the Character's Reach allows it at the Range to the target | Hit roll as above; a hit deals the Character's Damage to the target. |
| Position | **Advance** (target) | `normal` | the Range to the target is Far | The Range to the target becomes Near. No roll. |
| Items | **Use a Consumable** | `normal` | a held Consumable, Character below full Health | Heals as described under Consumables. |
| Leave | **Escape** | `normal` | always | Roll 2d6 + Character's Agility ≥ 7 + the highest Agility among surviving Enemy participants, with **+2 to the roll when no surviving participant was Near in the Round as shown when the Character committed**. Success ends the Combat. Failure: no effect. |
| Position | **Fall back** | `slow` | at least one surviving Enemy participant is Near | Roll 2d6 + Character's Agility ≥ 7 + the highest Agility among the Near participants. Success: every Near Range becomes Far. Failure: no change. |

There is a single Attack: no fast or heavy variant. The Character has no preparation actions.

#### Validity when the action's turn comes

An action legal on submission is **cancelled** (see [Rejected versus cancelled](#rejected-versus-cancelled)) when, at its place in the order:

| Action | Cancelled when |
|---|---|
| Attack | the target has been defeated, or the Character's Reach no longer allows it at the Range to the target |
| Distract | the target has been defeated |
| Advance | the target has been defeated, or the Range to it is already Near |
| Fall back | no surviving Enemy participant is Near |
| Defend, Use a Consumable, Escape | never: incoming actions cannot make these actions unavailable; Character death stops the sequence before the action instead |

The Escape bonus comes from the Round as shown on submission: an Enemy that closes in earlier in the order does not remove it. The opposing Agility of Escape and Fall back is read when the action resolves, so a participant defeated earlier in the Round no longer opposes. A cancelled Consumable is not consumed.

#### Temporary effects

These are the only temporary effects. Each follows the rules under [Timing hooks](#timing-hooks).

- **Guarded** (the Character, from Defend): from the moment Defend resolves until the end of the Round, every attack against the Character, by any participant, needs 2d6 + attacker's Might ≥ **9** + the Character's Agility. The first `melee` attack in the Round that misses the Guarded Character triggers a **counterattack** reaction: the Character's hit roll against that attacker, dealing **1 Damage** on a hit, whatever the weapon. At most one counterattack per Round; later misses trigger none. Guarded is round-scoped and never stored.
- **Wary** (an Enemy participant, from a successful Distract): until the end of the next Round the participant cannot be the target of Distract. Wary outlasts the step and is stored with the Combat.

A counterattack can defeat its target. Like any defeat during a Round, the participant loses its pending action, and defeating the last participant is a victory.

### Enemy Intents

Every Enemy has a **Behaviour**, chosen by the author from an engine-owned list. An Enemy without one is `steady`: select Close in when out of Reach, otherwise Strike, under the same Round ordering as every Intent.

| Behaviour | Meant for | Prepares a heavy attack |
|---|---|---|
| `steady` | ordinary pressure | never |
| `heavy` | telegraphed heavy blows (`melee`) or aimed shots (`ranged`) | sometimes, see selection |

#### Intent vocabulary

These are the only Intents. Each targets the Character.

| Intent | Speed | Kind | Resolution | Cancelled when its turn comes if |
|---|---|---|---|---|
| **Strike** | `normal` | attack | Hit roll; a hit deals the Enemy's Damage. | its Reach does not allow it at the current Range |
| **Close in** | `normal` | movement | The Range to this participant becomes Near. No roll. | the Range is already Near |
| **Prepare** | `normal` | preparing | No roll. The participant becomes **prepared**. | never (except by interruption) |
| **Heavy attack** | `slow` | prepared attack | Hit roll; a hit deals the Enemy's Damage **+3**. | its Reach does not allow it at the current Range |

- A `ranged` Enemy never moves; only a `melee` Enemy closes in. No Intent moves an Enemy away from the Character.
- A prepared state ends when the Heavy attack it prepares resolves or is cancelled for any reason (interruption, Reach, Fall back). The next Intent is then selected from the unprepared state.
- A missed `melee` Strike or Heavy attack against a Guarded Character can trigger the counterattack (see [Temporary effects](#temporary-effects)).
- Each Intent is shown honestly before the Character commits: its kind, its Speed, its place in the order and, for an attack, its Damage. A Prepare also shows what it prepares: a `slow` Heavy attack next Round with its Damage. How an Intent is worded for each Reach (for example "takes aim" and "aimed shot" for a `ranged` Enemy) is presentation.
- There are no defensive, healing or support Intents.

#### Selecting Intents

At the start of a Combat and at the end of each Round, the surviving participants select their Intents **in participant order**. Each takes the first rule that applies:

1. **Prepared.** If the Heavy attack would be in Reach at the current Range, it is selected. Otherwise the prepared state ends and selection continues with rule 2.
2. **Out of Reach.** A `melee` Enemy at Far selects Close in.
3. **Preparing.** A `heavy` Enemy draws one die from the injected random source. On 1–2 it selects Prepare, unless another participant is prepared or has selected Prepare in this same selection; then it does not draw and goes on to rule 4.
4. **Strike.**

So at most one Heavy attack is ever in preparation, and a second participant never turns a Round into two heavy attacks. Only rule 3 uses randomness: the dice are drawn in participant order after the Round's resolution rolls. Re-entry after an Escape selects from the unprepared state. A Combat carried over from a single-Enemy save selects its first Intents without rule 3 ([playthrough-state.md](playthrough-state.md#state-versions-and-migration)).

### End of Combat

- **Victory**: the last surviving participant is defeated (its Health reaches 0), including by a counterattack. The rest of the Round does not resolve.
- **Escape**: a successful Escape ends the Combat; participants later in the order do not act.
- **Death**: the Character's Health reaches 0, and the Playthrough ends on the death Ending.

What follows a victory or an escape is authored on the Encounter (see [content-semantics.md](content-semantics.md#encounters-and-combat)).

### Persistence of wounds

- Damage belongs to the **participant** that took it, within its Encounter. A participant is **defeated** when its Damage taken reaches its Enemy's maximum Health; an Encounter is defeated when **every** participant is.
- With unchanged content, a defeated participant stays defeated. If the Character escapes and later fights the same Encounter again, only the surviving participants take part, each keeping its remaining Health. The Combat starts again at `startRange` with freshly selected Intents and no prepared states or temporary effects. The opening narration is shown as authored; there is no separate narration after a partial victory.
- With unchanged content, a defeated Encounter stays defeated, and its `victory` Outcome applies once, when its last participant falls. Outside an active Combat, raising maximum Health or changing an Enemy kind can revive a participant whose recorded Damage is now below its maximum Health. A later Combat fights the current survivors, and its victory applies the Outcome and Effects again; there is no stored victory/reward marker. Revival that adds a survivor to an active Combat makes the save incompatible instead ([architecture.md](architecture.md#content-compatibility)). An ended Playthrough remains ended.
- A different Encounter with the same Enemy kind is independent and starts at full Health.

### Tactical notes (consequences, not extra rules)

- Fast actions protect but deal no Damage. Defend weakens every attack in the Round; Distract stops one announced Intent outright, including a prepared strike, but not the same participant two Rounds running.
- The counterattack uses the ordinary hit roll, deals 1 Damage and happens at most once per Round, so Defend is protection, never a better source of Damage than Attack.
- Fall back is `slow`: it does not dodge an ordinary `normal` attack in the same Round. It does step out of a `slow` melee attack from a participant acting after the Character, it makes `melee` participants spend an Intent closing in again, and it gives the next Escape its +2 while nothing is Near.
- A Prepare is a Round without an attack from that participant: a window to heal, attack or reposition. The Heavy attack that follows is `slow`, so Defend, Distract and a Fall back by a Character at least as agile all come before it. Because preparing is drawn at random, no fixed sequence of answers is always best.
- Against a `melee` Enemy, Advancing gains little, because the Enemy closes in by itself. Advance matters against `ranged` Enemies, which get free shots while the Character approaches.
- Healing is `normal`: a faster Enemy's attack resolves before it, so drinking at very low Health can come too late.
- Escape's +2 depends only on what the player saw when choosing it, so a slow Character keeps it in a Round that starts with every Enemy Far, even when faster `melee` Enemies close in first. Once an Enemy is Near, a Character with low Agility escapes poorly; leaving early is its best chance.
- A Heavy attack costs its Enemy a whole Round of preparation, so a `heavy` Enemy still deals somewhat less Damage over a fight than a `steady` one. In exchange its blows are larger and announced in advance, which rewards answering them.
- No fight is unwinnable by construction: the worst hit chance (Might 0 against Agility 3) is 1/6, Damage is at least 2, Enemy Health is at most 30, a `melee` Character can always Advance without a roll, and Escape is always available.

### Balance targets

These targets guide authors and reviewers when choosing Enemies and Encounters. They are not engine rules and not test assertions; content validation does not check them. The figures were measured with the [balance harness](https://github.com/lbacik/simple-rpg-engine/tree/prototype/issue-83-combat-balance/docs/spec/mockups/tactical-combat/balance), which assumes a Character at full Health with starting Equipment and perfect play. A real player does somewhat worse.

| Tier | Example | Target | Measured |
|---|---|---|---|
| Ordinary duel | Grey Wolf, Bandit Archer, Drowned Porter, Iron Foreman, Channel Watchman, Brass Auditor | Every Template wins 85% or more, with about half its Health or more left, in 2–16 Rounds | 87–100% for every Template, except the Scholar against the Grey Wolf (51%) |
| Boss duel | Barrow Wight | Fighting Templates win most of the time; the others must prepare or Escape | Hunter 97%, Soldier 75%, Scholar 12% |
| Two participants (hard) | Grey Wolf + Bandit Archer, starting Far | Fighting Templates win 60–95%. The others can Escape: a death risk of at most 10% when trying only to survive, or 15% at Agility 0 | Hunter 97%, Canal Runner 98%, Harbour Warden 92%, Soldier 68%. Scholar, Tide Engineer and Crew Advocate win 5–9%; their minimum death risk is 0–3%, and 14% for the Crew Advocate (Agility 0) |
| Beyond hard | Two Grey Wolves, starting Far | Not a target for ordinary content | Hunter 89%, Canal Runner 92%, Harbour Warden 63%, Soldier 36%, the others 0–2%. Minimum death risk at most 4%, and 15% for the Crew Advocate |

- In every reference fight, a Character at full Health survives the first two Rounds.
- The Scholar's result against the Grey Wolf is accepted. The Scholar's strength lies outside Combat, and the rules give it no extra Damage source.
- When composing two-participant Encounters: two `melee` participants with Agility 2 or more go beyond the hard tier. A `melee` participant paired with a `ranged` one, starting Far, is the hard-tier reference. A Character with low Agility depends on leaving early, so a two-participant Encounter that starts Near is harsher still.
- The Grey Wolf + Bandit Archer and two-Grey-Wolf compositions are the reference fixtures for engine tests. Engine tests check rules on them, not these percentages.

## Sources

- [Core mechanics: attributes, die, tests, combat resolution, character creation](https://github.com/lbacik/simple-rpg-engine/issues/2#issuecomment-6098918991)
- [Combat presentation: abstract exchange vs simple grid board](https://github.com/lbacik/simple-rpg-engine/issues/9#issuecomment-6099395150)
- [Scenario content model: Locations, Scenes, choices, conditions, effects](https://github.com/lbacik/simple-rpg-engine/issues/3#issuecomment-6099088394) (item kinds)
- [Playthrough state: exploration, inventory, persistent encounters and endings](https://github.com/lbacik/simple-rpg-engine/issues/13#issuecomment-6099619014) (effective Attributes everywhere)
- [Normative Scenario YAML syntax and walk-through gaps](https://github.com/lbacik/simple-rpg-engine/issues/16#issuecomment-6100076156) (`very-hard`)
- [Combat round lifecycle: visible intents and action-speed initiative](https://github.com/lbacik/simple-rpg-engine/issues/77#issuecomment-6130653596) (Rounds, Speed, Intents)
- [Tactical Character actions: defence, Wits disruption, Range and Escape](https://github.com/lbacik/simple-rpg-engine/issues/78) (Character actions, per-participant Range, Guarded and Wary)
- [Enemy intent profiles for tactical one- and two-Enemy Combat](https://github.com/lbacik/simple-rpg-engine/issues/79) (Behaviours, Intent vocabulary, selection)
- [Encounter participants: stable identity, individual wounds and partial victory](https://github.com/lbacik/simple-rpg-engine/issues/80) (participants, individual wounds, partial victory)
- [Tactical Combat content, state migration and compatibility contracts](https://github.com/lbacik/simple-rpg-engine/issues/81) (migrated Combat's first Intents)
- [Prototype: tactical Combat balance and meaningful action trade-offs](https://github.com/lbacik/simple-rpg-engine/issues/83) (Heavy attack +3, Escape bonus on commitment, balance targets)
- [Active Combat roster and compatibility after participant reordering or revival](https://github.com/lbacik/simple-rpg-engine/issues/116) (saved Round ties, revival boundaries and repeated victory under changed content)
- [Tactical Combat specification and dependency-ordered implementation handoff](https://github.com/lbacik/simple-rpg-engine/issues/84) (final reconciliation and implementation acceptance)
