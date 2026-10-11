# Editor JSON Schemas

One JSON Schema per Scenario file kind, generated from the Zod definitions
in `src/content/schema.ts` (the source of truth for the Structure phase):

```sh
npm run schemas
```

The committed files must match the generator output; `tests/schemas.test.ts`
fails on drift. `.vscode/settings.json` is the example `yaml.schemas`
configuration: it associates these schemas with the recommended Scenario
layout, so opening a Scenario file in VS Code gives completion and flags
out-of-range values. There is no per-Scenario schema enumerating IDs.

Limits expressible in JSON Schema (ranges, enums, required keys) reach the
editor through these files. Refinements (the Template point sum, mutually
exclusive keys, the narration rules) are enforced by the loader and the CLI
only.
