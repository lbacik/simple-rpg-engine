# Validation

What a Scenario package must satisfy to enter the collection, how it is checked, and how findings are reported. The same loader and validator (`loadScenario`, in `src/content`) serve the CLI and the app's startup (see [architecture.md](architecture.md)).

## Severity

- Two severities: **`error`** and **`warning`**. There is no `info` level and no strict mode.
- An **error** rejects the Scenario. At startup it is left out of the collection and logged with its diagnostics; the app still starts. The CLI exits with code 1.
- An error **about a Translation** rejects only that Translation. The Scenario stays in the collection without it, and its players see the Base Language instead ([Translations](#translations)). At startup the rejected Translation is logged with its diagnostics. The CLI still exits with code 1.
- A **warning** never blocks. It is logged at startup and printed by the CLI. Warnings alone give exit code 0.
- Assignment principle:
  - **error**: the engine cannot run the package correctly, the player would hit undefined or broken behaviour, or the Scenario *certainly* cannot be won;
  - **warning**: a likely author mistake while play stays well defined.
  - Only **certain** findings (no false positives) may be errors. Every heuristic finding is a warning.

## Phases

| Phase | Code prefix | Checks |
|---|---|---|
| 1. Package | `package/` | manifest presence and shape, supported `schemaVersion`, path rules, YAML subset, files listed at most once, Scenario `id` equal to the directory name |
| 2. Structure | `schema/` | the Zod definition of every file, including every per-entity mechanics limit and text rule |
| 3. Integrity | `ref/` | IDs, typed references, declared Flags, Scene membership, Template slots, images |
| 4. Playability | `play/` | static reachability analysis and authoring-quality warnings |

- Within a phase, **all** diagnostics from all files are collected.
- If a phase produced any error, the later phases do not run. Warnings never stop the pipeline. This avoids cascades such as an unknown-Scene error when the Scene's file merely failed to parse.
- The phases check the base Scenario. Each Translation has a pipeline of its own, run once the base has passed phase 3 ([Translations](#translations)).
- Limits expressible in JSON Schema (ranges, enums, required keys) also reach the editor through the generated schema. Refinements (the Template point sum, the narration rules, mutually exclusive keys) are enforced by the loader and the CLI only.

## Diagnostic format

```ts
type Diagnostic = {
  severity: 'error' | 'warning';
  code: string;                 // stable rule id with a phase prefix, e.g. 'ref/unknown-scene'
  message: string;              // English, naming the IDs involved
  file?: string;                // relative to the Scenario directory
  range?: { line: number; column: number; endLine: number; endColumn: number }; // from `yaml` node ranges
  path?: (string | number)[];   // path within the document, e.g. ['choices', 2, 'outcome', 'next']
  related?: { file: string; range?: Diagnostic['range']; message: string }[]; // e.g. "first declared here"
  translation?: string;         // the Translation manifest's path, on every diagnostic about a Translation
};
```

- Positions come from the `yaml` library's node ranges and `LineCounter`; lines and columns are 1-based.
- Playability diagnostics point at the `id` node of the entity concerned.
- Duplicate-ID diagnostics carry the first declaration in `related`.
- `translation` is set on every diagnostic about a Translation, including those whose `file` is a base file. It is the manifest's path because the path exists even when the Translation's `language` cannot be read.

## CLI

`npm run validate <scenario-dir>` (run through `tsx`) validates one package.

- Default output, one line per diagnostic, clickable in terminals and VS Code:

  ```text
  <scenario-dir>/<file>:<line>:<column> <severity> <code>: <message>
  ```

  followed by a summary line with the error and warning counts and each rejected Translation's manifest path and `language`, for example `1 error, 2 warnings; Translation translations/pl/scenario.yaml (pl) rejected`. A diagnostic without a file or range omits those parts.
- `--json` prints the raw `Diagnostic[]` array instead.
- Exit code 1 if there is any error, including an error that rejects only a Translation, otherwise 0.
- The CLI applies the same `id`-equals-directory rule as the collection.

## Rule catalog

Every rule has a stable code. **(W)** marks a warning; everything else is an error.

### Phase 1: Package

| Code | Rule |
|---|---|
| `package/missing-manifest` | `scenario.yaml` is missing or unreadable. |
| `package/yaml-syntax` | A listed file (or the manifest) is not parsable YAML. |
| `package/multiple-documents` | A file contains more than one YAML document. |
| `package/forbidden-yaml` | An anchor, alias, merge key or custom tag is used. |
| `package/duplicate-key` | A mapping has the same key twice. |
| `package/unsupported-schema-version` | `schemaVersion` is missing or not a supported version (currently only `1`). |
| `package/invalid-manifest` | The manifest's file-list sections are missing where required or are not lists of strings. Other manifest fields are checked in phase 2. |
| `package/invalid-path` | A listed path is absolute, contains `..`, is a URL, lacks the `.yaml` extension, or is a symlink resolving outside the Scenario directory. |
| `package/missing-file` | A listed file is missing or unreadable. |
| `package/duplicate-file` | A file is listed more than once, in one section or across sections. |
| `package/id-mismatch` | The manifest `id` differs from the directory name. |

Files present in the directory but not listed produce no diagnostic.

### Phase 2: Structure

| Code | Rule |
|---|---|
| `schema/unknown-key` | A key not defined for that object. |
| `schema/missing-field` | A required key is absent. |
| `schema/invalid-value` | A value has the wrong type, is not an allowed token, or is outside its range (see the ranges below). |
| `schema/empty-text` | A text or narration field, required or optional, is empty after trimming. |
| `schema/template-points` | A Template's base Attributes do not sum to exactly 6. |
| `schema/multiple-transitions` | An Outcome has more than one of `next`, `move`, `start-combat`, `end`. |
| `schema/outcome-and-test` | A Choice has both `outcome` and `test`. |
| `schema/when-on-follow-on` | A Scene without `trigger` has `when`. |
| `schema/condition-bounds` | An `attribute` or `health` Condition has zero bounds or both. |
| `schema/empty-combinator` | An `all` or `any` list is empty. |
| `schema/weapon-only-field` | `reach` or `damage` on an item that is not a weapon, or a weapon without `damage`. |
| `schema/invalid-language` | `language` is not a valid BCP 47 tag (checked with `Intl.getCanonicalLocales`). |
| `schema/narration-brace` | A `{` in narration other than in `{name}`. |
| `schema/markdown-outside-subset` **(W)** | Narration uses Markdown outside the subset: headings, links, images, lists or raw HTML. It is rendered literally, with HTML escaped. |

Ranges and shapes checked under `schema/invalid-value` and `schema/missing-field`:

- **Manifest** (beyond the file lists and `schemaVersion`, which phase 1 checks): `version` a non-empty YAML string (no semver enforcement); at least one Character Template in total across the `templates` catalogs.
- **Character Template**: base Attributes integers 0–3, all four present; starting item `quantity` ≥ 1.
- **Equipment**: `slot` `weapon` | `outfit` | `talisman`; `bonus` an Attribute; weapon `reach` `melee` | `ranged`; `melee` weapon `damage` 2–4, `ranged` weapon `damage` 2–3.
- **Consumable**: `heal` 1–12.
- **Enemy**: Attributes integers 0–3, all four present; `health` 1–30; `damage` 1–6; `reach` `melee` | `ranged`.
- **Encounter**: `escape` present; `startRange` `near` | `far`.
- **Ending**: `kind` `victory` | `defeat`.
- **Effects**: `heal` and `damage` 1–12; `give-item` and `take-item` `quantity` ≥ 1, no upper bound.
- **Conditions**: `has.atLeast` ≥ 1; `attribute` `atLeast` 1–5 or `atMost` 0–4; `health` `atLeast` 2–12 or `atMost` 1–11.
- **Tests**: `difficulty` `easy` | `ordinary` | `hard` | `very-hard`.
- **Location `map`**: both `x` and `y` present, numbers 0–100.
- **Image**: `alt` present (and non-empty, under `schema/empty-text`).

Optional text fields (Connection `label`, item, Enemy and Template `description`, Scenario `intro`, Outcome `text`) may be omitted but, when present, must not be empty. Required text: Scenario `title` and `description`; Location `name` and `description`; Scene `title` and `text`; Choice `text`; item, Enemy and Template `name`; Ending `title` and `text`; Encounter `text`; image `alt`. There are no length limits.

### Phase 3: Integrity

| Code | Rule |
|---|---|
| `ref/invalid-id` | An ID does not match `[a-z][a-z0-9-]*`. |
| `ref/duplicate-id` | Two entities of the same type share an ID within the Scenario. |
| `ref/duplicate-choice-id` | Two Choices of one Scene share an ID. |
| `ref/duplicate-connection-target` | Two Connections of one Location have the same `to`. (A Translation keys Connection `label`s by `to`.) |
| `ref/unknown-location` | A reference to a Location that does not exist: `startLocation`, Connection `to`, `move`, `reveal`, `visited`. |
| `ref/unknown-scene` | A reference to a Scene that does not exist: Location `scenes`, `next`, `fired`. |
| `ref/unknown-item` | A reference to an item that does not exist: Template `items`, `give-item`, `take-item`, `has`. |
| `ref/unknown-enemy` | An Encounter's `enemy` does not exist. |
| `ref/unknown-encounter` | `start-combat` or `defeated` names an Encounter that does not exist. |
| `ref/unknown-ending` | `deathEnding` or `end` names an Ending that does not exist. |
| `ref/unknown-image` | `illustration` names an image that is not declared. |
| `ref/undeclared-flag` | A Condition or Effect uses a Flag not in the manifest's `flags`. |
| `ref/death-ending-kind` | The death Ending is not of kind `defeat`. (An explicit `end` to the death Ending is allowed.) |
| `ref/scene-membership` | An `on-enter` or `on-demand` Scene is listed by no Location or by more than one; or a follow-on Scene is listed by a Location. |
| `ref/next-to-triggered-scene` | `next` targets a Scene that has a `trigger`. |
| `ref/template-slot-conflict` | A Template's starting items include two Equipment items for the same slot. |
| `ref/duplicate-image-path` | Two image entries declare the same path. |
| `ref/invalid-image-path` | An image path breaks the path rules, or its extension is not `.png`, `.jpg`, `.jpeg` or `.webp` (lowercase). |
| `ref/missing-image-file` | A declared image file is missing or unreadable. |
| `ref/image-format-mismatch` | The image file's signature does not match its extension. |
| `ref/image-too-large` | An image file is over 2 MiB or has a side over 4096 px. |

### Phase 4: Playability

#### Reachability analysis

An **over-approximating fixpoint** over obtainable state. "Unreachable" therefore always means *certainly* unreachable.

1. **Start**: the starting Location is reachable, and the starting items of every Template are obtainable.
2. **Evaluate Conditions three-valued.** Each fact is *false* when it is certainly false given what is reachable so far, and *unknown* otherwise:
   - `flag: F` is false if no reachable Outcome sets F;
   - `has: { item }` is false if the item is neither a starting item nor given by any reachable Outcome;
   - `visited: L`, `fired: S`, `defeated: E` are false if L, S or E is not (yet) reachable;
   - `attribute: { name, atLeast: n }` is false if n exceeds the highest base value of that Attribute among the Templates plus `min(2, k)`, where k is the number of slots in which some obtainable Equipment grants that bonus; `atMost: n` is false if n is below the lowest base value among the Templates;
   - `health` facts are unknown.

   `all`, `any` and `not` combine these with three-valued (Kleene) logic, where `not` of unknown is unknown. A Condition is **satisfiable** unless it evaluates to false.
3. **Expand** reachable content:
   - a reachable Location makes reachable its listed Scenes whose `when` is satisfiable, and the targets of its Connections whose `when` is satisfiable;
   - a reachable Scene makes reachable the Outcomes of its Choices whose `when` is satisfiable (both Test results);
   - a reachable Encounter makes reachable its `victory` and `escape` Outcomes;
   - a reachable Outcome makes its `next` Scene, `move` Location, `start-combat` Encounter and `end` Ending reachable, and records the Flags it sets and the items it gives.
4. **Repeat** until nothing changes.

Ordering, `clear-flag`, `take-item`, Health and dice are ignored.

#### Way-out analysis

For `play/no-way-out`, take the graph of play positions, each paired with the current Location, **ignoring every Condition**. A Location reaches its listed Scenes and its Connection targets; a Scene reaches its Outcomes and, through the implicit Continue, the Location view; an Outcome follows its transition, or with none returns to the current Location; an Encounter reaches both its Outcomes, and without a `victory` Outcome returns to the current Location. An Ending is reached only through an `end` transition (an explicit `end` to the death Ending counts). **Death is not a way out**, otherwise every Location reachable after `damage` would pass trivially.

#### Rules

| Code | Rule |
|---|---|
| `play/no-victory` | No Ending of kind `victory` is reachable. |
| `play/no-way-out` | A reachable Location or Scene from which no Ending can be reached in the way-out analysis. This is a certain soft-lock. |
| `play/unreachable-location` **(W)** | A Location is not reachable. |
| `play/unreachable-scene` **(W)** | A Scene is not reachable. |
| `play/unreachable-encounter` **(W)** | An Encounter is not reachable. |
| `play/unreachable-ending` **(W)** | An Ending is not reachable. The death Ending is exempt. |
| `play/all-choices-conditional` **(W)** | A Scene has at least one Choice, and every one of them has a `when`. (The engine offers the implicit Continue when none is visible.) |
| `play/take-without-has` **(W)** | An Outcome has `take-item: { item: X }` but is not gated by a `has: { item: X }`. It is gated when the `when` of its Choice or Scene is that `has`, or contains it as a direct entry of a top-level `all`. (An Encounter Outcome can never be gated this way, so a `take-item` there always warns.) |
| `play/repeatable-combat` **(W)** | `start-combat: E` in any Outcome (Test results included) of a Scene with `repeatable: true`, not gated by `not: { defeated: E }`. It is gated when the `when` of its Scene or Choice is that `not`, or contains it as a direct entry of a top-level `all`. Deeper nesting (inside `any`, a double `not`) and Flag-based Conditions do not count. The engine treats the start as a no-op anyway. |
| `play/next-to-fired-scene` **(W)** | `next: T` where T is not repeatable and at least one holds: (a) Outcomes of **two or more distinct sources** have `next: T` (a source is a Scene or an Encounter; several Outcomes of one Scene count once); (b) a source is **repeatable** (a Scene with `repeatable: true`, or an Encounter's `escape` Outcome); (c) T is its own source. False positives on mutually exclusive Outcomes are accepted. |
| `play/flag-never-set` **(W)** | A declared Flag is never set by any `set-flag`. |
| `play/flag-never-read` **(W)** | A Flag is set but never used in a Condition. |
| `play/item-never-obtainable` **(W)** | An item is in no Template and given by no `give-item`. |
| `play/key-item-unused` **(W)** | A Key Item is used in no Condition. |
| `play/enemy-unused` **(W)** | An Enemy has no Encounter. |
| `play/image-unused` **(W)** | A declared image is referenced by no Scene. |
| `play/missing-map-coordinates` **(W)** | A Location has no `map`. |
| `play/map-too-close` **(W)** | Two Locations' `map` points are less than 5 units apart (Euclidean). |

#### Deliberately not checked

- **State-dependent soft-locks** (for example, a key given away before the only locked exit) cannot be proven statically. A warning for "every way out is conditional" was rejected as too noisy, because locked doors with a puzzle are a normal pattern.
- **Combat balance**: within the mechanics limits no fight is unwinnable by construction (see [mechanics.md](mechanics.md#tactical-notes-consequences-not-extra-rules)). Difficulty estimates are out of scope.

## Translations

A [Translation](scenario-format.md#translations) is checked against the base Scenario, so its checks run only after the base has passed phase 3 (Integrity), when every base ID is resolved. They do not depend on phase 4: a playability error rejects the Scenario anyway, but the CLI still reports the Translations' findings to the author.

Each Translation listed under the base manifest's `translations` runs its own pipeline, independent of the other Translations:

| Stage | Code prefix | Checks |
|---|---|---|
| T1. Package | `package/` | the Translation manifest and every file it lists: presence, YAML syntax and subset, path rules, files listed at most once across the whole package |
| T2. Structure | `schema/` | the Zod definition of the Translation manifest and of each Translation file, a text-only projection of the base file kind; the text rules |
| T3. Match | `translation/` | completeness against the base, language tags, staleness |

- Within a stage, all diagnostics of that Translation are collected. If a stage produced any error, the Translation's later stages do not run.
- Any error in its pipeline **rejects the Translation**, and only it. The Scenario is loaded without it, and an Interface Language that would have selected it falls back to the Base Language. Warnings never reject.
- Every diagnostic of the pipeline carries the Translation's manifest path in `translation`.

What the earlier stages catch, with existing codes:

- A Translation manifest listed under `translations` that is missing or unreadable is `package/missing-file`, and a `translations` entry that breaks the path rules is `package/invalid-path`. Each rejects only that Translation.
- `package/duplicate-file` covers the whole package. A Translation that lists a base file is rejected. When two Translations list the same file, both are rejected.
- A non-translatable field in a Translation file (`when`, `effects`, `map`, …) is `schema/unknown-key`.
- A missing `language` or `baseVersion` is `schema/missing-field`, and an invalid tag is `schema/invalid-language`.
- Translation text follows the base text rules: `schema/empty-text`, `schema/narration-brace` and the `schema/markdown-outside-subset` warning.
- `{name}` is not compared with the base. A Translation may drop it where the base has it, or use it where the base does not, as its grammar requires.

### Stage T3: Match

Entries are matched to the base by their keys ([Translation files](scenario-format.md#translation-files)): `id` for entities, catalog entries and Choices, `to` for Connections, and the base nesting for Outcomes.

| Code | Rule |
|---|---|
| `translation/missing-text` | A translatable field the base has is absent from the Translation, including every field of a base entity the Translation has no entry for. One diagnostic per field, pointing at the `id` node of the base entity, or at the base field itself for manifest fields. |
| `translation/unmatched` | The Translation has an entry or field with no base counterpart: an unknown `id`, Choice `id` or Connection `to`; an Outcome branch the base Choice or Encounter does not have (for example `test.success` under a Choice with `outcome`); or an optional field the base omits. |
| `translation/duplicate-entry` | The Translation has two entries with the same key, in one file or across its files. The first entry is in `related`. |
| `translation/base-language` | The Translation's primary language subtag equals the Base Language's. |
| `translation/duplicate-language` | Two Translations of the Scenario share a primary language subtag. **Both** are rejected, since neither has precedence; each names the other in `related`. Every Translation whose manifest declares a valid `language` counts, even one rejected by another rule. |
| `translation/not-interface-language` **(W)** | The Translation's primary language subtag is not an Interface Language (currently `en` and `pl`). It is valid but never shown. |
| `translation/stale` **(W)** | The Translation manifest's `baseVersion` differs from the base manifest's `version`. The message names both versions. |

### Staleness

Structural drift is already an error: a Scene, Choice or optional field added to the base makes the Translation incomplete (`translation/missing-text`), and one removed from the base leaves it `translation/unmatched`. What remains is changed text in a field both still have, which no rule can see. A Translation therefore records the base `version` it was translated from in `baseVersion`, and a mismatch draws `translation/stale`.

- The values are compared as plain strings. There is no ordering and no semver: any difference warns.
- The check is coarse. It relies on the author bumping `version` when text changes, and it marks the whole Translation, not the changed strings. The translator clears it by reviewing the text and updating `baseVersion`.
- It is a warning, not an error, because a stale Translation is complete and playable. It is shown to players as usual, with no marker.

## The example Scenario

[`scenarios/whispering-woods/`](../../scenarios/whispering-woods/) has been walked through every phase by hand and passes with **no errors and no warnings**. It is the reference fixture for the validator's tests; invalid fixtures are written alongside the validator.

## Sources

- [Translation validation and staleness](https://github.com/lbacik/simple-rpg-engine/issues/58) (Translations, scoped rejection, `baseVersion`)
- [Scenario validation rules and playability checks](https://github.com/lbacik/simple-rpg-engine/issues/7#issuecomment-6099876109)
- [Normative Scenario YAML syntax and walk-through gaps](https://github.com/lbacik/simple-rpg-engine/issues/16#issuecomment-6100076156) (rule catalog changes, death Ending, the "not defeated" and `next` warning definitions)
- [Scene illustration assets: authoring, references and loading contract](https://github.com/lbacik/simple-rpg-engine/issues/14#issuecomment-6099824478) (image rules)
- [Write the example Scenario and check it against the validation rules](https://github.com/lbacik/simple-rpg-engine/issues/12#issuecomment-6099995494) (walk-through)
