# Game data from earlier Combat rules is discarded at the v0.6.0 release

Status: accepted.

Source: the scope change in the [Combat MVP 1.0 implementation handoff](../spec/combat-mvp-1.0-handoff.md#scope-change-at-this-ticket), decided by the driving developer on 2026-10-19. It replaces the retirement model of [Choose save lifecycle and recovery for the simple-rpg-engine transition](https://github.com/lbacik/simple-rpg-engine/issues/182#issuecomment-6251588033), so the planned ADR "Saves from earlier rules are retired, not converted" is not written; this ADR is written instead.

Pre-v0.6.0 game data is **discarded, not retired**. The v0.6.0 release ships the MVP 1.0 rules ([ADR 0008](0008-shared-combat-core-replacing-tactical-rules.md)) with fresh documents, and no earlier Combat data survives it.

## What the release does

- A Kysely migration in the release **deletes every Playthrough and every Journal entry** and **drops `arena_runs` and `arena_setups`**. The `sessions` table is kept.
- There are no retired Playthroughs, no "played under earlier rules" reason code, and no frozen legacy Journal renderers: the v1/v2 Combat renderers and their catalogue keys (including `escape`, `combatEndEscape`, `stopEscape`) are deleted with the old rules.
- The "Retired Playthrough" glossary entry is not added.
- The shipped Scenarios on the production volume are replaced: the release empties the Scenario directory once and lets the entrypoint re-seed the bundled v2 collection.
- **Rollback restores the backup.** "Redeploy the previous tag without a database restore" is withdrawn: an older image runs `npm run migrate` under `set -eu`, and Kysely's migrator throws once a newer migration has run, so the previous image would not start on the migrated database. Rollback is restore-then-redeploy. Everything played after the release is lost on rollback.

## What stays in force from #182

- `schemaVersion` on both documents (Playthrough 3, Arena run 1); the key `stateVersion` is never written again.
- The server is the only authority; the browser persists nothing.
- Arena import/export and Scenario export-only of the bare `CombatState` JSON, with `PLAN`/`CHOOSE`/`FINISHED` handling, the 1 MB cap, `ParseIssue` Interface Text and the `origin: 'setup' | 'import'` marking.
- The monotonic Arena `step` per Session and the stale (`?notice=stale`) / rejected (`?notice=rejected`) notices.

## Considered Options

- **Retire, don't convert** (the #182 resolution): every v1/v2 Playthrough becomes read-only with a distinct reason code, old Arena tables stay dormant, and frozen legacy renderers keep every stored entry renderable. Withdrawn by the handoff scope change: it keeps dead data and dead renderers in production indefinitely for an experimental project with no hand edits worth keeping.
- **Convert v2 state to v3**: rejected already in #182 — the old per-participant Combat state has no lossless mapping to the new rules, so any converter would be lossy and need its own verification.

## Consequences

- ADR 0004's guarantee applies to entries written from v0.6.0 (see its amendment); earlier entries are discarded by the release, not kept verbatim.
- ADR 0005's v1→v2 application is removed (see its amendment); there is nothing left to migrate.
- Dropping the wiped rows or the dormant tables beyond this release wipe is out of scope: it would delete production data and needs its own effort. The mandatory pre-rollout backup of the SQLite file and the Scenario directory stands.
