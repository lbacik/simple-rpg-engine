import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The standalone server runs with its own directory as cwd, which would make
// relative DATABASE_PATH / SCENARIO_DIR diverge from `npm run migrate`.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

// The standalone server serves `/_next/static` from its own directory, next
// to server.js (the Docker image copies it there explicitly). Sync the fresh
// build output there on startup, so `npm run start` serves the client
// JavaScript the browser needs for soft navigation, the journal's infinite
// scroll and the journal modal. Without this the pages still render, but
// every click degrades to a full navigation as if JavaScript were disabled.
const builtStatic = path.join(root, '.next', 'static');
const standaloneStatic = path.join(root, '.next', 'standalone', '.next', 'static');
if (fs.existsSync(builtStatic)) {
  fs.cpSync(builtStatic, standaloneStatic, { recursive: true });
}
await import('../.next/standalone/server.js');
