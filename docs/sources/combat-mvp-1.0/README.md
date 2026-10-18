# Combat MVP 1.0: rule source and accepted UI direction

The durable, reviewable input for adapting Combat to the stance, card and range system ("MVP 1.0"), first in the Arena and then in Scenario Combat. It is recorded by [Preserve the normative simple-rpg-engine rule source and prototype decision](https://github.com/lbacik/simple-rpg-engine/issues/180) on the map [Map: adapt Combat to simple-rpg-engine MVP with command-panel UI](https://github.com/lbacik/simple-rpg-engine/issues/179).

This folder is a **source**, not yet the integrated spec. [`docs/spec/`](../../spec/README.md), [`CONTEXT.md`](../../../CONTEXT.md) and the ADRs still describe the previous Combat rules. Where they conflict with these rules, the map's decisions will name the supersession explicitly; until then, neither silently overrides the other. Storing the rules here does not authorise building Combat.

## Files

| File | Role |
|---|---|
| [`rules.md`](rules.md) | **Canonical.** English translation of the MVP 1.0 specification. Implementers read this. |
| [`original-pl.md`](original-pl.md) | Provenance. The Polish original, byte-for-byte as received. Never edited. |

## Precedence

1. `rules.md` is the canonical rule text for MVP 1.0.
2. `original-pl.md` is the record of where the rules came from. It is not edited; if the received source ever changes, that is a new source with a new identity here.
3. A difference in meaning between `rules.md` and `original-pl.md` is a **translation defect**, not a rule change. Fix `rules.md` to match the original and say so in the commit message.
4. A deliberate rule change (a balance tweak, a correction from an executable reference example or a playtest) is a named decision on the map. It edits `rules.md`, requires a new `rulesVersion`, and recomputes the reference examples (section 15.4). It never edits `original-pl.md`.

## Source identity

| Property | Value |
|---|---|
| Title (original) | *Warmaster — postawy, karty i odległości*, "Specyfikacja MVP 1.0 · 18 października 2026 · język: polski" |
| Received as | `tmp/figth/03_system_postawy_karty_odleglosci_MVP.md`, a git-ignored local file in the repository owner's working copy, last modified 2026-10-18 12:45 +0200 |
| Size | 67,192 bytes, 892 lines, 17 sections |
| SHA-256 | `d64e1a9484209d320b3af4905c1f77c6f5d6d2bac469d6da2587c69e2c97820a` (identical for `original-pl.md`) |
| Rules version in the original | `warmaster-stance-cards-1.0` |
| Rules version in the canon | `simple-rpg-engine-stance-cards-1.0` |

Verify the copy with `shasum -a 256 docs/sources/combat-mvp-1.0/original-pl.md`.

### Changes made in translation

The translation does not revise any rule, number, formula, ordering or example. These are its only intentional departures from a literal rendering:

- **Name.** "Warmaster" was the project's working title. On the repository owner's instruction, the canon uses *simple-rpg-engine* everywhere, including the `rulesVersion` identifier in section 12 (`warmaster-stance-cards-1.0` → `simple-rpg-engine-stance-cards-1.0`). The prototype's own rename of the same title is the precedent (see below).
- **Balanced stance abbreviation.** The original abbreviates Zrównoważona as `Z`; the canon uses `B`. So `S(Z)` becomes `S(B)` in enemy cycles and examples. In a cycle entry the letter outside the parentheses is the action and the letter inside is the stance, so `B(D)` is Brace in Defensive and `S(B)` is Strike in Balanced.
- **Range constants in pseudocode.** `ZWARCIE` / `BLISKO` / `DALEKO` become `MELEE` / `NEAR` / `FAR`. Polish pseudocode comments are translated.
- **Header line.** "język: polski" becomes "English canonical translation".
- **Card names in section 17.3.** "sześć polskich kart" (six Polish cards) is rendered "six cards originally named in Polish", since the canon names them in English.
- **Quoted interface strings** (sections 5.5, 7, 14) are translated. The Polish originals in `original-pl.md` remain the reference for Polish Interface Text.

### Earlier, non-normative variants

The same session produced two earlier combat variants. They are **superseded** by MVP 1.0 and are not preserved here; their identity is recorded only so a later reader can recognise them.

| File (git-ignored, local) | Size | SHA-256 | Prototype commit |
|---|---:|---|---|
| `tmp/figth/01_wariant_C_walka_z_grupa.md` (group fight, "Wariant C") | 38,720 | `07b01389b3c414ae2fe306cdbeb306628742bc7b3dbd04440c666b27531e2712` | `6bf192fc83c8dc5954e1eee7dcb0593c8bd71f46` |
| `tmp/figth/02_wariant_A_pojedynek.md` (duel, "Wariant A") | 41,608 | `620d79c476c807a43c4f41fe8a889446cea2145275fdbd1e07817ab05eda8020` | `89eda8b2f3c80ba675aaeab58d3949f45b3e2a28` |

Their "Wariant A/C" letters are rule variants, unrelated to the UI layouts A/B/C below.

## Terminology

The terms the canon uses for the original's Polish terms. They are rule vocabulary for this source, not yet `CONTEXT.md` glossary entries; the glossary's current Range (Near/Far), Intent and Round describe the previous rules.

| Polish (original) | English (canon) | Identifier |
|---|---|---|
| Zwarcie / Blisko / Daleko | Melee / Near / Far | `MELEE` / `NEAR` / `FAR` |
| związanie; związany; wolny | engagement; Engaged; Free | `engagements` |
| grupa bliskości | proximity group | `groupId` |
| postawa Agresywna / Zrównoważona / Defensywna | Aggressive / Balanced / Defensive stance (A / B / D) | `aggressive` / `balanced` / `defensive` |
| Potężne uderzenie | Heavy Blow | `heavy` |
| Kontratak; Kontra; riposta; parowanie | Counterattack; Counter; riposte; parry | `counter` |
| Zwód | Feint | `feint` |
| Osłona; osłaniający; podopieczny | Cover; protector; ward | `cover`, `coverWard` |
| Szarża | Charge | `charge` |
| Przygotowanie | Prepare | `prepare`, `readyRound` |
| Atak (action) | Strike | `strike` |
| Obrona (action) | Brace | `brace` |
| Strzał | Shot | `shot` |
| Podejście / Odskok / Odwrót | Approach / Disengage / Withdraw | `approach` / `disengage` / `withdraw` |
| Czekanie z osłoną | Guarded Wait | `wait` |
| Odsłonięcie | Exposed | `exposed` |
| ochrona | guard | `guard` |
| zamiar | intent | `frozenEnemyPlans` |
| miejsce ataku; wiek oczekiwania | attack slot; wait age | `attackSlot`, `waitAge` |
| atak pierwotny / bezpośredni; próba ataku | primary / direct attack; attack attempt | |
| wytrzymałość; umiejętność; obrona; pancerz; moc | stamina; skill; defense; armor; power | `stamina`, `skill`, `defense`, `armor`, `power` |
| odnowienie | cooldown (CD) | `availableRound` |
| Bohater / Towarzysz | hero / companion | `hero` / `companion` role |
| Bandyta / Osiłek / Strażnik / Łucznik | Raider / Brute / Sentinel / Archer | `raider` / `brute` / `sentinel` / `archer` |
| Strażnik drużyny / Łucznik drużyny | Party Sentinel / Party Archer | |

## Accepted UI direction: C, Command panel

The repository owner accepted layout **C — Command panel** ("Panel dowodzenia": three columns; hero status, stances and companion on the left; enemy intents and targeting in the centre; compact actions and the round preview on the right) from the three-layout stance-combat prototype.

| Property | Value |
|---|---|
| Branch | `codex/prototype-stance-combat` (local to the owner's clone; not pushed at the time of writing) |
| Accepted commit | `819a0c0c34a85ea40bc30b67b06e9e11e82821bd`, the branch tip, "prototype: compare three stance combat interface layouts" |
| Originally cited commit | `9935ec1fad651f341abc02c986d65c952e0bbb66`, the same commit before an interactive rebase rewrote it into `819a0c0`. The only difference is two strings renamed from "Warmaster" to "simple-rpg-engine" (the README title and the page eyebrow); layouts A/B/C are identical. `9935ec1` is reachable only from the reflog and will eventually be garbage-collected, so cite `819a0c0`. |
| Path | `src/app/arena/prototype-stance/` (`page.tsx`, `prototype.tsx`, `prototype.css`, `README.md`) |
| Run | `npm run prototype:fight`, then `http://localhost:3011/arena/prototype-stance?variant=C` (non-production only; the route returns 404 in production) |
| Shows | The first-round state of reference scenarios T1, T5 and T7 (section 15.2) |

What the acceptance covers, and what it does not:

- It approves the **layout**. It is not evidence of usability and not evidence that the rules are correct or balanced.
- The prototype is **not an engine**. It does not compute final HP or later rounds, has no round resolver, no saves, import or export; its preview is a mock-up and confirming only writes a demonstration message. Section 14.2's requirement that the preview run the same engine function as the commit is unmet by design.
- The prototype is throwaway code. Production UI is built anew against the real engine; prototype components are not promoted.
- The prototype README still says the verdict is pending. That file is left untouched so the accepted commit stays the one cited; this record is the verdict.

## Reference locations

Where later tickets will most often point:

| Topic | Section of [`rules.md`](rules.md) |
|---|---|
| Participant fields and initial values | 2.1 |
| Range as a relation; groups and engagements | 3.1–3.3 |
| Movement actions | 3.4 |
| Stances and their card restrictions | 4 |
| Card table, costs, priorities, cooldowns | 5.1 |
| Hit and damage formulas | 6.1–6.2 |
| Blow order, elimination and terminal check | 6.3 |
| Full round order (12 steps) | 7 |
| Enemy profiles, cycles and intent adaptation | 8 |
| Two-attack budget and Guarded Wait | 9.1 |
| Companion profiles and AI | 10 |
| Worked reference examples | 11 |
| Saved state, command, `stateVersion`, `rulesVersion` | 12 |
| Normative pseudocode for ordering | 13 |
| Browser interface requirements | 14 |
| Reference scenarios T1–T7 | 15.2 |
| Engine acceptance tests | 15.3 |
| Optional extensions, outside the MVP | 16 |
