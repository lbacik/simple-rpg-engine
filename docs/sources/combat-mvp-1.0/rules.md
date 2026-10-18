# simple-rpg-engine — stances, cards and ranges

**An original map-free combat system for a single-player browser RPG**  
**MVP 1.0 specification · 18 October 2026 · English canonical translation**

This document is a self-contained specification: it is sufficient to implement and play fights without the rulebooks of other games. The player controls one hero against 1–5 opponents. Optionally, one automatic companion helps them. The decision for a round is **stance + one card or action + the required target**. Movement also uses up the action.

**Origin of the rules.** All numbers, formulas, cards, phase order, AI algorithms and the range model in sections 1–16 are an original proposal. The inspirations are limited to abstract distances and engagement in *13th Age*, the choice of stance in *The One Ring*, and the choice of mutually interacting actions in *Mouse Guard*. The document does not reproduce the rules of those games and does not require combining them. Section 17 lists the sources and the differences. The parameters are a starting point for testing, not a declaration of confirmed balance.

## 1. Goal and scope of the MVP

Combat should reward reading the opponent's intent, choosing a target, managing stamina and accepting a deliberate risk. Position matters through range and concrete engagements, without coordinates, squares, directions or measuring metres.

The base version includes:

- Three ranges: **Melee / Near / Far**.
- Three stances: **Aggressive / Balanced / Defensive**.
- Six always-visible cards: **Heavy Blow, Counterattack, Feint, Cover, Charge, Prepare**.
- A plain Strike, Brace and three movement actions as available auxiliary buttons.
- Open, frozen intents of the opponents and the companion.
- Deterministic hits, damage and tie-breaking.
- At most two enemy primary attacks per round, in total for the player's whole party.
- Victory, defeat, surrender and a 30-round limit.

There is no card drawing, no discard piles, no random criticals, no equipment, no level progression, no healing and no periodic effects. A card is a way of presenting an ability, not a consumable item. All six cards are unlocked from the first fight. The hero has no shot in the base set; a ranged opponent and the optional archer are enough to exercise the ranges.

Full information means that for a specific target a best move may exist. The MVP tests the quality of trade-offs between health, time, stamina and the companion's safety. It does not simulate guessing a hidden card.

## 2. Glossary, units and initial state

### 2.1. Participant parameters

| Field | Hero | Meaning |
|---|---:|---|
| `hp`, `maxHp` | 40/40 | Health; 0 means immediate elimination |
| `stamina`, `maxStamina` | 10/10 | Stamina paid when the choice is confirmed |
| `skill` | 4 | Base attack effectiveness |
| `defense` | 4 | Base difficulty of hitting the character |
| `armor` | 1 | Reduction of each damage packet that hits |
| `power` | 0 | Bonus to the raw damage of the character's own hit |
| `stance` | Balanced | Current stance; chosen anew every round |
| `groupId` | `g0` | Proximity group, described in section 3 |
| `guard` | 0 | Protection pool consumed after armor; disappears after the round |
| `readyRound` | `null` | Number of the round in which Prepare takes effect |
| `availableRound` | All cards from 1 | Earliest round in which each card may be used again |

Opponents have HP, skill, defense, armor, power, stance and position, but **have no stamina and no card cooldowns**. Their constraints are an open action cycle and two attack slots. This is an intended asymmetry of the MVP. The companion has stamina and uses the hero's rules, with a limited set of actions.

All mechanical quantities are integers. `clamp(x, lo, hi) = min(hi, max(lo, x))`. HP and stamina stay within the range from 0 to the maximum. Damage may be 0. Excess damage is lost.

### 2.2. Terms

| Term | Definition |
|---|---|
| Free | The participant has no engagement with any living enemy |
| Engaged | The participant has at least one engagement with a living enemy |
| Intent | The revealed action, stance and target of an AI for the current round |
| Primary attack | Strike, Heavy Blow, Feint, the offensive part of Charge, or Shot |
| Direct attack | Strike, Heavy Blow or the offensive part of Charge; only these actions trigger Counterattack |
| Attack attempt | An attack after checking that both characters are alive and its range is legal; it may miss |
| Riposte | An additional single blow that is part of Counterattack; it does not trigger further reactions |
| Cover | The name of the card that takes over one attack on an ally |
| Guard `guard` | A numeric absorption pool; separate from redirection by Cover |
| Cancellation | An announced effect does not take place, e.g. the target died or the shooter became engaged |

Every character has an immutable ASCII identifier: `h01`, `c01`, `e01` and so on. ID ties are broken by ascending character-by-character comparison. The order of cards on screen does not change IDs.

## 3. Ranges and engagement without a map

### 3.1. Unambiguous representation of range

Range is **a relation between two characters**, not an enemy label measured only from the hero. This lets it also work with a companion.

The engine stores:

1. One `groupId` for each living character. A shared group means the characters are near each other.
2. A set of unordered pairs `engagements`, e.g. `[h01, e01]`. A pair means that two opponents are engaged with each other.

Range `range(a, b)` is always computed like this:

```text
if a.id == b.id: SELF, used only to validate a self target
if pair(a, b) is in engagements: MELEE
if a.groupId == b.groupId: NEAR
otherwise: FAR
```

`SELF` is a technical marker, not a fourth combat range. An engagement may be created only between living opponents in the same group. There is no engagement between allies. Range is symmetric.

Groups are not squares or rows. They are a minimal memory of proximity relations: characters in the same group are mutually Near, except for directly engaged pairs. Two different groups are always Far. Neither metres nor the order of groups are stored. They can be presented as lists such as “with the hero”, “with the archer”, without a board.

**Consequence of this abstraction:** joining the target's group also brings the character closer to all other members of that group. This is an explicit rule, not an accidental change of the other ranges. The MVP has no arrangement “A near B, B near C, A far from C” for three unengaged characters.

### 3.2. What ranges enable

| Relation to the target | Possible actions |
|---|---|
| Melee | Melee Strike, Heavy Blow, Feint, Counterattack against that attacker |
| Near, opponent | A free actor may enter Melee through Approach or Charge |
| Near, ally | May be chosen as the target of Cover |
| Far | A free actor needs an Approach to the target's group before it can enter Melee |
| Near or Far | Shot, if the shooter is free; the target's status does not block the shot |

Everyone sees every living character. There is no terrain cover and there are no obstacles. Merely being in an enemy's group does not restrict the choice of targets. Armor and an active Cover are the only barriers once range is satisfied.

### 3.3. Multiple engagements

The hero can be engaged with `e01`, `e02` and `e03` at the same time. A melee attack may choose any of these enemies. If the hero and the companion are engaged with the same enemy, that does not mean they are engaged with the other opponents.

A new free attacker may join the fight against an already engaged target. There is no limit on the number of edges; the limit of two enemy attacks described in section 9 concerns announced attacks, not geometry or engagements.

An engaged actor cannot use Approach, Charge or Withdraw. It may attack its own engaged enemies, Brace, Prepare, Cover a nearby ally or Disengage. It cannot “click its way” into Melee with a new target without removing its current engagements.

Elimination immediately removes all edges of the dead character. The remaining edges stay. The death of one of three enemies does not free the character from the other two.

### 3.4. Movement actions

Each movement action uses the whole action of the round. It grants no plain attack, no guard and no extra regeneration. It may be combined with any stance.

