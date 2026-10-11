import fs from 'node:fs';

// Start the smoke run with a throwaway database, so a previous run's
// Playthroughs never leak into this one.
export default function globalSetup(): void {
  for (const suffix of ['', '-shm', '-wal', '-journal']) {
    fs.rmSync(`./e2e-smoke.sqlite${suffix}`, { force: true });
  }
}
