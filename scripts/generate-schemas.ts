// Generate the editor JSON Schemas from the Zod definitions:
// `npm run schemas` writes one file per file kind into schemas/.
// See src/content/jsonSchema.ts and .vscode/settings.json for the VS Code
// wiring (yaml.schemas), which gives completion and structural checks.

import fs from 'node:fs';
import path from 'node:path';
import { FILE_KINDS, buildJsonSchemas } from '../src/content/jsonSchema';

const repoRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(repoRoot, 'schemas');

function main(): void {
  fs.mkdirSync(outDir, { recursive: true });
  const schemas = buildJsonSchemas();
  for (const kind of FILE_KINDS) {
    const file = path.join(outDir, `${kind}.json`);
    fs.writeFileSync(file, `${JSON.stringify(schemas[kind], null, 2)}\n`);
    console.log(`wrote ${path.relative(repoRoot, file)}`);
  }
}

main();