| Action | Cost | Condition when chosen | Result |
|---|---:|---|---|
| Approach `approach` to a Far target | 0 | Actor free; any other living target | Record variant `JOIN`: the actor joins the target's group; no engagement is created |
| Approach `approach` to a Near enemy | 0 | Actor free; living opponent | Record variant `ENGAGE`: create one engagement with the chosen enemy |
| Disengage `disengage` | 1 | Actor engaged | Remove all its engagements; it stays in the same group |
| Withdraw `withdraw` | 0 | Actor free | Move it to a new empty group; it is Far from everyone else |

It is allowed to approach a Far ally in order to be able to Cover it in the next round. Approaching an ally that is already Near is illegal. Approaching an enemy in Melee is also illegal.

When `JOIN` is executed, the current group of the recorded target is used. If the actor is already in that group, the move does not change the state and does not turn into an engagement. `ENGAGE` requires the target to still be Near; if it has gone Far, the move is lost. In both variants the actor must still be free and the target alive. The new Withdraw group receives the next ID from a counter stored in the state, e.g. `g2`. Empty groups may be removed, but the IDs of the remaining groups must not change.

**There are no attacks of opportunity and no test to break free.** Disengage removes even three engagements for the same price. In that round it invalidates attacks that require the old Melee, but a later Approach or Charge by an enemy can create a new engagement. Safely moving from Melee to Far usually requires two of the character's own actions: Disengage, then Withdraw. Withdraw is not an escape from the skirmish.

## 4. Stances

A stance applies from the confirmation of the round until the end of its resolution, including before the character makes its own blow. Choosing and changing a stance costs no stamina. There is no penalty for changing between rounds.

| Stance | Attack modifier | Defense modifier | Available special cards |
|---|---:|---:|---|
| Aggressive `aggressive` | +2 | −2 | Heavy Blow, Feint, Charge, Prepare |
| Balanced `balanced` | 0 | 0 | Heavy Blow, Counterattack, Feint, Cover, Prepare |
| Defensive `defensive` | −2 | +2 | Counterattack, Cover, Prepare |

The basic Strike, Brace, Approach, Disengage and Withdraw are available in every stance. Shot, for units that have it, is available in every stance. A stance does not change range, the number of actions, armor or regeneration.

The modifiers apply to all of the character's attacks, including the riposte and Shot, and to defense against all attacks, including ranged ones. Feint is an exception: it ignores the positive stance bonus to the target's defense. The numeric effects are original; they are not values from *The One Ring*.

## 5. Cards and actions

### 5.1. Implementation table

`A` means Aggressive, `B` Balanced, `D` Defensive. Damage in the table is raw, before power, Prepare and reductions. Priority is used only for the order of blows: higher acts earlier.

| ID / card | Cost | Stances | Target and range when chosen | Card accuracy | Base damage | Priority | CD |
|---|---:|---|---|---:|---:|---:|---:|
| `heavy` Heavy Blow | 4 | A, B | One enemy in Melee | −1 | 13 | 10 | 1 |
| `counter` Counterattack | 3 | B, D | Self; at least one engagement | +2 for the riposte | 7 for the riposte | Reaction | 1 |
| `feint` Feint | 2 | A, B | One enemy in Melee | +2 | 6, or 9 against stance D | 30 | 0 |
| `cover` Cover | 2 | B, D | One other living ally that is Near | — | — | Defense | 0 |
| `charge` Charge | 3 | A | One Near enemy; actor free | 0 | 6 | 20 | 0 |
| `prepare` Prepare | 0 | A, B, D | Self | — | — | Support | 0 |

`CD = 1` blocks use for one full following round. A card played in round `r` is available from `r + 2`. In general `availableRound = r + CD + 1`. Initially all cards have the value 1. CD = 0 allows the card to be repeated in the next round. The cooldown and the cost are spent already at confirmation, even when the later effect is cancelled.

### 5.2. Heavy Blow

On declaration the character receives **Exposed: −2 to defense until the end of the current round**. It also applies before the character's attack and after a miss. It does not depend on whether the blow managed to take place. Exposed stacks with the Aggressive stance: a hero with base defense 4 then has defense 0.

The blow itself has a lower priority than a plain Strike. It pays off for breaking through HP or armor, but it can let the enemy strike earlier. It does not ignore guard or armor and does not interrupt an action other than through ordinary elimination of the target.

### 5.3. Counterattack

The card prepares one counter token. The attacker is not chosen in advance. The token is consumed by **the first legal direct attack attempt** whose actual recipient is the counterattacker and whose attacker is engaged with it at the moment of the attack.

Procedure:

1. Consume the token, even if the attack later misses.
2. Compute the hit. A blow that hits receives a parry of 6 raw damage, before armor and guard.
3. After the blow is settled, if both sides are still alive and engaged, immediately perform one riposte: accuracy +2, base damage 7.
4. The riposte can also happen after the attacker misses or is fully parried. It is a separate hit attempt.

Counterattack does not protect against Feint, Shot or a riposte. It grants no `guard` pool. It does not react to the mere announcement of a cancelled attack. Against two blows it parries only the first. A riposte does not trigger Counterattack or Cover redirection; there are no reaction chains. After a lethal hit the counterattacker does not riposte. An unused token disappears after the round without refunding the cost.

### 5.4. Feint

Feint:

- Has a higher priority than Strike and Heavy Blow.
- Ignores the positive stance bonus to the target's defense; the negative modifier of Aggressive still applies.
- Ignores all `guard` protection, without consuming it.
- Deals a base 9 instead of 6 against an actual recipient in the Defensive stance.
- Does not trigger Counterattack, but is subject to armor.

Feint does not remove the opponent's stance, Prepare or intent. “Breaking the defense” means the described omission of the bonus and guard, not a stun. If Cover takes over the attack, all of the above properties are checked against the protector.

### 5.5. Cover

The card grants the protector guard 6 for the current round and records the indicated ally as the ward. It does not move characters and does not create an engagement.

The first legal **primary attack** on the ward is redirected to the protector, if both are alive and still Near. The attack's target selection and range are checked first against the original target; then defense and damage are computed against the protector. No second range test to the new recipient is performed: the takeover is exactly the exception that allows covering a neighbour. It covers melee blows and Shot.

The redirection is consumed on the attempt, even if the attack misses. Direct attacks on the protector may consume its guard earlier, but they do not consume the redirection token. Subsequent attacks on the ward hit it normally. If the proximity condition is not met, the attack goes to the original target, and the token remains for a possible later attack in that round.

An attack may be redirected at most once. Mutual Cover between the hero and the companion does not create a loop. When several effects would protect the same character, the protector with the lowest ID wins; the other tokens are not consumed. In the MVP, at most one companion means this last case mainly concerns future extensions.

Without a companion the card is visible but inactive, with the description “Requires a nearby ally”. A character cannot cover itself. There is no automatic interception of enemy movement.

### 5.6. Charge

When chosen it requires a free actor, the Aggressive stance and a Near enemy. It does not reach Far directly.

In the movement phase it creates an engagement with the target, if the actor is still free and the target is still Near. It records the movement's success. In the blow phase, with priority 20, it performs an attack with base damage 6, but only if the movement succeeded, both characters are alive and they are still engaged.

A failed movement does not turn Charge into a plain Strike, even if someone later creates the required engagement. A successful Charge can block an announced Shot by engaging the shooter. It does not block the shooter's other melee attack or Prepare. Enemies that use Charge are subject to the same rules, except for the stamina payment.

### 5.7. Prepare

In the current round the character does not attack and receives no guard. Record `readyRound = r + 1`. At the end of the current, non-terminal round a living hero or companion recovers an extra 3 stamina, i.e. 5 in total together with base regeneration.

