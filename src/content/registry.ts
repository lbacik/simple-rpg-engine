// Scenario collection registry (docs/spec/architecture.md, scenario
// collection). `register()` loads every Scenario directory into an in-memory
// registry with `loadScenario`. Invalid Scenarios are logged with their
// diagnostics and left out; warnings are logged; the app still starts.

import fs from 'node:fs';
import path from 'node:path';
import { loadScenario, type Diagnostic, type Scenario } from './loadScenario';

export function scenarioDirectory(): string {
  if (process.env.SCENARIO_DIR) return path.resolve(process.env.SCENARIO_DIR);
  return path.resolve(process.cwd(), 'scenarios');
}

export type RegistryEntry = {
  scenario: Scenario;
  warnings: Diagnostic[];
  /**
   * Absolute paths watched for dev reloads: the manifest plus every file it
   * lists. A directory's own mtime does not change when a file inside it is
   * edited, so the files themselves are watched.
   */
  watchedFiles: string[];
  /** `mtimeMs` per watched file at load, or null when it was missing. */
  watchedMtimes: (number | null)[];
};

declare global {
  var __scenarioRegistry: Map<string, RegistryEntry> | undefined;
}

function registryMap(): Map<string, RegistryEntry> {
  if (!globalThis.__scenarioRegistry) globalThis.__scenarioRegistry = new Map();
  return globalThis.__scenarioRegistry;
}

function statMtimeOrNull(full: string): number | null {
  try {
    return fs.statSync(full).mtimeMs;
  } catch {
    return null;
  }
}

/** Manifest plus every listed file, as absolute paths. */
function watchedFilesFor(dir: string, scenario: Scenario): string[] {
  return [
    path.join(dir, 'scenario.yaml'),
    ...scenario.listedPaths.map((listed) => path.join(dir, listed)),
  ];
}

function snapshotEntry(dir: string, scenario: Scenario, warnings: Diagnostic[]): RegistryEntry {
  const watchedFiles = watchedFilesFor(dir, scenario);
  return {
    scenario,
    warnings,
    watchedFiles,
    watchedMtimes: watchedFiles.map(statMtimeOrNull),
  };
}

/** True when the manifest or any listed file changed since the entry was loaded. */
function isStale(entry: RegistryEntry): boolean {
  for (let index = 0; index < entry.watchedFiles.length; index += 1) {
    const file = entry.watchedFiles[index] as string;
    if (statMtimeOrNull(file) !== entry.watchedMtimes[index]) return true;
  }
  return false;
}

export function loadAllScenarios(dir: string = scenarioDirectory()): Map<string, Scenario> {
  const registry = registryMap();
  registry.clear();
  let names: string[] = [];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    console.error(`scenario directory "${dir}" is missing or unreadable; starting with no Scenarios`);
    return new Map();
  }
  for (const name of names) {
    loadOne(registry, dir, name);
  }
  const scenarios = new Map<string, Scenario>();
  for (const [id, entry] of registry) scenarios.set(id, entry.scenario);
  return scenarios;
}

function loadOne(registry: Map<string, RegistryEntry>, dir: string, name: string): void {
  const full = path.join(dir, name);
  const result = loadScenario(full);
  if (result.ok) {
    registry.set(name, snapshotEntry(full, result.scenario, result.warnings));
    for (const warning of result.warnings) {
      console.warn(
        `scenario "${name}" warning [${warning.code}]${warning.file ? ` ${warning.file}` : ''}: ${warning.message}`,
      );
    }
  } else {
    console.error(`scenario "${name}" is invalid and was left out of the collection:`);
    for (const diagnostic of result.diagnostics) {
      console.error(
        `  [${diagnostic.code}]${diagnostic.file ? ` ${diagnostic.file}` : ''}: ${diagnostic.message}`,
      );
    }
  }
}

/**
 * Reload one entry when its manifest or any listed file changed. A reload
 * that fails validation leaves the Scenario out of the collection (like
 * startup), so its Playthroughs read as incompatible.
 */
function refreshIfStale(registry: Map<string, RegistryEntry>, name: string): void {
  const entry = registry.get(name);
  if (!entry) return;
  if (!isStale(entry)) return;
  const result = loadScenario(entry.scenario.dir);
  if (result.ok) {
    registry.set(name, snapshotEntry(entry.scenario.dir, result.scenario, result.warnings));
  } else {
    console.error(`scenario "${name}" is invalid after an edit and was left out of the collection:`);
    for (const diagnostic of result.diagnostics) {
      console.error(
        `  [${diagnostic.code}]${diagnostic.file ? ` ${diagnostic.file}` : ''}: ${diagnostic.message}`,
      );
    }
    registry.delete(name);
  }
}

/** All currently loaded Scenarios, sorted by id. */
export function listScenarios(): Scenario[] {
  if (process.env.NODE_ENV !== 'production') {
    // Pick up added or removed Scenario directories without a restart, and
    // edited manifests or listed files on request.
    const dir = scenarioDirectory();
    try {
      const names = new Set(
        fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
      );
      const registry = registryMap();
      for (const name of names) {
        if (!registry.has(name)) loadOne(registry, dir, name);
        else refreshIfStale(registry, name);
      }
      for (const name of [...registry.keys()]) {
        if (!names.has(name)) registry.delete(name);
      }
    } catch {
      /* keep the startup registry when the directory is unreadable */
    }
  }
  return [...registryMap().values()].map((entry) => entry.scenario).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * One Scenario by id. In development the Scenario reloads on request when the
 * modification time of its manifest or of any file it lists has changed.
 */
export function getScenario(id: string): Scenario | undefined {
  if (process.env.NODE_ENV !== 'production') {
    const dir = scenarioDirectory();
    if (!registryMap().has(id)) {
      // A Scenario directory added without a restart loads on first request.
      try {
        if (fs.statSync(path.join(dir, id)).isDirectory()) {
          loadOne(registryMap(), dir, id);
        }
      } catch {
        /* not a directory; stays unknown */
      }
    } else {
      refreshIfStale(registryMap(), id);
    }
  }
  return registryMap().get(id)?.scenario;
}
