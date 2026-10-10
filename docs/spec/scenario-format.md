# Scenario format

This is the **normative** syntax of a Scenario package and the input to the Zod definitions. The example Scenario [`scenarios/whispering-woods/`](../../scenarios/whispering-woods/) conforms to it; where the two disagree, this document wins and the example has a bug.

What the fields *mean* during play is in [content-semantics.md](content-semantics.md). The checks a package must pass are in [validation.md](validation.md).

## Package

A Scenario is a directory under the server-side Scenario directory (`scenarios/` by convention). Its name equals the Scenario `id`.

- **`scenario.yaml`** is the manifest and the entry point. It holds the metadata, the starting Location, the death Ending, the declared Flags, and explicit lists of content files grouped by content type.
- Each **Location** and each **Scene** occupies its own file, whose root is one mapping with an explicit `id`.
- **Items, Enemies, Encounters, Character Templates, Endings and images** live in **catalog** files, whose root is a sequence of mappings, each with an explicit `id`. Any catalog may be split across several files listed under the same type.
- A file's content type is decided by the manifest section that lists it, never by its path or name. Entity and catalog files have no extra root wrapper.

Recommended layout (names are conventions, not engine requirements; other paths and subdirectories work when listed):

```text
scenarios/<id>/
  scenario.yaml
  locations/
    village.yaml
    forest.yaml
  scenes/
    village-arrival.yaml
    forest-ambush.yaml
  items.yaml
  enemies.yaml
  encounters.yaml
  templates.yaml
  endings.yaml
  images.yaml
  images/
    village-gate.webp
```

### Manifest file lists and paths

