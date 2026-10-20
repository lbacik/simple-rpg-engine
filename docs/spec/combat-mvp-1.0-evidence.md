# Combat MVP 1.0 — implementation-readiness evidence (V6)

Package P7, rows V5/V6. This report maps every handoff row D1–R5 to its test
or recorded manual check, lists accepted limitations, and links the P8
playtest template. P8/P9 rows that need a human are marked **pending**.

Contract: [`combat-mvp-1.0-handoff.md`](combat-mvp-1.0-handoff.md).
Source precedence: `docs/sources/combat-mvp-1.0/rules.md` > map decision
comments > the handoff > the prototype (layout only).
Rules version: `simple-rpg-engine-stance-cards-1.0`.
Status of the gate: V5 commands were run on this branch (proposed for
`combat-mvp-1.0`); results are recorded under V5 below.

## Integration status

P0–P7 closed as the per-package issues (P0a #226 through P7b #246, plus P9a #249)
with their PRs merged to `main`; this branch is at `main` plus the V5/V6 gate
P0–P7 together with the gate. Merging that PR satisfies "P0–P7 merged into
`combat-mvp-1.0`"; the V5 table above is the pre-merge run on the exact
proposed content.

## V5 — repository checks (recorded run)

| Command | Result |
|---|---|
| `npm run schemas` then `git status` | no drift |
| `git diff --check` | clean |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | 81 files, 1153 passed, 1 skipped (the skip is the #264-blocked §15.3 Cover row, see limitations) |
| `npm run validate` × 5 Scenarios | 0 errors, 0 warnings each |
| `npm run build` | pass |
| `npm run migrate` twice, empty database | second run a no-op |
| `npm run test:e2e` | pass — 14/14 across the four gating specs (production build, isolated database and Scenario directory) |

Gate work in this branch (test-only, no production or rule change):
`tests/e2e/combat-helpers.ts` `expectStaleLoser` and
`tests/e2e/combat-stale.spec.ts` read the loser's settled state with
retrying assertions (`toHaveValue`, `expect.poll`); the one-shot reads
flaked under full parallel load (scenario-stale failed 2 of the first
full-set runs, then passed with and without the change). Same values
asserted, no expectation changed.

## P0 — contracts and documents

| Row | Proof |
|---|---|
| D1 | Manual check: ADRs [0008](../../adr/0008-shared-combat-core-replacing-tactical-rules.md), [0009](../../adr/0009-game-data-from-earlier-combat-rules-is-discarded-at-release.md), [0010](../../adr/0010-campaign-health-is-the-hero-combat-hp.md), [0011](../../adr/0011-combat-interface-text-as-client-catalogue-slice.md) exist with status accepted; amendment sections exist on [0001](../../adr/0001-content-compatibility-by-reference-check.md), [0004](../../adr/0004-journal-stores-events-and-scenario-text-as-presented.md), [0005](../../adr/0005-playthrough-state-migrated-by-the-engine-on-read.md), [0006](../../adr/0006-arena-as-a-mode-next-to-scenarios.md) ("Combat MVP 1.0 amendment (accepted)"). |
| D2 | Manual check: [`combat-contract.md`](combat-contract.md) holds the public core contract, reason codes, event types, actor ids, document shapes and named deviations; `mechanics.md` points to `rules.md` and the contract and marks the tactical passages retired. |
| D3 | Manual check: `CONTEXT.md` glossary — "Arena run" redefined as persisted, versioned and importable; no "Retired Playthrough" entry. |
| D4 | Manual check: [`README.md`](README.md) lists the new documents and marks `tactical-combat-handoff.md` and the tactical mockups historical; no `docs/spec/` document describes Speed/Agility order, Reach, Behaviour, escape or Near/Far-only Range as current. |
| D5 | Manual check: `docs/sources/combat-mvp-1.0/README.md` states the folder is the normative rule source and integrated spec. |

## P1 — core

| Row | Proof |
|---|---|
| K1 | `tests/combat-core-parse.test.ts` — every §12 rule rejected with a `ParseIssue` code; valid states round-trip. |
| K2 | `tests/combat-core-range.test.ts` — engagement pairs, groups, edge add/remove. |
| K3 | `tests/combat-core-options.test.ts` — all reason codes per action × target; `listOptions` is the single legality source; Brace always legal. |
| K4 | `tests/combat-core-purity.test.ts` (no IO/`Date`/randomness/catalogue in core) + `tests/boundaries.test.ts` (import boundaries incl. the client-component-builds check). |
| K5 | `tests/combat-core-plan.test.ts` — profile cycles, range adaptation, target choice, slot rotation, two-attack budget, Companion AI. |
| K6 | `tests/combat-core-plan.test.ts` — frozen-plan recomputation equality; mismatch rejected, plans never replaced. |
| K7 | `tests/combat-core-resolve.test.ts` — hit ties, reductions, Feint, Counter/riposte, Cover, Charge, Prepare, movements, terminal cutoff, regeneration; `resolveRound` is the only §7 steps 5–12 path. |
| K8 | `tests/combat-core-golden.test.ts` — §11.1–§11.4 full-Round goldens (T1 WIN Round 3, hero 30 HP/5 stamina; T5 hero 40 HP/9 stamina). §11.5 pending decision — see limitation 1. |
| K9 | `tests/combat-core-15-3.test.ts` — one test per §15.3 row, 25 of 26; the Cover row is `it.skip` pointing at #264. |
| K10 | `tests/combat-core-preview-commit.test.ts` — preview ≡ commit for every legal command in every T1–T7 Round state on the V3 sequences; input deep-equal before/after. |
| K11 | `tests/combat-core-resolve.test.ts` — determinism and replay: initial state + command list replays identically. |
| K12 | `tests/combat-core-resolve.test.ts` — rejection without mutation (wrong round/phase, illegal action/stance/target/cost, surrender outside `CHOOSE`); reason codes, no stamina taken. Results (`LOSS_SURRENDER` from `CHOOSE` only, `DRAW_LIMIT` after 30 Rounds never `WIN`, no attacks/regen after terminal) and event shape (ids, numbers, `round`, sequence) in the same file. |

## P2 — persistence and legacy removal

| Row | Proof |
|---|---|
| S1 | `tests/persistence-005-wipe-migration.test.ts` — 001–004 database with v1/v2 Playthroughs, Journal rows, Arena run and remembered Setup is wiped as specified; sessions intact; re-migration a no-op. This file is also the R4 synthetic CI test. |
| S2 | `tests/playthrough-v3.test.ts` — `schemaVersion` (Playthrough 3, Arena run 1), no `stateVersion`; malformed/unknown-version/wrong-`rulesVersion`/frozen-plan-mismatch reads are read-only with Journal intact (Arena "cannot be read" + Setup form). `tests/scenario-combat-lifecycle.test.ts` covers the tampered-Combat incompatible read. |
| S3 | `tests/arena-fight-store.test.ts` — `WHERE step = expected` guard; monotonic Arena `step` across start/rematch/restart/import so a replaced run's tab never matches. |
| S4 | Recorded manual check: `src/engine/state-v1.ts`, the engine's `migrate.ts`, `tactical.ts`, Round resolvers in `index.ts`/`arena.ts`, `/test-tactical`, the v1/v2 Combat Journal renderers and catalogue keys (`escape`, `combatEndEscape`, `stopEscape`), Arena Bestiary statistics, Equipment/Consumables Combat roles are deleted; nothing imports them (verified by `npm run lint` + `npm run typecheck` passing with no dangling references). Old-rule test suites were rewritten or removed for the new rules. |
| S5 | `tests/persistence-v3-atomicity.test.ts` — atomic commit of state/`step`/status/Ending/Journal on v3 documents; concurrent-turn and rollback coverage in the same file. |

## P3 — content format v2 and conversion

| Row | Proof |
|---|---|
| C1 | `tests/content-v2-validation.test.ts` — one fixture per #184 Q15 catalogue rule with code and source location, incl. `schema/retired-format` and `schema/retired-field`. |
| C2 | `tests/schemas.test.ts` — `companions.json` and `translation-companions.json` generated; fidelity to Zod; V5 run of `npm run schemas` leaves no drift. |
| C3 | Recorded manual check: all five Scenarios converted per the #184 tables (`harek-duel` removed, Astrid as Companion `astrid`); `surrender`/`draw` text present in English and Polish in every Scenario (`scenarios/*/translations/pl/encounters.yaml`). Agent-drafted; merged as PR #275 (human-enabled auto-merge) — see limitation 2. |
| C4 | V5 run: `npm run validate` on all five Scenarios, 0 errors and 0 warnings each; CI validates all five (`.github/workflows/test.yml`); CLI coverage in `tests/cli.test.ts`. |
| C5 | `tests/combat-builder.test.ts` — pure Encounter → `InitialCombatState` builder; every Encounter in all five Scenarios with no Companion and with each party profile passes `startCombat`. |
| C6 | `tests/combat-winnability.test.ts` — one test per converted Encounter: recorded sequence to `WIN`, full roster, hero 40 HP, no Companion; tuning only via `phaseOffset`/`power`/`startRange`. |
| C7 | Manual check: `scenario-format.md`, `content-semantics.md`, `validation.md` updated; [`content-migration-1.0.md`](content-migration-1.0.md) holds before/after examples and the #184 tables; Scenario READMEs describe profiles. |

## P4 — Combat catalogue and UI C component

| Row | Proof |
|---|---|
| U1 | `tests/combat-catalogue-slice.test.ts` — typed, complete EN+PL slice for every reason code, event, result, notice and `ParseIssue`; a missing key fails typecheck; client bundle holds only the slice. |
| U2 | `tests/combat-command-panel.test.tsx` + `tests/combat-panel-selection.test.ts` — three columns, Intents-as-target-list with legality lines, slot status, perspective Ranges incl. Companion. |
| U3 | Same files — every disabled reason shown per card/target; previous Round's stance stays selected. |
| U4 | `tests/combat-panel-forecast.test.ts` — forecast rendered only from `previewRound` events (movement, blow order with arithmetic, Cover/Counter/riposte tags, cancellations with reasons, terminal-cutoff line, post-Round HP/stamina/engagements, regen rules); no forecast arithmetic outside the core (`tests/combat-core-purity.test.ts` + lint boundary). |
| U5 | `tests/combat-command-panel-u5u6u7.test.tsx` — per-Round grouped log with player choice; step-by-step skippable replay; reduced motion honoured. |
| U6 | Same file — Intents above cards with sticky threat strip below the narrow breakpoint; no 390 px overflow in either language. |
| U7 | Same file — keyboard target selection, visible focus, screen-reader names, announced disabled reasons; in-page surrender/replace confirmations, no browser dialogs. |
| U8 | `tests/e2e/combat-nojs.spec.ts` — links/forms preview without advancing `step`; server forecast via `previewRound`; Confirm/Surrender as POSTs; unit side in `tests/combat-command-panel.test.tsx` + `tests/combat-panel-selection.test.ts`. |

## P5 — Arena adapter and UI

| Row | Proof |
|---|---|
| A1 | `tests/arena-setup.test.ts` (Setup builds §15.2 states, positional ids `h01`/`c01`/`e01`–`e05`) + `tests/arena-setup-form.test.ts` (form fields parse into the strict Setup). |
| A2 | `tests/arena-fight-store.test.ts` + `tests/e2e/arena.spec.ts` ("T1 preset fight starts and survives a reload" — same `CHOOSE` state, same frozen plans). |
| A3 | `tests/arena-import-export.test.ts` — file + paste through one strict parse (1 MB cap), `ParseIssue` Interface Text on failure, `PLAN`→`startCombat`, `CHOOSE` recomputation verify, `FINISHED` view-only, history marked not verified, bare-state export naming. E2E side in `tests/e2e/arena.spec.ts` (export downloads; import takes paste and file). |
| A4 | `tests/e2e/arena.spec.ts` ("whole T1 fight plays to Victory, then Fight again starts fresh") + `tests/arena-fight-store.test.ts` (rematch/restart/replace-confirmation semantics). |
| A5 | `tests/e2e/arena.spec.ts` (Victory result panel) + `tests/combat-command-panel.test.tsx` (`WIN`/`DRAW_LIMIT` terminal rendering, no regen after terminal). |
| A6 | `tests/arena-fight-store.test.ts` (`?notice=stale` / `?notice=rejected` with reason, no state/`step` change, double submit pays nothing twice) + `tests/e2e/combat-stale.spec.ts` (arena side). |

## P6 — Scenario adapter

| Row | Proof |
|---|---|
| G1 | `tests/scenario-combat-lifecycle.test.ts` (attrition, surrender-and-return, draw, death through the real stores) + `tests/scenario-companion-lifecycle.test.ts` (Companion lost). |
| G2 | `tests/scenario-combat.test.ts` — Health in/out at current value (max 40), `h01.hp` authoritative, wounds/Journal written once at end, full stamina / Round-1 cooldowns / no Prepare per Combat. |
| G3 | `tests/scenario-combat.test.ts` + `tests/scenario-combat-lifecycle.test.ts` — `WIN`→`victory`, `LOSS`→`deathEnding`, `LOSS_SURRENDER`→`surrender`, `DRAW_LIMIT`→`draw`; surrender/draw leave the Encounter undefeated; repeat fights include survivors only in the authored arrangement. |
| G4 | `tests/scenario-companion.test.ts` — join/leave Effects, replacement departure record, lost-Companion join no-op, full HP per Combat, permanent loss at 0 HP, `companion`/`companionLost` Conditions; rendering side in `tests/journal-scenario-combat.test.ts`. |
| G5 | `tests/scenario-combat-lifecycle.test.ts` (no Combat restart; Journey actions illegal mid-Combat) + `tests/engine-inventory.test.ts` (Attribute-only bonuses, Consumables outside Combat only, `in-combat` inventory state). |
| G6 | `tests/journal-scenario-combat.test.ts` — `combat-start` / `combat-round` (`version: 3`, events + actor-to-`ref` mapping) / `combat-end` (`win`/`surrender`/`draw`) and Companion joined/left/lost entries render from the catalogue in both languages, full and modal Journal, without Scenario content. |
| G7 | `tests/playthrough-combat-export.test.ts` — Playthrough export imports into the Arena; Q18 compatibility (unknown Companion / disappeared Participant → read-only; changed profile/`startRange`/`phaseOffset`/`power` applies from next Combat). Reference-check behaviour in `tests/compatibility.test.ts`. |

## P7 — verification

| Row | Proof |
|---|---|
| V1 | `.github/workflows/test.yml` `e2e` job is gating: installs Chromium, builds once, runs the four Combat specs against the production build with an isolated database (`e2e-smoke.sqlite`) and per-process Scenario directory (`playwright.config.ts`). |
| V2 | `tests/e2e/arena.spec.ts` (whole T1 fight to Victory + Fight again; import file/paste + export; keyboard-only Round), `tests/e2e/combat-scenario.spec.ts` (victory / surrender-keeps-undefeated / death; export re-imports as unverified history), `tests/e2e/combat-nojs.spec.ts` (U8 in both modes). |
| V3 | `tests/arena-preset-replays.test.ts` — T1–T7 automated replays from presets (T1/T5 the §11 winning sequences; T2–T4/T6/T7 recorded diagnostic lines asserting determinism and legality only). |
| V4 | `tests/e2e/combat-stale.spec.ts` — two tabs at the same `step` in each mode; the loser sees current state with a stale notice; nothing applies twice. |
| V5 | The recorded run at the top of this report. |
| V6 | This report, plus the linked playtest template: [`combat-mvp-1.0-playtest-template.md`](combat-mvp-1.0-playtest-template.md). |

## P8 — human acceptance (pending)

H1–H3 are driving-developer playtests (T1–T7 Arena diagnostics, one whole-Scenario attrition playtest, written verdict). Not run in this gate. Record them with the [playtest template](combat-mvp-1.0-playtest-template.md).

## P9 — release rehearsal and merge (pending except R1/R4-test)

| Row | Proof |
|---|---|
| R1 | Done (test): [`../releases/v0.6.0.md`](../releases/v0.6.0.md) states the data discard, Scenario directory reset, backup/deploy/smoke/rollback steps and post-release progress loss on rollback; pinned by `tests/release-notes-v0-6-0.test.ts`. |
| R2 | **Pending** — rehearsal on a production `/data` copy with the v0.6.0 image (driving developer). |
| R3 | **Pending** — rollback rehearsal incl. the v0.5.0-image-fails-on-migrated-copy check (driving developer). |
| R4 | Test half done: `tests/persistence-005-wipe-migration.test.ts` is the synthetic CI test (S1); it complements, not replaces, the R2/R3 rehearsals (pending). |
| R5 | **Pending** — merge `combat-mvp-1.0` into `main` as one merge after H3 accepts. No agent pushes a release tag. |

## Accepted limitations

1. **§11.5 / §15.3 "Cover against two Shots" unreachable as a full-Round golden** ([issue #264](https://github.com/lbacik/simple-rpg-engine/issues/264), `question`). The resolution arithmetic agrees with the prose; the §11.5 intents (two free Archers shooting the companion; companion Prepare in Balanced) cannot arise from the AI rules (§§8.2, 10), and frozen-plan recomputation rejects them. K8 covers §11.1–§11.4; K9 covers 25 of 26 §15.3 rows with the Cover row as `it.skip` pointing at #264. Closing needs a driving-developer decision (rule change with new `rulesVersion`, recomputed example, or a golden exemption) — per the stop conditions it is not settled in code.
2. **C3 review record.** Surrender/draw text ships in English and Polish in all five Scenarios (manual check above); it was drafted by an agent and merged as PR #275 with human-enabled auto-merge. No separate review-comment text was found on the PR; the merge itself is the recorded approval.
