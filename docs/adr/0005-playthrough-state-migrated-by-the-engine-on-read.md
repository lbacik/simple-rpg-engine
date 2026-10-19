# Playthrough state is versioned and migrated by the engine when read, against the current Scenario

Tactical Combat changes the stored `state` document: Damage taken moves from one number per Encounter to one per participant, and an active Combat gains a Range, an Intent and a prepared state per participant. Version 1 documents never stored which Enemy an Encounter placed, so a version 1 Damage taken can only be assigned to a participant by reading the Encounter in the current Scenario content. The migration is therefore an **engine function of the stored document and the current Scenario**, run when a Playthrough is read, before the reference check of [ADR 0001](0001-content-compatibility-by-reference-check.md). Each version keeps a frozen schema and is validated strictly before and after migrating. The result is written back with the pin, in the existing `step`-guarded update, without advancing `step`. A migration that cannot assign stored state unambiguously, such as an Encounter that now has two participants, makes the Playthrough incompatible, and it is not written back.

## Considered Options

- **A Kysely data migration in `npm run migrate` that rewrites every row**: all rows are current once the deploy finishes, and the app needs only one schema. But migrations run without the Scenario collection loaded, so they cannot learn participant ids. They would also freeze a content-dependent decision at deploy time, before the reference check that reads the same content.
- **A content-independent upcast with a placeholder participant**: no content is needed, but a placeholder would sit in the participant model for as long as any old save exists. Every rule that reads participants would have to handle it.
- **Migrating in memory on every read, never writing back**: nothing is written on a read, but the Intent shown for a migrated Combat could change if the content changed between two reads. That breaks the rule that a committed Intent is never re-selected.

## Consequences

- The version 1 schema and the migration stay in the code for as long as version 1 rows may exist. A dormant Playthrough is migrated whenever it is next opened.
- Migration draws no randomness. The first Intents of a migrated Combat are selected without the Prepare draw, so repeating a migration gives the same state, and tests need no RNG for it.
- A migrated single-participant Combat also records that participant's id as its starting membership and as the current Round's tie-break order. These additions need no randomness and preserve the round, Range, Health, wounds, inventory and `step` ([Active Combat roster and compatibility after participant reordering or revival](https://github.com/lbacik/simple-rpg-engine/issues/116)).
- Reading a page can write a row, as the pin update already does. The write is guarded by `step`. If a turn commits in between, the fresh row wins.
- An incompatible Playthrough is never rewritten, so restoring the content restores the Playthrough, in keeping with incompatibility being derived on read.
- State versions and database schema migrations are independent: a new state version needs no Kysely migration unless a column changes.

## Combat MVP 1.0 amendment (accepted)

Source: [ADR 0008](0008-shared-combat-core-replacing-tactical-rules.md) and [ADR 0009](0009-game-data-from-earlier-combat-rules-is-discarded-at-release.md).

- **The v1→v2 application is removed.** The v1 schema, `migrate.ts` and the per-participant tactical migration are deleted with the old rules; there is no v2→v3 converter and nothing left to migrate.
- **Its principles carry on for v3 onwards.** Migration by the engine on read, strict validation per version, a `step`-guarded writeback without advancing `step`, and never re-selecting a committed Intent remain the mechanism for any future v3→v4 change.
