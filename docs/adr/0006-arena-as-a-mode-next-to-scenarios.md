# Arena is a mode next to Scenarios, not a Scenario

The engine runs Combat for testing the Combat mechanism directly from an Arena Setup, without any authored Scenario, Encounter, Outcome or Ending. An Arena Setup (opponents with their Enemy definitions, a Range per opponent, a Character with Attributes, Health and Equipment) is validated and turned into a running Combat through the engine, reusing the existing Intent selection, Round resolution, Range and Reach rules unchanged. All existing Combat actions work through the engine's public Arena action entry point. Combat end yields a plain Arena result (victory, death or escape) with no Scenario Ending or Outcome involved, and an Arena run is never stored as, or shown as, a Playthrough.

## Considered Options

- **Ship the Arena as a real Scenario reusing the content pipeline**: simple, but every fight becomes a Playthrough listed among the Session's Playthroughs, and every fight needs authored Encounters, Outcomes and Endings — the very authoring the mode exists to bypass. It also makes the Arena a Scenario in the collection, entered through Scenario pages, instead of a mode next to Scenarios.
- **A separate Combat simulator duplicating the rules**: exact isolation, but every rule change must be made twice, and the two copies drift. The mode exists to test the mechanism, so it must run the mechanism, not a copy of it.
- **An engine module reusing the tactical core (chosen)**: `src/engine/arena.ts` validates Setups and resolves Rounds with the shared `selectIntents` and Round order from `tactical.ts` under the unchanged Combat rules. The Arena state carries `kind: 'arena'` and no Scenario, Encounter, Ending, Flag or inventory records, so no store, reader or list can hold one as a Playthrough.

## Consequences

- At most 2 opponents per Arena Setup (the mechanics limit). Attributes are 0–3 each with no sum limit: the Arena deliberately allows extremes no Character Template could take.
- Setup validation rejects more than 2 opponents and any out-of-range Attribute, Health, Damage or weapon value, plus duplicate opponent ids.
- An Arena Setup carries no consumables, so `use-item` is always unavailable there; the entry point still accepts the action and rejects it through the normal path, drawing no dice and advancing no step.
- There is no Arena UI yet and no Arena persistence: fights run through the engine and its tests only. A future UI must hold Arena state outside the Playthrough stores, so Arena runs stay out of the Session's Playthroughs.
- `docs/spec` no longer describes Combat as Encounter-only: [mechanics.md](../spec/mechanics.md), [content-semantics.md](../spec/content-semantics.md), [playthrough-state.md](../spec/playthrough-state.md) and [architecture.md](../spec/architecture.md) name the Arena where they did.

## Combat MVP 1.0 amendment (accepted)

Source: [ADR 0008](0008-shared-combat-core-replacing-tactical-rules.md) and the save-lifecycle decisions it builds on ([ADR 0009](0009-game-data-from-earlier-combat-rules-is-discarded-at-release.md)).

- **The #181 supersessions.** Superseded by the shared Combat core: reusing the existing Intent selection, Round resolution, Range and Reach rules unchanged; at most 2 opponents; the Attribute 0–3 Setup; victory/death/escape results; Arena Consumables. Retained: an Arena is a mode, never a Playthrough; `kind: 'arena'`; no Scenario records. The Arena Setup is now 1–5 opponents from the closed MVP profiles with an optional Companion, positional actor ids, presets T1–T7, and results `WIN`/`LOSS`/`LOSS_SURRENDER`/`DRAW_LIMIT`.
- **Arena persistence.** The outdated consequence "no Arena persistence" is corrected: an Arena run persists per Session in a versioned document (Arena run `schemaVersion: 1`) with `origin`, `setup` and `initial`, a monotonic `step`, import/export of the bare `CombatState`, and a projected log. Pre-v0.6.0 `arena_runs`/`arena_setups` rows are dropped by the release wipe.
