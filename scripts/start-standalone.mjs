import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The standalone server runs with its own directory as cwd, which would make
// relative DATABASE_PATH / SCENARIO_DIR diverge from `npm run migrate`.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
await import('../.next/standalone/server.js');
