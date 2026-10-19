# Content migration 1.0: Scenario format v1 → v2

This guide migrates Scenario content from format v1 (`schemaVersion: 1`) to
format v2 (`schemaVersion: 2`). The loader rejects a v1 package with
`schema/retired-format`, and every retired v1 field in a v2 package fails
with `schema/retired-field`, which names its replacement. There is no
dual-format support and no converter tool: the five shipped Scenarios were
converted by hand from the tables below.

Source decisions: [Define Scenario authoring and content migration for
simple-rpg-engine](https://github.com/lbacik/simple-rpg-engine/issues/184)
(Q1–Q18). Normative format reference: [scenario-format.md](scenario-format.md);
semantics: [content-semantics.md](content-semantics.md); diagnostics:
[validation.md](validation.md).

## Checklist

1. Manifest: `schemaVersion: 1` → `2`; list `companions:` when the Scenario
   defines Companions.
2. Enemies: drop `attributes`, `health`, `damage`, `reach`, `behaviour`;
   add `profile` from the [Q11 table](#profile-assignment-q11).
3. Encounters: move `startRange` onto each Participant (required) per the
   [Q12 table](#startrange-phaseoffset-and-power-q12q13); add `phaseOffset`
   / `power` only where Q13 says; replace `escape` with required
   `surrender` + `draw` (Q7); remove `harek-duel`-style ally variants (Q8).
4. Health: rescale every `heal`/`damage` Effect, Consumable `heal` and
   Health Condition per the [Q6 rule](#health-rescaling-q6).
5. Weapons: delete `damage` and `reach`; keep `slot` and the Attribute
   `bonus`. A weapon without a `bonus` becomes flavour only.
6. Companions (Q14, Q8): add `companions.yaml` (`id`, translatable name,
   `party-sentinel` | `party-archer`); join with `companion-join`, gate
   presence with `{companion: id}`.
7. Translations: mirror `surrender`/`draw` text and `companions.yaml`
   (entries `{id, name, description?}`).
8. README: rewrite the Encounter table in terms of profiles.

## Enemy: before → after

```yaml
# v1 (retired)
- id: grey-wolf
  name: Grey Wolf
  description: A lean wolf with a torn ear.
  attributes: { might: 1, agility: 2, wits: 0, presence: 0 }
  health: 6
  damage: 2
  reach: melee
  behaviour: steady
```

```yaml
# v2
- id: grey-wolf
  name: Grey Wolf
  description: A lean wolf with a torn ear.
  profile: raider          # raider | brute | sentinel | archer
```

All statistics come from the profile in the versioned rules table
([rules §8.1](../sources/combat-mvp-1.0/rules.md#81-starting-profiles)).
`translations/<lang>/enemies.yaml` is unchanged (`{id, name, description?}`).

## Encounter: before → after

```yaml
# v1 (retired)
- id: tower-assault
  participants:
    - id: door-guard
      enemy: cinder-raider
    - id: roof-bowman
      enemy: clan-bowman
  startRange: far
  text: …
  victory: { … }
  escape:
    text: …
    move: south-road
```

```yaml
# v2
- id: tower-assault
  participants:              # 1–5, authored order → e01, e02, … (ties break by this order)
    - id: door-guard
      enemy: cinder-raider
      startRange: far        # required: melee | near | far
    - id: roof-bowman
      enemy: clan-bowman
      startRange: far
      phaseOffset: 0         # optional, default 0, 0..cycleLength-1 of the profile
      power: 0               # optional, default 0, integer 0–3
  text: …
  victory: { … }             # optional, as before
  surrender: { text: …, move: south-road }   # required
  draw: { text: …, move: south-road }        # required
```

Rules (Q3–Q5):

- The `enemy:` shorthand stays as sugar for a single Participant and
  requires `startRange` next to it. An Encounter-level `startRange` beside
  `participants` is retired.
- Participant ids default to the Enemy id; a duplicate id is an error.
- The Companion is Playthrough state, never an Encounter Participant, and
  does not count towards the 1–5 limit.
- `startRange` derives the core relations: `melee` → group `g0` with a
  hero engagement; `near` → `g0` alone; `far` → shared group `g1`.
  `nextGroupSerial` is 2 when any Participant is `far`, else 1.
- `waitAge` is always 0 at a Combat start; HP is `profile.maxHp − wounds`;
  the starting Stance is `balanced`.
- Translation entries become
  `{id, text, victory?: {text?}, surrender: {text?}, draw: {text?}}`.

### `escape` → `surrender` + `draw` (Q7)

Both new Outcomes inherit the old `escape` Outcome's `move` target. Their
text is written anew per Encounter and per Outcome, in the base language
and `pl`: "you fled" is neither "you yielded" nor "a stalemate". Against
beasts and the undead, surrender reads as breaking the fight off. The
conversion adds no Effects; `text` stays formally optional but is never
omitted.

## Health rescaling (Q6)

Rule: `round(v × 10/3)`, with two semantic exceptions: "full heal"
12 → **40**, and `atMost 11` ("below full Health") → **39**.

New ranges: `heal`/`damage` Effects 1–40; Consumable `heal` 1–40;
`atLeast` 2–40; `atMost` 1–39.

| Old | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|
| `heal` Effect / Consumable | 7 | 10 | 13 | 17 | 20 | 27 | – | – | 40 |
| `damage` Effect (1 → 3) | 7 | 10 | – | – | – | – | – | – | – |
| Health `atMost` | – | – | – | – | – | – | 30 | 39 | – |

Rationale: a Raider Strike costs 7/40, close to an old hit of 2/12, so
proportional scaling keeps the "healing versus the cost of a fight"
relation. Balance is retuned only when the Q10 winnability gate shows
a need.

## Profile assignment (Q11)

Rule of thumb: `ranged` → `archer`; a guard or automaton in the fiction →
`sentinel`; `heavy` with Health ≥ 9, or a brute, troll or boss → `brute`;
everything else → `raider`.

| Scenario | raider | brute | sentinel | archer |
|---|---|---|---|---|
| whispering-woods | grey-wolf | barrow-wight | – | bandit-archer |
| perun-stone | leszy-wolf | utopiec | – | – |
| the-drowned-ledger | drowned-porter | iron-foreman | brass-auditor | channel-watchman |
| the-ember-pass | ridge-wolf, cinder-raider, tunnel-crawler, deep-ghoul, ash-hound | stone-troll, clan-brute, gharra | – | clan-bowman, ember-shaman |
| the-frost-cairn | fen-hound | draugr-berserker, jarl-harek | draugr-sentry | frost-archer |

Borderline cases: `deep-ghoul` (heavy, Health 8) is a `raider`, whose
cycle already contains Heavy. `brass-auditor` (steady, 10) is a
`sentinel`, as the mechanical guardian of the heart.

## `startRange`, `phaseOffset` and `power` (Q12, Q13)

`startRange` is purely mechanical, with no hand-picked narrative
exceptions:

| Old Encounter `startRange` | Participant profile | New `startRange` |
|---|---|---|
| `near` | not `archer` | `melee` |
| `near` | `archer` | `near` (shoots free; engaged it would lose its cycle) |
| `far` | any | `far` |

`phaseOffset` is 0 everywhere (the MVP reference case). `power` is
non-zero only where the old Damage was 4 or the Participant is a final
boss: `gharra` 2, `jarl-harek` 2, `draugr-berserker` 1. Every other
Participant has 0. Tuning (a phase offset, `power`, or a `startRange`
exception) happens only after a gate failure (Q10) and is recorded in
the Scenario's README.

## Companions (Q14, Q8)

```yaml
# companions.yaml (v2, listed by the manifest as `companions`)
- id: astrid
  name: Astrid the Skald
  description: A captive skald whose verses bind the restless dead.
  profile: party-sentinel  # party-sentinel | party-archer
```

Translation: `translations/<lang>/companions.yaml` with
`{id, name, description?}`. Companion ids are a namespace separate from
Enemy ids. Effects `companion-join: <id>` / `companion-leave` and
Conditions `{companion: <id>}` / `{companionLost: <id>}` are as decided
in #183.

`the-frost-cairn` (Astrid): Astrid becomes the Companion `astrid`
(`party-sentinel`; guarding the flank is Cover). `astrid-rescue`
adds `companion-join: astrid`, keeps `set-flag: astrid-rescued` and its
rescaled heal (3 → 10). The `harek-duel` Encounter is removed:
`sepulchre-approach`'s two Choices merge into one starting
`harek-and-guard`, with rewritten narration (no binding-song variant).
Every place assuming Astrid's presence switches from
`flag: astrid-rescued` to `{companion: astrid}` (starting with
`cairn-collapse/escape-with-astrid`); readers meaning "was rescued"
keep the Flag.

`the-ember-pass` (captives): a group, not one character — no Companion.
`warlord-duel` / `warlord-and-guard` stay.

## Shipped conversion scope (Q9)

All five Scenarios converted faithfully: the same Encounters (except
`harek-duel`), the same 1–2-Participant rosters, the same victory
Outcomes and Locations. No new Encounters, no grown rosters; the
5-Participant limit is later authoring work. No Scenario leaves
the collection.

## Winnability gate (Q10)

CI gate, one test per converted Encounter: a deterministic core plus an
explicit command sequence recorded in the test must reach `WIN` against
the full roster, with the hero at 40 HP and no Companion. Release gate:
human playtests for attrition across a whole Scenario (see #186). An
Encounter failing the CI gate is tuned by Q13; a needed rule change
returns to the map as an explicit decision.
