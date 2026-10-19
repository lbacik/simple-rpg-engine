# Tactical Combat implementation handoff

> **Historical.** This document planned the tactical Combat (Speed/Agility order, Reach, Behaviour, escape, Near/Far-only Range) that the MVP 1.0 rules replace. It is kept for provenance only and is not implemented. The current rules are [`docs/sources/combat-mvp-1.0/rules.md`](../sources/combat-mvp-1.0/rules.md) and the [Combat contract](combat-contract.md); the delivery plan is the [Combat MVP 1.0 implementation handoff](combat-mvp-1.0-handoff.md).

Status: accepted by the driving developer on 2026-10-12 after live review. The six packages, acceptance matrix and complete-release approach are accepted. Exact Polish tactical copy is implementer's discretion within the existing Interface Text rules and must use any canonical terms settled by the separate language effort; it is not a prerequisite design decision for this handoff. This document plans production implementation; it does not authorize deployment or execute the work packages.

Source: [Tactical Combat specification and dependency-ordered implementation handoff](https://github.com/lbacik/simple-rpg-engine/issues/84), within [Map: tactical Combat with action-speed initiative and up to two Enemies](https://github.com/lbacik/simple-rpg-engine/issues/76).

## Contract and decision provenance

Implement the normative documents below together. The decision comments explain why; they are not a second copy of the rules. Later decisions explicitly supersede earlier values: Heavy attack is +3, Escape's bonus is captured at commitment, and active Combat membership and saved participant ties follow the roster clarification.

| Concern | Normative home | Canonical decision |
|---|---|---|
| Round lifecycle, Speed, Agility and stopping | [mechanics.md](mechanics.md#rounds) | [Combat round lifecycle: visible intents and action-speed initiative](https://github.com/lbacik/simple-rpg-engine/issues/77#issuecomment-6130653596) |
| Character actions, Range, Guarded and Wary | [mechanics.md](mechanics.md#character-actions) | [Tactical Character actions: defence, Wits disruption, Range and Escape](https://github.com/lbacik/simple-rpg-engine/issues/78#issuecomment-6130772561) |
| Intent vocabulary, Behaviour and selection | [mechanics.md](mechanics.md#enemy-intents) | [Enemy intent profiles for tactical one- and two-Enemy Combat](https://github.com/lbacik/simple-rpg-engine/issues/79#issuecomment-6130828610) |
| Participant identity, wounds and Encounter Outcomes | [CONTEXT.md](../../CONTEXT.md), [content-semantics.md](content-semantics.md#encounters-and-combat), [mechanics.md](mechanics.md#persistence-of-wounds) | [Encounter participants: stable identity, individual wounds and partial victory](https://github.com/lbacik/simple-rpg-engine/issues/80#issuecomment-6130894204) |
| YAML, validation, state migration, events and references | [scenario-format.md](scenario-format.md), [validation.md](validation.md), [playthrough-state.md](playthrough-state.md), [architecture.md](architecture.md), [ADR 0005](../adr/0005-playthrough-state-migrated-by-the-engine-on-read.md) | [Tactical Combat content, state migration and compatibility contracts](https://github.com/lbacik/simple-rpg-engine/issues/81#issuecomment-6131048800) |
| Arena, targets, order and round report | [ui.md](ui.md#combat-panel) | [Prototype: readable intents, targets and action order for two Enemies](https://github.com/lbacik/simple-rpg-engine/issues/82#issuecomment-6131433854) |
| Accepted tuning, authoring guidance and reference fights | [mechanics.md](mechanics.md#balance-targets) | [Prototype: tactical Combat balance and meaningful action trade-offs](https://github.com/lbacik/simple-rpg-engine/issues/83#issuecomment-6132111538) |
| Starting membership, saved ties and content revival | [playthrough-state.md](playthrough-state.md#combat-compatibility-acceptance-examples), [architecture.md](architecture.md#content-compatibility), [ADR 0001](../adr/0001-content-compatibility-by-reference-check.md) | [Active Combat roster and compatibility after participant reordering or revival](https://github.com/lbacik/simple-rpg-engine/issues/116#issuecomment-6132321322) |

The existing server-authoritative engine, injected RNG, ownership checks, `step` guard and atomic state/Journal commit remain requirements. Near/Far is per participant, without a grid. No third Enemy, new Character attack variants, Presence action, new status effects, reward flag or additional Combat objective is introduced.

JSON field names, TypeScript union layouts and module boundaries remain implementer's discretion under [README.md](README.md#implementers-discretion). This handoff adds no domain terms or ADR: the trade-offs already have normative homes.

## Reconciliation and implementation baseline

The normative spec already describes tactical Combat, while production code at `9d18fa2` still uses state v1, `CompiledEncounter.enemy`, one Range, one Enemy response and an untargeted action transport. Those are implementation gaps, not alternate rules to retain. Freeze the actual existing v1 schema before introducing v2; do not infer historical save structure from illustrative spec JSON.

- The glossary and mechanics define one or two Participants, Speed then Agility, visible committed Intents, per-participant Range and the new actions. The content syntax/validation, Encounter semantics, state/action/Journal contract, architecture and arena consume those definitions.
- The roster clarification is already reconciled across state, mechanics, architecture, UI and ADRs. The acceptance matrix below retains its six concrete examples.
- Its publication is [Clarify active Combat membership, round ties and content revival](https://github.com/lbacik/simple-rpg-engine/pull/117), still awaiting merge when this handoff was prepared. Merge that prerequisite documentation before the handoff, then implement against the combined spec. Closing the planning decisions does not claim these PRs have merged.
- Legacy presentation prototypes remain historical assets. Tactical variant A and the current normative text govern implementation; neither prototype's rules module is production code. The earlier prototype predates both balance tuning and the roster clarification.
- The approved Behaviour assignments belong in the reference content package below. Existing shorthand Encounters stay valid, and pair compositions are test/playtest fixtures rather than new shipped story content.
- Interface Text uses the typed `en`/`pl` catalogues and existing Translation/Journal contracts. Participants and Behaviour introduce no translatable Scenario fields. The separate [Map: Interface Language choice (English/Polish) and Scenario Translations](https://github.com/lbacik/simple-rpg-engine/issues/56) owns language decisions; this effort neither claims its tickets nor expands its scope. Exact copy is implementer's discretion under the UI spec; any canonical terminology settled there must be consumed here.

Before implementation, re-read the current code, package scripts and relevant guides under `node_modules/next/dist/docs/`, as required by `AGENTS.md`. Paths below identify existing seams, not a required file split. Check concurrent changes, especially language/Journal work, before fixing integration contracts.

## Work packages and dependencies

The packages are boundaries for later execution issues. They can be reviewed as separate PRs on an integration branch, but the complete feature ships as one release. No intermediate PR may enable v2 writes in the live application while any reader, action handler or Journal renderer still expects v1.

| Package | Requires | Result and principal touched areas | Acceptance ownership |
|---|---|---|---|
| **Content contract and validation** | None | Normalised ordered participants and default Behaviour; schemas and diagnostics. `src/content/{schema,model,integrity,playability,jsonSchema}.ts`, generated `schemas/`, schema/CLI/content tests. | C1–C4 |
| **State versions and compatibility** | Content contract; use the shared Intent-selection rule delivered by Round resolution | Frozen v1, strict v2, deterministic migration and reference checks. `src/engine/state.ts`, `src/content/compatibility.ts`, migration/compatibility tests. | M1–M10 |
| **Round resolution and actions** | Content contract; agree v2 and event types with State versions and compatibility | Pure Round/Intent/action rules, Encounter Conditions and structured Combat events. `src/engine/index.ts`, `src/engine/conditions.ts`, appropriate internal engine modules, engine fixtures/tests. | R1–R12 |
| **Application integration and Journal** | State versions and compatibility + Round resolution and actions | All read/action paths migrate before compatibility; guarded writeback; atomic turns; targeted forms; versioned event rendering and result selection. `src/persistence/stores.ts`, `src/app/lib/{playthrough,turn,combat,journal}.ts`, game/Journal pages and renderers, `src/i18n/`, persistence/turn/Journal tests. | I1–I7 |
| **Tactical Combat UI** | Round/view contract + Application integration and Journal | Server-rendered lanes, bubbles, order strip, target links, action forms and complete round report. Combat panel, game page, result panel, CSS and any small preview component; component/E2E tests. | U1–U7 |
| **Reference content and release verification** | Content contract for fixtures; all packages for completion | Behaviour assignments, legacy and pair fixtures, production-build E2E, reference playtests and release evidence. `scenarios/`, `tests/fixtures/`, focused `tests/e2e/`, release notes/checklist. | All rows and release gate |

State versions and Round resolution can proceed together after a brief type-contract agreement: state stores Intent kinds and membership/order; the engine owns deterministic selection, events and view projection. Migration must reuse the same selection rules with Prepare randomness disabled, rather than implement a second Behaviour engine. Neither package is complete in isolation.

Independent preparation is limited to fixture construction after content types settle, legacy save/Journal fixture capture, catalogue copy and UI scaffolding against agreed view examples. UI mechanics, thresholds, legality and order are always supplied by the engine. Integration and final release verification wait for both state and Round packages.

### Content contract and validation

| ID | Required evidence |
|---|---|
| C1 | Load legacy `enemy: X` and `participants: [{ enemy: X }]` as the same participant id and ordered model. Omitted Behaviour is `steady`; manifest `schemaVersion` remains 1. Existing Scenario packages load without edits. |
| C2 | Accept one or two participants, including explicit `wolf-a`/`wolf-b`. Reject zero/three participants, invalid Behaviour, both/neither spelling (`schema/encounter-enemies`), duplicate explicit/defaulted ids (`ref/duplicate-participant-id` with `related`), invalid ids and unknown Enemy references. Assert codes and source locations, not incidental diagnostic prose. |
| C3 | `play/enemy-unused` sees every participant. `defeated` Conditions test every participant; playability retains its existing analysis without numerical balance checks. Generated schemas match Zod and expose the new fields; loader-only refinements are exercised through the CLI. |
| C4 | Participants/Behaviour add no Translation text. Shorthand conversion and participant edits preserve the Translation projection; all existing valid Translations load. Mechanical edits change the content hash and trigger the reference check. |

### State versions and compatibility

Use real v1 documents captured before implementation, including active, escaped, defeated and ended saves. Migration always precedes the same-hash fast path as well as a changed-hash reference check. A valid version-2 document is returned unchanged. Unknown/newer versions and invalid documents fail validation without being silently interpreted as v1 or rewritten; the failure must not prevent historical Journal access.

| ID | Required evidence |
|---|---|
| M1 | V1 records map unambiguously to the current Encounter's only participant. Keep zero-Damage entries. Missing or now-two-participant recorded Encounters are incompatible; an Encounter with no saved record may change freely within the content rules. |
| M2 | **Legacy active Combat:** retain round, Range, Character Health, inventory, Equipment, wounds and `step`; starting membership and saved tie order are `[p]`; choose Close in/Strike deterministically without a Prepare draw, unprepared and not Wary. No action resolves and no Journal entry is appended. Repeating migration yields the same document. |
| M3 | **Defeat one wolf and reload:** starting membership contains both ids; only the survivor has active state and is targetable; the other has a grey lane without Range/Intent. Projection works with an empty Journal. |
| M4 | **Escape and re-enter:** keep both wounds, but new starting membership, active state and saved tie order contain only survivors. Reset Range from `startRange`, preparation and Wary; select fresh Intents. No old defeated lane remains. |
| M5 | **Reorder equal-priority participants:** current Round retains saved tie order across reload and rejection; the next cleanup captures current content order for both Intent selection and next-Round ties. Arena lane order may follow current content independently. Statistics remain derived from current content. |
| M6 | **Revival during active Combat:** raising a defeated participant's maximum Health so it survives without action state makes the save read-only/incompatible. State, pin and Journal remain untouched, no new Intent/action is invented, and restoring content restores compatibility. Lowering an active participant's maximum Health to its Damage taken or below also fails. |
| M7 | **Revival outside Combat:** in an active Playthrough, later start fights current survivors with kept wounds and the next victory applies the Outcome/Effects again; introduce no victory marker. An ended Playthrough stays ended. |
| M8 | Adding a participant is accepted before any record and after an undefeated non-active record; the new participant joins at full Health on next start. Adding to a defeated Encounter or active Combat fails. Removing/renaming any recorded participant fails. Shorthand conversion preserves identity and compatibility. |
| M9 | Accept allowed edits to kind/Attributes/Damage/Reach/Behaviour/order/`startRange` only while content-dependent invariants hold. Keep the committed Intent kind; do not select a replacement before execution. Missing saved membership/order ids, duplicate order ids and mismatched active/surviving sets cannot pass. |
| M10 | Missing/invalid Scenario: no migration or state write; Journal stays available. Failed migration/reference checks preserve original bytes and remain recoverable after content restoration. Compatible ended saves may migrate structurally without changing their ending or advancing play. |

### Round resolution and actions

Use injected finite dice sequences and assert the resulting state, ordered events and consumed dice. Percentages from the balance solver are not engine test assertions.

| ID | Required evidence |
|---|---|
| R1 | Fast precedes normal precedes slow; higher effective Agility precedes lower within a Speed; Character wins equal-Agility ties; equal Enemies use saved participant order. Compare one participant, same-kind pair and mixed-Reach pair. |
| R2 | Select Intents on Combat start and cleanup, not `view`, reload, target changes or rejection. Draw only where selection requires it, after resolution rolls and in saved/new selection order as appropriate. At most one participant is prepared or selecting Prepare; a disallowed second Prepare consumes no die. |
| R3 | Character Attack defeats participant A before its queued Intent while B survives: A's action is dropped, B still acts, partial defeat does not apply victory. Defeating the last participant stops immediately; later actions are recorded as not reached. No action is replaced or retargeted. |
| R4 | Successful Distract cancels an announced Prepare/Heavy attack, clears preparation and makes the target Wary through the next Round. It is unavailable in that next Round and available after expiry. Failure has no effect. |
| R5 | Defend applies Guarded only from its execution until cleanup. Both participants' attacks use the guarded threshold. Only the first missed melee attack triggers a rolled 1-Damage counter; ranged misses do not. Reaction triggers no reaction, and a last-participant defeat by counter stops the sequence. |
| R6 | Prepare leaves prepared state; the next Heavy attack is slow and deals base Damage +3. Its miss, interruption or Reach cancellation clears preparation. A successful Fall back can cancel a melee Heavy attack later in the order: both are slow, so test higher/equal versus lower Character Agility. An earlier normal Strike is not retroactively avoided. |
| R7 | Advance changes only the targeted Far lane. A faster Close in before a legal Advance changes its target to Near: Advance is cancelled as already Near, spends the Round and is not replaced. Fall back tests against the highest Agility among currently Near survivors and changes all Near lanes on success. Mixed-Reach attacks validate current Range at execution. |
| R8 | Escape keeps +2 from the all-Far commitment state even if a faster Enemy closes in first. Resolve opposing Agility from current survivors. Success stops later actions; failure permits them. Earlier actions remain recorded. |
| R9 | A faster Enemy kills the Character before a normal Consumable/Escape: death Ending, no item consumed, later actions not reached, no next Intent draw. Use-item at full Health is rejected; a legal use heals/consumes only at execution. |
| R10 | Reject stale, unavailable, unknown/defeated/missing targets and targets on untargeted actions without advancing `step`, drawing dice or changing Intents/state/Journal. One surviving participant permits an omitted target for legacy forms; two require a target for Attack/Distract/Advance. Distinguish rejection from an action cancelled during a legal Round. |
| R11 | A continuing Round increments the round number once and `step` once; expire round-scoped effects and then select/store next Intents/order. Victory, Escape and death resolve neither cleanup selection nor remaining actions. Apply only the applicable Encounter/death Outcome. |
| R12 | `view` supplies arena membership, legal targets, reason codes, thresholds, guarded thresholds, Speed/order positions, badges and preparation descriptions from state/current content. No RNG or mutation in projection. Expected action/event layouts are shared with app/UI tests. |

### Application integration and Journal

The current store parses only v1 before Scenario resolution. Move version-aware validation/migration to a layer that has the current Scenario, while retaining a safe validated representation for incompatible read-only views. Cover every caller, including Playthrough lists, the game page, action reads and standalone/modal Journal views; do not assume only the game page reads saved state.

| ID | Required evidence |
|---|---|
| I1 | Compatible read writes migrated state and pin together through the guarded update without advancing `step` or appending Journal. Reload sees the same initial Intent. A racing action wins over an older read; re-read, revalidate/migrate the fresh row before returning it. Never report an unvalidated fresh v1 row as current v2. |
| I2 | A submitted action migrates/checks before engine legality; successful action commits v2 and pin with its one-step transition. Stale/illegal submissions resolve no Round; compatible migration writeback may still occur as specified. Another Session/nonexistent Playthrough gives 404 and performs no migration write. |
| I3 | State/pin/status/Ending and new Journal entries commit atomically. Test two submissions with the same expected step: exactly one Round and one set of entries commits. Inject a Journal insertion failure after the state update and prove rollback of both. Also verify atomic Playthrough creation: failure appending the initial Journal leaves no partial Playthrough. The existing adjacent update/insert in `turn.ts` and insert/append in `PlaythroughStore.create` are not sufficient evidence of these guarantees. Implement transaction handling that also survives the existing concurrent-turn test on SQLite. |
| I4 | Server Action whitelist includes Distract and transports `target` independently from `item`. Forged target/action data is validated by the engine; refreshed rejection notices preserve the existing behavior. A pre-release single-participant form with no target is still accepted at the matching step. |
| I5 | Versioned tactical events render ordered executed/cancelled/dropped/not-reached actions, rolls/results, nested counter, defeats and stop reason. Scenario names/text and participant ordinals are stored as presented; engine messages remain structured and Interface Text is rendered through the catalogue. Rendering works without Scenario content in both Interface Languages. Legacy text/one-Range/guard payloads render unchanged and are never reinterpreted as tactical events. |
| I6 | The ongoing Combat panel derives its arena from state, never the Journal. Its last-round report uses events. The decisive victory/Escape Round appears in the result panel with Outcome/end/notice; death uses the Ending screen and remains readable in Journal. Result Continue changes no state and does not replay a Round. |
| I7 | Compatible/incompatible/ended reads, Session lists and paginated/modal Journal tolerate mixed historical and new entries. Preserve existing rows and their recorded language. Catalogue coverage is typed and complete; participant/Behaviour mechanics do not leak into Translation text. |

### Tactical Combat UI

| ID | Required evidence |
|---|---|
| U1 | Tactical variant A: one/two lanes, Intent bubbles and thresholds, badges, Character summary and order strip. A/B letters distinguish same-kind participants; author ids are never displayed as names. M3–M5 remain visible correctly after reload and content reorder. |
| U2 | `?target=` links select a survivor without state writes, `step` change or RNG. Missing/invalid parameter selects first survivor. Two survivors show the picker; one hides it and posts the survivor. Disabled actions show the engine's reason and the selected target. |
| U3 | Each button shows Speed, predicted order, roll threshold where applicable and target where applicable. Plain forms post the current step, selected participant and Consumable id correctly. Client focus/hover preview uses only server-supplied positions and does not change authoritative state. |
| U4 | No-JavaScript flow: start, read Intents, select B, Distract/Attack/Advance, use item, Escape, Continue and open Journal work through links/forms. Browser E2E verifies a real two-participant save rather than a static mocked panel. |
| U5 | Two tabs with the same step: the loser sees refreshed state and a stale notice; no duplicate damage, items, Outcome or Journal. Changing targets alone does not stale the other tab. |
| U6 | Phone-width lanes and 2×2 action groups remain readable without horizontal page overflow. Keyboard navigation/focus, target `aria-current`, ordered-list semantics, per-lane screen-reader summaries and disabled-action reasons work; decorative drawings are excluded. Honour reduced motion. Check both English and Polish text lengths. |
| U7 | Full and modal Journal, last-round callout and decisive result use the same renderer. Cancels, counters and same-kind letters stay understandable; legacy guard text never creates a live Guarded badge. |

## Reference content and playtests

Apply the already accepted Behaviour assignments without converting existing shipped Encounters into pairs:

| Scenario | Enemy | Behaviour |
|---|---|---|
| Whispering Woods | grey-wolf | steady |
| Whispering Woods | bandit-archer | heavy |
| Whispering Woods | barrow-wight | heavy |
| The Drowned Ledger | drowned-porter | steady |
| The Drowned Ledger | iron-foreman | heavy |
| The Drowned Ledger | channel-watchman | heavy |
| The Drowned Ledger | brass-auditor | steady |

Retain a legacy unmodified package fixture, a one-entry explicit-id fixture, Grey Wolf + Bandit Archer (Far, steady/heavy), two Grey Wolves (Far, distinct ids), and a two-heavy selection fixture. The pair fixtures support engine tests and a test-only/manual playthrough entry path; they do not add production narrative branches or require new Translation fields.

Play the accepted balance walkthroughs against the implemented rules: Scholar/wolf, Soldier/wight's wind-up, Hunter/wolf + archer, Soldier/two wolves and low-Agility early Escape. Compare finite seeded rule traces with the accepted tuning in the [balance harness](https://github.com/lbacik/simple-rpg-engine/tree/prototype/issue-83-combat-balance/docs/spec/mockups/tactical-combat/balance). A separate harness setup/trace adapter may be throwaway; never import it into production. Current spec wins if the older presentation prototype disagrees.

Record the reviewed actions, resulting traces and usability observations. Balance percentages guide authoring, not automated gates: Scholar/wolf at 51% and fighting Templates above 95% in the reference pair are accepted results, not reasons to tune again. No numerical adjustment is silently bundled into implementation. A rule/balance change needs a new decision outside this completed handoff.

## Verification and release gate

During each package, run the relevant deterministic unit/integration tests. On the completed integration branch, collect one release evidence report mapping every C/M/R/I/U row to its automated test or recorded manual check and any accepted limitation.

Required commands, using the scripts available at the baseline:

```sh
npm run schemas
git diff --check
npm run lint
npm run typecheck
npm test
npm run validate scenarios/whispering-woods
npm run validate scenarios/the-drowned-ledger
npm run build
npm run test:e2e
```

Run schema generation before the tests and review/commit the intended generated diff; require no uncommitted generated drift afterward. Validate additional new Scenario fixtures through their content tests or CLI. Run focused tactical E2E on the production build with an isolated database and a fixture collection; adapt the existing Playwright server setup as needed. Do not substitute the presentation prototype for these flows. Existing suites must pass, with old-rule expectations updated only where superseded by named decisions.

Release sequence:

1. Finish and review all packages on the integration branch. Keep v2 readers, writers, transport, renderer and UI in the same deployable artifact. Capture genuine legacy state/Journal fixtures before changing the v1 reader.
2. Rehearse on a disposable copy of the persistent SQLite database and Scenario directory using the actual production artifact. Open active one-Enemy Combats at Near/Far, escaped/defeated records, a dormant save, an ended save and an incompatible save. Check preservation, deterministic writeback and the concurrent-tab cases. No bulk Kysely rewrite of state is required.
3. Before live rollout, stop the old process and capture a consistent database and Scenario-directory backup. Deploy the complete artifact and approved content together; restart to load the validated collection. Do not run old and new processes as simultaneous writers.
4. Smoke-test starting a new Playthrough and opening a legacy active Combat, then a legal Round and Journal in both languages. Observe loader diagnostics, migration failures and rejected actions. An incompatible save stays recoverable/read-only; it is not forcibly converted.
5. Rollback must restore a consistent database/content backup with the old artifact: v1 code cannot read saves already rewritten to v2. Restoring that backup loses progress since it was taken; preserve the failed-release copy for investigation and communicate the recovery window before rollout. A forward fix may preserve newer progress. Neither deployment nor rollback is executed by this planning map.

## Completion and residual risks

This handoff is ready to become separate execution issues when the developer has accepted the package boundaries, dependency/release order and acceptance matrix, the linked normative spec is reconciled, and no design prerequisite remains. Execution issues should copy a package's scope and acceptance ids and wire its dependencies. Creating or executing those issues is a subsequent implementation effort.

Production is done only after all packages and the release gate pass. Risks to track during implementation are content-dependent v1 ambiguity, recovery of incompatible saves, the changed low-Might/two-participant balance, state/Journal atomicity, read/action races, catalogue integration and rollback after lazy v2 writeback. These have defined behavior and verification above; they are not permission to invent new mechanics.

If implementation exposes a decision that cannot be answered from the linked spec or explicit implementer's discretion, stop that dependent package and open a named decision in a new planning effort. Keep unrelated packages moving. This handoff does not resolve such future decisions in advance.