In round `r + 1`, the character's first declared offensive card or action receives **+2 to hit and +3 to raw damage**. This applies to Strike, Heavy Blow, Feint, Charge, Shot and the Counterattack riposte. The bonus is captured into the action's data when the action is confirmed, and the marker is consumed then, even if later there is no legal hit or the Counterattack is not triggered.

Prepare does not stack and grants no extra action. If movement, Brace or Cover is chosen in the next round, the bonus is lost at the end of that round. Repeating Prepare establishes a new bonus for the next round, without keeping the old one. An enemy may receive the bonus to its next attack, but does not benefit from regenerating a resource it does not have.

### 5.8. Basic actions

| ID / action | Cost | Condition | Effect |
|---|---:|---|---|
| `strike` Strike | 0 | One enemy in Melee | Accuracy 0, base damage 8, priority 20, CD 0 |
| `brace` Brace | 0 | Self | Guard 6; no attack and no extra regeneration |
| `shot` Shot | 0 | Only a unit with this ability; free; enemy Near or Far | Accuracy 0, damage according to the profile, priority 20 |

Enemies may have their own base Strike and Heavy Blow values from the profile table. The other modifiers, Exposed and priorities stay the same. The hero and the companion use the values of the card tables, unless the companion's profile defines its own Shot.

## 6. Hits, defense and damage

### 6.1. Hitting without rolling

First check whether the attacker and the original target are alive and whether the attack is legal in the current state. A melee attack requires their specific engagement. Shot requires a free shooter. Only a legal attempt can trigger Cover or Counterattack.

After any redirection, determine the actual recipient `t`:

```text
attackScore = attacker.skill + stanceAttack(attacker)
              + cardAccuracy + preparedAccuracy

stanceDefenseUsed = stanceDefense(t)
if the attack is Feint: stanceDefenseUsed = min(0, stanceDefenseUsed)

defenseScore = max(0, t.defense + stanceDefenseUsed - exposedPenalty(t))
hit = attackScore >= defenseScore
```

`exposedPenalty` is 2 after a declared Heavy Blow, otherwise 0. `preparedAccuracy` is 2 or 0. A tie is a hit. There are no rolls, no critical thresholds and no guaranteed hit. A miss deals 0 and does not consume guard. The interface shows “will hit” or “will miss”, not a percentage chance.

### 6.2. Order of reductions

```text
raw = max(0, baseDamage + attacker.power + preparedDamage)
afterParry = max(0, raw - parry)        # parry = 6 only for a triggered Counter
afterArmor = max(0, afterParry - t.armor)

if the attack is Feint:
    absorbed = 0
otherwise:
    absorbed = min(t.guard, afterArmor)
    t.guard -= absorbed

hpLoss = afterArmor - absorbed
t.hp = max(0, t.hp - hpLoss)
```

The block above is executed only on a hit. `preparedDamage` is 3 or 0. Choose the Feint base according to the stance of the actual recipient. Armor is subtracted from each separate hit. Guard is a shared, decreasing pool for all attacks of that round; it does not renew between blows. There is no minimum damage.

Reduction example: raw 12, parry 6, armor 1, guard 3 → `12 − 6 = 6`, `6 − 1 = 5`, guard absorbs 3, HP loss = 2. Guard must not be subtracted before armor, nor may its full value be applied to every attack.

### 6.3. Order of blows and elimination

Primary attacks are sorted by:

1. Priority, descending: Feint 30, Strike/Shot/Charge 20, Heavy Blow 10.
2. The actor's role: hero, then companion, then opponents.
3. Actor ID, ascending.

Stance does not change priority. Ties are not simultaneous. The first blow can eliminate a second actor and remove that actor's later attack. A riposte happens immediately after the attack that triggers it, before the queue moves on.

After every HP change, remove the engagements of the eliminated and check the outcome: hero HP = 0 means `LOSS`; no living enemies means `WIN`. In the MVP there is no simultaneous dealing of damage to both sides. The companion's elimination does not end the fight. No announced action chooses a new target after the death of the previous one.

## 7. Full round order

State phases: `PLAN`, `CHOOSE`, `RESOLVE`, `FINISHED`. The first round has number 1.

| Step | Phase | Activities |
|---:|---|---|
| 1 | `PLAN` | Remove leftovers of guard, counter, Cover, Exposed and bonuses attached to the previous action; keep engagements, HP, stamina, `availableRound` and a valid Prepare |
| 2 | `PLAN` | Based on the initial state, choose the enemies' stances, actions and targets; assign the two attack slots; freeze the plan |
| 3 | `PLAN` | Choose the companion's plan according to section 10, based on the same state and the frozen enemy plan |
| 4 | `CHOOSE` | Show all intents; the player chooses a stance, one action and the required target |
| 5 | `RESOLVE` | Atomically validate the whole command, costs, stance, range, target and cooldown. An error leaves the state unchanged in `CHOOSE` |
| 6 | `RESOLVE` | For a legal command, deduct the cost of the hero and the companion, set cooldowns, apply all chosen stances, capture Prepare bonuses into offensive actions |
| 7 | `RESOLVE` | Simultaneously establish declaration effects: Exposed, the guard of Brace/Cover/enemy waiting, Cover and Counter tokens, the next Prepare |
| 8 | `RESOLVE` | Execute movements: hero → companion → enemies by ID; Charge performs only its movement part here |
| 9 | `RESOLVE` | Build the queue of primary attacks according to section 6; before each, re-check life and range; settle redirection, Counter, hit, damage and any riposte |
| 10 | `RESOLVE` | If the fight continues: the living hero and companion recover 2 stamina, plus an extra 3 after Prepare; cap at the maximum |
| 11 | `RESOLVE` | Update the enemies' wait age; remove round effects; remove an unused Prepare valid no later than this round; write the log |
| 12 | `PLAN` / `FINISHED` | After a full round 30 without victory/defeat, set `DRAW_LIMIT`; otherwise increment the number and go to planning |

Declaration effects act before all blows, even when their owner would act later. Some tokens may therefore be established and then lose their meaning after their owner's elimination. There is no separate phase in which the player's party attacks before all enemies.

In the MVP nothing changes positions or HP between confirmation and the movement phase, which is why the companion plan chosen in step 3 still has a legal declaration. It does not change its plan after the player's choice. The implementation's validation must nevertheless reject a corrupted save or a stale command, instead of paying for part of the round.

A terminal round ends immediately after a lethal hit: without regeneration, wait-age accounting, effect removal or further blows. Mark the final save as `FINISHED`, keeping the events that actually took place. On the result screen, temporary effects are not presented as an active next round. The “Surrender” button in `CHOOSE` sets `LOSS_SURRENDER` without simulating attacks.

Costs cannot be financed by regeneration that has yet to happen. Stamina 0 does not weaken base statistics; it only blocks paid actions. The always-legal Brace guarantees that the choice can always be completed.

## 8. AI of a single opponent

### 8.1. Starting profiles

Each enemy has `power = 0`, `waitAge = 0` and `phaseOffset = 0`, unless the scenario states otherwise. `S` means Strike, `H` Heavy Blow, `B` Brace, `P` Prepare, `R` Shot. Stances are given with each action: the letter outside the parentheses is the action, the stance letter (A/B/D) is inside them.

| Profile | HP | Skill | Defense | Armor | Strike / Heavy / Shot | Repeating cycle |
|---|---:|---:|---:|---:|---|---|
| Raider `raider` | 14 | 4 | 4 | 0 | 7 / 12 / — | `S(A), H(A), S(B), B(D)` |
| Brute `brute` | 26 | 4 | 4 | 1 | 8 / 12 / — | `H(A), P(D), S(B)` |
| Sentinel `sentinel` | 20 | 4 | 4 | 1 | 6 / 11 / — | `B(D), S(B), H(A)` |
| Archer `archer` | 12 | 4 | 4 | 0 | 4 / — / 6 | `R(B), R(B), P(D)` |

