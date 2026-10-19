# Simple RPG Engine: prototype specification

The implementation-ready specification of the prototype: a web platform for single-player RPG adventures. Authors write a Scenario as a multi-file YAML package; a shared engine runs it with common rules and a common UI, in a Next.js application.

This spec is **self-contained and normative**. It was assembled from the decisions on the planning map [Map: single-player RPG platform prototype (Next.js + YAML scenarios)](https://github.com/lbacik/simple-rpg-engine/issues/1); each document links its source tickets under "Sources" for provenance only. Where a ticket and this spec differ, the spec wins.

## Reading order

1. [`CONTEXT.md`](../../CONTEXT.md): the domain glossary. Every capitalised term in the spec (Scenario, Location, Scene, Playthrough, Encounter, …) means exactly what it defines.
2. [mechanics.md](mechanics.md): Attributes, Tests, Characters, items, Health and Combat.
3. [scenario-format.md](scenario-format.md): the package layout and the normative field-level YAML syntax; the input to the Zod definitions.
4. [content-semantics.md](content-semantics.md): how the engine interprets Locations, Scenes, Choices, Outcomes, Effects, Conditions, Encounters and Endings.
5. [validation.md](validation.md): validation phases, the diagnostic format, the CLI and the full rule catalog.
6. [playthrough-state.md](playthrough-state.md): the Playthrough state, player actions, the `step` guard, transitions and the Journal.
7. [architecture.md](architecture.md): hosting, repository shape, the engine contract, Sessions, persistence, routes and asset serving.
8. [ui.md](ui.md): screens, layout and interactions, with links to the [mockups](mockups/).

Supporting material:

- [ADR 0001: content compatibility by reference check](../adr/0001-content-compatibility-by-reference-check.md).
- [ADR 0002: a Translation is a text-only overlay](../adr/0002-translation-as-text-only-overlay.md).
- [ADR 0003: the engine emits no Interface Text; a typed catalogue renders it](../adr/0003-interface-text-from-a-typed-catalogue.md).
- [ADR 0004: the Journal stores engine events and Scenario text as presented](../adr/0004-journal-stores-events-and-scenario-text-as-presented.md).
- [ADR 0005: Playthrough state is migrated by the engine on read](../adr/0005-playthrough-state-migrated-by-the-engine-on-read.md).
- [ADR 0007: Illustration Motion is engine-composed Layers over a Still, not an animated file](../adr/0007-motion-as-engine-composed-layers-over-a-still.md). The Motion spec was assembled from the planning map [Map: animated Illustrations (ambient motion for Scenes and Locations)](https://github.com/lbacik/simple-rpg-engine/issues/193).
- The example Scenario, [`scenarios/whispering-woods/`](../../scenarios/whispering-woods/): 7 Locations, 14 Scenes, 3 Encounters, a magic talisman, an Illustration and 4 Endings. It conforms to the format, passes every validation phase with no diagnostics, and is the engine's and validator's reference fixture.
- [Mockups](mockups/): throwaway HTML prototypes of the game screen, Combat presentation and Location map. [ui.md](ui.md) says what in them is normative.
- [Tactical Combat implementation handoff](tactical-combat-handoff.md): the accepted package boundaries, dependencies, acceptance matrix and release verification for tactical Combat. It supplements the normative rules; production implementation is a subsequent effort.
- [Combat MVP 1.0 implementation handoff](combat-mvp-1.0-handoff.md): the accepted packages, gates, release and rollback procedure for replacing tactical Combat with the [MVP 1.0 rules](../sources/combat-mvp-1.0/rules.md) in release v0.6.0. Until its first package reconciles this spec, the documents here still describe the tactical rules.
- Background research, non-normative: [cross-file references in multi-file YAML](../research/multi-file-yaml-references.md) and [Next.js architecture for a server-authoritative game engine](../research/nextjs-game-architecture.md).

## Standing decisions

- The narrative model is a hybrid: a graph of Locations, within which conditional Scenes with Choices fire. NPC dialogue is Scenes with Choices.
- All narration is pre-written in YAML. There is no LLM narrator.
- Playthrough state is server-authoritative (dice are rolled on the server), persisted, and bound to an anonymous Session cookie. A Session has any number of Playthroughs, saved after every action.
- Each Scenario is written in one Base Language, declared in its manifest, and may carry complete Translations as text-only overlays ([scenario-format.md](scenario-format.md#translations)). The player chooses an Interface Language, English or Polish; it sets the language of all Interface Text and selects the Translation shown ([architecture.md](architecture.md#interface-language)).
- Mechanics are a closed vocabulary owned by the engine. Scenarios define items, Enemies and Tests only in terms of engine Attributes and Effects; they cannot add Attributes or change the dice.
- Scenarios enter the collection as directories in a server-side Scenario directory, gated by validation (the CLI, and again at startup). Invalid Scenarios are left out.
- Combat is abstract, with two Ranges (Near and Far) and no grid board.

## Ready for implementation

The spec is ready for implementation when all of these hold:

1. Every decision recorded on the map's "Decisions so far" has a home in this spec.
2. The spec has no TBDs and no open questions. Choices deliberately left to the implementer are listed under [Implementer's discretion](#implementers-discretion); everything else is decided.
3. The example Scenario conforms to [scenario-format.md](scenario-format.md) and passes [validation.md](validation.md) on paper with no errors and no warnings.
4. The spec uses the vocabulary of [`CONTEXT.md`](../../CONTEXT.md).
5. The driving developer has reviewed and accepted the spec.

The original platform specification has no general implementation-ticket breakdown. The subsequent [Tactical Combat implementation handoff](tactical-combat-handoff.md) supplies the ordered plan for that change; its execution issues and production implementation remain outside the planning map.

## Implementer's discretion

These are intentionally left open. Choose freely within the constraints of the spec:

- The TypeScript shapes of the compiled `Scenario` model, `GameView`, actions, Journal entry payloads, the engine's structured events and the internal layout of the `state` JSON document, as long as they carry what the spec requires and stored state refers to content only by ID.
- The content hash and image hash algorithms (for example SHA-256), as long as they are deterministic and the content hash covers everything [architecture.md](architecture.md#content-compatibility) lists.
- Diagnostic message wording, and any additional `schema/` codes for finer-grained Zod issues, as long as the codes in [validation.md](validation.md) keep their meaning.
- UI copy in both Interface Languages (Polish copy uses the [Polish terms](ui.md#polish-terms) and the [Interface Text rules](ui.md#interface-text)), including exact Polish tactical wording where no canonical term has been settled by the separate language effort; visual styling and component structure within the approved layout; the exact map aspect ratio and the fallback-placement offsets; the Journal page size.
- How the off-by-default "?" exit-stub map setting is configured.
- The Session cookie name, the Interface Language cookie name, and the hash used to store the Session id (for example SHA-256).
- How the Scenario directory is configured (default `scenarios/` at the repository root), and where the example VS Code schema configuration lives.
- Libraries not named by the spec, such as the Markdown-subset renderer and the image header reader.
- How Motion is animated in the browser (CSS animations or the Web Animations API, the DOM structure of the composition) and the `localStorage` key and values of the Motion preference, as long as the composition and timeline follow [ui.md](ui.md#motion).

## Out of scope

- LLM-driven narration or improvisation.
- Login and accounts; transferring a Character between Playthroughs.
- A Scenario upload UI or admin panel.
- Trading, shops and currency.
- Character progression (experience, levels) during a Playthrough.
- Spells, charges, temporary bonuses and other magic effects.
- Requiring artwork for every Scene or Scenario.
- A tactical grid board, three or more Range bands, and ranged attacks that roll Agility.
- Fast travel to non-adjacent visited Locations, and auto-laid-out maps.
- External image URLs, and Illustrations for Endings, Encounters or a Scenario cover.
- Animated files (video, animated AVIF, WebP, GIF or PNG, SVG, Lottie, Rive) and engine effect presets: Motion is Layers over a Still only.
- Motion on other surfaces (Endings, the Combat arena, the Location map, a Scenario cover), Motion that reacts to Playthrough state, and sound.
- Counters, conditional Location descriptions, and deleting Playthroughs.
- Combat balance analysis and state-dependent soft-lock detection in the validator.
