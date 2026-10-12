# A Translation is a complete, text-only overlay keyed by content ids

A Scenario is written once, in its Base Language, and a Translation renders all of its text into one other language without touching anything else. A Translation lives inside the Scenario package, under its own manifest listed by the base manifest, and its files are text-only projections of the base files: the same shape, keeping only the translatable fields and the keys that say where they belong (`id`, a Choice's `id`, a Connection's `to`, and the base nesting for Outcomes). Mechanics (Conditions, Effects, transitions, numbers, references, Illustrations) exist only in the base. A Translation must be complete, so the engine shows either all of a Scenario's text in the Translation or all of it in the Base Language, never a mix.

## Considered Options

- **A full copy of the Scenario per language**: a translator could work without the base, but every mechanical fix would have to be repeated in every language, and copies would drift into different games behind the same id.
- **A flat key map** (`scenes.barrow-door.choices.use-key.outcome.text: …`): compact and easy to diff by key, but hard to read next to the base and unlike every other file an author writes.
- **Per-field fallback to the Base Language**: tolerates an unfinished Translation, but shows players a mix of languages within one Scenario.
- **One file per language**: simple to list, but unwieldy at Scenario size and unlike the base layout.

## Consequences

- Connections are matched by `to`, so `to` must be unique within a Location. Before this, two Connections to the same target were allowed.
- A Translation can change an Illustration's `alt` but not its image. Art with lettering is not supported.
- Translation files are covered by the content hash. A Translation-only edit triggers the reference check of [ADR 0001](0001-content-compatibility-by-reference-check.md), which passes because no id changes.
- Because a Translation must be complete, an incomplete one is never shown alongside base text. How an incomplete Translation, or one that has fallen behind the base, is detected and treated is a separate decision.