Choosing the cycle position: `index = (round - 1 + phaseOffset) mod length(cycle)`. The cycle advances by global rounds, also after a cancelled attack, a movement, waiting or the lack of a slot. An enemy does not remember an unexecuted Heavy Blow for the next round. The phase offset is a visible part of the scenario, not a random draw.

### 8.2. Target selection

An enemy attacking in melee chooses, among its engaged opponents, the one with the lowest current HP; a tie is broken by ID. If it is not engaged with anyone, it chooses the living hero. It does not bypass the hero to chase a free companion on its own.

A free archer chooses the living hero. An engaged archer always replaces the whole cycle entry with a plain Strike in the Balanced stance against the engaged opponent according to the rule above, even if the entry was Prepare. This is the only such profile exception.

All targets are frozen before the player's choice. After the target's later death, its moving away, or the shooter becoming engaged, the action may be lost, but the enemy does not change it into a more favourable one. Cover may take over a legal attack according to its open rules.

### 8.3. Adapting the intent to range

For a melee entry `S` or `H`:

- If the enemy is engaged with the chosen target: it keeps the entry.
- If it is free and the target is Far: it replaces the entry with Approach `JOIN`, keeping the entry's stance.
- If it is free, the target is Near, and the entry has the Aggressive stance: it replaces the entry with Charge; the base damage of Charge is 6 for every profile.
- If it is free, the target is Near, and the entry has the Balanced stance: it replaces the entry with Approach `ENGAGE` in Balanced.

Brace and Prepare do not require an engagement, so they stay as they are. A free Shot has legal range to every enemy. The absence of a living hero is already a final state, so the AI does not need to plan a new round.

If an enemy has announced a plain Strike and the hero Disengages, the enemy does not add a Charge after the fact. If it has announced a Charge and an earlier movement by the hero has engaged it with another participant, it is no longer free and its movement fails.

The AI does not read the currently highlighted card and does not recompute its plan after the player confirms. Reopening a save in `CHOOSE` restores the same plan.

## 9. Several opponents at once

### 9.1. The two-attack budget

After the individual intents are chosen, build the list of enemies whose resulting intent is a primary attack, including Charge and Shot. Approach, Brace and Prepare are not candidates. MVP enemies do not use Counterattack, Feint or Cover.

Sort the candidates in turn by:

1. `waitAge` descending.
2. Base damage of the resulting intent descending, without power and Prepare.
3. ID ascending.

The first two receive `attackSlot = true`. The others replace their resulting intent with **Guarded Wait** `wait`: they do not move, do not attack, and receive guard 3 in the declaration phase. They keep their chosen stance. They do not get Exposed for a rejected Heavy Blow. They do not consume Prepare, but its validity can still expire after the round.

After a non-terminal round, set `waitAge = 0` for living candidates with a slot, also after their attack was cancelled. Increase the age of living candidates without a slot by 1. Set 0 for the other living enemies. Skip the dead.

This is a rotation of access to attacking, not the order in which the blows themselves are executed. The blows are still sorted by section 6. A slot freed by killing or engaging a shooter **is not refilled in that round**. The UI shows Waiting as a distinct open intent, not a hidden third attack.

### 9.2. What numerical superiority means

The third and further enemies:

- Have their own HP and must be defeated.
- Can enter Melee with a plain Approach, if such an intent resulted from the plan.
- Can take over an attack slot in the next round through wait age.
- Can Brace or Prepare in a given round instead of competing for a slot.

There is no extra, hidden “surrounded” bonus, pressure, damage multiplier, or raising of the limit when there is a companion. This keeps the MVP small. Five enemies still mean a longer fight and more target changes, not five simultaneous blows on the hero.

The limit applies to all enemy attacks on the hero and the companion combined. The hero's attack, the companion's attack and their ripostes do not occupy these slots. There are no enemy ripostes in the base set, so the upper limit of two primary attempts does not hide additional reactions.

## 10. Automatic companion

### 10.1. Common rules

The MVP allows enabling **one** companion or playing without one. A larger number is an extension. The companion performs one action and chooses one stance per round. It receives no free movement. Its plan is visible before the player's decision and is not changed after it.

| Parameter | Party Sentinel | Party Archer |
|---|---:|---:|
| HP | 24 | 18 |
| Stamina | 8/8 | 8/8 |
| Skill / defense | 4 / 4 | 4 / 4 |
| Armor / power | 1 / 0 | 0 / 0 |
| Starting group | Same as the hero's | Same as the hero's |
| Set | Strike, Cover, Brace, Prepare, Approach, Disengage | Shot 5, Strike, Prepare, Approach, Disengage |

The companion's melee Strike has a base 8, as for the hero. Both recover 2 stamina after a non-terminal round and an extra 3 after Prepare. They have no cooldowns of their own beyond the universal CD 0 semantics of the available actions. They cannot use other cards.

A companion at HP = 0 is out until the end of the skirmish. It does not choose a plan, grants no bonus and takes no damage. The hero can still win. There is no healing or resurrection in combat. A new test skirmish starts with the full state of all participants.

### 10.2. Party Sentinel AI — first matching rule

1. If it has less than 2 stamina: Prepare in Defensive.
2. If the hero is Near and at least one enemy intent with an assigned attack slot targets the hero: Cover the hero in Defensive.
3. If it is engaged: Strike in Balanced at its engaged enemy with the lowest HP, tie by ID.
4. If the hero is Far: Approach `JOIN` to the hero in Defensive.
5. Otherwise: Brace in Defensive.

The Sentinel does not intercept an intent that has only been redirected by someone else's Cover and does not predict the hero's choice. Condition 2 checks the raw, frozen target of the announcement. Frequent use of Cover is a deliberate cost of losing its offence.

### 10.3. Party Archer AI — first matching rule

1. If it is engaged and has at least 1 stamina: Disengage in Defensive.
2. If it is engaged and has 0 stamina: Prepare in Defensive.
3. If it is free: Shot in Balanced at the living enemy with the lowest HP, tie by ID.

When choosing a target it does not forecast the hero's action. If the hero kills the chosen target earlier, the companion's Shot is lost. All enemies are in range of a free archer. The companion does not occupy a place in the enemies' budget.

## 11. Worked examples

All examples apply exactly the stated rules. Stances are marked A/B/D. Unless stated otherwise, the hero has the starting statistics and the opponents have power 0. “End” in the tables means the state after regeneration, except in the round that ends the fight.

### 11.1. A full duel: the hero against a Brute

Start: hero 40 HP, 10 stamina; Brute 26 HP, armor 1, cycle from the first entry. Both in `g0`, the engagement `[h01, e01]` exists.

