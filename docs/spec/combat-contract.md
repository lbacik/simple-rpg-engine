# Combat contract

The public contract that the Combat core, its Arena and Scenario adapters, and the Combat UI implement against. The rules themselves live in [`docs/sources/combat-mvp-1.0/rules.md`](../sources/combat-mvp-1.0/rules.md) (canonical, `rulesVersion: simple-rpg-engine-stance-cards-1.0`); this document holds the integration surface: the core's public functions, ids, reason codes, event types, persisted document shapes, and the consolidated list of named deviations from MVP 1.0.

**Status: current.** It replaces the tactical Combat contract. The [tactical Combat handoff](tactical-combat-handoff.md) is historical.

## Sources

- Rules: `rules.md` §1–§15; precedence `rules.md` > map decision comments > the [Combat MVP 1.0 handoff](combat-mvp-1.0-handoff.md) > the prototype (layout only).
- [Choose the shared Combat core and adapter contracts](https://github.com/lbacik/simple-rpg-engine/issues/181#issuecomment-6250548915), recorded in [ADR 0008](../adr/0008-shared-combat-core-replacing-tactical-rules.md).
- [Choose save lifecycle and recovery](https://github.com/lbacik/simple-rpg-engine/issues/182#issuecomment-6251588033) as amended by the handoff's [scope change](combat-mvp-1.0-handoff.md#scope-change-at-this-ticket) (game data discarded at v0.6.0), recorded in [ADR 0009](../adr/0009-game-data-from-earlier-combat-rules-is-discarded-at-release.md).
- [Define how Combat connects to Scenario play](https://github.com/lbacik/simple-rpg-engine/issues/183#issuecomment-6251696849), recorded in [ADR 0010](../adr/0010-campaign-health-is-the-hero-combat-hp.md).
- [Define Scenario authoring and content migration](https://github.com/lbacik/simple-rpg-engine/issues/184#issuecomment-6251827295): no deviations from MVP 1.0.
- UI direction: [ADR 0011](../adr/0011-combat-interface-text-as-client-catalogue-slice.md).

## Names

- **MVP 1.0 rules**: the Combat rules in `rules.md`, identified in state by `rulesVersion: simple-rpg-engine-stance-cards-1.0`. "1.0" always means this rules version.
- **Phases**: `PLAN` (initial, never persisted), `CHOOSE` (persisted, with frozen plans), `FINISHED` (persisted, with a result). `PLAN` and `RESOLVE` never leave the core.
- **Results**: `WIN`, `LOSS`, `LOSS_SURRENDER`, `DRAW_LIMIT`. Victory/death/escape as Arena results are retired.

## Public core contract

The core lives under `src/engine/combat/` (name indicative). It performs no IO, reads no `Date`, takes no `Rng`, holds no text, and the browser may import it for previews. The server remains the only authority at commit. Statistics come only from the versioned rules table keyed by `rulesVersion` (closed profiles below); content may set per instance only `power`, `phaseOffset`, `waitAge`, the initial group and engagements, and `hp`/`stamina` within range.

```ts
type RulesVersion = 'simple-rpg-engine-stance-cards-1.0'
type ActorId = string            // /^(h01|c01|e0[1-5])$/
type GroupId = string            // /^g\d+$/, a label, not a coordinate
type ProfileId = 'hero' | 'party-sentinel' | 'party-archer'
               | 'raider' | 'brute' | 'sentinel' | 'archer'   // closed set in 1.0
type Stance = 'aggressive' | 'balanced' | 'defensive'
type CardId = 'heavy' | 'counter' | 'feint' | 'cover' | 'charge' | 'prepare'
type ActionId = CardId | 'strike' | 'brace' | 'shot'
              | 'approach' | 'disengage' | 'withdraw' | 'wait'
type CombatResult = 'WIN' | 'LOSS' | 'LOSS_SURRENDER' | 'DRAW_LIMIT'

interface CombatActor {
  id: ActorId
  ref: string | null             // opaque adapter reference; never read by rules
  team: 'heroes' | 'enemies'
  role: 'hero' | 'companion' | 'enemy'
  profileId: ProfileId
  hp: number                     // 0..profile.maxHp
  stamina: number | null         // null for enemies
  stance: Stance
  groupId: GroupId
  readyRound: number | null
  availableRound: Partial<Record<CardId, number>>
  power?: number                 // enemies only; default 0 (rules §8.1)
  phaseOffset?: number           // enemies only
  waitAge?: number               // enemies only
}

interface FrozenPlan {           // rules §12, verbatim field set
  actorId: ActorId; stance: Stance; actionId: ActionId
  targetId: ActorId | null; moveVariant: 'JOIN' | 'ENGAGE' | null
  wasCandidate: boolean; attackSlot: boolean
  baseDamage: number; priority: number
}

interface CombatState {          // persisted only in CHOOSE or FINISHED
  rulesVersion: RulesVersion
  round: number                  // 1..30
  phase: 'CHOOSE' | 'FINISHED'
  result: CombatResult | null
  nextGroupSerial: number
  actors: CombatActor[]
  engagements: [ActorId, ActorId][]   // canonical sorted pairs, no duplicates
  frozenEnemyPlans: FrozenPlan[]
  frozenCompanionPlan: FrozenPlan | null
  log: CombatEvent[]             // whole fight, at most 30 rounds
}
// InitialCombatState: same shape, phase 'PLAN', round 1, no plans, empty log.

interface RoundCommand { round: number; stance: Stance; actionId: ActionId; targetId: ActorId | null }

parseCombatState(json: unknown): Ok<CombatState> | Invalid<ParseIssue[]>
startCombat(initial: InitialCombatState): Accepted | Rejected   // validate §12, then planRound
listOptions(state, stance): Option[]   // every action × target: legal, or { reason: ReasonCode }
previewRound(state, command): { projected, events } | Rejected   // resolveRound on a deep copy; no planning
submitRound(state, command): Accepted | Rejected                 // validate → resolveRound → planRound unless FINISHED
surrender(state): Accepted | Rejected                            // CHOOSE only → FINISHED, LOSS_SURRENDER
// Accepted = { state: CombatState, events: CombatEvent[] }; Rejected = { reason: ReasonCode } and nothing mutated
```

- **Preview and commit share one resolver.** `resolveRound` is the only code that applies rules §7 steps 5–12. `previewRound` runs it on an isolated copy; `submitRound` runs the same function and then calls `planRound`. There is no forecast arithmetic anywhere else, view projections included.
- **One legality function.** A command is legal exactly when `listOptions` marks it legal; there is no second legality function. A legal option (Brace) always exists. The core derives the movement variant (`JOIN`/`ENGAGE`) from range at choice time, so the command does not carry it.
- **Frozen plans are validated by recomputation.** Reading or importing `CHOOSE` recomputes `planRound` from the stored state and requires exact equality. A mismatch is rejected; plans are never replaced.
- **Round effects** (`guard`, `exposed`, `counterToken`, `coverWard`, `chargeMoveSucceeded`, prepared bonuses) exist only in the working resolution state and never leave the core.
- **Terminal cutoff**: a terminal Round ends immediately after the lethal hit, without regeneration, wait-age accounting, effect removal or further blows. `DRAW_LIMIT` applies after 30 full Rounds and is never `WIN`. No attacks or regeneration happen after a terminal result.

## Actor ids

Actor ids are canonical and positional. The adapter assigns them in the **explicit authored order** of the opponents, so that order is a visible, mechanically meaningful property (it breaks ties):

- `h01`: the hero, always present;
- `c01`: the Companion, when one fights;
- `e01`–`e05`: enemies, 1–5 per Combat, at most one Companion.

Content ids (Scenario participant ids, Arena opponent ids, the Companion id) travel only in the opaque `ref`, which the rules never read. Adapters use `ref` for names, wounds and the Journal. For self actions `targetId` is the actor's own id; for Withdraw it is `null`.

## Profiles

Closed set in 1.0 (rules §2.1, §8.1, §10.1). Authored statistics would be a rule change needing a new `rulesVersion` and a named decision.

| Profile | HP | Stamina | Skill / Defense | Armor | Notes |
|---|---|---|---|---|---|
| `hero` | 40 | 10 | 4 / 4 | 1 | Strike 8, Shot —; full card set |
| `party-sentinel` | 24 | 8 | 4 / 4 | 1 | Strike 8, Cover, Brace, Prepare, Approach, Disengage |
| `party-archer` | 18 | 8 | 4 / 4 | 0 | Shot 5, Strike, Prepare, Approach, Disengage |
| `raider` | 14 | — | 4 / 4 | 0 | Strike 7 / Heavy 12; cycle `S(A), H(A), S(B), B(D)` |
| `brute` | 26 | — | 4 / 4 | 1 | Strike 8 / Heavy 12; cycle `H(A), P(D), S(B)` |
| `sentinel` | 20 | — | 4 / 4 | 1 | Strike 6 / Heavy 11; cycle `B(D), S(B), H(A)` |
| `archer` | 12 | — | 4 / 4 | 0 | Strike 4 / Shot 6; cycle `R(B), R(B), P(D)` |

Enemies have no stamina and no card cooldowns; their constraints are the open action cycle and the two-attack budget (rules §9). Stances: Aggressive (+2 attack / −2 defense; Heavy, Feint, Charge, Prepare), Balanced (+0/+0; Heavy, Counterattack, Feint, Cover, Prepare), Defensive (−2/+2; Counterattack, Cover, Prepare). Strike, Brace, Approach, Disengage and Withdraw are available in every stance. At most two enemy primary attacks per Round hold an attack slot; the rest wait as Guarded Wait.

## Reason codes

`listOptions` returns every action × target with **all** applicable reason codes and their parameters, not only the first. The UI turns codes into Interface Text through the typed catalogue slice ([ADR 0011](../adr/0011-combat-interface-text-as-client-catalogue-slice.md)).

| Code | Parameters | Shown as (rules §14.2) |
|---|---|---|
| `insufficient_stamina` | `missing` | "Missing N stamina" |
| `on_cooldown` | `availableRound` | "Available from round N" |
| `stance_disallows` | — | — |
| `no_shot_ability` | — | The hero has no shot in the base set (rules §5.8, §8) |
| `not_engaged` | — | Counterattack and Disengage need an engagement (rules §5.3, §3.4) |
| `target_far` | — | "The target is Far" |
| `target_not_near` | — | — |
| `must_disengage` | — | "Disengage first" |
| `requires_near_ally` | — | "Requires an ally that is Near" |
| `actor_engaged` | — | — |
| `invalid_target` | — | — |
| `wrong_round` | — | Illegal target, stance, cost or old version: the state stays unchanged, without stamina being taken (rules §15.3) |
| `wrong_phase` | — | — |
| `in-combat` | — | Inventory disabled during Combat ([ADR 0010](../adr/0010-campaign-health-is-the-hero-combat-hp.md)) |

Rejection (wrong round, wrong phase, illegal action, stance, target or cost, surrender outside `CHOOSE`) returns a reason code, leaves the input deep-equal and takes no stamina.

## Event types

One typed event per resolution step. Each carries `round` and a sequence number, and holds only ids and numbers, never text. Animations only replay this log.

| Event | Meaning |
|---|---|
| `round-planned` | frozen intents and attack slots |
| `declared` | cost, cooldown, stance, captured Prepare bonus |
| `effect-established` | guard, Exposed, Counter, Cover, Prepare |
| `moved` | `JOIN`, `ENGAGE`, Disengage or Withdraw, or failed with a reason |
| `attack` | source, original target, recipient, redirected, Counter triggered, range, `attackScore`, `defenseScore`, hit, `raw`, parry, armor, absorbed, HP loss |
| `riposte` | same shape as `attack` |
| `cancelled` | reason (target died, range lost, shooter engaged, …) |
| `eliminated` | removed edges |
| `regenerated` | end-of-round stamina/HP recovery; never after a terminal Round |
| `wait-age-updated` | attack-slot rotation bookkeeping |
| `finished` | result (`WIN` / `LOSS` / `LOSS_SURRENDER` / `DRAW_LIMIT`) |

For replay, keep the initial state, the `rulesVersion` and the list of accepted commands; no random seed is needed (rules §12).

## Document shapes

### Combat state

The §12 shape above, plus the representation additions from #181 (`ref` per actor, explicit `power` on enemy instances). The MVP's `stateVersion`/`expectedStateVersion` map to the enclosing document's `step`/`expectedStep`: `step` increments once per accepted command or surrender, because `PLAN` is never persisted. The name `stateVersion` is never stored with its MVP meaning. A missing `availableRound` entry for an auxiliary action with CD 0 means it is available from round 1. `nextGroupSerial` must be greater than every group number in use.

### Playthrough (`schemaVersion` 3)

```ts
activeCombat: { encounterId: string; combat: CombatState } | null
// CombatState refs: participant ids for enemies, the Companion id for c01, null for h01
encounters: Record<EncounterId, Record<ParticipantId, number /* damageTaken */>>
companion: { id: CompanionId } | null
lostCompanions: CompanionId[]
character: { ...; health: number /* 0..40 */ }
```

- While a Combat runs, `h01.hp` in the Combat state is authoritative; `character.health` and `encounters` wounds are written once, when the Combat ends, never per Round.
- Every Combat starts with stamina at the profile maximum, every `availableRound` at 1 and `readyRound: null`.
- Result routing: `WIN` → the Encounter's `victory` Outcome; `LOSS` → the Scenario's `deathEnding`; `LOSS_SURRENDER` → the Encounter's required `surrender` Outcome; `DRAW_LIMIT` → the Encounter's required `draw` Outcome. Surrender and draw leave the Encounter undefeated; a repeat fight includes survivors only, in the authored arrangement.
- A malformed document, an unknown `schemaVersion`, a wrong `rulesVersion` or a frozen-plan mismatch makes a Playthrough read-only with its Journal.

### Arena run (`schemaVersion` 1)

The first versioned Arena document. The run persists `origin` (`'setup'` or `'import'`), the remembered `setup` and `initial: InitialCombatState | null`; the Arena log is projected from `CombatState.log`, so there is no separate journal column. Import accepts a file and pasted JSON through one strict parse (1 MB cap); failures render `ParseIssue` Interface Text. `PLAN` goes through `startCombat`; `CHOOSE` is verified by recomputation; `FINISHED` is view-only; imported history is marked not verified. Export writes the bare `CombatState`. The Arena `step` is monotonic per Session across start, rematch, restart and import. Stale `expectedStep` or wrong `round` redirects with `?notice=stale`; an illegal command gets `?notice=rejected` with its reason; neither changes state or `step`.

### Arena Setup

```ts
interface ArenaOpponent { profileId: 'raider' | 'brute' | 'sentinel' | 'archer'
  startingGroup: GroupId; engagedWithHero: boolean
  phaseOffset?: number; power?: number }   // power 0..3, default 0 (rules §8.1)
interface ArenaSetup { opponents: ArenaOpponent[]  // 1..5, in explicit order
  companion?: 'party-sentinel' | 'party-archer' }  // hero needs no setup: no equipment
```

The opponents' explicit order is the authored order the adapter assigns `e01`–`e05` in, so it breaks ties. `startingGroup` places each opponent in its proximity group; `engagedWithHero` starts the pair engaged in that group.

### Journal projection

- `combat-start`: the Participants, the Companion if present, and the opening narration.
- `combat-round`, `version: 3`: the core's typed events for that Round plus the actor-to-`ref` mapping, rendered from the catalogue on read.
- `combat-end`: `howEnded` of `win`, `surrender` or `draw`; `LOSS` is followed by an `ending` entry as death is today.
- Companion joined, Companion left, Companion lost in Combat.

## Consolidated list of named deviations from MVP 1.0

No rule changes. `rulesVersion` stays `simple-rpg-engine-stance-cards-1.0`.

From #181 (shared core):

1. MVP `stateVersion` is absorbed into `step`, which increments once per accepted command instead of after planning and after the command, because `PLAN` is never persisted.
2. Representation additions with no rule effect: an opaque `ref` per actor, and an explicit `power` on enemy instances (allowed by rules §8.1, absent from the §12 sample JSON).

From #182 (save lifecycle), as amended by the handoff scope change:

3. "Local save" (rules §14.3) is the per-Session server save: every accepted command persists `CHOOSE` with its frozen plans (or `FINISHED`). The browser persists nothing.
4. JSON import is Arena-only. Scenario play offers export only of the current `CombatState`.

From #183 (Scenario connection):

5. Campaign layer: the hero's HP enters a Combat at the Character's current Health instead of full, and the Companion's presence persists between Combats. The MVP's full-state start (rules §10.1, §15.2) applies to independent test skirmishes, not to a campaign. There is no healing inside a Combat.
6. There is no Combat restart in Scenario play (rules §14.3). Restart is Arena-only.

From #184 (content migration): none. The content bounds (`power` 0–3, starting arrangements limited to `melee`/`near`/`far` with one shared far group) are authoring restrictions inside the MVP state space, not rule changes.