- The manifest lists every content file explicitly. There is no glob expansion and no directory scanning. Files present in the directory but not listed are outside the package (unfinished content may stay there) and produce no diagnostic.
- Paths are relative to the Scenario directory. Content files use the `.yaml` extension; image files use their own extensions (see [Images](#images)).
- Absolute paths, `..` segments, URLs, and symlinks that resolve outside the Scenario directory are forbidden.
- A file may be listed only once, across all sections.
- Manifest order has no meaning for play.

### Identity and references

- IDs are explicit, author-owned values, independent of file names. They match **`[a-z][a-z0-9-]*`**.
- Each content type has its own namespace within the Scenario: Locations, Scenes, items, Enemies, Encounters, Character Templates, Endings, Flags and images. A Location and a Scene may both be called `forest`; two Locations may not.
- **Choice IDs** are unique within their Scene only; the same Choice ID (for example `leave`) may appear in many Scenes.
- A reference is a plain ID string. The field that holds it decides the target type: `next: forest-ambush` names a Scene, `move: forest` names a Location.
- Story content never refers to file paths, and never to another Scenario.
- Conditions and Outcomes are written inline where they are used. They have no IDs and no shared definition files.
- A Location lists its Scenes as an ordered list of Scene IDs. This is the Scene's membership and the on-enter evaluation order. A Scene does not name its Location.
- Every Flag is declared in the manifest's `flags` list. Flags have no files and no initial values (all start false).

Moving or renaming a file means editing the manifest only. Renaming an ID means editing every reference to it.

### YAML subset

- Exactly **one YAML document** per file, made of ordinary mappings, sequences and scalars.
- **Forbidden**: anchors, aliases, merge keys (`<<`), custom tags, and duplicate mapping keys.
- YAML comments (`#`) are the place for author notes.

## Conventions

- **Field keys are camelCase**: `schemaVersion`, `startLocation`, `deathEnding`, `startRange`, `atLeast`.
- **Vocabulary tokens are kebab-case**, including when they act as keys: `on-enter`, `on-demand`, `set-flag`, `give-item`, `start-combat`, `very-hard`. Attribute names are lowercase: `might`, `agility`, `wits`, `presence`. No aliases are accepted (`very hard` is invalid).
- **Objects are strict.** An unknown key is an error, everywhere, including the manifest.
- **One form per key, no shorthands.**
  - A Condition fact or Effect with exactly one parameter takes a scalar: `flag: x`, `set-flag: x`, `heal: 3`.
  - One with optional parameters always takes a mapping: `has: { item: x }`, `give-item: { item: x }`.
- Narration always lives in `text`; every Condition always lives in `when`.
- `version` must be a YAML string (`"1.0.0"`). An unquoted `1.0` is a number and is an error.

### Value types

| Notation | Meaning |
|---|---|
| `<id>`, `<location-id>`, … | an ID; the suffix names the target type |
| `<text>` | a string that is non-empty after trimming, shown **literally** (no Markdown, no interpolation) |
| `<narration>` | a non-empty string in the [narration format](#narration-format) |
| `<string>` | any string |
| `<bool>` | `true` or `false` |
| `<attribute>` | `might` \| `agility` \| `wits` \| `presence` |
| `<path>` | a package path following the path rules |
| `a \| b` | exactly one of the alternatives |
| `?` after a key | the key is optional |

### Defaults

| Key | Default when omitted |
|---|---|
| `repeatable`, `once`, `magic` | `false` |
| `quantity` | `1` |
| `has.atLeast` | `1` |
| `reach` | `melee` |
| `startRange` | `far` |
| `choices`, `effects`, `scenes`, `connections`, `flags` | `[]` |

### Narration format

Narration fields are: Scenario `intro`, Location `description`, Scene `text`, Outcome `text`, Encounter `text`, Ending `text`.

- A Markdown subset: paragraphs, **bold** and *italic*, with CommonMark semantics (so `*` and `_` both work). Paragraphs are separated by a blank line; a single newline inside a paragraph is a soft break, rendered as a space. Anything else (headings, links, images, lists, raw HTML) is shown literally, with HTML escaped, and draws a warning.
- Exactly one interpolation: **`{name}`**, the Character's name. There are no other variables or expressions.
- A `{` anywhere other than in `{name}` is an error (it catches typos such as `{nmae}`). There is no escape syntax; braces are not allowed in narration.

## Field reference

### Manifest `scenario.yaml`

```yaml
schemaVersion: 1               # package format version; anything else is rejected
id: <id>                       # equals the directory name
title: <text>
description: <text>            # shown on the Collection card
author?: <string>
version: <text>                # author's content version, any non-empty string
language: <BCP 47 tag>         # the language of all the Scenario's text
intro?: <narration>            # shown before the starting Location
startLocation: <location-id>
deathEnding: <ending-id>       # must have kind: defeat
flags?: [<flag-id>]            # every Flag the Scenario uses
locations: [<path>]            # file lists by content type
scenes?: [<path>]
items?: [<path>]
enemies?: [<path>]
encounters?: [<path>]
templates: [<path>]            # at least one Character Template in total
endings: [<path>]
images?: [<path>]
```

### Location file

```yaml
id: <id>
name: <text>
description: <narration>       # static; shown in the Location view
map?: { x: 0-100, y: 0-100 }   # both keys; origin top-left, y down
scenes?: [<scene-id>]          # ordered; on-enter and on-demand Scenes of this Location
connections?:
  - to: <location-id>
    label?: <text>             # default: the target Location's name
    when?: <Condition>         # unmet: the Connection is hidden
```

### Scene file

```yaml
id: <id>
title: <text>                  # heading; also the action label of an on-demand Scene
trigger?: on-enter | on-demand # omitted: a follow-on Scene
repeatable?: <bool>
when?: <Condition>             # forbidden on a follow-on Scene
illustration?: <image-id>
text: <narration>
choices?: [<Choice>]           # none visible: the implicit "Continue"
```

### Choice

```yaml
id: <id>                       # unique within its Scene
text: <text>
when?: <Condition>             # unmet: the Choice is hidden
once?: <bool>                  # hidden after being taken
outcome?: <Outcome>            # at most one of outcome | test;
test?:                         # neither: the empty Outcome
  attribute: <attribute>
  difficulty: easy | ordinary | hard | very-hard
  success: <Outcome>
  failure: <Outcome>
```

### Outcome

```yaml
text?: <narration>
effects?: [<Effect>]           # applied in order
# at most one transition, applied last; none: back to the Location view
next?: <scene-id>              # must be a follow-on Scene
move?: <location-id>
start-combat?: <encounter-id>
end?: <ending-id>
```

### Effect

Each list entry is a one-key mapping.

```yaml
- set-flag: <flag-id>
- clear-flag: <flag-id>
- reveal: <location-id>
- heal: 1-12
- damage: 1-12
- give-item: { item: <item-id>, quantity?: <integer ≥ 1> }
- take-item: { item: <item-id>, quantity?: <integer ≥ 1> }
```

### Condition

A one-key mapping.

```yaml
flag: <flag-id>                # the Flag is true
visited: <location-id>         # the Location has been entered
fired: <scene-id>              # the Scene has been activated
defeated: <encounter-id>       # the Encounter's Enemy is dead
has: { item: <item-id>, atLeast?: <integer ≥ 1> }
attribute: { name: <attribute>, atLeast: 1-5 | atMost: 0-4 }  # effective value
health: { atLeast: 2-12 | atMost: 1-11 }                       # current Health
all: [<Condition>]             # at least one entry
any: [<Condition>]             # at least one entry
not: <Condition>
```

- `attribute` and `health` take **exactly one** bound. A range is two Conditions under `all`. There is no `equals` and there are no strict comparisons.
- The bound ranges exclude every value that would make the Condition constant (`attribute atLeast 0` is always true; so is `health atLeast 1`, because Conditions are only evaluated while the Character is alive). An out-of-range bound is an error.
- Test results are not Conditions; they select the `success` or `failure` Outcome.

### Item catalog

A sequence of items, discriminated by `kind`.

```yaml
- id: <id>
  kind: equipment
  name: <text>
  description?: <text>
  slot: weapon | outfit | talisman
  bonus?: <attribute>          # +1 to that Attribute while equipped
  magic?: <bool>
  reach?: melee | ranged       # weapon only
  damage: 2-4                  # weapon only, and required for a weapon; ranged: 2-3
- id: <id>
  kind: consumable
  name: <text>
  description?: <text>
  heal: 1-12
  magic?: <bool>
- id: <id>
  kind: key
  name: <text>
  description?: <text>
  magic?: <bool>
```

### Enemy catalog

```yaml
- id: <id>
  name: <text>                 # shown on the Range strip
  description?: <text>
  attributes: { might: 0-3, agility: 0-3, wits: 0-3, presence: 0-3 }  # all four
  health: 1-30                 # maximum Health
  damage: 1-6
  reach?: melee | ranged
```

### Encounter catalog

```yaml
- id: <id>
  enemy: <enemy-id>
  startRange?: near | far
  text: <narration>            # opening narration
  victory?: <Outcome>          # omitted: a brief Enemy-defeated notice, then the Location view
  escape: <Outcome>
```

### Character Template catalog

```yaml
- id: <id>
  name: <text>
  description?: <text>
  attributes: { might: 0-3, agility: 0-3, wits: 0-3, presence: 0-3 }  # sum exactly 6
  items?: [{ item: <item-id>, quantity?: <integer ≥ 1> }]  # Equipment starts equipped
```

At most one Equipment item per slot among a Template's items.

### Ending catalog

```yaml
- id: <id>
  kind: victory | defeat
  title: <text>
  text: <narration>            # closing narration
```

### Image catalog

```yaml
- id: <id>
  path: <path>                 # relative to the Scenario directory, not to this file
  alt: <text>                  # required, in the Scenario's language
```

## Images

Only **Scenes** have Illustrations, and an Illustration is always optional.

- Images are **package-local files** declared in `images` catalogs and referenced by ID (`illustration: <image-id>`). Story content never contains image paths. Several Scenes may share one image.
- A path may be declared only once and follows the manifest path rules.
- **Formats**: PNG, JPEG and WebP, identified by a lowercase extension (`.png`, `.jpg`/`.jpeg`, `.webp`). The file signature must match the extension. SVG, GIF and AVIF are not supported. Animation is neither detected nor forbidden.
- **Limits**: file size ≤ 2 MiB, each side ≤ 4096 px. No minimum size and no required aspect ratio.
- `alt` is required and non-empty. There is no decorative option and no caption.

Loading, serving and failed-load behaviour are in [architecture.md](architecture.md#scenario-assets) and [ui.md](ui.md#scene-illustration).

## Versioning

- **`schemaVersion: 1`** is the engine's package-format version. An unsupported value rejects the package.
- **`version`** is the author's content version. It is informational: whether existing Playthroughs survive a content change is decided by a reference check, not by this field (see [ADR 0001](../adr/0001-content-compatibility-by-reference-check.md)).

## Schemas and editor support

- **Zod is the source of truth** for the structure of every file kind, including the per-entity limits above. JSON Schema is generated from it with `z.toJSONSchema` for editor completion and structural checks.
- Refinements that JSON Schema cannot express (the Template point sum, the narration brace rule) and all cross-file checks run only in the loader and the CLI.
- No per-Scenario schema enumerating IDs is generated.
- The repository ships an example VS Code configuration (`yaml.schemas`) associating each generated schema with the files of the recommended layout. A non-standard layout needs matching associations; the loader still takes file types from the manifest.

## Example

The example Scenario exercises every construct above. A representative Scene, [`scenes/barrow-door.yaml`](../../scenarios/whispering-woods/scenes/barrow-door.yaml), excerpted:

```yaml
id: barrow-door
title: The Sealed Door
trigger: on-enter
repeatable: true
when:
  not: { flag: barrow-open }
text: |
  The grey slab is fitted so closely into the mound that a knife blade would
  not pass between the stones. …
choices:
  - id: use-key
    text: Turn the bronze key in the serpent lock.
    when: { has: { item: barrow-key } }
    outcome:
      text: |
        The key turns with a groan, and the slab swings inwards on hidden
        pivots. You step into the dark.
      effects:
        - take-item: { item: barrow-key }
        - set-flag: barrow-open
      move: barrow-tomb
  - id: force-door
    text: Put your shoulder to the slab.
    when:
      attribute: { name: might, atLeast: 2 }
    test:
      attribute: might
      difficulty: very-hard
      success:
        text: |
          Stone grinds on stone, and the slab shifts just enough for you to
          squeeze through.
        effects:
          - set-flag: barrow-open
        move: barrow-tomb
      failure:
        text: |
          The slab does not move, and something in your shoulder does.
        effects:
          - damage: 1
  - id: step-away
    text: Step away from the door.
```

## Sources

- [Normative Scenario YAML syntax and walk-through gaps](https://github.com/lbacik/simple-rpg-engine/issues/16#issuecomment-6100076156) (conventions, field reference, defaults, display text)
- [Scenario package layout and reference convention](https://github.com/lbacik/simple-rpg-engine/issues/6#issuecomment-6099136128)
- [Scenario content model: Locations, Scenes, choices, conditions, effects](https://github.com/lbacik/simple-rpg-engine/issues/3#issuecomment-6099088394)
- [Scene illustration assets: authoring, references and loading contract](https://github.com/lbacik/simple-rpg-engine/issues/14#issuecomment-6099824478)
- [Location map: auto-laid-out graph vs author-provided coordinates](https://github.com/lbacik/simple-rpg-engine/issues/11#issuecomment-6099544434) (`map`)
- [Combat presentation: abstract exchange vs simple grid board](https://github.com/lbacik/simple-rpg-engine/issues/9#issuecomment-6099395150) (`reach`, `startRange`)
- [Cross-file references in multi-file YAML packages](https://github.com/lbacik/simple-rpg-engine/issues/4) (background: [research notes](../research/multi-file-yaml-references.md))