| Round | Brute's open intent | Hero's choice | Computation and result | End state |
|---:|---|---|---|---|
| 1 | Heavy Blow A, base 12 | Counterattack D, cost 3 | Brute: attack `4+2−1=5` against the hero's defense `4+2=6`: **misses**. The attempt consumes the Counter and triggers the riposte. The Brute has defense `max(0,4−2−2)=0`. Riposte: `4−2+2=4 ≥ 0`, damage `7−1=6` | Hero 40 HP, stamina `10−3+2=9`; Brute 20 HP; Counter available from r. 3 |
| 2 | Prepare D | Feint B, cost 2 | Feint ignores the D bonus to defense: `4+2=6 ≥ 4`. Base against D = 9, after armor `9−1=8`. The Brute establishes Prepare for r. 3 | Hero 40 HP, stamina `9−2+2=9`; Brute 12 HP |
| 3 | Strike B with Prepare | Heavy Blow A, cost 4 | The Brute's plain blow has priority 20, so it precedes Heavy 10. Attack `4+2=6` against the exposed hero's defense `4−2−2=0`; raw `8+3=11`, after armor 10. The hero then hits: `4+2−1=5 ≥ 4`; deals `13−1=12` | Hero 30 HP, stamina 5; Brute 0 HP; **WIN**, without final regeneration |

The first riposte is legal despite the Brute's miss. Prepare in r. 2 gives a bonus to the attack in r. 3, but does not protect against Feint in the round in which it is established. In r. 3 the hero chooses to end the fight at the price of losing 10 HP. Heavy Blow alone does not allow overtaking a plain Strike.

### 11.2. Counterattack against two blows that hit

This example is a separate test state: the hero in D, without Prepare, has a Counter. Two engaged attackers perform Strike A with base 7; each has `skill=4`, `defense=4`, armor 0. Both already have attack slots.

1. First: score `4+2=6`, hero's defense `4+2=6`: hits. Parry and armor: `max(0,7−6−1)=0` HP. The riposte hits that attacker's defense `4−2=2`, because `4−2+2=4`; deals 7.
2. Second: also hits `6 ≥ 6`, but the Counter token is consumed. The hero loses `7−1=6` HP and does not riposte again.

Result from full health: hero 34 HP, first attacker −7 HP, second undamaged. In a group fight, Counterattack is not a full defense against the whole round.

### 11.3. Three Raiders and attack-slot rotation

Start: three Raiders `e01`, `e02`, `e03` have 14 HP each, `phaseOffset=0`, are engaged with the hero in one group; each one's age = 0.

**Round 1:** all want Strike A with base 7. Ties give the slots to `e01` and `e02`; `e03` waits, has guard 3 and keeps A. The hero chooses Counterattack D. Settlement as in 11.2: the hero ends with 34 HP and 9 stamina, `e01` has 7 HP, the others 14. The age of `e03` grows to 1; the others have 0.

**Round 2:** all want Heavy Blow A with base 12. The slots go first to `e03` through age 1, then to `e01` through the lower ID in the tie; `e02` waits with guard 3, without Exposed.

The hero chooses Strike A on `e01`. Its priority 20 precedes both Heavy 10. It hits `4+2=6` against the exposed defense `max(0,4−2−2)=0` and deals 8: `e01` dies. We do not assign the freed slot to `e02`.

The blow of `e03` remains: attack `4+2−1=5` hits the hero with defense `4−2=2`; damage `12−1=11`. The hero ends with **23 HP and 10 stamina**; `e02` and `e03` are alive. Their two engagements with the hero still exist. `e02` has age 1, `e03` has 0. Slot selection and blow order are two different procedures.

### 11.4. Far → Near → Melee and interrupting a Shot

Start: hero in `g0`; a lone Archer in `g1`; no engagements. Their range is Far. The Archer starts its cycle from `R(B)`.

- **Round 1:** the hero chooses Approach D, variant `JOIN` to the Archer. The hero moves to `g1`, so both are Near. There is no hero attack and no engagement. The Archer's Shot stays legal, but `4 < 4+2`: it misses.
- **Round 2:** the Archer announces a second Shot B. The hero chooses Charge A for 3. The movement creates `[h01,e01]` before the blow phase. The hero hits `4+2=6 ≥ 4`, deals 6, the Archer has 6 HP. The announced Shot is lost because the shooter is engaged. It does not turn into a melee Strike. The hero ends the round with 9 stamina.
- **Round 3:** the engaged Archer replaces the Prepare entry with Strike B with base 4. The hero chooses Strike A; the priority-20 tie is broken in the hero's favour. The hit `6 ≥ 4` deals 8 and eliminates the Archer before its blow. Result: WIN, hero 40 HP, stamina 9, without regeneration in the terminal round.

Charge became available only after shortening Far to Near. The mere fact of entering the group did not engage the Archer. The example assumes open space and no other enemies.

### 11.5. Cover and consuming one guard pool

Separate state: hero 40 HP, companion 18 HP with armor 0, both Near. The hero declares Cover B on the companion and gets guard 6. Two free Archers in B have legal, frozen Shots with base 6 at the companion. The companion uses Prepare B and stays in the same group.

1. The first Shot is taken over. Against the hero's defense: `4 ≥ 4`, a hit. After armor `6−1=5`; guard absorbs 5. The hero loses no HP and has guard 1 left. The redirection token is consumed.
2. The second Shot goes to the companion. It hits `4 ≥ 4`, deals 6 after armor 0. The companion has 12 HP. The hero's remaining guard does not automatically protect the ward.

Changing the hero's stance to D would make the first shot miss (`4 < 6`), but it would also consume the redirection. If the first attack were a Feint against a protector in D, base 9 would be checked, the D bonus to defense and the guard would be skipped, but armor would apply.

## 12. Data model and saving

The JSON below shows the complete state **before planning round 1** of the duel from 11.1. Profile and card statistics are in a versioned rules table; the instance stores the mutable state. For the hero, `profileId=hero` refers to section 2; for the Brute, to section 8.

```json
{
  "rulesVersion": "simple-rpg-engine-stance-cards-1.0",
  "stateVersion": 0,
  "round": 1,
  "phase": "PLAN",
  "result": null,
  "nextGroupSerial": 1,
  "actors": [
    {
      "id": "h01",
      "team": "heroes",
      "role": "hero",
      "profileId": "hero",
      "hp": 40,
      "stamina": 10,
      "stance": "balanced",
      "groupId": "g0",
      "readyRound": null,
      "availableRound": {
        "heavy": 1, "counter": 1, "feint": 1,
        "cover": 1, "charge": 1, "prepare": 1
      }
    },
    {
      "id": "e01",
      "team": "enemies",
      "role": "enemy",
      "profileId": "brute",
      "hp": 26,
      "stamina": null,
      "stance": "balanced",
      "groupId": "g0",
      "readyRound": null,
      "availableRound": {},
      "phaseOffset": 0,
      "waitAge": 0
    }
  ],
  "engagements": [["e01", "h01"]],
  "frozenEnemyPlans": [],
  "frozenCompanionPlan": null,
  "log": []
}
```

Store engagement pairs as sorted IDs, without duplicates. `groupId` is a label, not a coordinate. `nextGroupSerial` must be greater than every group number in use: a scenario with `g0` and `g1` starts with the counter at 2. The profile and `rulesVersion` define the maxima and base statistics; loading with a mismatched rules version requires migration or rejection, not silently using different numbers. A missing `availableRound` entry for an auxiliary action with CD 0 means it is available from round 1.

When creating and loading a state, check the uniqueness of IDs, the existence of profiles, the ranges of HP and resources, and the correctness of engagements: two different living opponents in the same group. Reversed and repeated pairs must be reduced to one canonical pair before the game starts. Reject references to non-existent characters, engagements between party allies, a missing hero, more than one companion, and an active-fight state without a living hero or enemies. A final state keeps the result and may contain eliminated characters. When importing `CHOOSE`, also validate the frozen plans; do not recompute them to other targets.

The player's command:

```json
{
  "expectedStateVersion": 1,
  "round": 1,
  "stance": "defensive",
  "actionId": "counter",
  "targetId": "h01"
}
```

