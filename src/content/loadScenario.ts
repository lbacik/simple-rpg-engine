// loadScenario: the loader and validator shared by the CLI and the app's
// startup (see docs/spec/architecture.md).
//
// Phases 1 (Package), 2 (Structure), 3 (Integrity) and 4 (Playability) from
// docs/spec/validation.md run behind this same function: collect each
// phase's diagnostics, and skip every later phase once an error was produced.

import fs from 'node:fs';
import path from 'node:path';
import { isMap, isPair, isScalar, isSeq } from 'yaml';
import type { LineCounter } from 'yaml';
import type { Diagnostic, DiagnosticRange } from './diagnostic';
import { runIntegrityPhase } from './integrity';
import { buildScenario } from './model';
import { runPlayabilityPhase } from './playability';
import { hasDotDot, isAbsolutePath, isUrl, normalizeListedPath, symlinkEscapesDir } from './paths';
import type { Scenario } from './model';
import { runStructurePhase } from './structure';
import type { ManifestSection, ParsedFile } from './structure';
import { nodeRange, parseYamlText } from './yamlFile';

export type { Diagnostic, DiagnosticRange } from './diagnostic';
export type {
  AttributeName,
  CompiledChoice,
  CompiledCondition,
  CompiledConnection,
  CompiledEffect,
  CompiledEncounter,
  CompiledEnding,
  CompiledEnemy,
  CompiledImageEntry,
  CompiledItem,
  CompiledLocation,
  CompiledOutcome,
  CompiledScene,
  CompiledTemplate,
  CompiledTemplateItem,
  Scenario,
} from './model';

export type LoadScenarioSuccess = {
  ok: true;
  scenario: Scenario;
  warnings: Diagnostic[];
};

export type LoadScenarioFailure = {
  ok: false;
  diagnostics: Diagnostic[];
};

export type LoadScenarioResult = LoadScenarioSuccess | LoadScenarioFailure;

const MANIFEST_FILE = 'scenario.yaml';
const SUPPORTED_SCHEMA_VERSION = 1;

const MANIFEST_SECTIONS: readonly ManifestSection[] = [
  'locations',
  'scenes',
  'items',
  'enemies',
  'encounters',
  'templates',
  'endings',
  'images',
];

/** Sections the manifest must list (docs/spec/scenario-format.md). */
const REQUIRED_SECTIONS: readonly ManifestSection[] = ['locations', 'templates', 'endings'];

type ListedFile = {
  section: ManifestSection;
  value: string;
  range: DiagnosticRange | undefined;
};

