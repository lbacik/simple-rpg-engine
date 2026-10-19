# Architecture

How the prototype is built: hosting, repository shape, the engine contract, turn handling, Sessions, the Interface Language, persistence and asset serving. Background research: [Next.js architecture for a server-authoritative game engine](../research/nextjs-game-architecture.md).

## Hosting and stack

- **One self-hosted, long-lived Node process** with a persistent disk: Next.js with `output: 'standalone'`, run in Docker with a volume holding the database and the Scenario directory. Local `next start` and `next dev` work the same way.
- Defaults: **Next.js 16.x**, **Node 24 LTS**, **TypeScript strict**, **Zod 4** (for `z.toJSONSchema`).
- **A later move to a network database (PostgreSQL or MySQL) is expected.** Persistence is portable from day one: async ports even though `better-sqlite3` is synchronous, no SQLite-specific features, and a concurrency guard that works the same on every dialect.
- A serverless target would also need the Scenario directory bundled into the build or moved to object storage. This is a recorded consequence, not a plan.

## Repository shape

A single npm package (no workspaces):

| Directory | Contents | May not import |
|---|---|---|
| `src/engine` | pure rules: `startPlaythrough`, `applyAction`, `view` | `next/*`, `server-only`, `react`, `src/persistence`, `src/i18n` |
| `src/content` | the YAML loader, Zod definitions, validator, content hash | `next/*`, `server-only`, `react`, `src/persistence` |
| `src/i18n` | the Interface Language list, the Interface Text catalogues, the plural helper, the `Accept-Language` matcher ([Interface Text](#interface-text)) | `next/*`, `server-only`, `react`, `src/persistence`, `src/engine` (types excepted), `src/content` |
| `src/persistence` | the store ports and their Kysely implementation, migrations | |
| `src/app` | the Next.js App Router application | |
| `src/cli` | the validation CLI (`npm run validate <dir>`, run with `tsx`) | |

An ESLint `no-restricted-imports` rule enforces the import boundaries, so the CLI can reuse `src/content` and `src/engine` unchanged. `src/i18n` may import types from `src/engine` (for example the Attribute ids its catalogues name), but no runtime code.

Scenario packages live in `scenarios/` at the repository root (the server-side Scenario directory).

## Engine contract

```ts
loadScenario(dir: string):                                           // src/content
  | { ok: true; scenario: Scenario; warnings: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] }
startPlaythrough(scenario, templateId, name, rng):
  | { ok: true; state; journal: JournalEntry[] }
  | { ok: false; reason }                                              // unknown Template, invalid name
applyAction(scenario, state, action, rng):
  | { ok: true; state; journal: JournalEntry[] }
  | { ok: false; reason }
view(scenario, state): GameView
validateArenaSetup(input):                                    // src/engine/arena
  | { ok: true; setup }
  | { ok: false; issues }
startArena(setup, rng): { state; journal: ArenaJournalEntry[] }
applyArenaAction(state, action, rng):
  | { ok: true; state; journal: ArenaJournalEntry[] }
  | { ok: false; reason }
arenaResult(state): { outcome; rounds } | undefined
```

- `loadScenario` runs the four validation phases and each Translation's own pipeline ([validation.md](validation.md)) and returns either an **immutable, compiled model** with references resolved and only the Translations that passed, together with its warnings and the diagnostics of every rejected Translation, or all the diagnostics of the run that rejected it. It also computes the **content hash** and reads the dimensions and hash of each image and each Layer file. Shared by the CLI and the app.
- `applyAction` is synchronous, deterministic for a given `rng`, and does no I/O. It checks `action.expectedStep === state.step` as a domain rule, then legality against the current position ([playthrough-state.md](playthrough-state.md#actions-and-the-step-guard)). It returns only the **new** Journal entries.
- The Arena entry points (`validateArenaSetup`, `startArena`, `applyArenaAction`, `arenaResult`) run a Combat from an Arena Setup with no Scenario involved. They are synchronous and do no I/O; the Arena state is never a Playthrough and persists in its own versioned run document ([combat-contract.md](combat-contract.md#arena-run-schemaversion-1), [ADR 0006](../adr/0006-arena-as-a-mode-next-to-scenarios.md)).
- `view` is the derived projection the UI renders: the current narration, the shown Illustration with its Showing key (below), visible Choices, visible Connections, on-demand Scenes on offer, map nodes and lines, effective Attributes, inventory with available item actions, Combat state and available Combat options (with every applicable reason code for unavailable ones), and the latest result entries. The Combat projection lists the actors (`h01`, `c01`, `e01`–`e05`) with their HP, stamina, stance, group, engagements and frozen plans, and every action × target as legal or carrying its reason codes — exactly what the core's `listOptions` returns, so the app computes none of it itself ([combat-contract.md](combat-contract.md)).
- The shown Illustration carries the Still's asset URL, `width`, `height` and `alt`, and, when the image has `motion`, every Layer with its declaration (defaults applied), its file's asset URL and pixel size, and the Camera. Its **Showing key** is `scene:<id>` while a Scene is active, otherwise `location:<id>` of the current Location. The UI keys the Illustration by it, so a change of key starts a new Showing ([ui.md](ui.md#timeline)). The key is derived from the current position only: no arrival step is stored and nothing is derived from the Journal.
- **The engine produces no Interface Text** ([ADR 0003](../adr/0003-interface-text-from-a-typed-catalogue.md)). Everything it would say in its own words is a structured value: a kind plus content ids and numbers. This covers Test results, Combat rounds (typed events), state changes from Effects, inventory actions, Combat end and the Companion joined/left/lost notices, available and unavailable actions with reason codes, and the names of its own vocabulary (Attribute, Difficulty, Stance, Range, Equipment slots, Combat results). Each event carries every id and number its message needs, for example the item id and quantity of a `give-item`, the item id and Health restored by a Consumable, the actor ids of a Combat round. The app renders these through the catalogue, resolving names from the Scenario text in the language shown ([Interface Text](#interface-text)). Scenario text itself (narration, titles, names) keeps flowing through the engine as content, with `{name}` substituted.
- `rng` is injected. Production uses `crypto.randomInt(1, 7)` per die and stores no seed. Tests use a deterministic RNG. Combat itself needs no randomness.
- The `state` document carries a `schemaVersion` (Playthrough 3; the Arena run is versioned separately). When read it is validated with Zod against the schema of its own version, migrated by the engine to the current version against the current Scenario, and validated again ([playthrough-state.md](playthrough-state.md#state-versions-and-migration)). Migration is synchronous and deterministic. Pre-v0.6.0 documents are discarded by the release, not migrated ([ADR 0009](../adr/0009-game-data-from-earlier-combat-rules-is-discarded-at-release.md)).

## Turn transport

- **Server Actions only**, for every player action. Pages are Server Components that read the state and call `view`.
- Every action re-checks, in this order: the Session, ownership of the Playthrough, `step`, then legality in the engine.
- The only Route Handler is the Scenario asset route. There is no REST API.

## Session

- Created **lazily** on the first write action (starting a Playthrough). There is no Proxy. Read-only pages without a cookie simply show no Playthroughs.
- Cookie value: a random 256-bit id, base64url-encoded. Attributes: `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, `Max-Age` 400 days, refreshed on every action (sliding).
- The database stores only a **hash** of the id (`sessions(id_hash, created_at, last_seen_at)`), never the raw value.
- Losing the cookie loses access to its Playthroughs. This is accepted because accounts are out of scope. No expiry or cleanup.

## Interface Language

- The Interface Languages are `en` and `pl`, defined once in `src/i18n` as `INTERFACE_LANGUAGES` with the type `InterfaceLanguage`. The validator's `translation/not-interface-language` rule and the app import that list.
- A server-only `getInterfaceLanguage()` in `src/app/lib` resolves the language on every request: the language cookie when its value is an Interface Language (any other value is ignored, since cookies are client-controlled), else the [RFC 4647 Lookup](https://www.rfc-editor.org/rfc/rfc4647#section-3.4) match of `Accept-Language` against the Interface Languages by primary language subtag (`q` honoured, `q=0` and `*` skipped, malformed tags skipped), else `en`.
- The negotiated default is **not** written to a cookie: the cookie is set only when the player switches. There is still no Proxy and no `Set-Cookie` on a plain GET. The language is not stored with the Session or the Playthrough.
- Switching is a Server Action that sets the cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, `Max-Age` 400 days) and refreshes the current page, without JavaScript too. Where the switcher sits is in [ui.md](ui.md).
- Every page is already dynamic, so reading the cookie and `Accept-Language` costs nothing in rendering or caching. A `use cache` function, if one is ever added, takes the language as an argument.

## Interface Text

Recorded in [ADR 0003](../adr/0003-interface-text-from-a-typed-catalogue.md).

- **One catalogue per Interface Language** in `src/i18n` (`en.ts`, `pl.ts`): a typed TypeScript object, not JSON. The `en` object's shape defines the `Catalogue` type, and `pl` is declared as a `Catalogue`. Messages with arguments are functions with typed parameters.
- **Completeness is checked at compile time.** A missing message or a wrong signature in either catalogue fails `tsc`, and so the build. There is no runtime fallback from one catalogue to another. A unit test also checks that both catalogues have the same set of keys at run time, for code that slips past the types.
- **Plurals** use a small helper over `Intl.PluralRules`, cached per language, with the categories typed per language: `one | other` for `en`, `one | few | many | other` for `pl`. A missing category is a type error.
- **Scenario names in messages.** A message places a Scenario-provided name (item, Enemy, Location, Character, Scenario title) only where its language needs no inflection: as a label, after a colon, or in the nominative. Polish messages are therefore label-shaped where a name is involved ("Atak: Miecz (4+3+1=8 vs 7) — trafienie, 3 obrażenia", "Pokonano: Wilk"). English messages may be sentences. Scenario text is never case-transformed.
- **Rendering happens in `src/app`.** Server Components and Server Actions call `getCatalogue(await getInterfaceLanguage())` and render the engine's structured values with it. Client Components receive rendered strings as props. No catalogue is shipped to the browser.
- Notices after a rejected action are rendered from their codes on the page the action redirects to, so they appear in the language current at that moment.
- Numbers (and any dates) are formatted with `Intl`, using the Interface Language.
- **Out of the catalogue**: validation diagnostics and the CLI's own output stay in English ([validation.md](validation.md#diagnostic-format)), because they are read by Scenario authors, not players. So do server logs and the asset route's plain `Not found`.

## Scenario collection

- `instrumentation.ts` `register()` loads and validates every Scenario directory into an **in-memory registry** at startup.
- Invalid Scenarios are logged with their diagnostics and left out. The app still starts. Warnings are logged.
- Content changes need a restart. In `next dev`, the registry reloads a Scenario on request when the modification time of its manifest or of any file it lists has changed (a directory's own mtime does not change when a file inside it is edited).

## Content compatibility

Recorded in [ADR 0001](../adr/0001-content-compatibility-by-reference-check.md).

- Each Playthrough pins the Scenario id, the content `version` and the **content hash**.
- The content hash covers every file the manifest lists, the manifest itself, every listed Translation manifest and every file it lists, and the bytes of every declared image and every Layer file, so any content change (including an image, a Layer file or a Translation) changes it. A file used as a Still and a Layer, or as several Layers, counts once, in a deterministic order (by package path). A Translation-only or image-only change changes no ID, so the reference check it triggers passes.
- When the hash differs from the loaded Scenario's, a **mechanical reference check** runs, on the state as migrated to the current version ([playthrough-state.md](playthrough-state.md#state-versions-and-migration)). It passes when every content ID in the stored state still exists with the right type (Location, Scene, (Scene, Choice), Encounter, (Encounter, participant), item, slot, Flag, Character Template, Ending), and the stored state still satisfies the invariants that depend on content:
  - every equipped item is still Equipment of the slot it occupies;
  - every participant in an Encounter record still exists in that Encounter;
  - a participant the record does not list (added to the content later) is allowed only while the Encounter is neither defeated by its record nor in the active Combat;
  - the `companion.id` and every id in `lostCompanions` still exist as a Companion; if one does not, the Playthrough is incompatible;
  - a participant of an active Combat that disappears from the content makes the Playthrough incompatible. A changed Enemy profile behaves like a changed maximum Health: outside an active Combat it may revive or defeat a participant (defeated means wounds ≥ the profile's `maxHp`), while the active Combat's `CombatState` is self-contained. Changed `startRange`, `phaseOffset` or `power` never breaks compatibility and applies from the next Combat start.

  The tactical compatibility rules formerly listed here (starting membership, saved Round tie-break order, committed Intent kinds, per-participant Range/Intent/prepared/Wary, Damage read from content at execution) are retired with the tactical rules.

  A changed trigger or Location membership of the active Scene does not fail the check; the Scene simply continues.
- If the check passes, play continues and the pin is updated. If it fails, the Playthrough is **incompatible** and read-only.
- A Scenario removed from the collection, or no longer valid, makes all its Playthroughs read-only in the same way.
- **Read-only views are best effort.** Stored state holds only IDs, so display data comes from content:
  - while the Scenario is in the collection, the Character sheet, inventory, map and Ending render from its current content, and anything whose ID no longer exists is left out;
  - when the Scenario is no longer in the collection, only the Journal is shown, and the Ending is read from its Journal entry.

  The Journal always renders completely, because it stores Scenario text as presented and engine events that the catalogue renders without the content ([ADR 0004](../adr/0004-journal-stores-events-and-scenario-text-as-presented.md)). Its Interface Text, and the Ending kind read from it, follow the current Interface Language.
- Incompatibility is derived on read. It is not a stored status. The author's `version` is informational.

## Persistence

- **Kysely** behind two async ports, `PlaythroughStore` and `SessionStore`. Now: `SqliteDialect` with `better-sqlite3`. Later: `PostgresDialect` or `MysqlDialect`. (Drizzle was rejected because its schema is defined per dialect.)
- Table **`playthroughs`**: scalar columns for queries and guards (`id` UUID v4, `session_id`, `scenario_id`, `scenario_version`, `content_hash`, `status`, `ending_id`, `step`, `created_at`, `updated_at`) and a **`state` JSON document** owned by the engine, holding everything in the [Playthrough state model](playthrough-state.md#stored-and-derived-state).
- Table **`journal_entries`** (`playthrough_id`, `seq`, `step`, `type`, `lang`, `payload` JSON, `created_at`): append-only, paginated when read. `lang` is the language of the Scenario text in effect when the entry was presented. The migration that adds it sets it to `en` on existing rows, whose payload holds English text only ([playthrough-state.md](playthrough-state.md#journal)).
- Table **`sessions`** (`id_hash`, `created_at`, `last_seen_at`).
- JSON maps to `TEXT` (SQLite), `jsonb` (PostgreSQL) and `JSON` (MySQL).
- **State versions** are not database migrations. The `state` document is migrated by the engine when it is read, against the current Scenario, and written back with the pin ([ADR 0005](../adr/0005-playthrough-state-migrated-by-the-engine-on-read.md), [playthrough-state.md](playthrough-state.md#state-versions-and-migration)). The v0.6.0 Combat replacement ships its own Kysely migration, which deletes every Playthrough and Journal entry and drops the old Arena tables ([ADR 0009](../adr/0009-game-data-from-earlier-combat-rules-is-discarded-at-release.md)).
- **Migrations** are Kysely migrations run by a separate `npm run migrate` step. The Docker entrypoint runs `migrate`, then `start`; development uses the same script. They are not run in `register()`, so they stay safe with several instances later.

### Turn atomicity

Each action runs in one transaction:

1. Read the row. If its `session_id` is not the current Session, respond 404.
2. Run `applyAction`.
3. `UPDATE playthroughs SET state = ?, step = ?, status = ?, ending_id = ?, updated_at = ? WHERE id = ? AND step = <expected>`. If no row changed, roll back and reject the action as stale.
4. `INSERT` the new Journal entries.

This is optimistic concurrency with no in-process locks, and behaves the same on SQLite, PostgreSQL and MySQL.

### Rejections

- A stale `step` (for example from another tab), an illegal action, or an action on an `ended` or incompatible Playthrough changes nothing.
- The Server Action always ends by refreshing the current state (`revalidatePath`, or a redirect to the game page without JavaScript) and shows a transient notice, such as "The game was advanced in another tab; this is its current state" or "That action is no longer available". There is no error page.
- Another Session's Playthrough, or a nonexistent one, is always a 404, so its existence is never revealed.

## Routes

| Route | Purpose |
|---|---|
| `/` | Scenario collection |
| `/scenarios/[scenarioId]` | Scenario description and Character creation (Template and name); the start action creates the Playthrough and, if needed, the Session |
| `/playthroughs` | the current Session's Playthroughs, active and ended |
| `/play/[playthroughId]` | game screen; read-only once `ended` or incompatible |
| `/play/[playthroughId]/journal` | paginated Journal |
| `/scenarios/[scenarioId]/assets/[hash]/[...path]` | Scenario assets (Illustrations) |

## Scenario assets

- At startup the loader hashes each image file and reads its intrinsic width and height. The registry holds `{ id, path, format, width, height, hash, alt, motion? }` per image, and `{ path, format, width, height, hash }` per distinct Layer file.
- The Route Handler at `/scenarios/[scenarioId]/assets/[hash]/[...path]` serves only paths declared by the loaded Scenario, as an image or as a Layer `path`, each under its own file hash, read from the Scenario directory. Anything else, or a hash that does not match the registry, is a 404.
- Response headers: `Content-Type` from the declared format, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=31536000, immutable`. No Session is required.
- Every asset, Layer files included, is a PNG, JPEG or WebP still image ([ADR 0007](../adr/0007-motion-as-engine-composed-layers-over-a-still.md)): no further MIME types, no HTTP Range requests, and no scriptable formats.
- An Illustration transfers at most 4 MiB ([scenario-format.md](scenario-format.md#images)): the Still with the page, its Layer files only while Motion is on.
- The Still is rendered as a plain `<img>` and the Layers are composed over it in the browser (see [ui.md](ui.md#scene-and-location-illustration)); the `next/image` optimizer is not used.

## Testing strategy

- **Engine**: unit tests of the pure functions with a deterministic RNG. The example Scenario is a fixture. Tests assert structured events, not wording.
- **Interface Text**: the catalogue key-parity test, the plural helper (Polish `one`/`few`/`many`/`other` boundaries such as 1, 2, 5, 12, 22, 25, 112), and the `Accept-Language` matcher (`pl-PL,pl;q=0.9,en;q=0.8` → `pl`, `de-DE,pl;q=0.5` → `pl`, `pl;q=0,en;q=0.1` → `en`, `*`, malformed and missing headers → `en`).
- **Loader and validator**: valid and invalid fixture packages; the example Scenario must produce no diagnostics.
- **Translations**: two small fixture Scenarios, kept in `tests/fixtures/scenarios/` (outside `scenarios/`, so they are never shipped), serve both the unit and the end-to-end tests. Both must produce no diagnostics.
  - `two-bridges`: Base Language `en` with a complete `pl` Translation. It has at least one of every kind of translatable field ([Translation files](scenario-format.md#translation-files)), Illustration `alt` included, so the overlay is checked for each kind and every mutation below has a target.
  - `stara-studnia`: Base Language `pl` with an `en` Translation, minimal (two Locations, a Scene with a Choice, an Ending). It covers fallback to a Base Language other than English.
  - Invalid and stale variants are not separate packages: a test copies a fixture to a temporary directory and changes one file.
  - Validation: one test per `translation/*` code ([validation.md](validation.md#translations)); a rejected Translation leaves the Scenario valid and shown in its Base Language, while another valid Translation of it stays available (except under `translation/duplicate-language`); a `translation/stale` Translation is still shown; changing Translation text changes the content hash.
  - Selection: a Translation is chosen by primary language subtag (`en-US` selects an `en` Translation).
  - Journal: rows stored before Interface Languages existed are seeded through the persistence port and rendered verbatim in English with a catalogue type label.
- **Interface Text rendering**: a table test with one example of every structured event kind the engine emits, rendered with both catalogues; each result is non-empty and contains no `undefined`, `NaN` or `{`. There are no snapshots of whole texts; wording is reviewed by a person against the [term table](ui.md#polish-terms).
- **Persistence**: port tests against in-memory SQLite, including a race test: two actions with the same `step`, exactly one succeeds.
- **End to end**: Playwright against a production build, with a temporary Scenario directory holding the shipped Scenarios and both Translation fixtures. A test-only entry route seeds real Combat saves through the engine and the stores (see the Combat MVP 1.0 handoff's verification package).
  - The smoke test: start a Playthrough, take one Choice, reload.
  - The Interface Language: a first visit with `Accept-Language: pl-PL` is in Polish; a switch in the language menu survives a reload; a switch also works with JavaScript disabled (one test); the collection groups and each card's language flags; the fallback badge on the game screen; a switch mid-Playthrough followed by the Journal, where earlier narration stays in its language with a flag and Interface Text is in the new language.
  - Which language is shown is asserted through `<html lang>` and the `lang` of elements holding Scenario text. Where visible text matters, it is written in the test, not imported from the catalogue.
  - Tactical Combat: historical. Its no-JavaScript flow, legacy-save Round and two-tab cases are replaced by the MVP verification package (command-panel UI in both modes, no-JavaScript flow, keyboard-only play, stale-command evidence).

## Sources

- [Architecture: engine boundaries, persistence and Session handling in Next.js](https://github.com/lbacik/simple-rpg-engine/issues/8#issuecomment-6099767575)
- [Map: adapt Combat to simple-rpg-engine MVP with command-panel UI](https://github.com/lbacik/simple-rpg-engine/issues/179) (shared core, save lifecycle, Scenario connection, Arena persistence: [#181](https://github.com/lbacik/simple-rpg-engine/issues/181), [#182](https://github.com/lbacik/simple-rpg-engine/issues/182), [#183](https://github.com/lbacik/simple-rpg-engine/issues/183))
- [Next.js architecture for a server-authoritative game engine](https://github.com/lbacik/simple-rpg-engine/issues/5) (research)
- [Scene illustration assets: authoring, references and loading contract](https://github.com/lbacik/simple-rpg-engine/issues/14#issuecomment-6099824478) (asset route, content hash coverage)
- [Scenario validation rules and playability checks](https://github.com/lbacik/simple-rpg-engine/issues/7#issuecomment-6099876109) (`Diagnostic[]` from `loadScenario`)
- [ADR 0001: content compatibility by reference check](../adr/0001-content-compatibility-by-reference-check.md)
- [Interface text catalogue](https://github.com/lbacik/simple-rpg-engine/issues/60) (catalogue, Interface Language resolution, the engine's structured output)
- [i18n approach for the Next.js 16 App Router](https://github.com/lbacik/simple-rpg-engine/issues/59) (research)
- [ADR 0003: the engine emits no Interface Text](../adr/0003-interface-text-from-a-typed-catalogue.md)
- [Test strategy for two languages](https://github.com/lbacik/simple-rpg-engine/issues/91) (Translation fixtures, Interface Text rendering, language end-to-end tests)
- [Tactical Combat content, state migration and compatibility contracts](https://github.com/lbacik/simple-rpg-engine/issues/81) (state migration on read, participant reference checks, the Combat view)
- [ADR 0005: Playthrough state is migrated by the engine on read](../adr/0005-playthrough-state-migrated-by-the-engine-on-read.md)
- [ADR 0007: Illustration Motion is engine-composed Layers over a Still](../adr/0007-motion-as-engine-composed-layers-over-a-still.md) (Layer files on the asset route)
- [Clarify the Motion spec gaps found by the example](https://github.com/lbacik/simple-rpg-engine/issues/212#issuecomment-6261254575) (Layer files in the content hash and the registry, the Showing key)
- [Active Combat roster and compatibility after participant reordering or revival](https://github.com/lbacik/simple-rpg-engine/issues/116) (arena membership, saved Round ties and active revival invariant)