`stateVersion` increases after completed planning and after an accepted command; a validation attempt and a change of UI selection do not increase it. In the example, the `PLAN` state with version 0 becomes `CHOOSE` with version 1. A duplicate command after confirmation is rejected by phase or version, without being paid again.

A frozen plan contains at least `actorId`, `stance`, `actionId`, `targetId`, `moveVariant`, `wasCandidate`, `attackSlot`, `baseDamage`, `priority`. For a waiting enemy, `actionId=wait`, `wasCandidate=true`, `attackSlot=false`. The `wasCandidate` field preserves the information from before the replacement with Waiting. For self actions `targetId` is the actor's own ID; for Withdraw it is `null`. Do not re-determine the target while executing the plan.

Round effects (`guard`, `exposed`, `counterToken`, `coverWard`, `chargeMoveSucceeded`, `preparedAccuracy`, `preparedDamage`) may be kept in a working resolution state. The MVP saves to the browser only the stable phases `CHOOSE` and `FINISHED`. It does not save half of an animated round. `CHOOSE` must contain the full plans and the corresponding version number.

The event log covers the source, the original target, the recipient, the range result, the attack score, the defense, the hit, the raw damage, the parry, the armor, the absorption, the HP loss and the reason for cancellation. For replay, keep the initial state, the rules version and the list of accepted commands; no random seed is needed.

## 13. Engine pseudocode

The pseudocode is normative for ordering. Helper functions refer to the rules of the previous sections; all of them operate on a copy of the state, and only a complete accepted resolution replaces the interface state.

### 13.1. AI and slot planning

```text
function planRound(state):
    assert state.phase == PLAN and state.result == null
    clearRoundEffects(state)
    plans = []
    for enemy in livingEnemies(state) sorted by id:
        entry = enemy.cycle[(state.round - 1 + enemy.phaseOffset) % len(enemy.cycle)]
        if enemy.profile == archer and isEngaged(enemy):
            plan = strikeBalancedAtLowestHpEngagedOpponent(enemy)
        else if entry.action in [strike, heavy]:
            target = lowestHpEngagedOpponent(enemy) or hero(state)
            if engaged(enemy, target):
                plan = entryWithTarget(entry, target)
            else if range(enemy, target) == FAR:
                plan = approach(entry.stance, target, JOIN)
            else if entry.stance == aggressive:
                plan = charge(aggressive, target, baseDamage=6)
            else:
                plan = approach(balanced, target, ENGAGE)
        else if entry.action == shot:
            plan = shot(entry.stance, hero(state), enemy.profile.shotDamage)
        else:
            plan = selfAction(entry)
        plan.wasCandidate = isPrimaryAttack(plan)
        plans.append(plan)

    candidates = plans where wasCandidate
    sort candidates by (-actor.waitAge, -plan.baseDamage, actor.id)
    for index, plan in enumerate(candidates):
        plan.attackSlot = index < 2
        if not plan.attackSlot:
            replaceActionWithWait(plan)   # keep the stance and wasCandidate

    state.frozenEnemyPlans = plans
    state.frozenCompanionPlan = chooseCompanionPlan(state, plans)
    state.phase = CHOOSE
    state.stateVersion += 1
    return state
```

The plan does not settle Prepare, does not collect the cost and does not yet apply Exposed. These operations belong to the declaration of the action that is actually kept.

### 13.2. Resolving a round

```text
function submitRound(inputState, command):
    error = validateCommandAndFrozenPlans(inputState, command)
    if error: return Rejected(error, unchanged=inputState)

    s = deepCopy(inputState)
    s.phase = RESOLVE
    s.stateVersion += 1
    plans = [heroPlan(command)] + optionalCompanionPlan(s) + enemyPlans(s)

    for plan in plans:
        actor = getActor(plan.actorId)
        payCostAndSetAvailableRound(actor, plan, s.round)
        actor.stance = plan.stance
        if isOffensiveAction(plan) and actor.readyRound == s.round:
            plan.preparedAccuracy = 2
            plan.preparedDamage = 3
            actor.readyRound = null
        else:
            plan.preparedAccuracy = 0
            plan.preparedDamage = 0

    for plan in plans:
        if plan.actionId == heavy: actor(plan).exposed = true
        if plan.actionId in [brace, cover]: actor(plan).guard = 6
        if plan.actionId == wait: actor(plan).guard = 3
        if plan.actionId == counter: actor(plan).counterToken = true
        if plan.actionId == cover: actor(plan).coverWard = plan.targetId
        if plan.actionId == prepare: actor(plan).readyRound = s.round + 1

    for plan in plans sorted by (roleOrder(actor), actor.id):
        executeMovementPartIfAny(s, plan)

    attacks = plans where isPrimaryAttack(plan)
    sort attacks by (-plan.priority, roleOrder(actor), actor.id)
    for attack in attacks:
        if s.result != null: break
        resolvePrimaryAttack(s, attack)

    if s.result != null:
        s.phase = FINISHED
        return Accepted(s)

    for living actor in [hero, optionalCompanion]:
        gain = 2 + (3 if actor.plan.actionId == prepare else 0)
        actor.stamina = min(actor.maxStamina, actor.stamina + gain)

    for living enemy:
        p = itsFrozenPlan
        if p.wasCandidate and not p.attackSlot: enemy.waitAge += 1
        else: enemy.waitAge = 0

    expireReadyBonusesWithRoundAtMost(s.round)
    clearRoundEffects(s)
    if s.round == 30:
        s.result = DRAW_LIMIT
        s.phase = FINISHED
    else:
        s.round += 1
        s.phase = PLAN
    return Accepted(s)
```

`isOffensiveAction` covers primary attacks and Counterattack; `isPrimaryAttack` does not include Counterattack. The payment function skips enemies; for the others, the CD of actions without a cooldown may be omitted from the save. `clearRoundEffects` does not remove `readyRound`, engagements or cooldowns.

### 13.3. Attack and reactions

```text
function resolvePrimaryAttack(s, p):
    a = actor(p)
    original = actor(p.targetId)
    if not alive(a) or not alive(original):
        logCancel("actor_or_target_dead"); return
    if not attackRangeStillLegal(s, p):
        logCancel("range_or_charge_invalid"); return

    t = original
    protector = lowestIdEligibleProtectorOf(original)
    if protector exists:
        t = protector
        consumeCoverRedirect(protector)  # no further redirection

    triggeredCounter = (
        isDirectAttack(p)
        and t.counterToken
        and engaged(a, t)
    )
    if triggeredCounter: t.counterToken = false

    # compute the test and the Feint base against t, not original
    hit = computeAttackScore(a, p) >= computeDefenseScore(t, p)
    if hit:
        parry = 6 if triggeredCounter else 0
        applyDamageAndCheckTerminal(s, a, t, p, parry)
    else:
        logMiss(a, original, t, p)

    if s.result != null: return
    if triggeredCounter and alive(a) and alive(t) and engaged(a, t):
        riposte = makeRiposte(from=t, to=a,
                              accuracy=2, baseDamage=7,
                              bonuses=t.counterPlan.preparedBonuses)
        # No Cover and no Counterattack; normal hit test, armor and guard.
        resolveAttackWithoutReactions(s, riposte)
```

For Charge, `attackRangeStillLegal` also requires its movement to have succeeded. `applyDamageAndCheckTerminal` immediately removes the engagements of characters at HP 0 and checks the outcome from section 6. A Strike plan may be in the queue despite its author's death; it will be skipped by the condition above. The same applies to a shot at an already eliminated target.

### 13.4. Movement