function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  if ((a.file ?? '') !== (b.file ?? '')) return (a.file ?? '') < (b.file ?? '') ? -1 : 1;
  if ((a.range?.line ?? 0) !== (b.range?.line ?? 0)) return (a.range?.line ?? 0) - (b.range?.line ?? 0);
  return (a.range?.column ?? 0) - (b.range?.column ?? 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findPair(root: unknown, key: string) {
  if (!isMap(root)) return undefined;
  for (const item of root.items) {
    if (isPair(item) && isScalar(item.key) && item.key.value === key) return item;
  }
  return undefined;
}

export function loadScenario(dir: string): LoadScenarioResult {
  const scenarioDir = path.resolve(dir);
  const dirName = path.basename(scenarioDir);
  const diagnostics: Diagnostic[] = [];
  const push = (diagnostic: Diagnostic): void => {
    diagnostics.push(diagnostic);
  };

  let manifestBytes: Buffer;
  try {
    manifestBytes = fs.readFileSync(path.join(scenarioDir, MANIFEST_FILE));
  } catch {
    push({
      severity: 'error',
      code: 'package/missing-manifest',
      message: `${MANIFEST_FILE} is missing or unreadable`,
      file: MANIFEST_FILE,
    });
    return { ok: false, diagnostics };
  }
  const manifestSource = manifestBytes.toString('utf8');

  const manifest = parseYamlText(manifestSource, MANIFEST_FILE, push);
  const manifestDoc = manifest.docs[0];
  const manifestRoot = manifestDoc?.contents;
  let manifestValue: unknown;
  try {
    manifestValue = manifestDoc?.toJS();
  } catch {
    manifestValue = undefined;
  }

  checkSchemaVersion(manifestRoot, manifestValue, manifest.lineCounter, push);
  const listed = checkManifestSections(manifestRoot, manifest.lineCounter, push);
  checkIdMismatch(manifestRoot, manifestValue, dirName, manifest.lineCounter, push);
  const parsedFiles: ParsedFile[] = [];
  const fileBytes = new Map<string, Buffer>();
  for (const entry of listed) {
    const parsed = checkListedFile(scenarioDir, entry, push);
    if (parsed) {
      parsedFiles.push(parsed.file);
      fileBytes.set(entry.value, parsed.bytes);
    }
  }
  checkDuplicateFiles(listed, push);

  // Deterministic, position-ordered output: by file, then line, then column.
  diagnostics.sort(compareDiagnostics);

  // Phase gating (docs/spec/validation.md): later phases do not run after an
  // error. Every package/ finding is an error, so any diagnostic rejects.
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ok: false, diagnostics };
  }

  // Phase 2 (Structure): the Zod definitions and the custom schema/ checks.
  // A Structure error stops phases 3 and 4; warnings never stop the pipeline.
  runStructurePhase(
    {
      section: 'manifest',
      file: MANIFEST_FILE,
      value: manifestValue,
      contents: manifestRoot,
      lineCounter: manifest.lineCounter,
    },
    parsedFiles,
    push,
  );
  diagnostics.sort(compareDiagnostics);

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ok: false, diagnostics };
  }

  // Phase 3 (Integrity): IDs, typed references, declared Flags, Scene
  // membership, Template slots and images. An Integrity error stops phase 4;
  // warnings never stop the pipeline.
  const manifestParsed: ParsedFile = {
    section: 'manifest',
    file: MANIFEST_FILE,
    value: manifestValue,
    contents: manifestRoot,
    lineCounter: manifest.lineCounter,
  };
  const integrity = runIntegrityPhase(manifestParsed, parsedFiles, scenarioDir, push);
  diagnostics.sort(compareDiagnostics);

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ok: false, diagnostics };
  }

  // Phase 4 (Playability): reachability, way-out and authoring-quality
  // warnings over the compiled model. An error (no-victory, no-way-out)
  // rejects the Scenario like any earlier error.
  const scenario = buildScenario({
    id: dirName,
    dir: scenarioDir,
    manifest: manifestParsed,
    files: parsedFiles,
    images: integrity.images,
    imageBytes: integrity.imageBytes,
    manifestBytes,
    listedPaths: listed.map((entry) => entry.value),
    fileBytes,
  });
  runPlayabilityPhase(scenario, manifestParsed, parsedFiles, push);
  diagnostics.sort(compareDiagnostics);

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    scenario,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning'),
  };
}

function checkSchemaVersion(
  manifestRoot: unknown,
  manifestValue: unknown,
  lineCounter: LineCounter,
  push: (diagnostic: Diagnostic) => void,
): void {
  const value = isRecord(manifestValue) ? manifestValue['schemaVersion'] : undefined;
  if (value === SUPPORTED_SCHEMA_VERSION) return;
  const pair = findPair(manifestRoot, 'schemaVersion');
  const valueNode = pair?.value;
  if (pair && valueNode != null) {
    push({
      severity: 'error',
      code: 'package/unsupported-schema-version',
      message: `unsupported schemaVersion ${JSON.stringify(value) ?? String(value)}; only version 1 is supported`,
      file: MANIFEST_FILE,
      range: nodeRange(valueNode, lineCounter),
    });
  } else {
    push({
      severity: 'error',
      code: 'package/unsupported-schema-version',
      message: 'schemaVersion is missing; only version 1 is supported',
      file: MANIFEST_FILE,
    });
  }
}

function checkManifestSections(
  manifestRoot: unknown,
  lineCounter: LineCounter,
  push: (diagnostic: Diagnostic) => void,
): ListedFile[] {
  const listed: ListedFile[] = [];
  for (const section of MANIFEST_SECTIONS) {
    const pair = findPair(manifestRoot, section);
    if (!pair || pair.value == null) {
      if (REQUIRED_SECTIONS.includes(section)) {
        push({
          severity: 'error',
          code: 'package/invalid-manifest',
          message: `manifest section "${section}" is required and must be a list of file paths`,
          file: MANIFEST_FILE,
        });
      }
      continue;
    }
    if (!isSeq(pair.value)) {
      push({
        severity: 'error',
        code: 'package/invalid-manifest',
        message: `manifest section "${section}" must be a list of file paths`,
        file: MANIFEST_FILE,
        range: nodeRange(pair.value, lineCounter),
      });
      continue;
    }
    for (const item of pair.value.items) {
      if (isScalar(item) && typeof item.value === 'string') {
        listed.push({ section, value: item.value, range: nodeRange(item, lineCounter) });
      } else {
        push({
          severity: 'error',
          code: 'package/invalid-manifest',
          message: `manifest section "${section}" must be a list of strings`,
          file: MANIFEST_FILE,
          range: nodeRange(item, lineCounter),
        });
      }
    }
  }
  return listed;
}

