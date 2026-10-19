# Combat MVP 1.0 implementation handoff

Status: accepted by the driving developer on 2026-10-19 in a live grilling session (Q1–Q17). The ten packages, dependency order, acceptance matrix, gates and release procedure are accepted. This document plans production implementation; it does not authorize implementation to merge into `main`, and it does not authorize deployment.

Source: [Define implementation packages and release gates for simple-rpg-engine](https://github.com/lbacik/simple-rpg-engine/issues/186), within [Map: adapt Combat to simple-rpg-engine MVP with command-panel UI](https://github.com/lbacik/simple-rpg-engine/issues/179).

## Names used here

- **MVP 1.0 rules**: the Combat rules in [`docs/sources/combat-mvp-1.0/rules.md`](../sources/combat-mvp-1.0/rules.md), identified in state by `rulesVersion: simple-rpg-engine-stance-cards-1.0`. "1.0" always means this rules version.
- **v0.6.0**: the application release that ships the MVP 1.0 rules. The project is still experimental; this is not an application 1.0. Never write "release 1.0".
- **Package P0–P9**: the work packages below. **Rows** (`D1`, `K1`, …) are acceptance evidence; their letters never denote packages.

## Scope change at this ticket

The driving developer redrew the delivery in this session. These changes supersede earlier map decisions where they conflict, and the earlier tickets carry a pointer to this handoff:

1. **One release for the whole game.** There is no staged "Arena first, Scenarios second" rollout and no Arena completion gate before Scenario work. The Arena stays a separate mode (ADR 0006); it is merely the cheapest place to run diagnostic playtests.
2. **Pre-v0.6.0 game data is discarded, not retired.** This replaces the retirement model of [Choose save lifecycle and recovery for the simple-rpg-engine transition](https://github.com/lbacik/simple-rpg-engine/issues/182#issuecomment-6251588033):
   - a Kysely migration in the release deletes every Playthrough and Journal entry and drops `arena_runs` and `arena_setups`; `sessions` is kept;
   - there are no retired Playthroughs, no "played under earlier rules" reason code, and no frozen legacy Journal renderers: the v1/v2 Combat renderers and their catalogue keys are deleted;
   - the planned ADR "Saves from earlier rules are retired, not converted" becomes "Game data from earlier Combat rules is discarded at the v0.6.0 release";
   - the "Retired Playthrough" glossary entry is dropped.
3. **Rollback restores the backup.** "Redeploy the previous tag without a database restore" is withdrawn: an older image runs `npm run migrate` in `docker-entrypoint.sh` under `set -eu`, and Kysely's migrator throws `corrupted migrations: previously executed migration … is missing` once a newer migration has run, so the previous image would not start. Rollback is restore-then-redeploy (see [Release procedure](#release-procedure)).
4. **The shipped Scenarios on the production volume are replaced.** `docker-entrypoint.sh` seeds `/data/scenarios` only when it is empty, so production still holds format-v1 Scenarios that the v2 loader rejects. The release empties the directory once and lets the entrypoint re-seed the bundled v2 collection. The driving developer confirmed there are no hand edits on the volume to keep.
5. **Combat works without JavaScript** (progressive enhancement, Q17). Stance, card and target choices are links or forms whose parameters (like today's `?target=`) are not game state; the server renders the forecast with the same `previewRound`, and Confirm is a plain POST. With JavaScript, the browser computes the forecast locally from the isomorphic core. Arena import works without JavaScript through both a file input and a plain `<textarea>`.

Everything else decided on the map stands, including the server as the only authority, `schemaVersion` on both documents (Playthrough 3, Arena run 1), the monotonic Arena `step`, Arena import/export and Scenario export only.

## Contract and decision provenance

Implement against the rule source and the decision comments together. The decisions explain the integration contract; they are not a second copy of the rules.

| Concern | Normative home (rules) | Canonical decision |
|---|---|---|
| Rules, examples, acceptance tests, reference scenarios T1–T7 | [`rules.md`](../sources/combat-mvp-1.0/rules.md) §1–§15; provenance in [the source README](../sources/combat-mvp-1.0/README.md) | [Preserve the normative simple-rpg-engine rule source and prototype decision](https://github.com/lbacik/simple-rpg-engine/issues/180) |
| Core/adapter boundary, public contract, ids, versions, events, Arena Setup | `rules.md` §12–§14 | [Choose the shared simple-rpg-engine Combat core and adapter contracts](https://github.com/lbacik/simple-rpg-engine/issues/181#issuecomment-6250548915) |
| Document versions, import/export, concurrency, stale and rejected commands | `rules.md` §12, §14.3 | [Choose save lifecycle and recovery for the simple-rpg-engine transition](https://github.com/lbacik/simple-rpg-engine/issues/182#issuecomment-6251588033), as amended by [Scope change at this ticket](#scope-change-at-this-ticket) |
| Health, Companion, result routing, Playthrough v3 Combat shape, Journal projection | `rules.md` §10, §14.3 | [Define how simple-rpg-engine Combat connects to Scenario play](https://github.com/lbacik/simple-rpg-engine/issues/183#issuecomment-6251696849), minus its frozen legacy renderers |
| Content format v2, profile tables, conversion, validation catalogue, winnability gate | `rules.md` §8.1, §15 | [Define Scenario authoring and content migration for simple-rpg-engine](https://github.com/lbacik/simple-rpg-engine/issues/184#issuecomment-6251827295) |
| Command-panel UI C, its adjustments, the client-side Combat catalogue slice | `rules.md` §14 | [Validate production UI C with real simple-rpg-engine interaction states](https://github.com/lbacik/simple-rpg-engine/issues/185#issuecomment-6261310235); reference prototype `prototype/combat-ui-c-states` @ `8fc2031` |
| Packages, gates, release and rollback | — | This document |

**Source precedence when they disagree:** `rules.md` > map decision comments (later supersedes earlier; this handoff's scope change supersedes #182 and #183 where named) > this handoff > the prototype, which governs layout only. A difference in meaning between `rules.md` and `original-pl.md` is a translation defect handled by the source README's own precedence rules.

## Reconciliation and implementation baseline

Baseline: `main` at `10a0942`, release tag `v0.5.0`.

- The previous tactical Combat (state v2, `src/engine/tactical.ts`) is on `main` since `v0.4.0` and was shipped by the tag-driven release. It reached `main` through a series of package PRs, not an integration branch.
- Round resolution is duplicated in `src/engine/index.ts` and `src/engine/arena.ts`; the "preview" is separate threshold arithmetic in the view projections. Both go away with the core.
- `src/engine/state.ts` holds `STATE_VERSION = 2`; `state-v1.ts` and `migrate.ts` hold v1 and its migration. `/test-tactical` is a test route for the old rules.
- Kysely migrations are the inline `MIGRATIONS` object in `src/persistence/migrations.ts` (`001_init` … `004_arena_setups`); stores live in `src/persistence/stores.ts`.
- CI (`.github/workflows/test.yml`) runs typecheck, lint, `npm test`, `npm run validate scenarios/whispering-woods`, build and a double migration on an empty database. Playwright E2E is not gating today.
- Release: pushing a `v*` tag runs `release.yml` → `test.yml` → `deploy.yml`, which builds the image on host `rum` over SSH, runs `compose -f compose.prod.yaml up -d --wait` and smoke-tests `https://$APP_HOST/`. `deploy.yml` is also `workflow_dispatch`-able with a `tag` input, which is the redeploy path. Production data lives in the `data` volume at `/data` (`DATABASE_PATH=/data/data.sqlite`, `SCENARIO_DIR=/data/scenarios`).
- The current spec (`docs/spec/`, `CONTEXT.md`, ADRs 0001–0006) describes the old rules. P0 reconciles it; until then neither the old spec nor `rules.md` silently overrides the other.

Before each package, re-read the current code, package scripts and the relevant guides under `node_modules/next/dist/docs/`, as `AGENTS.md` requires. Paths name existing seams, not a required file split.

## Integration strategy

- All packages are developed on one long-lived integration branch, **`combat-mvp-1.0`**, created from `main` by P0. Each package (or each execution issue cut from a package) is one PR into it. Merge `main` into the integration branch as needed; never the reverse until P9.
- The integration branch is promised fully green only at the implementation-readiness gate; each PR keeps its own tests green and changes old-rule expectations only where a named decision supersedes them.
- `main` receives the integration branch as **one merge**, in P9, after the human-acceptance gate. `main` never carries a half-migrated Combat, because a release is cut from it.
- Only the driving developer pushes the `v0.6.0` tag.

## Work packages and dependencies

| Package | Requires | Result | Owner | Rows |
|---|---|---|---|---|
| **P0 Contracts and documents** | — | Integration branch; ADRs and amendments; Combat contract document; glossary delta; spec reconciliation | agent | D1–D5 |
| **P1a Core: state and rules** | P0 | Core types, strict §12 parser, versioned rules table, Range relation, `listOptions` with every reason code | agent | K1–K4 |
| **P1b Core: planning** | P1a | Enemy AI, attack slots, Companion AI, frozen plans and recomputation on read | agent | K5–K6 |
| **P1c Core: resolution** | P1b | `resolveRound`, `previewRound`, `submitRound`, `surrender`, typed events | agent | K7–K13 |
| **P2 Persistence and legacy removal** | P1a | Wipe migration, new Arena tables, versioned documents, `step` guards; deletion of the old rules, renderers and route | agent | S1–S5 |
| **P3 Content format v2 and conversion** | P1c | v2 loader and validator, schemas, Encounter → initial Combat state builder, five converted Scenarios, CI coverage, winnability tests | agent; human reviews text | C1–C7 |
| **P4 Combat catalogue and UI C component** | P1c | Typed client-side catalogue slice (EN/PL); the shared command-panel component used by both modes | agent | U1–U8 |
| **P5 Arena adapter and UI** | P2, P4 | Arena Setup (1–5 opponents, Companion), presets T1–T7, persistence, import/export, Fight again/Restart | agent | A1–A6 |
| **P6 Scenario adapter** | P2, P3, P4 | Combat in Playthroughs: Health, wounds, Companion, result routing, Journal projection, export, compatibility | agent | G1–G7 |
| **P7 Verification** | P5, P6 | Gating E2E, cross-mode evidence, automated T1–T7 replays, evidence report, playtest report template | agent | V1–V6 |
| **P8 Human acceptance** | P7 | Recorded T1–T7 diagnostic playtests and a whole-Scenario attrition playtest | human | H1–H3 |
| **P9 Release rehearsal and merge** | P8 | Release notes and procedure, rehearsal on a copy of production data, one merge into `main` | agent + human | R1–R5 |

P1a–P1c are split only to fit agent sessions; the core is complete only after P1c. P2 can start once the P1a types settle. P3 and P4 run in parallel after P1c; P5 and P6 run in parallel after their inputs. Execution issues copy a package's scope and row ids and wire the dependencies above.

### P0 Contracts and documents

Create `combat-mvp-1.0` from `main` (which by then holds the rule source and this handoff). Write the ADRs with the next free numbers (0008 onward at the time of writing; check for concurrent additions):

| ADR | Source |
|---|---|
| Shared Combat core replacing tactical rules (closed profiles; ADR 0005/0006 supersessions) | #181 |
| Game data from earlier Combat rules is discarded at the v0.6.0 release | this handoff, replacing #182's retirement ADR |
| Campaign Health is the hero's Combat HP; only Health, wounds and Companion presence cross the Combat boundary | #183 |
| Combat Interface Text is a typed catalogue slice shipped to the browser (supersedes that part of ADR 0003 only) | #185 |

| ID | Required evidence |
|---|---|
| D1 | The four ADRs exist with status accepted. Amendment sections: ADR 0001 (Companion references; the reference check applies to v3 documents), ADR 0004 (the Journal guarantee holds for entries written from v0.6.0; earlier entries were discarded by the release), ADR 0005 (the v1→v2 application is removed; its principles carry on for v3 onwards), ADR 0006 (the #181 supersessions; Arena persistence). |
| D2 | One Combat contract document in `docs/spec/` holds the public core contract, reason codes, event types, actor ids, document shapes and the consolidated list of named deviations from MVP 1.0 (#181, #182, #183). `mechanics.md` replaces its Enemy, Combat and balance-target sections with a pointer to `rules.md` and the contract document. |
| D3 | `CONTEXT.md` applies the glossary deltas of #181, #183 and #184, plus "Arena run" redefined as persisted, versioned and importable. "Retired Playthrough" is not added. |
| D4 | `docs/spec/README.md` lists the new documents; `tactical-combat-handoff.md` and the tactical mockups are marked historical. No `docs/spec/` document still describes Speed/Agility order, Reach, Behaviour, escape or Near/Far-only Range as current. |
| D5 | The rule source README no longer says the rules are "not yet the integrated spec". |

### P1a–P1c Core

The core lives under `src/engine/combat/` (name indicative). It performs no IO, reads no `Date`, takes no `Rng` and holds no text, and the browser may import it. Tests initialised from an unusual state set positions, stances, plans and bonuses explicitly (§15.3 preamble).

| ID | Pkg | Required evidence |
|---|---|---|
| K1 | P1a | `parseCombatState` rejects every §12 rule with a `ParseIssue` code, including unknown or mismatched `rulesVersion`, more than one Companion and anything outside 1–5 enemies. Valid states round-trip unchanged. |
| K2 | P1a | Range relation, groups and edge add/remove (§3): canonical sorted engagement pairs, no duplicates, `JOIN` to a group of three makes the actor Near all three without engagements. |
| K3 | P1a | `listOptions` returns every action × target with **all** applicable reason codes and their parameters, not only the first. A command is legal exactly when `listOptions` marks it legal; there is no second legality function. A legal option (Brace) always exists. |
| K4 | P1a | Boundaries: lint forbids IO, `Date`, randomness and catalogue imports in the core; a client component importing the core builds. Statistics come only from the rules table keyed by `rulesVersion`. |
| K5 | P1b | `planRound`: profile cycles, range adaptation (§8.3), target choice (§8.2), slot rotation and the two-attack budget (§9). Killing an active candidate refills no slot in that Round. Companion AI per §10.2 and §10.3. |
| K6 | P1b | Frozen Intents: reading or importing `CHOOSE` recomputes `planRound` and requires exact equality; a mismatch is rejected and plans are never replaced. |
| K7 | P1c | Resolver mechanics: hit ties, reductions, Feint, Counter and riposte, Cover redirection, Charge, Prepare, movements, terminal cutoff, regeneration. `resolveRound` is the only code applying §7 steps 5–12. |
| K8 | P1c | §11.1–§11.5 as full-Round golden tests. T1 (duel 11.1) and T5 (sequence 11.4) play their stated winning sequences to the stated results (WIN in Round 3; hero 30 HP/5 stamina and 40 HP/9 stamina). |
| K9 | P1c | The whole §15.3 table: one test per row, named after the row. |
| K10 | P1c | **Preview ≡ commit**: for every legal command in every T1–T7 Round state reached by the K8/V3 sequences, `previewRound`'s projection equals the resolution part of `submitRound`, and the input state is deep-equal before and after. |
| K11 | P1c | Determinism and replay: initial state + command list gives an identical state and log on repeated runs. |
| K12 | P1c | Rejection without mutation: wrong round, wrong phase, illegal action, stance, target or cost, and surrender outside `CHOOSE`, each return a reason code, leave the input deep-equal and take no stamina. |
| K13 | P1c | Results: `LOSS_SURRENDER` from `CHOOSE` only; `DRAW_LIMIT` after 30 full Rounds and never `WIN`; no attacks or regeneration after a terminal result. Events carry only ids and numbers, a `round` and a sequence number. |

### P2 Persistence and legacy removal

| ID | Required evidence |
|---|---|
| S1 | A new migration (for example `005_combat_mvp_1_0`) on a database built by `001`–`004` with v1 and v2 Playthroughs, Journal rows, an Arena run and a remembered Setup: afterwards `playthroughs` and `journal_entries` are empty, `arena_runs` and `arena_setups` are gone, the new Arena tables exist, and `sessions` rows are intact. Running `migrate` again is a no-op; the empty-database path in CI still passes. |
| S2 | New documents carry `schemaVersion` (Playthrough 3, Arena run 1); the key `stateVersion` is never written. A malformed document, an unknown `schemaVersion`, a wrong `rulesVersion` or a frozen-plan mismatch makes a Playthrough read-only with its Journal, and shows an Arena "cannot be read" notice with the Setup form; the Arena row is replaced only by a user-initiated start or import. |
| S3 | `step` guard: stores update with `WHERE step = expected`. The Arena `step` is monotonic per Session across start, rematch, restart and import, so a tab from a replaced run never matches. |
| S4 | Deleted, with nothing importing them: `state-v1.ts`, the engine's `migrate.ts`, `tactical.ts`, the Round resolvers in `index.ts`/`arena.ts`, `/test-tactical`, the v1/v2 Combat Journal renderers and their catalogue keys (including `escape`, `combatEndEscape`, `stopEscape`), the Arena Bestiary statistics, Equipment and Consumables. Tests pinning the old rules (`tactical-*`, `state-migration`, `state-v1-fixtures`, the old Arena/Combat suites, `tactical-nojs`/`tactical-tabs` E2E) are rewritten for the new rules or removed. |
| S5 | State, `step`, status, Ending and new Journal entries still commit atomically; the existing concurrent-turn and rollback tests pass against the new documents. |

### P3 Content format v2 and conversion

| ID | Required evidence |
|---|---|
| C1 | Every rule of the #184 validation catalogue (Q15) is asserted by code and source location, including `schema/retired-format` for `schemaVersion: 1` and `schema/retired-field`. |
| C2 | Generated JSON schemas include `companions.json` and `translation-companions.json`; `npm run schemas` leaves no drift. |
| C3 | All five Scenarios are converted faithfully from the #184 tables (profiles, `startRange`, `phaseOffset`, `power`, Health ×10/3); `harek-duel` is removed and Astrid is the Companion `astrid`. New `surrender` and `draw` text exists in English and Polish, drafted by an agent and **reviewed by the driving developer**, with the review recorded on the PR. |
| C4 | One test: every shipped Scenario loads with 0 errors and 0 warnings. CI validates all five Scenarios. |
| C5 | The pure Encounter → `InitialCombatState` builder lives here (P6 consumes it). For every Encounter in all five Scenarios, the state built with no Companion and with each party profile passes `startCombat`. |
| C6 | Winnability: one test per converted Encounter plays a recorded command sequence to `WIN` against the full roster, hero at 40 HP, no Companion. A failing Encounter is tuned only through `phaseOffset`, `power` or `startRange`. |
| C7 | `scenario-format.md`, `content-semantics.md` and `validation.md` are updated; `docs/spec/content-migration-1.0.md` holds the before/after examples and the #184 tables; Scenario READMEs describe profiles. |

### P4 Combat catalogue and UI C component

Rebuild prototype C in production; do not promote prototype code.

| ID | Required evidence |
|---|---|
| U1 | The Combat catalogue slice is typed and complete in English and Polish for every reason code, event, result, notice and `ParseIssue`; a missing key fails typecheck. Only that slice reaches client bundles; the rest of the catalogue stays server-side. |
| U2 | Layout per #185: three columns; Intents are the target list with a text + icon legality line; slot status (`Attack slot` or `Waiting · guard N · would …`); Ranges from a selectable perspective, including the Companion's. |
| U3 | Every disabled reason is shown for each card and target. The previous Round's stance stays selected. |
| U4 | The forecast is rendered only from `previewRound` events: movement, blow order with expandable arithmetic, Cover/Counter/riposte tags, cancellations with reasons, an explicit terminal-cutoff line, HP/stamina and engagements after the Round, regeneration (none after a terminal Round). No forecast arithmetic exists outside the core. |
| U5 | The Combat log is grouped per Round with the player's choice; replay is step-by-step and skippable; reduced motion is honoured. |
| U6 | Below the narrow breakpoint the Intents sit above the cards with a sticky threat strip; no horizontal page overflow at 390 px in either language. |
| U7 | Accessibility: keyboard target selection, visible focus, screen-reader names for Intents, targets, cards and forecast lines, and announced disabled reasons. Surrender and replace confirmations are in-page; no browser dialogs. |
| U8 | Without JavaScript: stance, card and target choices are links/forms whose URL parameters change no state and do not advance `step`; the server renders the same forecast through `previewRound`; Confirm and Surrender are plain POSTs. |

### P5 Arena adapter and UI

| ID | Required evidence |
|---|---|
| A1 | Setup: 1–5 opponents from `raider`, `brute`, `sentinel`, `archer` in explicit order, each with a starting group, an engaged-with-hero flag, `phaseOffset` and `power`; an optional `party-sentinel` or `party-archer` Companion; the hero without equipment. Presets T1–T7 build the §15.2 states. Actor ids are positional (`h01`, `c01`, `e01`–`e05`). |
| A2 | A run persists in the new table with `origin`, `setup` and `initial`; a reload resumes the same `CHOOSE` state with the same frozen plans. |
| A3 | Import accepts a file and pasted JSON through one strict parse (1 MB cap); failures render `ParseIssue` Interface Text. `PLAN` goes through `startCombat`; `CHOOSE` is verified by recomputation; `FINISHED` is view-only. Imported history is marked not verified. Export writes the bare `CombatState` (`combat-rNN-<phase>.json`). |
| A4 | After a fight only "Fight again" remains (fresh start from the remembered Setup). "Restart" is offered mid-fight only for Setup-started runs and `PLAN` imports, behind an in-page confirmation. Replacing a `CHOOSE` fight needs an in-page confirmation. |
| A5 | Results `WIN`, `LOSS`, `LOSS_SURRENDER`, `DRAW_LIMIT` render in the result panel; victory/death/escape are gone from the Arena. |
| A6 | Stale `expectedStep` or wrong `round` redirects with `?notice=stale`; an illegal command gets `?notice=rejected` with its reason; neither changes state or `step`. A double submit pays nothing twice. |

### P6 Scenario adapter

| ID | Required evidence |
|---|---|
| G1 | The #183 lifecycle examples (attrition, surrender and return, draw, Companion lost, death) pass as integration tests through the real stores. |
| G2 | Health enters Combat at its current value (max 40) and leaves at the final value; `h01.hp` is authoritative during Combat; `character.health` and wounds are written once, at the end. Every Combat starts with full stamina, cooldowns at Round 1 and no Prepare. |
| G3 | Result routing: `WIN` → `victory`, `LOSS` → `deathEnding`, `LOSS_SURRENDER` → `surrender`, `DRAW_LIMIT` → `draw`. Surrender and draw leave the Encounter undefeated; a repeat fight includes survivors only, in the authored arrangement. |
| G4 | Companion: `companion-join`/`companion-leave` Effects, replacement records a departure, joining a lost Companion is a no-op, full HP per Combat, permanent loss at 0 HP, `companion`/`companionLost` Conditions. |
| G5 | Equipment gives Attribute bonuses only; Consumables are usable outside Combat only; the inventory shows `in-combat` during Combat. There is no Combat restart in a Playthrough. |
| G6 | Journal: `combat-start`, `combat-round` (`version: 3`, events plus actor-to-`ref` mapping), `combat-end` (`win`/`surrender`/`draw`), and Companion joined/left/lost entries render from the catalogue in both Interface Languages without Scenario content, in the full and modal Journal. |
| G7 | Export of the current `CombatState` from a Playthrough imports into the Arena. Content compatibility per #184 Q18: unknown Companion references or a disappeared active Participant make the Playthrough read-only; a changed profile, `startRange`, `phaseOffset` or `power` applies from the next Combat start. |

### P7 Verification

| ID | Required evidence |
|---|---|
| V1 | Playwright runs against the production build with an isolated database and Scenario directory, and `test.yml` makes it **gating**. |
| V2 | E2E in both modes: a whole Arena fight (Setup, play to a result, Fight again), import of file and paste, export; a Scenario Combat to each of victory, surrender and death; the no-JavaScript flow (U8) in both modes; keyboard-only play of one Round. |
| V3 | T1–T7 each have an automated replay test from its preset: T1 and T5 replay the §11 winning sequences; T2–T4, T6 and T7 replay a recorded diagnostic line and assert only determinism and legality, never a balance outcome. |
| V4 | Stale-command evidence: two tabs at the same `step` in each mode; the loser sees the current state with a stale notice and nothing applies twice. |
| V5 | All [repository checks](#repository-checks) pass on the integration branch. |
| V6 | One evidence report maps every row D1–R5 to its test or recorded manual check, plus any accepted limitation, and links a playtest report template for P8. |

### P8 Human acceptance

| ID | Required evidence |
|---|---|
| H1 | The driving developer plays T1–T7 in the Arena on an integration-branch build and records, per scenario, the commands or an exported `CombatState`, the result, final HP and usability notes. These are **diagnostic**: T2–T7 have no stated winning line, and a harsh result (T7 is known to be harsh under naive play) is an observation, not a failure. |
| H2 | A whole-Scenario attrition playtest of at least one converted Scenario, recording Health between Combats and any dead end. |
| H3 | A written verdict in the playtest report: accept usability and balance for v0.6.0, or name the decisions that must return to planning. |

### P9 Release rehearsal and merge

| ID | Required evidence |
|---|---|
| R1 | Release notes for v0.6.0 state the data discard, the Scenario directory reset, the backup, deploy, smoke-test and rollback steps, and that progress after the release is lost on rollback. |
| R2 | Rehearsal on a copy of the production `/data` volume, taken by the driving developer from `rum`, with the actual v0.6.0 image: the migration wipes as in S1, the emptied Scenario directory re-seeds the v2 collection, all five Scenarios load, and the smoke test passes. |
| R3 | Rollback rehearsal: restore the untouched copy and start the `v0.5.0` image; it starts and resumes the restored saves. Also show that the `v0.5.0` image fails to start on the migrated copy, which confirms restore is mandatory. |
| R4 | A synthetic CI test (S1) complements the rehearsal; neither replaces the other. |
| R5 | The integration branch is merged into `main` as one merge after H3 accepts. |

## Repository checks

On the completed integration branch:

```sh
npm run schemas            # then: no uncommitted generated drift
git diff --check
npm run lint
npm run typecheck
npm test
npm run validate scenarios/whispering-woods
npm run validate scenarios/the-drowned-ledger
npm run validate scenarios/the-ember-pass
npm run validate scenarios/the-frost-cairn
npm run validate scenarios/perun-stone
npm run build
npm run migrate            # twice, on an empty database
npm run test:e2e
```

## Gates

Three gates, in order, each with one owner. Passing one never implies the next.

1. **Implementation readiness** (agent). P0–P7 merged into `combat-mvp-1.0`; every repository check passes; the evidence report (V6) is complete. This proves the rules are implemented as specified, not that the game is fun or balanced.
2. **Human acceptance** (driving developer). H1–H3 recorded with an accepting verdict. Only then do P9's rehearsal and the merge into `main` happen.
3. **Deployment authorization** (driving developer as operator). After R1–R5, the driving developer alone decides to push the `v0.6.0` tag. No agent pushes a release tag.

## Release procedure

Executed by the operator after the deployment authorization; rehearsed in R2–R3 first.

1. Stop the running container so nothing writes. Never run two writing processes against the volume.
2. Back up the whole `/data` volume (the SQLite file and `/data/scenarios`) consistently, off the host, and keep it until v0.6.0 is accepted in production.
3. Empty `/data/scenarios` so the new entrypoint re-seeds the bundled v2 collection.
4. Push the `v0.6.0` tag. `release.yml` runs the tests and `deploy.yml`; the container runs the wipe migration on start.
5. Smoke-test: start a Playthrough in a converted Scenario and play one Round, open the Journal in both languages, start an Arena fight from a preset, import and export it. Check the logs for loader diagnostics and rejected actions. Old browser tabs from before the release get a not-found or stale result, never a crash.
6. **Rollback**: stop the container, restore the step-2 backup to the volume, then run `deploy.yml` by `workflow_dispatch` with `tag: v0.5.0`. Everything played after the release is lost. A forward fix is the alternative when the data since the release matters.

## Stop conditions

Stop the dependent package, keep unrelated packages moving, and open a named decision issue (`needs-triage`) linking this handoff when:

- a §11 example, §15.3 row or T1/T5 sequence disagrees with the rule prose. Never settle it in code or in a test;
- a winnability test cannot pass by tuning `phaseOffset`, `power` or `startRange`, so it needs a rule change;
- a question cannot be answered from `rules.md`, the decision comments or explicit implementer's discretion;
- any work would delete or rewrite data beyond the S1 wipe;
- the prototype and the rules disagree on behaviour (the rules win; raise it only if the rules are unclear).

A rule change edits `rules.md`, needs a new `rulesVersion` and recomputes the reference examples, as the source README requires. It is never bundled silently into implementation.

## Relationship to earlier work

- [Tactical Combat release verification and merge](https://github.com/lbacik/simple-rpg-engine/issues/130) is closed as not planned: the tactical rules shipped in `v0.4.0` without its evidence report, and this effort replaces them entirely. No evidence is collected retroactively.
- [Prototype: light illustrated game UI with Journal in a modal](https://github.com/lbacik/simple-rpg-engine/issues/155) is adjacent UI work, not part of this effort.
- [Tactical Combat implementation handoff](tactical-combat-handoff.md) becomes historical in P0.

## Completion and residual risks

This handoff is ready to become execution issues now. Creating and executing them is a separate implementation effort.

Risks to watch: rule-text ambiguity exposed by executable examples; balance of converted Encounters under campaign attrition; the T7 tail; browser and server previews diverging (guarded by one resolver and K10); catalogue completeness in Polish; and the irreversibility of the data discard, which the backup and rehearsal guard. These have defined behaviour and verification above; they are not permission to invent mechanics.