```text
function executeMovementPartIfAny(s, p):
    a = actor(p)
    if not alive(a): return
    if p.actionId == disengage:
        removeAllEngagementsOf(a)
        return
    if p.actionId == withdraw:
        if isFree(a):
            a.groupId = "g" + s.nextGroupSerial
            s.nextGroupSerial += 1
        return
    if p.actionId not in [approach, charge]: return
    t = actor(p.targetId)
    if not alive(t) or not isFree(a): return
    if p.actionId == approach and p.moveVariant == JOIN:
        a.groupId = t.groupId
    else if range(a, t) == NEAR and a.team != t.team:
        addEngagement(a, t)
        if p.actionId == charge: p.chargeMoveSucceeded = true
```

A later actor's Disengage can remove an engagement created by an earlier Charge; the Charge's later blow is then lost. Two Charge plans aimed at each other do not automatically produce two blows: the earlier movement creates the engagement, so the later charger is no longer free and does not perform its own movement. The movement-order rule resolves this case explicitly.

## 14. Browser interface

### 14.1. Screen layout

1. **Hero status:** HP, stamina, current/selected stance, active Prepare and the list “Engaged with: …”.
2. **Opponent cards:** name, HP, armor, stance, exact intent, target, priority, range from the selected character, and the attack-slot or Waiting marker.
3. **Companion:** HP, stamina, frozen plan and its target. The ability to view range relations from its perspective.
4. **Decision panel:** three stances, six cards, Strike, Brace and the available movements. After a card is chosen, highlight the legal targets.
5. **Round preview:** forecast final HP, stamina, cancelled intents and engagements after the full resolution of the chosen option.
6. **Log:** successive events with the ability to expand the numbers; the “Play round” and “Surrender” buttons.

Enemy cards may be sorted, but not dragged as a movement. The graphic layout has no mechanical meaning. Besides the range relative to the hero, a small relations panel is available after pointing at a participant; the list “Near the hero” alone is not enough to explain the companion's range.

Example card text: “Heavy Blow · cost 4 · hit 5 against defense 4 · 12 damage after armor · you act after the enemy's Strike · your defense this round: 0”. For a Counter against a group: “You will parry the first legal blow: e01. The second blow will not be parried”.

### 14.2. The preview must use the engine

Compute the forecast on a copy of the state through the same function as the confirmation. Summing the expected damage is not enough: an earlier elimination, Charge, Disengage, Cover and riposte change the rest of the queue. The preview does not mutate the current state or the AI plan, and does not write a log to the real fight.

Changing the highlighted stance updates card availability and the forecast. An illegal combination cannot be confirmed. The reason for disabling is textual: “Missing 1 stamina”, “Available from round 4”, “The target is Far”, “Disengage first”, “Requires an ally that is Near”.

The UI should show regeneration as an end-of-round effect, with a note that it will not happen if the round ends early. The choice must not be paid for while clicking through the preview. The confirm button is locked while resolution runs. Animations only replay the finished log; their speed and skipping do not affect the result.

### 14.3. Accessibility and handling

- All actions, targets and the confirmation are available from the keyboard; visible focus and readable labels.
- Ranges, stances and threats are marked with text and an icon, not with colour alone.
- The ability to skip animations immediately and to read the full log.
- On a narrow screen, enemy intents stay visible above the card choice.
- A local save after the planning of each round, JSON export/import and a scenario restart.
- Base numbers, bonuses and reductions available on expansion, without having to read the pseudocode.

## 15. Balance and verification plan

### 15.1. Why these values

A hero with a base Strike of 8 eliminates an unarmored Raider in two hits. Heavy 13 does not eliminate a Raider with full 14 HP, but after an earlier wound it can save a round. A Brute with armor 1 takes 7 from a plain Strike and 12 from Heavy.

Counterattack at 3 with regeneration 2 costs a net 1 resource in a non-terminal round, but CD 1 prevents uninterrupted counter-defending. Heavy costs a net 2 and gives Exposed. Feint costs a net 0, but deals only 6 against stances other than Defensive; the free Strike then has higher damage. Charge pays for movement combined with an attack and forces the risk of Aggressive. Prepare gives 5 regeneration for a whole round without direct protection.

An important property of the thresholds: the hero's plain Strike in D has a score of 2 and often misses defense 4. Stance D should not always be a good offensive choice. Prepare raises it to 4 for one offensive action. Feint can hit a target in D, because it skips its defensive bonus.

These arguments justify the starting relations between the numbers, but do not replace play sessions or simulations. The examples in section 11 are reference computations; they are not a measurement of balance across a population of players.

### 15.2. Scenarios included with the prototype

In every fight the hero starts with full health and stamina; so does the companion. All enemies have full HP, `waitAge=0`. Unless the table states otherwise, `phaseOffset=0`, everyone is in `g0`, and the indicated engagements already exist before round 1. A scenario is an independent test, not the next fight of a campaign.

| ID | Composition and position | Companion | What we check |
|---|---|---|---|
| T1 | One Brute `e01`, engaged with the hero | None | Reproduction of the full duel 11.1 |
| T2 | One Sentinel `e01`, engaged with the hero | None | Whether Feint and Prepare break the defensive cycle |
| T3 | Three Raiders `e01–e03`, all engaged with the hero | None | Slot rotation, Counter on one blow, choice of elimination |
| T4 | Raider `e01` engaged with the hero; Archer `e02` in `g1` | None | The cost of breaking free and reaching the shooter |
| T5 | A lone Archer `e01` in `g1`, hero in `g0`, no engagements | None | Reference 11.4 and the effectiveness of Charge |
| T6 | Two Raiders `e01–e02` engaged with the hero; Archer `e03` in `g1` | Party Sentinel in `g0` | Cover versus offence; the party's attack budget |
| T7 | Two Raiders `e01–e02` engaged with the hero; Sentinel `e03` in `g0`; two Archers `e04–e05` in `g1` | Party Archer in `g0` | Information load, five enemies, a long tail of the fight |

Apart from the reference test, repeat the scenarios with enemy phase offsets equal to `0,1,2,…` according to their IDs, modulo the length of their cycle. This is a controlled change, not an attempt to obtain a random result from the same command.

T1 and T5 have stated legal winning sequences. T2–T7 are diagnostic scenarios of unconfirmed difficulty; do not assume each must be easy or winnable with any strategy. Before making them available as a campaign, verify that a winning path exists for the given conditions.

### 15.3. Minimum engine acceptance tests

The tests below concern the behaviour of the public engine. Tests initialised from an unusual state must explicitly set positions, stances, intents and bonuses; they must not be inferred from the previous test.

