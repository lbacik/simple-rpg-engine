# Shared Combat core replacing tactical rules

Status: accepted.

Source: [Choose the shared simple-rpg-engine Combat core and adapter contracts](https://github.com/lbacik/simple-rpg-engine/issues/181#issuecomment-6250548915), within [Map: adapt Combat to simple-rpg-engine MVP with command-panel UI](https://github.com/lbacik/simple-rpg-engine/issues/179). Rule source: [`docs/sources/combat-mvp-1.0/rules.md`](../sources/combat-mvp-1.0/rules.md), identified by `rulesVersion: simple-rpg-engine-stance-cards-1.0`.

One **pure, shared Combat core** owns all MVP 1.0 rules. Arena and Scenario play reach it only through thin **adapters**. The core **replaces** `tactical.ts` and the two duplicated Round resolvers in `src/engine/index.ts` and `src/engine/arena.ts`. Old and new rules do not coexist: there is a single `rulesVersion`, `simple-rpg-engine-stance-cards-1.0`.

## Responsibility boundary

| Core (`src/engine/combat/`, name indicative) | Adapters (Arena, Scenario) |
|---|---|
| Combat state type and strict parser (§12) | Build the initial Combat state from a Setup or Encounter |
| Versioned rules table: profiles and cards | Assign actor ids from the authored order; keep the `ref` mapping |
| Enemy AI, attack slots, Companion AI (§8–§10) | Hold the enclosing document's schema version and `step`; persist it |
| Option legality and command validation | Render Interface Text from reason codes and events (ADR 0011) |
| Full-round resolution, preview, surrender | Project events into the Arena log or the Journal (ADR 0004) |
| Typed events (no text) | Route the Combat result |

The core performs no IO, takes no `Rng`, reads no `Date` and holds no text. It is **isomorphic**: the browser may import it to compute previews. The server remains the only authority at commit.

## Public contract

- `parseCombatState(json: unknown)`: strict validation of §12, rejecting with typed `ParseIssue` codes, including unknown or mismatched `rulesVersion`, more than one Companion and anything outside 1–5 enemies.
- `startCombat(initial)`: validate §12, then `planRound`.
- `listOptions(state, stance)`: every action × target, each legal or carrying **all** applicable reason codes with parameters. A command is legal exactly when `listOptions` marks it legal; there is no second legality function. A legal option (Brace) always exists.
- `previewRound(state, command)`: `resolveRound` on an isolated copy, without planning the next round. The preview runs the commit's own resolver; there is no forecast arithmetic anywhere else.
- `submitRound(state, command)`: validate → `resolveRound` → `planRound`, unless the Round ends the fight.
- `surrender(state)`: `CHOOSE` only → `FINISHED` with `LOSS_SURRENDER`.
- `PLAN` and `RESOLVE` never leave the core. Round effects (`guard`, `exposed`, `counterToken`, `coverWard`, `chargeMoveSucceeded`, prepared bonuses) exist only in the working resolution state.
- **Frozen plans are validated by recomputation.** Reading or importing `CHOOSE` recomputes `planRound` and requires exact equality; a mismatch is rejected and plans are never replaced.
- **Closed profiles.** Statistics come from the rules table keyed by `rulesVersion`: `hero`, `party-sentinel`, `party-archer`, `raider`, `brute`, `sentinel`, `archer`. Content may set per instance only what MVP §8.1 allows (`power`, `phaseOffset`, `waitAge`, the initial group and engagements, `hp`/`stamina` within range). Authored statistics would be a rule change needing a new `rulesVersion` and a named decision.
- **Actor ids are canonical and positional**: `h01` for the hero, `c01` for the Companion, `e01`–`e05` for enemies, assigned in the explicit authored order. Content ids travel only in an opaque `ref` the rules never read.
- **Versions and concurrency**: `rulesVersion` lives in the Combat state; the core rejects an unknown or mismatched value. The schema version belongs to the enclosing document. The concurrency revision is the enclosing document's `step`; the MVP's `stateVersion`/`expectedStateVersion` map to `step`/`expectedStep`. The name `stateVersion` is never stored with its MVP meaning.
- **Typed events** (ids and numbers only, each with a `round` and a sequence number): `round-planned`, `declared`, `effect-established`, `moved`, `attack`, `riposte`, `cancelled`, `eliminated`, `regenerated`, `wait-age-updated`, `finished`.

## Named deviations from MVP 1.0

1. MVP `stateVersion` is absorbed into `step`, which increments once per accepted command instead of after planning and after the command, because `PLAN` is never persisted.
2. Representation additions with no rule effect: an opaque `ref` per actor, and an explicit `power` on enemy instances (allowed by §8.1, absent from the §12 sample JSON).

No rule changes. `rulesVersion` stays `simple-rpg-engine-stance-cards-1.0`.

## Considered Options

- **Keep the two duplicated Round resolvers and patch them to the new rules**: no new module, but the copies already diverge (for example Distract availability) and the "preview" is separate threshold arithmetic in the view projections, which MVP §14.2 forbids.
- **A separate Combat simulator for the Arena duplicating the rules**: isolates the mode, but every rule change must be made twice and the copies drift; the Arena exists to test the mechanism, so it must run the mechanism.
- **Ship the Arena as a real Scenario**: reuses the content pipeline, but every fight becomes a Playthrough needing authored Encounters, Outcomes and Endings — the authoring the mode exists to bypass.

## Consequences

- `tactical.ts`, the Round resolvers in `index.ts`/`arena.ts`, `/test-tactical`, the v1/v2 Combat Journal renderers and their catalogue keys, the Arena Bestiary statistics, Equipment and Consumables are deleted with the old rules. What happens to old saves is decided by [ADR 0009](0009-game-data-from-earlier-combat-rules-is-discarded-at-release.md).
- The adapter assigns actor ids in the explicit authored order of the opponents, so that order stays a visible, mechanically meaningful property.
- Adapters supply the full initial state, so campaign questions such as HP carry-over stay with the adapter decisions ([ADR 0010](0010-campaign-health-is-the-hero-combat-hp.md)).

## Supersessions

- **ADR 0005.** Superseded: the per-participant Combat model (Range/Intent/prepared per participant) and the Prepare-draw note. Retained as a principle: migration by the engine on read, strict validation per version, a `step`-guarded writeback, and a committed Intent is never re-selected.
- **ADR 0006.** Superseded: reusing the existing Intent selection, Round resolution, Range and Reach rules unchanged; at most 2 opponents; the Attribute 0–3 Setup; victory/death/escape results; Arena Consumables. Retained: an Arena is a mode, never a Playthrough; `kind: 'arena'`; no Scenario records.
