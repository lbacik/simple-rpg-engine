# Handoff: issue #235 C7 documentation (content format v2)

## Done (all edits documentation-only, uncommitted, branch agent/issue-235)

1. **`docs/spec/scenario-format.md`** — rewritten to normative v2:
   - Manifest `schemaVersion: 2`, added `companions?: [<path>]`.
   - Defaults table: removed `reach: melee` / `startRange: far`; added `phaseOffset: 0`, `power: 0`.
   - Effects: `heal`/`damage` 1–40; added `companion-join` / `companion-leave: null`.
   - Conditions: health `atLeast: 2-40 | atMost: 1-39`; added `companion:` / `companionLost:` (died in Combat = permanent loss, per ADR 0010).
   - Item catalog: equipment without `damage`/`reach` (retired note); consumable `heal: 1-40`.
   - Enemy catalog v2 (`id, name, description?, profile`).
   - Encounter catalog v2 (1–5 participants, required per-participant `startRange`, `phaseOffset`/`power` defaults+rules, required `surrender`+`draw`, `enemy:` shorthand, retired Encounter-level `startRange`/`escape`, Companion not a participant).
   - New Companion catalog section (`party-sentinel | party-archer`).
   - Translations: manifest `companions?`, keys `victory/surrender/draw`, table + Encounter rows, pl encounters example replaced with real current WW text (surrender/draw).
   - Versioning: `schemaVersion: 2` + retired-format pointer to migration guide.
2. **`docs/spec/content-semantics.md`** — v2 semantics: heal cap 12→40; companion-join/leave effect rows; Encounters+Combat section rewritten (profiles, arrangement, only Health/wounds/Companion cross boundary, LOSS_SURRENDER→surrender, DRAW_LIMIT→draw, permanent Companion loss + `companionLost`, defeat vs profile maxHp); "re-offering a fight" heading; added #184 source.
3. **`docs/spec/validation.md`** — verified codes vs `src/content/structure.ts` (RETIRED_FIELDS, `schema/encounter-enemies`, count→invalid-value per comment at structure.ts:709) and `integrity.ts` (`ref/duplicate-id` covers companions via CATALOG_NAMESPACES; `ref/phase-offset-out-of-cycle` derives from ENEMY_CYCLES lengths; `ref/unknown-companion`; translations.ts companions matching). Two edits: duplicate-id covers Companion ids; Encounter bullet spells out count/startRange/power/profile/missing-surrender-draw code mapping. No codes renamed.

## Still to do

4. **Create `docs/spec/content-migration-1.0.md`** — before/after YAML + Q6/Q11/Q12 tables. All source material already gathered (in transcript):
   - BEFORE (v1, real): `git show main~1:scenarios/whispering-woods/` enemies.yaml (grey-wolf attributes/health 8/damage 2/reach melee/behaviour steady; bandit-archer; barrow-wight), encounters.yaml (camp-bandit/hollow-wolf escape+far, wight-fight escape+near), items.yaml weapons (hunting-bow reach ranged damage 3, sword damage 3, staff damage 2+bonus, axe damage 4), translations/pl/encounters.yaml (escape: texts); ember-pass `tower-assault` multi-participant (door-guard/roof-bowman, startRange far, escape) for the multi before-side; ember `greywatch-rest` atMost 11 + heal 5; frost `astrid-rescue/free-astrid` (set-flag astrid-rescued + heal 3).
   - AFTER (v2, real, current whispering-woods/): enemies.yaml profiles; encounters.yaml camp-bandit (far, surrender/draw → forest-edge), wight-fight (melee, end/surrender/draw → barrow-mound); items.yaml (no damage/reach, healing-herbs heal 10, elder-tonic heal 20); chapel-prayer (atMost 39, heal 13); chapel-threshold/barrow-door damage 7/3; translations/pl/encounters.yaml surrender/draw.
   - Before heal/damage values inferable from Q6 mapping (WW herbs 10←3, tonic 20←6, prayer 13←4, damages 7←2, 3←1).
   - Companion: no converted companions.yaml exists anywhere yet — use #184 Q14 astrid YAML as the normative after-side; join after-side per Q8 (free-astrid adds `companion-join: astrid`, keeps flag, heal 3→10); translation companions `{id,name,description?}` per schema.ts.
   - Tables: Q6 (heal 2→7,3→10,4→13,5→17,6→20,8→27,12→40 full-heal; damage 1→3,2→7,3→10; atMost 9→30, 11→39), Q11 profiles per scenario, Q12 startRange (near+non-archer→melee, near+archer→near, far→far), power (gharra 2, jarl-harek 2, draugr-berserker 1), arrangement derivation (melee→g0+engaged, near→g0, far→shared g1) per combatBuilder.ts.
5. **READMEs** — perun-stone already v2 on branch (schemaVersion 2; wolf-fight far/raider, utopiec-fight melee/brute): update walkthrough line 44 to profile language ("raider duel", "brute duel"). Ledger (v1): mapping porter raider melee, foundry foreman brute melee, tower watchman archer far, auditor sentinel melee; minimal edit is walkthrough line 36 "After an escape" → "After a surrender or draw". Ember (v1, 14 encounters): rewrite "Encounters and balance" table with profile/startRange/power (road-wolves 2×ridge-wolf raider far; tower-assault raider+archer far; tower-roof archer near; tower-stairs raider melee; ford-troll brute far; mine-crawler raider melee; depths-pair raider+raider far; gate-guards 2×raider far; gate-lone raider melee; shrine/pen-brute far/melee; shaman-rite archer+raider far; warlord-duel gharra power 2 far; warlord-and-guard +bowman far) + note Monte Carlo % are pre-migration. Frost (v1, 9 encounters): rewrite "Encounters & Combat" table (shore-wolves 2×fen-hound raider far; ridge-sentry sentinel melee; gate-guards sentinel+archer far; gate-sentry-lone melee; gallery-patrol 2×sentry melee; crevice-skulker archer far; shrine-berserker brute melee power 1; harek-and-guard harek power 2 + sentry far), REMOVE harek-duel row + Companion note (astrid party-sentinel, harek-duel removed, sepulchre-approach merged, {companion: astrid} vs flag). Leave story sections intact. Create whispering-woods/README.md (missing) in same style: 7 Locations, 14 Scenes, 3 Templates (hunter/soldier/scholar), 3 Enemies, 3 Encounters, 4 Endings, pl Translation.
6. Report file list + inconsistencies.

## Inconsistencies found (report, do NOT fix code)

- #184 Q15 lists "duplicate Companion id" as its own ref row, but code reports it under generic `ref/duplicate-id` (companions share the CATALOG_NAMESPACES duplicate check). Doc now states this; no rename made.
- #184 Q15 "participant count" row has no dedicated code: 0/6+ participants surface as `schema/invalid-value` (Zod min/max), neither/both spellings as `schema/encounter-enemies`. Doc now states this.
- Otherwise consistent: cycle lengths (raider 4, others 3) match Q4; power 0–3 bound matches Q5; RETIRED_FIELDS matches Q1/Q16; arrangement mapping matches Q4; contract profiles match rules.ts PROFILES.