| Test | Expected result |
|---|---|
| Identical state and command | Identical result and log regardless of time and animation |
| The whole duel 11.1 | WIN in r. 3; hero 30 HP, 5 stamina |
| Sequence 11.4 | WIN in r. 3; hero 40 HP, 9 stamina |
| Hit tie | Attack 6 against defense 6 hits |
| Armor higher than strength | 0 HP loss, guard does not decrease |
| Feint against D with guard 6 and armor 1 | With base 9 deals 8 HP on a legal hit; guard still 6 |
| Two Strike 7 hits against a Counter in D | As in 11.2: a total loss of 6 HP; one riposte |
| A missed direct attack on a Counter | Token consumed; one riposte, if both characters are alive and engaged |
| Shot or Feint on a Counter | Does not consume the Counter token and does not cause a riposte |
| Attack cancelled by Disengage | Does not trigger the Counter or Cover, because it is not a legal attempt |
| Cover against two Shots | Reference 11.5: hero 40 HP, companion 12 HP |
| Mutual Cover | At most one redirection of a given attack |
| Two sides Charge each other | The earlier movement creates the engagement; the later Charge gets no free blow |
| Disengage from three engagements | All three edges removed; group unchanged |
| Approach `JOIN` to a group of three characters | Actor Near all three, without automatic engagements |
| Death of one of three engaged enemies | Only that enemy's edges disappear |
| Charge on a free Archer with a Shot | Engagement before the blows; the announced Shot cancelled |
| Three candidates and killing one active | No slot refill in that round; at most two intents |
| Prepare and the next Counter without triggering | Bonus consumed on declaration and does not carry over |
| Prepare twice in a row | Only one bonus for the next round, without stacking |
| Counter used in r. 1 | Illegal in r. 2, legal from r. 3 |
| Illegal target, stance, cost or old version | The whole state stays unchanged, without stamina being taken |
| Death of the companion | Its engagements removed; the fight continues with the hero |
| Death of the target before the companion's blow | No automatic choice of another target |
| Terminal round | No further attacks and no regeneration after the result |
| No end after 30 full rounds | DRAW_LIMIT, never WIN |

### 15.4. Play measurements

Record the fight length, the result, the final HP, resource use, the number of stance changes, card frequencies, cancelled attacks, unused Counters, guard used and wasted, decision time and the reason for each elimination. In reports, separate scenarios, companions and phase offsets. Repeating an identical deterministic sequence is not a new difficulty sample.

First series: at least 20 played fights with several strategies and at least three people, if available. Compare play aimed at a quick victory, at preserving HP, and at using the preview. Additionally, automatically compare simple policies: Strike A only, Strike B, Feint when the target is in D, Counter when it is available and triggered, choosing the move that minimises HP loss in the current round. Every policy must have a legal fallback plan: Approach, Disengage or Brace.

Diagnostic targets, not promised results: an ordinary duel about 3–7 rounds, a group skirmish about 5–12, fewer than 10% of fights ending at the limit, and no single paid card dominating across all scenarios. More than 60% use of one special card across different scenarios is a signal for analysis, not automatic proof of an error. Judge decision time after a short learning of the rules, separately from first contact.

When a problem appears, change one variable at a time: first the HP and strength of specific profiles, then the cost or CD of the problematic card. The hit threshold is especially sensitive: a change of 1 can switch a whole category of blows from hits to misses. Do not raise defense, armor and guard at the same time, because that will make it hard to identify the cause. Rule changes require a new `rulesVersion` and recomputation of the reference examples.

## 16. Optional extensions — outside the MVP

The ideas below are not active rules and must not be silently added to the base prototype.

| Extension | Design question | What requires a separate specification |
|---|---|---|
| Incomplete intents | Does predicting the opponent give more excitement? | Which information is hidden, when it is drawn and how it is saved; the preview must not reveal the plan |
| Decks and hand | Does limited card availability increase variety? | Drawing, discarding, hand size, deterministic recording of the draw |
| More companions | Does cooperation outweigh the information overload? | Party action limit, target rules, Cover and changing the enemy budget |
| Automatic interception | Should the Sentinel stop a Charge? | Freedom conditions, reaction cost, priority relative to Cover and engagement |
| Different weapons and a hero shot | Do ranges change the play style? | Attack values, costs, legality in Melee, relation to existing cards |
| Enemy Feints and Counters | Does the duel need richer responses? | Enemy riposte budget and consistency with the two-attack limit; a ban on infinite reactions |
| Control and interrupts | Does the player have too little influence over two active threats? | Status, duration, immunity, cost, boss rules |
| Terrain and cover | Do targets need additional ranged protection? | Explicit group properties, passage, line of sight and Shot legality |
| Escape from the skirmish | Can a fight be ended at a narrative cost? | Condition, a result distinct from victory, the companion's fate and the campaign cost |
| A little randomness | Are fixed thresholds too predictable? | Test distribution, seed, saving, UI probabilities and new reference scenarios |

First, evaluate the stance–card–target choice and the readability of movement. Extensions may change what the MVP tries to measure; each should have a separate switch and rules version.

## 17. Inspirations and verified sources

The sources were checked on 18 October 2026. The links below lead to primary sources: an official SRD, the publisher, or the game's official website. Product links serve to identify the original; they are not a free complete rulebook. Nothing needs to be bought to play this MVP.

### 17.1. 13th Age — abstract position and engagement

The official [13th Age Archmage Engine — System Reference Document, PDF at Pelgrane Press](https://pelgranepress.com/files/13th_Age/13th_Age_System_Reference_Document.pdf#page=154), section **Combat Rules → Combat Actions → Position**. It is best to search for the headings `Nearby`, `Far Away`, `Engaged/Next to`, `Disengaging`. “Version 2.0” on the cover of this SRD means the version of the Archmage Engine document, not a statement that these are the rules of the second edition of 13th Age.

The original describes general position, nearness, and engagement with specific opponents. **Inspiration here:** no grid, and memory of who is fighting whom. **Original differences:** strictly three range levels, proximity groups, a deterministic Disengage, no attacks of opportunity and a movement cost equal to the whole action. These are the browser engine's own simplifications, not a summary of the full SRD rules.

### 17.2. The One Ring — choice of stance

The official [The One Ring — Starter Set, Free League Publishing](https://freeleaguepublishing.com/shop/the-one-ring/starter-set/) identifies the game and the combat stance cards included in the set. A supplementary publisher source: [The One Ring — official errata to the core rules, PDF](https://freeleaguepublishing.com/wp-content/uploads/2021/TOR_Core_Rules_Errata_2204.pdf), containing references to combat stances, among them Rearward. This is an errata, not a complete description of the stance mechanics.

**Inspiration here:** choosing a way of taking part in the fight and linking it to attack, defense and available actions. **Original differences:** exactly three stances, modifiers +2/0/−2, a shared hit formula and the card list above. These are not converted values of the tests, combat tasks or the complete set of stances from the *The One Ring* rulebook. The sources are not instructions for applying our numbers.

### 17.3. Mouse Guard — choice of action and its interactions

[Mouse Guard — the official RPG website](https://www.mouseguard.net/rpg/) describes Luke Crane's game and a set containing player cards. The site also hosts previews of the rulebook. This is a source that identifies the original and the form of its components, not a free SRD or a complete conflict manual.

**Inspiration here:** presenting options as actions whose value depends on the opponent's response, and the convenient form of cards. **Original differences:** six cards originally named in Polish, an open AI plan, stamina, individual HP, priorities and all the specific interactions. The card names in this specification are not a list of official *Mouse Guard* cards. We do not carry over the full conflict system or its test matrix; the mere presence of cards in the original does not imply mechanical compatibility.

### 17.4. The boundary between source and design

| Element | Borrowed idea | Own rule in force in this MVP |
|---|---|---|
| Position | Abstract range and engagements: 13th Age | `groupId` + graph, concrete movements, no attacks of opportunity |
| Stance | Choice of fighting style: The One Ring | Three stances, ±2, card restrictions |
| Action | Interactions of choices and cards: Mouse Guard | Six cards, costs, CD and order of effects |
| Multiple opponents | The need for a readable solo fight | Two attack slots, wait age and Waiting |
| Resolution | The need for a repeatable prototype | Fixed thresholds, damage, priorities and full preview |
| Companions | The need for cooperation without manually controlling a party | Two profiles, open AI priorities and a single Cover |

The links document inspirations. All details of this specification not described in the sources should be understood as the original design of sections 1–16, not as a missing rule to be looked up in someone else's rulebook.
