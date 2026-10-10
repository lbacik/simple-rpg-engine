# Research: cross-file references in multi-file YAML packages

Ticket: [#4](https://github.com/lbacik/simple-rpg-engine/issues/4) (child of map [#1](https://github.com/lbacik/simple-rpg-engine/issues/1)).
Date: 2026-10-10. Status: findings only. A later grilling ticket makes the decision.

## Question

What are the established ways to split a YAML document set across files with references between them? Which of them fit a TypeScript/Next.js server-side loader and editor support for authors?

A **Scenario** is a multi-file YAML package (see `CONTEXT.md`). It holds **Locations**, the **Scenes** inside them, items, enemies and tests. These pieces refer to each other: a Location connects to other Locations, a Scene lives in a Location, a choice leads to a Scene or Location, an item is granted. The engine validates Scenarios before they enter the collection.

## Versions checked (npm, 2026-10-10)

| Package | Latest |
| --- | --- |
| `yaml` (eemeli) | 2.9.1 |
| `js-yaml` (nodeca) | 5.4.3 |
| `ajv` | 8.20.0 |
| `zod` | 4.6.5 |
| `yaml-language-server` | 1.25.0 |
| `@apidevtools/json-schema-ref-parser` | 16.0.3 |
| `@redocly/cli` | 2.62.1 |

`js-yaml` v5 replaced the v4 custom-type API (`new yaml.Type(...)`) with `defineSequenceTag` / `defineMappingTag` / `Schema.withTags`. Pre-2025 blog posts about `js-yaml` custom tags are out of date. Source: [js-yaml migrate_v4_to_v5.md](https://github.com/nodeca/js-yaml/blob/master/docs/migrate_v4_to_v5.md).

---

## Option A: YAML anchors and aliases (`&id` / `*id`)

**What the spec says**
- "The alias refers to the most recent preceding node having the same anchor. It is an error for an alias node to use an anchor that does not previously occur in the document." ([YAML 1.2.2 §7.1 Alias Nodes](https://yaml.org/spec/1.2.2/#71-alias-nodes))
- Anchor names are "a serialization detail and are discarded once composing is completed" (§3.2.2.2).
- YAML defines no include or external-reference mechanism. The only directives are `%YAML` and `%TAG`, and "There is no way to define private directives. This is intentional." (§6.8)
- The `<<` merge key is a YAML 1.1 type ([yaml.org/type/merge](https://yaml.org/type/merge.html)). It is not part of the 1.2 core schema. In `yaml` it is controlled by the `merge` option, which defaults to `false` under 1.2 and `true` under 1.1 ([yaml docs: options](https://github.com/eemeli/yaml/blob/main/docs/03_options.md)).

**Trade-offs**
- Aliases only work inside one document, and only backwards (the anchor must come before the alias). They cannot cross file boundaries.
- They express "the same node again", not "a reference to entity X". After loading, the anchor name is gone, so the engine cannot tell that two values were linked.
- Library safety: `yaml` caps alias expansion with `maxAliasCount` (default 100) and throws `ReferenceError` past it, to block "billion laughs" attacks ([yaml src/nodes/toJS.ts](https://github.com/eemeli/yaml/blob/main/src/nodes/toJS.ts)).
- Editor: yaml-language-server's go-to-definition jumps from `*alias` to `&anchor` in the same file only ([yamlDefinition.ts](https://github.com/redhat-developer/yaml-language-server/blob/main/src/languageservice/services/yamlDefinition.ts)).

**Fit:** good for reusing repeated content inside one file, such as a shared stat block. It is not a cross-file reference mechanism.

## Option B: custom tags (`!include path.yaml`, `!ref scene_id`)

**What the libraries offer**
- `yaml`: the `customTags` option takes tag objects `{ tag, resolve(value, onError), identify, ... }`. `resolve` gets a string, `YAMLMap` or `YAMLSeq` and may return any value ([docs/06_custom_tags.md](https://github.com/eemeli/yaml/blob/main/docs/06_custom_tags.md)). An unknown tag is not an error: it produces a `YAMLWarning` (`Unresolved tag: …`) and the value falls back to the default type ([docs/10_yaml_syntax.md](https://github.com/eemeli/yaml/blob/main/docs/10_yaml_syntax.md)).
- `js-yaml` v5: `CORE_SCHEMA.withTags(defineMappingTag('!x', {...}), defineSequenceTag(...))`. For tags that are only loaded, never dumped, use `identify: () => false` ([custom_tags.md](https://github.com/nodeca/js-yaml/blob/master/docs/custom_tags.md), [migration guide](https://github.com/nodeca/js-yaml/blob/master/docs/migrate_v4_to_v5.md)).
- The spec allows this: "Local tags start with '!', are not URIs and are not expected to be globally unique", and "tag resolution is specific to the application" (§3.2.1.2, §3.3.2).
- yaml-language-server reports an unknown tag as an error (`Unresolved tag: !test`, see [test/customTags.test.ts](https://github.com/redhat-developer/yaml-language-server/blob/main/test/customTags.test.ts)) unless it is declared in the `yaml.customTags` setting, e.g. `"!Ref"`, `"!Seq sequence"`, `"!Map mapping"` ([README](https://github.com/redhat-developer/yaml-language-server/blob/main/README.md)). Declaring a tag only silences the error. The server does not open the included file, offer completion for the target, or validate the target.

**Trade-offs**
- `!include` is not portable. Every tool that reads the files (editor, linter, CI, other parsers) must be configured for the tag, or the file looks broken or has different meaning.
- Tag resolvers run synchronously while the document is being composed. An `!include` resolver therefore has to do its own file I/O, track the base directory, detect cycles, and attach source positions for errors. None of this is built in.
- Inlining with `!include` produces a tree. Two references to the same Scene become two copies, so "go to Scene X" (a graph edge) is still not modelled. A typed-ID tag such as `!scene cellar_door` does mark a reference explicitly, but it still has to be resolved after loading, which is Option D.
- Precedent: AWS CloudFormation uses `!Ref` / `!GetAtt`. This is the main reason yaml-language-server supports custom tags at all (its README examples are CloudFormation tags).

## Option C: JSON Reference / JSON Schema-style `$ref` in content

**What the sources say**
- In JSON Schema, `$ref` is a keyword *of schemas* that is resolved against the schema's `$id`. In Ajv, "The actual location of the schema file in the file system is not used", and every `$id` must be unique per Ajv instance ([Ajv: combining schemas](https://github.com/ajv-validator/ajv/blob/master/docs/guide/combining-schemas.md)). It does not reference *instance* data.
- OpenAPI is the established case of `$ref` inside *content* across files. An OpenAPI description "may be divided into multiple, connected parts at the discretion of the author", with an *entry document*. Relative `$ref`s "MUST be resolved using the referring document's base URI", and fragments "SHOULD be interpreted as a JSON-Pointer" ([OAS 3.1.1 §4.3, §4.6](https://spec.openapis.org/oas/v3.1.1.html)).
- OpenAPI also has name-based "implicit connections" (component names, tags). For multi-document descriptions the spec calls their resolution "implementation-defined" and "RECOMMENDED that tools resolve from the entry document" (§4.3.3). So even the main `$ref` standard needed a second, ID-based mechanism, and left it loosely specified across files.
- Tooling: `@apidevtools/json-schema-ref-parser` resolves `$ref` across local JSON/YAML files. It can *bundle* (one file, internal `$ref`s only) or *dereference* (a plain object without `$ref`), and it handles circular references ([docs](https://apidevtools.com/json-schema-ref-parser/)). `redocly bundle` follows external `$ref`s into one file, and `--dereferenced` removes `$ref` completely ([Redocly docs](https://redocly.com/docs/cli/commands/bundle)).

**Trade-offs**
- Familiar to authors who know OpenAPI, with existing resolver and bundler libraries.
- References are paths plus JSON Pointers (`./locations/cellar.yaml#/scenes/2`). Moving a file or reordering an array breaks them, and they are verbose for prose authors.
- Dereferencing turns a graph into copies, or into circular JS objects for cycles. A Location graph is full of cycles (A→B→A).
- yaml-language-server does not treat a `$ref` key inside *instance* data as a link. It is just a string property (its `$ref` handling is for schemas, see `yamlSchemaService.ts`). Authors get no navigation and no existence check from the editor.

## Option D: ID-based references resolved by a custom loader

**Shape:** every entity has a stable `id` that is unique within the Scenario, or within its kind. References are plain scalars such as `exits: [cellar, hall]` or `goto: scene.cellar_door`. The loader reads all files, builds a symbol table, and checks every reference in a separate pass.

**Precedent**
- Ink (interactive fiction): `INCLUDE cities/vienna.ink` splits a story into files, and "There are no rules about what file a knot must be in to be diverted to. (In other words, separating files has no effect on the game's namespacing)." Every knot/stitch "has a unique address" ([WritingWithInk.md](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md), "Script files can be combined"). This is id-based references with global names, independent of files.
- Kubernetes / Kustomize: files are only containers. `resources:` lists files or directories relative to `kustomization.yaml` ([Kustomize docs](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/resource/)), and objects refer to each other by `kind` + `name`, not by file path.
- OpenAPI component names (§4.3.3 above).

**Validation:** reference integrity cannot be checked with plain per-file schemas.
- Ajv `$data` (with `new Ajv({$data: true})`) can compare a value with another value in the *same instance* using a relative JSON pointer, e.g. `maximum: {$data: "1/larger"}` ([Ajv docs](https://github.com/ajv-validator/ajv/blob/master/docs/guide/combining-schemas.md)). It cannot express "this string is a key defined in another file".
- Zod's `superRefine` / `.check()` can add any number of issues with a custom `path` ([Zod API](https://github.com/colinhacks/zod/blob/v4.6.5/packages/docs/content/api.mdx)). Run it on the assembled Scenario object and it can check references. However, `z.toJSONSchema` silently drops `custom` checks (`.refine`, `.superRefine`, `.check`) because they have no JSON Schema equivalent ([json-schema-processors.ts](https://github.com/colinhacks/zod/blob/main/packages/zod/src/v4/core/json-schema-processors.ts)). Reference checks therefore exist at load/CLI time only, never in the editor.
- A possible middle ground (inferred, not a documented pattern of any tool): generate a *per-Scenario* JSON Schema whose reference fields are `enum`s of the IDs collected so far. Re-running the validator command refreshes it, so the editor gets completion and existence checks for references.

**Trade-offs**
- Short, readable references that survive moving files and reordering content. Cycles in the Location graph are not a problem.
- The engine keeps the references as references, which a graph of Locations and Scenes needs anyway.
- The loader is custom code: symbol table, duplicate-ID detection, dangling-reference errors with file:line, and possibly typed namespaces (`location:` vs `scene:` vs `item:`). With `yaml` this is easy: `parseDocument` keeps `range` on every node, and `LineCounter` maps offsets to one-indexed `{line, col}` ([docs 05/07/08](https://github.com/eemeli/yaml/tree/main/docs)). `js-yaml` attaches `mark.line/column` only to parse *exceptions* ([exception.ts](https://github.com/nodeca/js-yaml/blob/master/src/common/exception.ts)), not to loaded values, so it cannot point a reference error at the referring line.
- Out of the box, the editor has no go-to-definition for IDs (only alias→anchor). That would need a custom VS Code extension or language server.

## Option E: directory-convention packages

**Shape:** the file layout carries meaning, for example `scenario.yaml` (metadata, start Location), `locations/*.yaml` (one Location with its Scenes per file), `items.yaml`, `enemies.yaml`. Either the loader globs known directories, or a manifest lists files the way `kustomization.yaml` does.

**Trade-offs**
- No reference syntax is needed to *assemble* the package. It is complementary to Option D, not an alternative: it settles "which files belong", and IDs settle "who points to whom".
- The ID could come from the file name (`locations/cellar.yaml` → `cellar`) or be declared inside the file. Deriving it from the name rules out duplicates on one filesystem, but renaming the file changes the ID. Declaring it is explicit, but then it must be checked for duplicates.
- Editor fit is good. yaml-language-server's `yaml.schemas` maps a schema to glob patterns, e.g. `"schemas/location.json": "scenarios/*/locations/*.yaml"`. In single-root workspaces relative paths resolve from the workspace root ([README: Using yaml.schemas](https://github.com/redhat-developer/yaml-language-server/blob/main/README.md)). Each file kind gets its own schema without any marker in the file.
- Glob-free alternative: a modeline `# yaml-language-server: $schema=../../schema/location.json`, resolved relative to the YAML file itself (README, "Using a modeline").
- Manifest or glob: a manifest makes order and inclusion explicit, as Kustomize does depth-first. A glob is zero-config, but stray files get loaded silently.

---

## Cross-cutting notes for the TS/Next.js loader and authoring

**Parser choice**
- `yaml` gives a full AST (`parseDocument`, `visit`), node ranges, `LineCounter`, error and warning arrays (`code`, `pos`, `linePos`), and alias-bomb limits. It suits a validator that must report "file:line: unknown Location `celar`".
- `js-yaml` v5 is a simpler load-to-value parser. Its line/column are only available on parse exceptions.

**Schema / type layer**
- Zod 4 gives TS types and runtime checks in one place. `z.toJSONSchema` can emit the JSON Schema that yaml-language-server needs. Structural constraints survive the conversion, custom refinements do not (see above). Use `io: "input"` to describe the authored shape; it also omits `additionalProperties: false` ([json-schema.mdx](https://github.com/colinhacks/zod/blob/v4.6.5/packages/docs/content/json-schema.mdx)).
- Ajv validates against hand-written JSON Schema, which can be the single source shared by editor and loader. TS types would then come from a generator.
- yaml-language-server supports drafts 4, 7 (default), 2019-09 and 2020-12, and detects them from `$schema` ([autodocs](https://github.com/redhat-developer/yaml-language-server/blob/main/_autodocs/services-schema.md)).

**Validation layering** (applies to every option):
1. YAML syntax (parser errors and warnings).
2. Per-file structure (JSON Schema / Zod). The editor can also run this.
3. Cross-file reference integrity and graph checks (dangling IDs, duplicates, unreachable Locations). Only the loader/CLI can run this, unless a per-Scenario schema with ID enums is generated.

**Editor ceiling without a custom extension:** per-file schema validation, completion and hover, plus alias→anchor navigation inside a file. Navigation between files and reference checking need either generated schemas (enums) or a dedicated extension.

## Summary matrix

| Option | Crosses files | Models graph edges (cycles) | Editor support out of the box | Loader effort | Ref-integrity checking |
| --- | --- | --- | --- | --- | --- |
| A. Anchors/aliases | No | No (copy semantics) | Yes (same file) | None | Parser only, same file |
| B. Custom tags (`!include`, `!ref`) | Yes | `!include`: no; typed `!ref`: yes, if resolved later | Needs `yaml.customTags`; no target checks | Medium (I/O inside resolver, cycles, positions) | Custom |
| C. `$ref` + JSON Pointer | Yes | Poorly (dereference copies or cycles) | No (plain string in data) | Low with ref-parser libs | Library (existence only) |
| D. ID references + custom loader | Yes (global namespace) | Yes | Schema only; IDs unchecked unless enums are generated | Medium (symbol table, positions) | Custom, best error messages |
| E. Directory convention / manifest | Assembly only | n/a (pairs with D) | Good (`yaml.schemas` globs per file kind) | Low | n/a |

Seen in the sources: established multi-file content formats that model a *graph* combine a file-assembly convention with name/ID references resolved by the tool. Ink, Kustomize and OpenAPI implicit connections do this (E + D). `$ref` and `!include` are used where the target is a *tree* to inline (OpenAPI schemas, CloudFormation). This is an observation, not a decision.

## Open points for the deciding (grilling) ticket

- Do IDs have one global namespace per Scenario (as in Ink), or one per kind (`location`, `scene`, `item`, ...)? Is the kind spelled in the reference (`scene:cellar_door`) or inferred from the field?
- Are IDs declared in the file or derived from file and directory names?
- Manifest file or glob convention for package membership?
- What is the single source of truth for structure: Zod (generating JSON Schema) or JSON Schema (generating TS types)?
- Is a generated per-Scenario schema with ID enums worth it for editor-time reference checking, or is the CLI validator enough for the prototype?
- Allow anchors/aliases for in-file reuse, or forbid them so the content stays simple?
