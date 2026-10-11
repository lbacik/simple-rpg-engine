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
  loadedAt: number;
};

declare global {
  var __scenarioRegistry: Map<string, RegistryEntry> | undefined;
}

function registryMap(): Map<string, RegistryEntry> {
  if (!globalThis.__scenarioRegistry) globalThis.__scenarioRegistry = new Map();
  return globalThis.__scenarioRegistry;
}

function newestYamlMtime(dir: string): number {
  let newest = 0;
  const visit = (current: string): void => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.yaml')) {
        try {
          const mtime = fs.statSync(full).mtimeMs;
          if (mtime > newest) newest = mtime;
        } catch {
          /* ignore */
        }
      }
    }
  };
  visit(dir);
  return newest;
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
    registry.set(name, { scenario: result.scenario, warnings: result.warnings, loadedAt: Date.now() });
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

/** All currently loaded Scenarios, sorted by id. */
export function listScenarios(): Scenario[] {
  if (process.env.NODE_ENV !== 'production') {
    // Pick up added or removed Scenario directories without a restart.
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
  if (process.env.NODE_ENV !== 'production' && !registryMap().has(id)) {
    // A Scenario directory added without a restart loads on first request.
    try {
      if (fs.statSync(path.join(scenarioDirectory(), id)).isDirectory()) {
        loadOne(registryMap(), scenarioDirectory(), id);
      }
    } catch {
      /* not a directory; stays unknown */
    }
  }
  const entry = registryMap().get(id);
  if (!entry) return undefined;
  if (process.env.NODE_ENV !== 'production') {
    const newest = newestYamlMtime(entry.scenario.dir);
    if (newest > entry.loadedAt) {
      const reloaded = loadScenario(entry.scenario.dir);
      if (reloaded.ok) {
        registryMap().set(id, {
          scenario: reloaded.scenario,
          warnings: reloaded.warnings,
          loadedAt: Date.now(),
        });
        return reloaded.scenario;
      }
      console.error(`scenario "${id}" failed to reload and the previous version is kept`);
    }
  }
  return registryMap().get(id)?.scenario;
}
