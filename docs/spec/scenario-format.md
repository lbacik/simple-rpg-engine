# Scenario format

This is the **normative** syntax of a Scenario package and the input to the Zod definitions. The example Scenario [`scenarios/whispering-woods/`](../../scenarios/whispering-woods/) conforms to it; where the two disagree, this document wins and the example has a bug.

What the fields *mean* during play is in [content-semantics.md](content-semantics.md). The checks a package must pass are in [validation.md](validation.md).

## Package

A Scenario is a directory under the server-side Scenario directory (`scenarios/` by convention). Its name equals the Scenario `id`.

- **`scenario.yaml`** is the manifest and the entry point. It holds the metadata, the starting Location, the death Ending, the declared Flags, and explicit lists of content files grouped by content type.
- Each **Location** and each **Scene** occupies its own file, whose root is one mapping with an explicit `id`.
- **Items, Enemies, Encounters, Character Templates, Endings and images** live in **catalog** files, whose root is a sequence of mappings, each with an explicit `id`. Any catalog may be split across several files listed under the same type.
- A file's content type is decided by the manifest section that lists it, never by its path or name. Entity and catalog files have no extra root wrapper.
- **Translations** are optional text-only overlays, each with its own manifest listed under `translations` (see [Translations](#translations)).

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
    layers/
      chimney-smoke.webp
  translations/
    pl/
      translation.yaml
      locations/
        village.yaml
        forest.yaml
      scenes/
        village-arrival.yaml
        forest-ambush.yaml
      items.yaml
      …                        # the same catalogs as the base, text only
```

### Manifest file lists and paths

- The manifest lists every content file explicitly. There is no glob expansion and no directory scanning. Files present in the directory but not listed are outside the package (unfinished content may stay there) and produce no diagnostic.
- Paths are relative to the Scenario directory. Content files use the `.yaml` extension; image files use their own extensions (see [Images](#images)).
- Absolute paths, `..` segments, URLs, and symlinks that resolve outside the Scenario directory are forbidden.
- A file may be listed only once, across all sections of the manifest and of every Translation manifest.
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
| Drift and Camera `loop` | `false` |
| Drift and Camera `delay` | `0` |
| Layer `anchor`, and `at` on a Layer without `drift` | `{ x: 50, y: 50 }` |
| Layer `width` | `100` |
| Layer `blend` | `normal` |
| Camera `from` | `{ zoom: 100, x: 50, y: 50 }` |
| `quantity` | `1` |
| `has.atLeast` | `1` |
| `phaseOffset` | `0` |
| `power` | `0` |
| `choices`, `effects`, `scenes`, `connections`, `flags`, `translations` | `[]` |

### Narration format

Narration fields are: Scenario `intro`, Location `description`, Scene `text`, Outcome `text`, Encounter `text`, Ending `text`.

- A Markdown subset: paragraphs, **bold** and *italic*, with CommonMark semantics (so `*` and `_` both work). Paragraphs are separated by a blank line; a single newline inside a paragraph is a soft break, rendered as a space. Anything else (headings, links, images, lists, raw HTML) is shown literally, with HTML escaped, and draws a warning.
- Exactly one interpolation: **`{name}`**, the Character's name. There are no other variables or expressions.
- A `{` anywhere other than in `{name}` is an error (it catches typos such as `{nmae}`). There is no escape syntax; braces are not allowed in narration.

## Field reference

### Manifest `scenario.yaml`

```yaml
schemaVersion: 2               # package format version; anything else is rejected
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
companions?: [<path>]          # Companion definitions; see Companion catalog
templates: [<path>]            # at least one Character Template in total
endings: [<path>]
images?: [<path>]
translations?: [<path>]        # Translation manifests; see Translations
```

### Location file

```yaml
id: <id>
name: <text>
description: <narration>       # static; shown in the Location view
map?: { x: 0-100, y: 0-100 }   # both keys; origin top-left, y down
illustration?: <image-id>
scenes?: [<scene-id>]          # ordered; on-enter and on-demand Scenes of this Location
connections?:
  - to: <location-id>          # unique within the Location
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
- heal: 1-40
- damage: 1-40
- give-item: { item: <item-id>, quantity?: <integer ≥ 1> }
- take-item: { item: <item-id>, quantity?: <integer ≥ 1> }
- companion-join: <companion-id>   # that Companion joins the party
- companion-leave: null            # the current Companion, if any, leaves
```

### Condition

A one-key mapping.

```yaml
flag: <flag-id>                # the Flag is true
visited: <location-id>         # the Location has been entered
fired: <scene-id>              # the Scene has been activated
defeated: <encounter-id>       # every participant of the Encounter is dead
has: { item: <item-id>, atLeast?: <integer ≥ 1> }
attribute: { name: <attribute>, atLeast: 1-5 | atMost: 0-4 }  # effective value
health: { atLeast: 2-40 | atMost: 1-39 }                       # current Health
companion: <companion-id>      # that Companion is currently in the party
companionLost: <companion-id>  # that Companion died in Combat (permanent loss)
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
- id: <id>
  kind: consumable
  name: <text>
  description?: <text>
  heal: 1-40
  magic?: <bool>
- id: <id>
  kind: key
  name: <text>
  description?: <text>
  magic?: <bool>
```

Equipment carries no Damage or Reach: Combat statistics come from the [MVP 1.0 profiles](../sources/combat-mvp-1.0/rules.md), and a weapon's `bonus` is its only mechanical field. A weapon without a `bonus` is flavour only. The retired `damage` and `reach` fields are rejected (see [validation.md](validation.md)).

### Enemy catalog

```yaml
- id: <id>
  name: <text>                 # shown for the participant in Combat and the Journal
  description?: <text>
  profile: raider | brute | sentinel | archer   # required; all statistics come from it
```

An Enemy is a named, translatable kind of opponent bound to one of the fixed MVP profiles (rules §8.1; statistics in [combat-contract.md](combat-contract.md#profiles)). It has no Attributes or statistics of its own. A `party-*` profile on an Enemy is rejected, as are the retired v1 fields `attributes`, `health`, `damage`, `reach` and `behaviour`.

### Encounter catalog

```yaml
- id: <id>
  enemy: <enemy-id>            # one participant; exactly one of `enemy` and `participants`
  startRange: melee | near | far   # that participant's starting Range (with `enemy`)
  participants:                # 1-5 participants, in participant order
    - id?: <participant-id>    # default: the `enemy` id; unique within the Encounter
      enemy: <enemy-id>
      startRange: melee | near | far   # required; that participant's starting Range
      phaseOffset?: 0-3        # default 0; below the profile's cycle length
      power?: 0-3              # default 0; per-instance tuning
  text: <narration>            # opening narration
  victory?: <Outcome>          # omitted: a brief Enemy-defeated notice, then the Location view
  surrender: <Outcome>         # required
  draw: <Outcome>              # required
```

- `enemy: X` with a `startRange` beside it is shorthand for a single participant (`participants: [{ enemy: X, startRange: … }]`), with id `X` and zero tuning. It is not deprecated. The two spellings are the same Encounter: converting one into the other changes no participant id. An Encounter-level `startRange` beside `participants` is the retired v1 field and is rejected.
- `startRange` is required on every participant and has no default, because it is mechanical. The adapter derives the Combat arrangement from it ([combat-contract.md](combat-contract.md); `melee` starts engaged with the hero, `near` in the hero's group, `far` in a shared second group).
- `phaseOffset` must lie below the profile's cycle length (`raider` 0–3, `brute`/`sentinel`/`archer` 0–2); there is no modulo. `power` is an integer 0–3; the range is a content-validation bound, not a rule (rules §8.1).
- `surrender` and `draw` are required; the retired `escape` Outcome is rejected. Combat routes `LOSS_SURRENDER` to `surrender` and `DRAW_LIMIT` to `draw` (see [content-semantics.md](content-semantics.md#encounters-and-combat)).
- A participant id defaults to its `enemy`. Two participants of the same Enemy kind must name explicit, distinct ids:

  ```yaml
  - id: road-wolves
    participants:
      - { id: wolf-a, enemy: ridge-wolf, startRange: far }
      - { id: wolf-b, enemy: ridge-wolf, startRange: far }
    text: Two grey shapes slip out of the bracken.
    surrender: { text: You back away slowly, and the pack lets you go. }
    draw: { text: You hold the road until the pack loses interest. }
  ```

- A one-entry `participants` list is valid, for example to give a single participant an id other than its Enemy's.
- Participants carry no text. On screen and in the Journal a participant is named by its Enemy's `name`; two participants of one kind are told apart by the engine, not by authored names (see [playthrough-state.md](playthrough-state.md#journal)).
- The Companion is Playthrough state, never an Encounter participant, and does not count towards the 1–5 limit.

### Companion catalog

```yaml
- id: <id>
  name: <text>
  description?: <text>
  profile: party-sentinel | party-archer   # required
```

A Scenario-level Companion definition: the id, translatable name and party profile (rules §10.1) of a Companion that may join the party through `companion-join`. Companion ids are a namespace separate from Enemy ids; an enemy profile on a Companion is rejected. Companions fight through the Combat adapter, never as Encounter participants (see [content-semantics.md](content-semantics.md#encounters-and-combat)).

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
  path: <path>                 # the Still; relative to the Scenario directory, not to this file
  alt: <text>                  # required, in the Scenario's Base Language
  motion?: <Motion>            # see Motion
```

### Motion

```yaml
layers?: [<Layer>]             # draw order, first at the back; at least one entry when present
camera?: <Camera>              # at least one of layers | camera
```

### Layer

```yaml
path: <path>                   # the Layer's picture: one image, or a strip of frames
frames?: 2-64                  # integer; the picture is a horizontal strip of equal-width frames
fps?: 1-30                     # fractions allowed; required exactly when frames is present
at?: <Point 0-100>             # where the anchor sits on the Still; at most one of at | drift
anchor?: <Point 0-100>         # in percent of one frame
width?: 0-400                  # above 0; percent of the Still's width
blend?: normal | multiply | screen
drift?:                        # linear
  from: <Point -100 to 200>    # positions of the anchor; may lie outside the Still
  to: <Point -100 to 200>
  duration: 0-600              # seconds, above 0
  delay?: 0-600                # seconds
  loop?: <bool>
flicker?: { depth: 1-100 }     # opacity dip in percent
```

### Camera

```yaml
from?: <Framing>               # default: the whole Still
to: <Framing>
duration: 0-600                # seconds, above 0; ease-in-out
delay?: 0-600                  # seconds
loop?: <bool>                  # in, then back out
```

- A `<Point>` is `{ x, y }`, both keys, numbers in percent: of the Still for `at` and Drift points, of one frame for `anchor`. The origin is top-left and y points down, as in `map`.
- A `<Framing>` is `{ zoom, x, y }`, all three keys: `zoom` 100-400 in percent, `x` and `y` 0-100 in percent of the Still.

## Images

Both **Locations** and **Scenes** may have Illustrations, and an Illustration is always optional.

- Images are **package-local files** declared in `images` catalogs and referenced by ID (`illustration: <image-id>`). Story content never contains image paths. Several Scenes or Locations may share one image.
- A catalog entry's `path` is the Illustration's **Still**. An entry may add **Motion** under `motion` ([Illustration Motion](#illustration-motion)); an entry without `motion` is a static Illustration. Motion belongs to the image, so a shared image animates identically wherever it is shown.
- A catalog `path` may be declared only once and follows the manifest path rules. A Layer `path` follows the same path rules but is not a catalog entry: one file may serve several Layers, several Illustrations, and also be a Still.
- **Formats**: PNG, JPEG and WebP, identified by a lowercase extension (`.png`, `.jpg`/`.jpeg`, `.webp`), for Stills and Layer files alike. The file signature must match the extension. SVG, GIF and AVIF are not supported, and neither are video, Lottie or Rive. Stills and Layer files are single-frame images: an animated PNG or WebP is not supported, though the validator does not detect one, and its animation would run outside Motion (under reduced motion, while paused, without the Play/Pause control). WebP with alpha is recommended for Layers.
- **Limits** per file, for the Still and for every Layer file: file size ≤ 2 MiB, each side ≤ 4096 px. No minimum size and no required aspect ratio.
- **Limit per Illustration**: the Still plus every **distinct** Layer file of its Motion total at most 4 MiB. A file used by several Layers of one Illustration counts once; a file shared with another Illustration counts in each.
- `alt` is required and non-empty. One `alt` describes the Still and its Motion together. There is no decorative option and no caption.

Loading, serving and failed-load behaviour are in [architecture.md](architecture.md#scenario-assets) and [ui.md](ui.md#scene-and-location-illustration). The decision to compose Motion from Layers over a Still, rather than ship animated files, is recorded in [ADR 0007](../adr/0007-motion-as-engine-composed-layers-over-a-still.md).

### Illustration Motion

Motion is the decorative animation of an Illustration: its Layers' frames, Drifts and Flickers, and its Camera. It is identical on every Showing and does not react to Playthrough state. How the engine composes and times it, and when it is on or off, is in [ui.md](ui.md#motion).

- **Layers** are transparent pictures drawn over the Still in list order, the first at the back. There is no `z` key and no Layer `id`. `images/layers/` is the recommended place for Layer files, a convention, not a requirement.
- **Units**: positions and sizes are numbers in percent (no `%` suffix, no positional arrays), times are numbers of seconds, and `fps` is frames per second. Fractions are allowed.
- **Picture**: without `frames`, a Layer's picture is one image. With `frames: n`, it is a horizontal strip of `n` equal-width frames, so the file's pixel width must divide by `n`. Frames always loop while the Layer is shown.
- **Size**: `width` is the Layer's width in percent of the Still's width; its height follows from the aspect ratio of one frame. With the defaults (`width: 100`, `at` and `anchor` at the centre), a Layer drawn in the Still's proportions covers the whole Still.
- **Placement**: `anchor` names a point of the Layer, in percent of one frame, and that point sits on `at`. A grounded sprite uses `anchor: { x: 50, y: 100 }` with `at` on the ground. `at` must lie within the Still. `anchor` places the Layer only; it does not affect the Camera.
- **Drift**: the Layer's anchor travels from `from` to `to` in `duration` seconds, linearly, after `delay`. Drift points may lie outside the Still, so a Layer can enter or leave the picture. `drift` and `at` exclude each other.
- **Flicker**: an engine-driven variation of the Layer's opacity. The author sets only `depth`, the deepest dip in percent; the engine fixes the curve and its rate within safe limits. It is a mapping, not `flicker: true`, so later keys need no change of form.
- **Blend**: `normal`, `multiply` or `screen`, against everything drawn beneath the Layer.
- `frames`, `drift` and `flicker` combine freely on one Layer. Each Layer is declared on its own: there is no `count` for repeated sprites, and a file repeated across Layers is fetched once.
- **Camera**: a zoom, a pan or both, from the `from` framing to the `to` framing in `duration` seconds, eased in and out, after `delay`. It applies to the Still and every Layer together. In a framing, `zoom` is the magnification in percent (100 shows the whole Still) and `x`/`y` is the **fixed point**: the point of the Still that stays in place while zooming, so `x: 0` keeps the view flush with the left edge and `x: 100` with the right. A push-in changes `zoom`, a pan changes the fixed point at `zoom` above 100. The view never leaves the Still, so the engine never clamps.
- **One-shot or looping**: Drift and Camera are **one-shot** by default: they play once per Showing and hold their end state. `loop: true` repeats them. The per-Showing wording deliberately avoids `once` and `repeatable`, which count per Playthrough.
- **Room for later Condition-driven Motion**: objects are strict, so a later `when` on a Layer, or variants under `motion`, is an additive change that leaves existing packages valid. `when` is not used anywhere in Motion now.

```yaml
- id: loc-hunters-camp
  path: images/loc-hunters-camp.png              # the Still
  alt: >-
    An abandoned hunters' camp in a pine clearing, with a branch lean-to and a
    ring of blackened hearth stones.
  motion:
    layers:
      - path: images/layers/hunters-camp-sun.webp  # sun shafts over the whole Still
        blend: multiply
        flicker: { depth: 40 }
      - path: images/layers/crow.webp              # a crow standing on a stump
        frames: 8
        fps: 4
        anchor: { x: 50, y: 100 }
        at: { x: 33.4, y: 66.1 }
        width: 4
      - path: images/layers/bird.webp              # one-shot, starts mid-picture
        frames: 4
        fps: 5
        width: 4
        drift: { from: { x: 38, y: 16 }, to: { x: 108, y: 9 }, duration: 14, delay: 1.5 }
      - path: images/layers/bird.webp              # looping, same file
        frames: 4
        fps: 6
        width: 3.2
        drift: { from: { x: -5, y: 23 }, to: { x: 105, y: 19 }, duration: 24, delay: 8, loop: true }
    camera:
      to: { zoom: 110, x: 30, y: 55 }              # one-shot push-in towards the lean-to
      duration: 18
```

This is the example of [Example layered Illustration in whispering-woods](https://github.com/lbacik/simple-rpg-engine/issues/209#issuecomment-6251921939) (its prototype branch is [`prototype/layered-illustration-example`](https://github.com/lbacik/simple-rpg-engine/tree/prototype/layered-illustration-example)), with the crow placed by `anchor`. It enters the example Scenario together with the implementation of Motion.

### Authoring guidelines

Not validated; they keep Motion readable and accessible.

- Motion is identical on every Showing, so it must suit **every narrative state** of its Scene or Location. A burning fire does not belong at a camp that is abandoned in one state and occupied in another.
- Paint content that never moves into the Still. A Layer with no `frames`, `drift` or `flicker` vanishes whenever Motion is off, which the validator warns about.
- To keep a Layer unseen until it enters, start its Drift outside the Still: before its `delay` ends, a Layer waits at its `from` point.
- Frames loop at one `fps`, so a pause (a crow idling, then turning its head) is spelled as repeated frames. Two Layers sharing a strip move in unison unless their `fps` differ; there is no phase offset.
- `screen` is nearly invisible on a light, ink-on-paper Still. Paint light as a warm `multiply` tint.
- A Layer covering the whole Still may be drawn at a lower resolution and stretched by the default `width: 100`.
- A Camera magnifies the Still. `play/camera-low-resolution` counts pixels, so an upscaled Still passes without having real detail.
- `alt` describes the scene. Mention motion only where it carries meaning; decorative Layer content (a crow, passing birds) need not be named.
- No Layer content, sprite strips included, may flash more than three times in any one second (WCAG 2.3.1). Flicker complies by construction. The validator does no frame-luminance analysis; one could be added later as a warning, never an error.

## Translations

A Scenario is written in its **Base Language**, the manifest's `language`. It may carry any number of **Translations**, each a complete rendering of all of its text into one other language. Recorded in [ADR 0002](../adr/0002-translation-as-text-only-overlay.md).

- A Translation is a **text-only overlay** keyed by content IDs. It adds no content and changes no mechanics: IDs, references, Conditions, Effects, transitions, numbers, `map` coordinates, illustrations, `motion` and every other non-text field exist only in the base files.
- A Translation is **complete**. It provides exactly the translatable fields the base provides: a field present in the base is present in the Translation, and an optional field omitted in the base is omitted in the Translation. The engine never mixes the text of two languages within one Scenario.
- Translation text follows the same value types as the base: `<text>` fields are shown literally, and narration fields follow the [narration format](#narration-format) (the Markdown subset and `{name}` only).

### Translation manifest

The base manifest lists each Translation's manifest under `translations`. A Translation manifest lists its own files by content type, mirroring the base manifest's sections. Its paths are relative to the **Scenario directory** (not to the Translation manifest) and follow the [path rules](#manifest-file-lists-and-paths). `translations/<language>/` with the base layout mirrored inside it is the recommended layout, not a requirement.

```yaml
language: <BCP 47 tag>         # the language of this Translation's text
baseVersion: <string>          # the base `version` this Translation was made from
translator?: <string>          # credit, shown with the author
title: <text>
description: <text>
intro?: <narration>            # present exactly when the base has intro
locations: [<path>]
scenes?: [<path>]
items?: [<path>]
enemies?: [<path>]
encounters?: [<path>]
companions?: [<path>]
templates: [<path>]
endings: [<path>]
images?: [<path>]
```

A Translation manifest has no `schemaVersion`, `id`, `author` or `version`; the base manifest's values apply. It is identified by its `language`.

`baseVersion` records the base manifest's `version` the Translation was made from or last reviewed against. When the base's `version` moves on, the Translation is reported as stale, a warning ([validation.md](validation.md#staleness)). The translator clears it by reviewing the text and updating `baseVersion`.

A Translation that breaks any rule in this section is rejected on its own: the Scenario stays in the collection and shows its Base Language instead ([validation.md](validation.md#translations)).

### Language tags

- A Translation's `language` is a valid BCP 47 tag whose **primary language subtag** differs from the Base Language's (a Scenario in `en-GB` cannot have an `en-US` Translation).
- A Scenario has at most one Translation per primary language subtag.
- An Interface Language selects the Translation whose primary language subtag equals it. When the Base Language's primary subtag equals it, the base text is shown. Otherwise the base text is shown as the fallback.
- A Translation into a language that is not an Interface Language (currently `en` and `pl`, [architecture.md](architecture.md#interface-language)) is valid but never shown, and draws a warning.

### Translation files

Each Translation file is a **text-only projection** of the base file kind it stands for: the same shape, keeping only the translatable fields and the keys that identify where they belong. Location and Scene Translations are entity files (one mapping per file, with `id`); every other kind is a catalog (a sequence of mappings, each with `id`). The way the Translation splits a content type across files is independent of the base. Order within a file has no meaning: entries are matched by their keys, not by position.

The keys are:

- `id` for every entity and catalog entry, and for each Choice within its Scene;
- `to` for a Connection, which is why `to` is unique within a Location;
- the base's own nesting for Outcomes, which have no IDs: `outcome`, `test.success` and `test.failure` under a Choice; `victory`, `surrender` and `draw` under an Encounter.

The translatable fields are:

| Base | Fields |
|---|---|
| Manifest | `title`, `description`, `intro` |
| Location | `name`, `description`; Connection `label` |
| Scene | `title`, `text` |
| Choice | `text` |
| Outcome | `text` |
| item (all kinds) | `name`, `description` |
| Enemy | `name`, `description` |
| Encounter | `text`, Outcome texts (`victory`, `surrender`, `draw`; participants have no text; an Encounter is translated alike in either spelling) |
| Companion | `name`, `description` |
| Character Template | `name`, `description` |
| Ending | `title`, `text` |
| image | `alt` |

Nothing else is translated. `author` is a name and stays as written.

```yaml
# translations/pl/locations/ashford.yaml
id: ashford
name: Ashford
description: |
  Garść krytych strzechą chat wokół błotnistej łąki i kamiennej studni.
  Wieśniacy trzymają drzwi zamknięte, a wzrok wbity w ciemną linię lasu.
connections:
  - to: forest-edge
    label: Idź wozową drogą w stronę lasu
```

```yaml
# translations/pl/scenes/barrow-door.yaml
id: barrow-door
title: Zapieczętowane drzwi
text: |
  Szara płyta jest tak ciasno wpasowana w kurhan …
choices:
  - id: use-key
    text: Przekręć brązowy klucz w wężowym zamku.
    outcome:
      text: |
        Klucz obraca się ze zgrzytem …
  - id: force-door
    text: Naprzyj barkiem na płytę.
    test:
      success:
        text: |
          Kamień zgrzyta o kamień …
      failure:
        text: |
          Płyta ani drgnie, za to coś w twoim barku tak.
  - id: step-away
    text: Odejdź od drzwi.
```

```yaml
# translations/pl/encounters.yaml
- id: wight-fight
  text: |
    Aldric podnosi się z mar, a grobowy chłód zalewa cię falą.
  victory:
    text: |
      Upiór rozsypuje się w pył i rdzę. Mira otwiera oczy i wyciąga rękę
      ku twojej dłoni.
  surrender:
    text: |
      Padasz płasko i czołgasz się korytarzem ku światłu dnia. Upiór nie
      rusza za tobą; nigdy nie opuszcza grobowca.
  draw:
    text: |
      Wycofujesz się do wylotu korytarza i bronisz wąskiego przejścia
      ostrzem. Upiór raz próbuje progu, po czym opada z powrotem na mary.
```

### Illustrations in a Translation

A Translation translates an image's `alt` only. It cannot replace the image file or change its Motion; every language shows the same Illustrations.

## Versioning

- **`schemaVersion: 2`** is the engine's package-format version. An unsupported value rejects the package; the exact value `1` is reported as the retired format v1 with a pointer to the [migration guide](content-migration-1.0.md).
- **`version`** is the author's content version. It is informational: whether existing Playthroughs survive a content change is decided by a reference check, not by this field (see [ADR 0001](../adr/0001-content-compatibility-by-reference-check.md)).

## Schemas and editor support

- **Zod is the source of truth** for the structure of every file kind, including the per-entity limits above. JSON Schema is generated from it with `z.toJSONSchema` for editor completion and structural checks.
- Refinements that JSON Schema cannot express (the Template point sum, the narration brace rule, an empty `motion`, `drift` with `at`, `frames` with `fps`) and all cross-file checks run only in the loader and the CLI.
- Layer `at` has no schema default, because it is mutually exclusive with `drift`; the engine applies it.
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

- [Translation package format](https://github.com/lbacik/simple-rpg-engine/issues/57) (Translations, Connection `to` uniqueness)
- [Prototype: one Scene rendered with competing animation approaches](https://github.com/lbacik/simple-rpg-engine/issues/196#issuecomment-6250531255) (Layers over a Still, formats, the 4 MiB Illustration budget)
- [Authoring syntax for Illustration layers and camera](https://github.com/lbacik/simple-rpg-engine/issues/201#issuecomment-6251636679) (`motion`)
- [Example layered Illustration in whispering-woods](https://github.com/lbacik/simple-rpg-engine/issues/209#issuecomment-6251921939) (the example, authoring guidelines)
- [Clarify the Motion spec gaps found by the example](https://github.com/lbacik/simple-rpg-engine/issues/212#issuecomment-6261254575) (`anchor`)

- [Normative Scenario YAML syntax and walk-through gaps](https://github.com/lbacik/simple-rpg-engine/issues/16#issuecomment-6100076156) (conventions, field reference, defaults, display text)
- [Scenario package layout and reference convention](https://github.com/lbacik/simple-rpg-engine/issues/6#issuecomment-6099136128)
- [Scenario content model: Locations, Scenes, choices, conditions, effects](https://github.com/lbacik/simple-rpg-engine/issues/3#issuecomment-6099088394)
- [Scene illustration assets: authoring, references and loading contract](https://github.com/lbacik/simple-rpg-engine/issues/14#issuecomment-6099824478)
- [Location map: auto-laid-out graph vs author-provided coordinates](https://github.com/lbacik/simple-rpg-engine/issues/11#issuecomment-6099544434) (`map`)
- [Combat presentation: abstract exchange vs simple grid board](https://github.com/lbacik/simple-rpg-engine/issues/9#issuecomment-6099395150) (historical: `reach`, `startRange`)
- [Cross-file references in multi-file YAML packages](https://github.com/lbacik/simple-rpg-engine/issues/4) (background: [research notes](../research/multi-file-yaml-references.md))
- [Tactical Combat content, state migration and compatibility contracts](https://github.com/lbacik/simple-rpg-engine/issues/81) (historical: Encounter `participants`, Enemy `behaviour`)
- [Define Scenario authoring and content migration for simple-rpg-engine](https://github.com/lbacik/simple-rpg-engine/issues/184) (content format v2: profiles, per-participant `startRange`, `surrender`/`draw`, Companions, Health 1–40)