function checkIdMismatch(
  manifestRoot: unknown,
  manifestValue: unknown,
  dirName: string,
  lineCounter: LineCounter,
  push: (diagnostic: Diagnostic) => void,
): void {
  const idValue = isRecord(manifestValue) ? manifestValue['id'] : undefined;
  if (idValue === dirName) return;
  const pair = findPair(manifestRoot, 'id');
  const valueNode = pair?.value;
  if (typeof idValue === 'string' && valueNode != null) {
    push({
      severity: 'error',
      code: 'package/id-mismatch',
      message: `manifest id "${idValue}" differs from the directory name "${dirName}"`,
      file: MANIFEST_FILE,
      range: nodeRange(valueNode, lineCounter),
    });
  } else {
    push({
      severity: 'error',
      code: 'package/id-mismatch',
      message: `manifest id is missing; it must equal the directory name "${dirName}"`,
      file: MANIFEST_FILE,
    });
  }
}

function checkListedFile(
  scenarioDir: string,
  entry: ListedFile,
  push: (diagnostic: Diagnostic) => void,
): { file: ParsedFile; bytes: Buffer } | undefined {
  const invalidPath = (reason: string): void => {
    push({
      severity: 'error',
      code: 'package/invalid-path',
      message: `listed path "${entry.value}" ${reason}`,
      file: MANIFEST_FILE,
      range: entry.range,
    });
  };
  // Paths that cannot be resolved inside the Scenario directory are reported
  // without touching the filesystem.
  if (isAbsolutePath(entry.value)) {
    invalidPath('is absolute; paths must be relative to the Scenario directory');
    return undefined;
  }
  if (isUrl(entry.value)) {
    invalidPath('is a URL; paths must be relative to the Scenario directory');
    return undefined;
  }
  if (hasDotDot(entry.value)) {
    invalidPath('contains ".."; paths must stay inside the Scenario directory');
    return undefined;
  }
  if (!entry.value.endsWith('.yaml')) {
    invalidPath('lacks the .yaml extension');
  }

  const full = path.join(scenarioDir, entry.value);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(full);
  } catch {
    push({
      severity: 'error',
      code: 'package/missing-file',
      message: `listed file "${entry.value}" is missing or unreadable`,
      file: MANIFEST_FILE,
      range: entry.range,
    });
    return undefined;
  }
  if (stat.isDirectory()) {
    push({
      severity: 'error',
      code: 'package/missing-file',
      message: `listed file "${entry.value}" is missing or unreadable`,
      file: MANIFEST_FILE,
      range: entry.range,
    });
    return undefined;
  }
  if (symlinkEscapesDir(scenarioDir, entry.value)) {
    invalidPath('is a symlink resolving outside the Scenario directory');
    return;
  }

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(full);
  } catch {
    push({
      severity: 'error',
      code: 'package/missing-file',
      message: `listed file "${entry.value}" is missing or unreadable`,
      file: MANIFEST_FILE,
      range: entry.range,
    });
    return undefined;
  }
  const parsed = parseYamlText(bytes.toString('utf8'), entry.value, push);
  const doc = parsed.docs[0];
  let value: unknown;
  try {
    value = doc?.toJS();
  } catch {
    value = undefined;
  }
  return {
    file: {
      section: entry.section,
      file: entry.value,
      value,
      contents: doc?.contents,
      lineCounter: parsed.lineCounter,
    },
    bytes,
  };
}

function checkDuplicateFiles(
  listed: ListedFile[],
  push: (diagnostic: Diagnostic) => void,
): void {
  const byPath = new Map<string, ListedFile[]>();
  for (const entry of listed) {
    const key = normalizeListedPath(entry.value);
    const group = byPath.get(key);
    if (group) group.push(entry);
    else byPath.set(key, [entry]);
  }
  for (const group of byPath.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = group as [ListedFile, ...ListedFile[]];
    for (const duplicate of rest) {
      push({
        severity: 'error',
        code: 'package/duplicate-file',
        message: `file "${duplicate.value}" is listed more than once`,
        file: MANIFEST_FILE,
        range: duplicate.range,
        related:
          first.range === undefined
            ? undefined
            : [
                {
                  file: MANIFEST_FILE,
                  range: first.range,
                  message:
                    first.section === duplicate.section
                      ? 'first listed here'
                      : `first listed here (in "${first.section}")`,
                },
              ],
      });
    }
  }
}
