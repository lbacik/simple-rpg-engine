// Translation pipelines T1 (Package), T2 (Structure) and T3 (Match):
// docs/spec/validation.md, Translations; docs/spec/scenario-format.md,
// Translation files; ADR 0002.
//
// Each Translation listed under the base manifest's `translations` runs its
// own pipeline once the base has passed Integrity (phase 3), independent of
// the other Translations. Any error rejects only that Translation; warnings
// never reject. Every diagnostic of the pipeline carries the Translation's
// manifest path in `translation`.
//
// The compiled model holds the accepted Translations' text keyed for a later
// overlay.

import fs from 'node:fs';
import path from 'node:path';
import { isMap, isPair, isScalar, isSeq } from 'yaml';
import { z } from 'zod';
import { INTERFACE_LANGUAGES, primaryLanguageSubtag } from '../i18n/languages';
import type { Diagnostic, DiagnosticRange } from './diagnostic';
import {
  hasDotDot,
  isAbsolutePath,
  isUrl,
  normalizeListedPath,
  symlinkEscapesDir,
} from './paths';
import {
  REQUIRED_TRANSLATION_SECTIONS,
  TRANSLATION_SECTIONS,
  TranslationEncountersCatalogSchema,
  TranslationEnemiesCatalogSchema,
  TranslationEndingsCatalogSchema,
  TranslationImagesCatalogSchema,
  TranslationItemsCatalogSchema,
  TranslationLocationSchema,
  TranslationManifestSchema,
  TranslationSceneSchema,
  TranslationTemplatesCatalogSchema,
} from './schema';
import type { TranslationSection } from './schema';
import {
  checkLanguageTag,
  checkNarrationValue,
  checkTextValue,
  isRecord,
  nodeAtPath,
  runZodCheck,
} from './structure';
import type { Ctx, ManifestSection, ParsedFile } from './structure';
import { nodeRange, parseYamlText } from './yamlFile';
import type {
  CompiledTranslation,
  RejectedTranslationContent,
  TranslationChoiceText,
  TranslationEncounterText,
  TranslationEndingText,
  TranslationImageText,
  TranslationLocationText,
  TranslationNamedText,
  TranslationOutcomeText,
  TranslationSceneText,
} from './model';

const MANIFEST_FILE = 'scenario.yaml';

const TRANSLATION_FILE_SCHEMAS: Record<TranslationSection, z.ZodTypeAny> = {
  locations: TranslationLocationSchema,
  scenes: TranslationSceneSchema,
  items: TranslationItemsCatalogSchema,
  enemies: TranslationEnemiesCatalogSchema,
  encounters: TranslationEncountersCatalogSchema,
  templates: TranslationTemplatesCatalogSchema,
  endings: TranslationEndingsCatalogSchema,
  images: TranslationImagesCatalogSchema,
};

export type LoadedTranslationFile = {
  section: TranslationSection;
  manifestPath: string;
  parsed: ParsedFile;
  bytes: Buffer;
};

export type LoadedTranslation = {
  /** The Translation manifest's path, relative to the Scenario directory. */
  manifestPath: string;
  manifest: ParsedFile;
  files: LoadedTranslationFile[];
  manifestBytes: Buffer;
  /** Raw bytes of the manifest and every file it lists, keyed by listed path. */
  fileBytes: Map<string, Buffer>;
  /** The parsed `language`, when the manifest was readable. */
  language?: string;
};

export type TranslationOutcome =
  | { ok: true; loaded: LoadedTranslation }
  | {
      ok: false;
      manifestPath: string;
      language?: string;
      diagnostics: Diagnostic[];
    };

type ListedEntry = {
  section: TranslationSection;
  value: string;
  range: DiagnosticRange | undefined;
};

function findPair(root: unknown, key: string) {
  if (!isMap(root)) return undefined;
  for (const item of root.items) {
    if (isPair(item) && isScalar(item.key) && item.key.value === key) return item;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Stage T1: Package.
// ---------------------------------------------------------------------------

function checkTranslationListedFile(
  scenarioDir: string,
  manifestPath: string,
  entry: ListedEntry,
  push: (diagnostic: Diagnostic) => void,
): { parsed: ParsedFile; bytes: Buffer } | undefined {
  const invalidPath = (reason: string): void => {
    push({
      severity: 'error',
      code: 'package/invalid-path',
      message: `listed path "${entry.value}" ${reason}`,
      file: manifestPath,
      range: entry.range,
    });
  };
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
      file: manifestPath,
      range: entry.range,
    });
    return undefined;
  }
  if (stat.isDirectory()) {
    push({
      severity: 'error',
      code: 'package/missing-file',
      message: `listed file "${entry.value}" is missing or unreadable`,
      file: manifestPath,
      range: entry.range,
    });
    return undefined;
  }
  if (symlinkEscapesDir(scenarioDir, entry.value)) {
    invalidPath('is a symlink resolving outside the Scenario directory');
    return undefined;
  }

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(full);
  } catch {
    push({
      severity: 'error',
      code: 'package/missing-file',
      message: `listed file "${entry.value}" is missing or unreadable`,
      file: manifestPath,
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
    parsed: {
      section: entry.section as ManifestSection,
      file: entry.value,
      value,
      contents: doc?.contents,
      lineCounter: parsed.lineCounter,
    },
    bytes,
  };
}

function collectTranslationSections(
  manifestRoot: unknown,
  manifestLineCounter: LoadedTranslation['manifest']['lineCounter'],
  manifestPath: string,
  push: (diagnostic: Diagnostic) => void,
): ListedEntry[] {
  const listed: ListedEntry[] = [];
  for (const section of TRANSLATION_SECTIONS) {
    const pair = findPair(manifestRoot, section);
    if (!pair || pair.value == null) {
      if ((REQUIRED_TRANSLATION_SECTIONS as readonly string[]).includes(section)) {
        push({
          severity: 'error',
          code: 'package/invalid-manifest',
          message: `manifest section "${section}" is required and must be a list of file paths`,
          file: manifestPath,
        });
      }
      continue;
    }
    if (!isSeq(pair.value)) {
      push({
        severity: 'error',
        code: 'package/invalid-manifest',
        message: `manifest section "${section}" must be a list of file paths`,
        file: manifestPath,
        range: nodeRange(pair.value, manifestLineCounter),
      });
      continue;
    }
    for (const item of pair.value.items) {
      if (isScalar(item) && typeof item.value === 'string') {
        listed.push({ section, value: item.value, range: nodeRange(item, manifestLineCounter) });
      } else {
        push({
          severity: 'error',
          code: 'package/invalid-manifest',
          message: `manifest section "${section}" must be a list of strings`,
          file: manifestPath,
          range: nodeRange(item, manifestLineCounter),
        });
      }
    }
  }
  return listed;
}

// ---------------------------------------------------------------------------
// Stage T2: Structure.
// ---------------------------------------------------------------------------

function checkTranslationManifest(value: unknown, ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkTextValue(value['title'], ['title'], ctx);
  checkTextValue(value['description'], ['description'], ctx);
  if (value['intro'] !== undefined) checkNarrationValue(value['intro'], ['intro'], ctx);
  checkLanguageTag(value['language'], ['language'], ctx);
}

function checkTranslationOutcome(
  value: unknown,
  path: readonly (string | number)[],
  ctx: Ctx,
): void {
  if (!isRecord(value)) return;
  if (value['text'] !== undefined) checkNarrationValue(value['text'], [...path, 'text'], ctx);
}

function checkTranslationChoice(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkTextValue(value['text'], [...path, 'text'], ctx);
  if (value['outcome'] !== undefined) checkTranslationOutcome(value['outcome'], [...path, 'outcome'], ctx);
  const test = value['test'];
  if (isRecord(test)) {
    if (test['success'] !== undefined) {
      checkTranslationOutcome(test['success'], [...path, 'test', 'success'], ctx);
    }
    if (test['failure'] !== undefined) {
      checkTranslationOutcome(test['failure'], [...path, 'test', 'failure'], ctx);
    }
  }
}

function checkTranslationFile(section: TranslationSection, value: unknown, ctx: Ctx): void {
  switch (section) {
    case 'locations': {
      if (!isRecord(value)) return;
      checkTextValue(value['name'], ['name'], ctx);
      if (value['description'] !== undefined) {
        checkNarrationValue(value['description'], ['description'], ctx);
      }
      const connections = value['connections'];
      if (Array.isArray(connections)) {
        connections.forEach((connection, index) => {
          if (!isRecord(connection)) return;
          if (connection['label'] !== undefined) {
            checkTextValue(connection['label'], ['connections', index, 'label'], ctx);
          }
        });
      }
      return;
    }
    case 'scenes': {
      if (!isRecord(value)) return;
      checkTextValue(value['title'], ['title'], ctx);
      if (value['text'] !== undefined) checkNarrationValue(value['text'], ['text'], ctx);
      const choices = value['choices'];
      if (Array.isArray(choices)) {
        choices.forEach((choice, index) => checkTranslationChoice(choice, ['choices', index], ctx));
      }
      return;
    }
    case 'encounters': {
      if (!Array.isArray(value)) return;
      value.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        const at: (string | number)[] = [index];
        if (entry['text'] !== undefined) checkNarrationValue(entry['text'], [...at, 'text'], ctx);
        if (entry['victory'] !== undefined) {
          checkTranslationOutcome(entry['victory'], [...at, 'victory'], ctx);
        }
        if (entry['escape'] !== undefined) {
          checkTranslationOutcome(entry['escape'], [...at, 'escape'], ctx);
        }
      });
      return;
    }
    case 'endings': {
      if (!Array.isArray(value)) return;
      value.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        checkTextValue(entry['title'], [index, 'title'], ctx);
        if (entry['text'] !== undefined) checkNarrationValue(entry['text'], [index, 'text'], ctx);
      });
      return;
    }
    case 'images': {
      if (!Array.isArray(value)) return;
      value.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        checkTextValue(entry['alt'], [index, 'alt'], ctx);
      });
      return;
    }
    case 'items':
    case 'enemies':
    case 'templates': {
      if (!Array.isArray(value)) return;
      value.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        checkTextValue(entry['name'], [index, 'name'], ctx);
        if (entry['description'] !== undefined) {
          checkTextValue(entry['description'], [index, 'description'], ctx);
        }
      });
      return;
    }
  }
}

function runTranslationStructure(loaded: LoadedTranslation, push: (diagnostic: Diagnostic) => void): void {
  const manifestCtx: Ctx = {
    file: loaded.manifestPath,
    contents: loaded.manifest.contents,
    lineCounter: loaded.manifest.lineCounter,
    push,
  };
  runZodCheck(TranslationManifestSchema, loaded.manifest.value, manifestCtx);
  checkTranslationManifest(loaded.manifest.value, manifestCtx);
  for (const file of loaded.files) {
    const ctx: Ctx = {
      file: file.parsed.file,
      contents: file.parsed.contents,
      lineCounter: file.parsed.lineCounter,
      push,
    };
    runZodCheck(TRANSLATION_FILE_SCHEMAS[file.section], file.parsed.value, ctx);
    checkTranslationFile(file.section, file.parsed.value, ctx);
  }
}

// ---------------------------------------------------------------------------
// Stage T3: Match (docs/spec/validation.md, Stage T3: Match).
//
// Entries are matched to the base by their keys: `id` for entities, catalog
// entries and Choices, `to` for Connections, and the base nesting for
// Outcomes. A translatable field the base has must be present in the
// Translation (translation/missing-text); anything the Translation has
// without a base counterpart is translation/unmatched. Language tags and
// staleness are checked alongside.
// ---------------------------------------------------------------------------

function validLanguageTag(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    return Intl.getCanonicalLocales(value).length > 0;
  } catch {
    return false;
  }
}

type FilePos = {
  file: string;
  contents: unknown;
  lineCounter: LoadedTranslation['manifest']['lineCounter'];
};

function rangeIn(pos: FilePos, path: (string | number)[]): DiagnosticRange | undefined {
  return nodeRange(nodeAtPath(pos.contents, path), pos.lineCounter);
}

type BaseChoiceInfo = {
  outcome: boolean;
  outcomeText: boolean;
  test: boolean;
  successText: boolean;
  failureText: boolean;
};

type BaseIndex = {
  manifest: FilePos & { hasIntro: boolean; version: string; language: string };
  locations: Map<string, { pos: FilePos; idPath: (string | number)[]; labels: Map<string, boolean> }>;
  scenes: Map<string, { pos: FilePos; idPath: (string | number)[]; choices: Map<string, BaseChoiceInfo> }>;
  items: Map<string, { pos: FilePos; idPath: (string | number)[]; hasDescription: boolean }>;
  enemies: Map<string, { pos: FilePos; idPath: (string | number)[]; hasDescription: boolean }>;
  encounters: Map<string, { pos: FilePos; idPath: (string | number)[]; victory: boolean; victoryText: boolean; escapeText: boolean }>;
  templates: Map<string, { pos: FilePos; idPath: (string | number)[]; hasDescription: boolean }>;
  endings: Map<string, { pos: FilePos; idPath: (string | number)[] }>;
  images: Map<string, { pos: FilePos; idPath: (string | number)[] }>;
};

function outcomeTextOf(value: unknown): boolean {
  return isRecord(value) && typeof value['text'] === 'string';
}

function baseChoiceInfo(value: unknown): BaseChoiceInfo {
  const info: BaseChoiceInfo = {
    outcome: false,
    outcomeText: false,
    test: false,
    successText: false,
    failureText: false,
  };
  if (!isRecord(value)) return info;
  if (isRecord(value['outcome'])) {
    info.outcome = true;
    info.outcomeText = outcomeTextOf(value['outcome']);
  }
  const test = value['test'];
  if (isRecord(test)) {
    info.test = true;
    if (isRecord(test['success'])) info.successText = outcomeTextOf(test['success']);
    if (isRecord(test['failure'])) info.failureText = outcomeTextOf(test['failure']);
  }
  return info;
}

function buildBaseIndex(manifest: ParsedFile, files: ParsedFile[]): BaseIndex {
  const manifestValue = isRecord(manifest.value) ? manifest.value : {};
  const index: BaseIndex = {
    manifest: {
      file: manifest.file,
      contents: manifest.contents,
      lineCounter: manifest.lineCounter,
      hasIntro: typeof manifestValue['intro'] === 'string',
      version: typeof manifestValue['version'] === 'string' ? manifestValue['version'] : '',
      language: typeof manifestValue['language'] === 'string' ? manifestValue['language'] : '',
    },
    locations: new Map(),
    scenes: new Map(),
    items: new Map(),
    enemies: new Map(),
    encounters: new Map(),
    templates: new Map(),
    endings: new Map(),
    images: new Map(),
  };
  const posOf = (file: ParsedFile): FilePos => ({
    file: file.file,
    contents: file.contents,
    lineCounter: file.lineCounter,
  });
  for (const file of files) {
    const pos = posOf(file);
    if ((file.section === 'locations' || file.section === 'scenes') && isRecord(file.value)) {
      const id = file.value['id'];
      if (typeof id !== 'string') continue;
      if (file.section === 'locations') {
        const labels = new Map<string, boolean>();
        const connections = file.value['connections'];
        if (Array.isArray(connections)) {
          for (const connection of connections) {
            if (isRecord(connection) && typeof connection['to'] === 'string') {
              if (!labels.has(connection['to'])) {
                labels.set(connection['to'], typeof connection['label'] === 'string');
              }
            }
          }
        }
        if (!index.locations.has(id)) {
          index.locations.set(id, { pos, idPath: ['id'], labels });
        }
      } else {
        const choices = new Map<string, BaseChoiceInfo>();
        const rawChoices = file.value['choices'];
        if (Array.isArray(rawChoices)) {
          for (const choice of rawChoices) {
            if (isRecord(choice) && typeof choice['id'] === 'string' && !choices.has(choice['id'])) {
              choices.set(choice['id'], baseChoiceInfo(choice));
            }
          }
        }
        if (!index.scenes.has(id)) {
          index.scenes.set(id, { pos, idPath: ['id'], choices });
        }
      }
      continue;
    }
    if (!Array.isArray(file.value)) continue;
    file.value.forEach((entry, entryIndex) => {
      if (!isRecord(entry) || typeof entry['id'] !== 'string') return;
      const idPath: (string | number)[] = [entryIndex, 'id'];
      switch (file.section) {
        case 'items':
        case 'enemies':
        case 'templates': {
          const target =
            file.section === 'items' ? index.items : file.section === 'enemies' ? index.enemies : index.templates;
          if (!target.has(entry['id'])) {
            target.set(entry['id'], {
              pos,
              idPath,
              hasDescription: typeof entry['description'] === 'string',
            });
          }
          break;
        }
        case 'encounters': {
          if (!index.encounters.has(entry['id'])) {
            const victory = isRecord(entry['victory']) ? entry['victory'] : undefined;
            index.encounters.set(entry['id'], {
              pos,
              idPath,
              victory: victory !== undefined,
              victoryText: victory !== undefined && outcomeTextOf(victory),
              escapeText: isRecord(entry['escape']) && outcomeTextOf(entry['escape']),
            });
          }
          break;
        }
        case 'endings':
          if (!index.endings.has(entry['id'])) index.endings.set(entry['id'], { pos, idPath });
          break;
        case 'images':
          if (!index.images.has(entry['id'])) index.images.set(entry['id'], { pos, idPath });
          break;
        default:
          break;
      }
    });
  }
  return index;
}

type Occurrence = {
  key: string;
  file: string;
  contents: unknown;
  lineCounter: LoadedTranslation['manifest']['lineCounter'];
  keyPath: (string | number)[];
};

/**
 * translation/duplicate-entry: two Translation entries with the same key, in
 * one file or across its files. The first entry is in `related`. Matching
 * always uses the first occurrence, so duplicates never cause spurious
 * missing-text or suppress unmatched; the returned once-set is informational.
 */
function checkDuplicateEntries(
  occurrences: Occurrence[],
  kind: string,
  push: (diagnostic: Diagnostic) => void,
): Set<string> {
  const seen = new Map<string, Occurrence>();
  const once = new Set<string>();
  for (const occurrence of occurrences) {
    const first = seen.get(occurrence.key);
    if (!first) {
      seen.set(occurrence.key, occurrence);
      once.add(occurrence.key);
      continue;
    }
    once.delete(occurrence.key);
    push({
      severity: 'error',
      code: 'translation/duplicate-entry',
      message: `duplicate translation entry for ${kind} "${occurrence.key}"`,
      file: occurrence.file,
      range: nodeRange(nodeAtPath(occurrence.contents, occurrence.keyPath), occurrence.lineCounter),
      path: [...occurrence.keyPath],
      related: [
        {
          file: first.file,
          range: nodeRange(nodeAtPath(first.contents, first.keyPath), first.lineCounter),
          message: 'first entry here',
        },
      ],
    });
  }
  return once;
}

function runT3(loaded: LoadedTranslation, base: BaseIndex, push: (diagnostic: Diagnostic) => void): void {
  const manifestValue = isRecord(loaded.manifest.value) ? loaded.manifest.value : {};
  const manifestPos: FilePos = {
    file: loaded.manifestPath,
    contents: loaded.manifest.contents,
    lineCounter: loaded.manifest.lineCounter,
  };

  const missingAtBase = (
    basePos: FilePos,
    idPath: (string | number)[],
    message: string,
  ): void => {
    push({
      severity: 'error',
      code: 'translation/missing-text',
      message,
      file: basePos.file,
      range: rangeIn(basePos, idPath),
      path: [...idPath],
    });
  };

  const unmatchedAt = (
    pos: FilePos,
    atPath: (string | number)[],
    message: string,
  ): void => {
    push({
      severity: 'error',
      code: 'translation/unmatched',
      message,
      file: pos.file,
      range: rangeIn(pos, atPath),
      path: [...atPath],
    });
  };

  // ---- Manifest fields (title/description required on both sides). ----
  if (base.manifest.hasIntro && manifestValue['intro'] === undefined) {
    push({
      severity: 'error',
      code: 'translation/missing-text',
      message: 'translation is missing "intro" the base manifest has',
      file: base.manifest.file,
      range: rangeIn(base.manifest, ['intro']),
      path: ['intro'],
    });
  } else if (!base.manifest.hasIntro && manifestValue['intro'] !== undefined) {
    unmatchedAt(manifestPos, ['intro'], 'translation has "intro" the base manifest omits');
  }

  const filesBySection = (section: TranslationSection): LoadedTranslationFile[] =>
    loaded.files.filter((file) => file.section === section);

  // ---- Locations (id; Connections by `to`). ----
  const locationOccurrences: Occurrence[] = [];
  const translationLocations = new Map<
    string,
    { file: LoadedTranslationFile; connections: { to: string; toPath: (string | number)[]; labelPath: (string | number)[]; hasLabel: boolean }[] }
  >();
  for (const file of filesBySection('locations')) {
    const value = file.parsed.value;
    if (!isRecord(value) || typeof value['id'] !== 'string') continue;
    const pos: FilePos = { file: file.parsed.file, contents: file.parsed.contents, lineCounter: file.parsed.lineCounter };
    locationOccurrences.push({
      key: value['id'],
      file: pos.file,
      contents: pos.contents,
      lineCounter: pos.lineCounter,
      keyPath: ['id'],
    });
    if (translationLocations.has(value['id'])) continue;
    const connections: { to: string; toPath: (string | number)[]; labelPath: (string | number)[]; hasLabel: boolean }[] = [];
    const raw = value['connections'];
    if (Array.isArray(raw)) {
      raw.forEach((connection, connectionIndex) => {
        if (isRecord(connection) && typeof connection['to'] === 'string') {
          connections.push({
            to: connection['to'],
            toPath: ['connections', connectionIndex, 'to'],
            labelPath: ['connections', connectionIndex, 'label'],
            hasLabel: typeof connection['label'] === 'string',
          });
        }
      });
    }
    translationLocations.set(value['id'], { file, connections });
  }
  // First occurrences always match: the returned set is intentionally unused.
  checkDuplicateEntries(locationOccurrences, 'location', push);
  // Connection duplicates are per Location, keyed by `to`. The returned
  // sets are not used for matching: first occurrences always match, so a
  // duplicated key contributes only translation/duplicate-entry.
  for (const [id, entry] of translationLocations) {
    const pos: FilePos = {
      file: entry.file.parsed.file,
      contents: entry.file.parsed.contents,
      lineCounter: entry.file.parsed.lineCounter,
    };
    checkDuplicateEntries(
      entry.connections.map((connection) => ({
        key: connection.to,
        file: pos.file,
        contents: pos.contents,
        lineCounter: pos.lineCounter,
        keyPath: connection.toPath,
      })),
      `connection of location "${id}"`,
      push,
    );
  }
  for (const [id, baseLocation] of base.locations) {
    // First occurrences match even when duplicated: duplicates contribute
    // only translation/duplicate-entry, never a spurious missing-text.
    const entry = translationLocations.get(id);
    if (!entry) {
      missingAtBase(baseLocation.pos, baseLocation.idPath, `translation is missing location "${id}" ("name")`);
      missingAtBase(baseLocation.pos, baseLocation.idPath, `translation is missing location "${id}" ("description")`);
      for (const [to, hasLabel] of baseLocation.labels) {
        if (hasLabel) {
          missingAtBase(
            baseLocation.pos,
            baseLocation.idPath,
            `translation is missing the label of connection to "${to}" in location "${id}"`,
          );
        }
      }
      continue;
    }
    const entryPos: FilePos = {
      file: entry.file.parsed.file,
      contents: entry.file.parsed.contents,
      lineCounter: entry.file.parsed.lineCounter,
    };
    for (const [to, hasLabel] of baseLocation.labels) {
      const translated = entry.connections.find((connection) => connection.to === to);
      if (hasLabel && (!translated || !translated.hasLabel)) {
        missingAtBase(
          baseLocation.pos,
          baseLocation.idPath,
          `translation is missing the label of connection to "${to}" in location "${id}"`,
        );
      }
    }
    const processedTo = new Set<string>();
    for (const connection of entry.connections) {
      // First occurrence per `to` matches; later duplicates are already
      // reported as translation/duplicate-entry above.
      if (processedTo.has(connection.to)) continue;
      processedTo.add(connection.to);
      const baseHasLabel = baseLocation.labels.get(connection.to);
      if (baseHasLabel === undefined) {
        unmatchedAt(entryPos, connection.toPath, `translation has connection to "${connection.to}" with no base counterpart in location "${id}"`);
      } else if (!baseHasLabel && connection.hasLabel) {
        unmatchedAt(entryPos, connection.labelPath, `translation has a label for connection to "${connection.to}" the base omits in location "${id}"`);
      }
    }
  }
  for (const [id] of translationLocations) {
    if (base.locations.has(id)) continue;
    const entry = translationLocations.get(id);
    if (!entry) continue;
    const entryPos: FilePos = {
      file: entry.file.parsed.file,
      contents: entry.file.parsed.contents,
      lineCounter: entry.file.parsed.lineCounter,
    };
    unmatchedAt(entryPos, ['id'], `translation has location "${id}" with no base counterpart`);
  }

  // ---- Scenes (id; Choices by id; Outcomes by base nesting). ----
  type TranslationChoiceInfo = {
    idPath: (string | number)[];
    outcome: boolean;
    outcomeText: boolean;
    outcomePath: (string | number)[];
    outcomeTextPath: (string | number)[];
    test: boolean;
    testPath: (string | number)[];
    successText: boolean;
    successTextPath: (string | number)[];
    failureText: boolean;
    failureTextPath: (string | number)[];
  };
  const sceneOccurrences: Occurrence[] = [];
  const translationScenes = new Map<string, { file: LoadedTranslationFile; choices: Map<string, TranslationChoiceInfo>; choiceOrder: string[] }>();
  for (const file of filesBySection('scenes')) {
    const value = file.parsed.value;
    if (!isRecord(value) || typeof value['id'] !== 'string') continue;
    sceneOccurrences.push({
      key: value['id'],
      file: file.parsed.file,
      contents: file.parsed.contents,
      lineCounter: file.parsed.lineCounter,
      keyPath: ['id'],
    });
    if (translationScenes.has(value['id'])) continue;
    const choices = new Map<string, TranslationChoiceInfo>();
    const choiceOrder: string[] = [];
    const raw = value['choices'];
    if (Array.isArray(raw)) {
      raw.forEach((choice, choiceIndex) => {
        if (!isRecord(choice) || typeof choice['id'] !== 'string') return;
        const basePath: (string | number)[] = ['choices', choiceIndex];
        const outcome = isRecord(choice['outcome']) ? choice['outcome'] : undefined;
        const test = isRecord(choice['test']) ? choice['test'] : undefined;
        const success = test && isRecord(test['success']) ? test['success'] : undefined;
        const failure = test && isRecord(test['failure']) ? test['failure'] : undefined;
        if (!choices.has(choice['id'])) {
          choiceOrder.push(choice['id']);
          choices.set(choice['id'], {
            idPath: [...basePath, 'id'],
            outcome: outcome !== undefined,
            outcomeText: outcome !== undefined && typeof outcome['text'] === 'string',
            outcomePath: [...basePath, 'outcome'],
            outcomeTextPath: [...basePath, 'outcome', 'text'],
            test: test !== undefined,
            testPath: [...basePath, 'test'],
            successText: success !== undefined && typeof success['text'] === 'string',
            successTextPath: [...basePath, 'test', 'success', 'text'],
            failureText: failure !== undefined && typeof failure['text'] === 'string',
            failureTextPath: [...basePath, 'test', 'failure', 'text'],
          });
        } else {
          choiceOrder.push(choice['id']);
        }
      });
    }
    translationScenes.set(value['id'], { file, choices, choiceOrder });
  }
  // First occurrences always match: the returned sets are intentionally unused.
  checkDuplicateEntries(sceneOccurrences, 'scene', push);
  // Choice duplicates live within their Scene.
  for (const [id, entry] of translationScenes) {
    const pos: FilePos = {
      file: entry.file.parsed.file,
      contents: entry.file.parsed.contents,
      lineCounter: entry.file.parsed.lineCounter,
    };
    // Every occurrence located by its own index, for a precise range.
    const raw = isRecord(entry.file.parsed.value) ? entry.file.parsed.value['choices'] : undefined;
    const occurrences: Occurrence[] = [];
    if (Array.isArray(raw)) {
      raw.forEach((choice, choiceIndex) => {
        if (isRecord(choice) && typeof choice['id'] === 'string') {
          occurrences.push({
            key: choice['id'],
            file: pos.file,
            contents: pos.contents,
            lineCounter: pos.lineCounter,
            keyPath: ['choices', choiceIndex, 'id'],
          });
        }
      });
    }
    checkDuplicateEntries(occurrences, `choice of scene "${id}"`, push);
  }

  const checkOutcomeTextPair = (
    basePos: FilePos,
    baseIdPath: (string | number)[],
    transPos: FilePos,
    baseHasText: boolean,
    transHasText: boolean,
    textPath: (string | number)[],
    describe: string,
  ): void => {
    if (baseHasText && !transHasText) {
      missingAtBase(basePos, baseIdPath, `translation is missing ${describe}`);
    } else if (!baseHasText && transHasText) {
      unmatchedAt(transPos, textPath, `translation has ${describe} the base omits`);
    }
  };

  for (const [id, baseScene] of base.scenes) {
    const entry = translationScenes.get(id);
    if (!entry) {
      missingAtBase(baseScene.pos, baseScene.idPath, `translation is missing scene "${id}" ("title")`);
      missingAtBase(baseScene.pos, baseScene.idPath, `translation is missing scene "${id}" ("text")`);
      for (const [choiceId, choice] of baseScene.choices) {
        missingAtBase(baseScene.pos, baseScene.idPath, `translation is missing choice "${choiceId}" ("text") in scene "${id}"`);
        if (choice.outcomeText) {
          missingAtBase(baseScene.pos, baseScene.idPath, `translation is missing the outcome text of choice "${choiceId}" in scene "${id}"`);
        }
        if (choice.successText) {
          missingAtBase(baseScene.pos, baseScene.idPath, `translation is missing the success text of choice "${choiceId}" in scene "${id}"`);
        }
        if (choice.failureText) {
          missingAtBase(baseScene.pos, baseScene.idPath, `translation is missing the failure text of choice "${choiceId}" in scene "${id}"`);
        }
      }
      continue;
    }
    const entryPos: FilePos = {
      file: entry.file.parsed.file,
      contents: entry.file.parsed.contents,
      lineCounter: entry.file.parsed.lineCounter,
    };
    for (const [choiceId, choice] of baseScene.choices) {
      const translated = entry.choices.get(choiceId);
      if (!translated) {
        missingAtBase(baseScene.pos, baseScene.idPath, `translation is missing choice "${choiceId}" ("text") in scene "${id}"`);
        if (choice.outcomeText) {
          missingAtBase(baseScene.pos, baseScene.idPath, `translation is missing the outcome text of choice "${choiceId}" in scene "${id}"`);
        }
        if (choice.successText) {
          missingAtBase(baseScene.pos, baseScene.idPath, `translation is missing the success text of choice "${choiceId}" in scene "${id}"`);
        }
        if (choice.failureText) {
          missingAtBase(baseScene.pos, baseScene.idPath, `translation is missing the failure text of choice "${choiceId}" in scene "${id}"`);
        }
        continue;
      }
      if (translated.outcome && !choice.outcome) {
        unmatchedAt(entryPos, translated.outcomePath, `translation has an "outcome" branch for choice "${choiceId}" the base does not have in scene "${id}"`);
      } else if (translated.outcome && choice.outcome) {
        checkOutcomeTextPair(
          baseScene.pos,
          baseScene.idPath,
          entryPos,
          choice.outcomeText,
          translated.outcomeText,
          translated.outcomeTextPath,
          `the outcome text of choice "${choiceId}" in scene "${id}"`,
        );
      }
      if (translated.test && !choice.test) {
        unmatchedAt(entryPos, translated.testPath, `translation has a "test" branch for choice "${choiceId}" the base does not have in scene "${id}"`);
      } else if (translated.test && choice.test) {
        checkOutcomeTextPair(
          baseScene.pos,
          baseScene.idPath,
          entryPos,
          choice.successText,
          translated.successText,
          translated.successTextPath,
          `the success text of choice "${choiceId}" in scene "${id}"`,
        );
        checkOutcomeTextPair(
          baseScene.pos,
          baseScene.idPath,
          entryPos,
          choice.failureText,
          translated.failureText,
          translated.failureTextPath,
          `the failure text of choice "${choiceId}" in scene "${id}"`,
        );
      }
    }
    for (const [choiceId, info] of entry.choices) {
      if (baseScene.choices.has(choiceId)) continue;
      unmatchedAt(entryPos, info.idPath, `translation has choice "${choiceId}" with no base counterpart in scene "${id}"`);
    }
  }
  for (const [id, entry] of translationScenes) {
    if (base.scenes.has(id)) continue;
    const entryPos: FilePos = {
      file: entry.file.parsed.file,
      contents: entry.file.parsed.contents,
      lineCounter: entry.file.parsed.lineCounter,
    };
    unmatchedAt(entryPos, ['id'], `translation has scene "${id}" with no base counterpart`);
  }

  // ---- Catalogs with name + optional description. ----
  const checkNamedCatalog = (
    section: TranslationSection,
    kind: string,
    baseEntries: BaseIndex['items'],
    field: string,
  ): void => {
    const occurrences: Occurrence[] = [];
    const translated = new Map<string, { file: LoadedTranslationFile; index: number; hasDescription: boolean }>();
    for (const file of filesBySection(section)) {
      const value = file.parsed.value;
      if (!Array.isArray(value)) continue;
      value.forEach((item, itemIndex) => {
        if (!isRecord(item) || typeof item['id'] !== 'string') return;
        occurrences.push({
          key: item['id'],
          file: file.parsed.file,
          contents: file.parsed.contents,
          lineCounter: file.parsed.lineCounter,
          keyPath: [itemIndex, 'id'],
        });
        if (!translated.has(item['id'])) {
          translated.set(item['id'], {
            file,
            index: itemIndex,
            hasDescription: typeof item['description'] === 'string',
          });
        }
      });
    }
    // First occurrences always match: the returned set is intentionally unused.
    checkDuplicateEntries(occurrences, kind, push);
    for (const [id, baseEntry] of baseEntries) {
      const match = translated.get(id);
      if (!match) {
        missingAtBase(baseEntry.pos, baseEntry.idPath, `translation is missing ${kind} "${id}" ("${field}")`);
        if (baseEntry.hasDescription) {
          missingAtBase(baseEntry.pos, baseEntry.idPath, `translation is missing ${kind} "${id}" ("description")`);
        }
        continue;
      }
      const transPos: FilePos = {
        file: match.file.parsed.file,
        contents: match.file.parsed.contents,
        lineCounter: match.file.parsed.lineCounter,
      };
      if (baseEntry.hasDescription && !match.hasDescription) {
        missingAtBase(baseEntry.pos, baseEntry.idPath, `translation is missing ${kind} "${id}" ("description")`);
      } else if (!baseEntry.hasDescription && match.hasDescription) {
        unmatchedAt(transPos, [match.index, 'description'], `translation has "description" for ${kind} "${id}" the base omits`);
      }
    }
    for (const [id, match] of translated) {
      if (baseEntries.has(id)) continue;
      const transPos: FilePos = {
        file: match.file.parsed.file,
        contents: match.file.parsed.contents,
        lineCounter: match.file.parsed.lineCounter,
      };
      unmatchedAt(transPos, [match.index, 'id'], `translation has ${kind} "${id}" with no base counterpart`);
    }
  };
  checkNamedCatalog('items', 'item', base.items, 'name');
  checkNamedCatalog('enemies', 'enemy', base.enemies, 'name');
  checkNamedCatalog('templates', 'template', base.templates, 'name');

  // ---- Encounters (text; victory/escape Outcomes by base nesting). ----
  {
    const occurrences: Occurrence[] = [];
    const translated = new Map<
      string,
      {
        file: LoadedTranslationFile;
        index: number;
        victory: boolean;
        victoryText: boolean;
        victoryPath: (string | number)[];
        victoryTextPath: (string | number)[];
        escapeText: boolean;
        escapeTextPath: (string | number)[];
      }
    >();
    for (const file of filesBySection('encounters')) {
      const value = file.parsed.value;
      if (!Array.isArray(value)) continue;
      value.forEach((item, itemIndex) => {
        if (!isRecord(item) || typeof item['id'] !== 'string') return;
        occurrences.push({
          key: item['id'],
          file: file.parsed.file,
          contents: file.parsed.contents,
          lineCounter: file.parsed.lineCounter,
          keyPath: [itemIndex, 'id'],
        });
        if (translated.has(item['id'])) return;
        const victory = isRecord(item['victory']) ? item['victory'] : undefined;
        translated.set(item['id'], {
          file,
          index: itemIndex,
          victory: victory !== undefined,
          victoryText: victory !== undefined && typeof victory['text'] === 'string',
          victoryPath: [itemIndex, 'victory'],
          victoryTextPath: [itemIndex, 'victory', 'text'],
          escapeText: isRecord(item['escape']) && typeof item['escape']['text'] === 'string',
          escapeTextPath: [itemIndex, 'escape', 'text'],
        });
      });
    }
    // First occurrences always match: the returned set is intentionally unused.
    checkDuplicateEntries(occurrences, 'encounter', push);
    for (const [id, baseEntry] of base.encounters) {
      const match = translated.get(id);
      if (!match) {
        missingAtBase(baseEntry.pos, baseEntry.idPath, `translation is missing encounter "${id}" ("text")`);
        if (baseEntry.victoryText) {
          missingAtBase(baseEntry.pos, baseEntry.idPath, `translation is missing the victory text of encounter "${id}"`);
        }
        if (baseEntry.escapeText) {
          missingAtBase(baseEntry.pos, baseEntry.idPath, `translation is missing the escape text of encounter "${id}"`);
        }
        continue;
      }
      const transPos: FilePos = {
        file: match.file.parsed.file,
        contents: match.file.parsed.contents,
        lineCounter: match.file.parsed.lineCounter,
      };
      if (match.victory && !baseEntry.victory) {
        unmatchedAt(transPos, match.victoryPath, `translation has a "victory" branch for encounter "${id}" the base does not have`);
      } else if (match.victory && baseEntry.victory) {
        checkOutcomeTextPair(
          baseEntry.pos,
          baseEntry.idPath,
          transPos,
          baseEntry.victoryText,
          match.victoryText,
          match.victoryTextPath,
          `the victory text of encounter "${id}"`,
        );
      }
      checkOutcomeTextPair(
        baseEntry.pos,
        baseEntry.idPath,
        transPos,
        baseEntry.escapeText,
        match.escapeText,
        match.escapeTextPath,
        `the escape text of encounter "${id}"`,
      );
    }
    for (const [id, match] of translated) {
      if (base.encounters.has(id)) continue;
      const transPos: FilePos = {
        file: match.file.parsed.file,
        contents: match.file.parsed.contents,
        lineCounter: match.file.parsed.lineCounter,
      };
      unmatchedAt(transPos, [match.index, 'id'], `translation has encounter "${id}" with no base counterpart`);
    }
  }

  // ---- Endings (title, text) and images (alt): all required. ----
  const checkRequiredCatalog = (section: TranslationSection, kind: string, baseEntries: BaseIndex['endings'], fields: readonly string[]): void => {
    const occurrences: Occurrence[] = [];
    const translated = new Map<string, { file: LoadedTranslationFile; index: number }>();
    for (const file of filesBySection(section)) {
      const value = file.parsed.value;
      if (!Array.isArray(value)) continue;
      value.forEach((item, itemIndex) => {
        if (!isRecord(item) || typeof item['id'] !== 'string') return;
        occurrences.push({
          key: item['id'],
          file: file.parsed.file,
          contents: file.parsed.contents,
          lineCounter: file.parsed.lineCounter,
          keyPath: [itemIndex, 'id'],
        });
        if (!translated.has(item['id'])) translated.set(item['id'], { file, index: itemIndex });
      });
    }
    // First occurrences always match: the returned set is intentionally unused.
    checkDuplicateEntries(occurrences, kind, push);
    for (const [id, baseEntry] of baseEntries) {
      if (translated.has(id)) continue;
      for (const field of fields) {
        missingAtBase(baseEntry.pos, baseEntry.idPath, `translation is missing ${kind} "${id}" ("${field}")`);
      }
    }
    for (const [id, match] of translated) {
      if (baseEntries.has(id)) continue;
      const transPos: FilePos = {
        file: match.file.parsed.file,
        contents: match.file.parsed.contents,
        lineCounter: match.file.parsed.lineCounter,
      };
      unmatchedAt(transPos, [match.index, 'id'], `translation has ${kind} "${id}" with no base counterpart`);
    }
  };
  checkRequiredCatalog('endings', 'ending', base.endings, ['title', 'text']);
  checkRequiredCatalog('images', 'image', base.images, ['alt']);

  // ---- Language tags. ----
  const language = manifestValue['language'];
  if (validLanguageTag(language) && validLanguageTag(base.manifest.language)) {
    if (primaryLanguageSubtag(language) === primaryLanguageSubtag(base.manifest.language)) {
      push({
        severity: 'error',
        code: 'translation/base-language',
        message: `translation language "${language}" shares its primary language subtag ("${primaryLanguageSubtag(language)}") with the base language "${base.manifest.language}"`,
        file: manifestPos.file,
        range: rangeIn(manifestPos, ['language']),
        path: ['language'],
      });
    }
    if (!(INTERFACE_LANGUAGES as readonly string[]).includes(primaryLanguageSubtag(language))) {
      push({
        severity: 'warning',
        code: 'translation/not-interface-language',
        message: `translation language "${language}" (primary subtag "${primaryLanguageSubtag(language)}") is not an interface language (${INTERFACE_LANGUAGES.join(', ')}); it is valid but never shown`,
        file: manifestPos.file,
        range: rangeIn(manifestPos, ['language']),
        path: ['language'],
      });
    }
  }

  // ---- Staleness: plain string comparison, no ordering, no semver. ----
  const baseVersion = manifestValue['baseVersion'];
  if (typeof baseVersion === 'string' && baseVersion !== base.manifest.version) {
    push({
      severity: 'warning',
      code: 'translation/stale',
      message: `translation baseVersion "${baseVersion}" differs from the base version "${base.manifest.version}"`,
      file: manifestPos.file,
      range: rangeIn(manifestPos, ['baseVersion']),
      path: ['baseVersion'],
    });
  }
}

/**
 * translation/duplicate-language: two Translations sharing a primary language
 * subtag. Both are rejected, since neither has precedence; each names the
 * other in `related`. Every Translation whose manifest declares a valid
 * `language` counts, even one rejected by another rule.
 */
function checkDuplicateLanguages(
  candidates: { manifestPath: string; manifest: ParsedFile; language: string }[],
  pushFor: (manifestPath: string) => (diagnostic: Diagnostic) => void,
): void {
  const groups = new Map<string, { manifestPath: string; manifest: ParsedFile; language: string }[]>();
  for (const candidate of candidates) {
    const key = primaryLanguageSubtag(candidate.language);
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }
  for (const [primary, group] of groups) {
    if (group.length < 2) continue;
    for (const candidate of group) {
      const push = pushFor(candidate.manifestPath);
      const languageRange = nodeRange(
        nodeAtPath(candidate.manifest.contents, ['language']),
        candidate.manifest.lineCounter,
      );
      push({
        severity: 'error',
        code: 'translation/duplicate-language',
        message: `two translations share primary language subtag "${primary}"`,
        file: candidate.manifestPath,
        range: languageRange,
        path: ['language'],
        related: group
          .filter((other) => other.manifestPath !== candidate.manifestPath)
          .map((other) => ({
            file: other.manifestPath,
            range: nodeRange(nodeAtPath(other.manifest.contents, ['language']), other.manifest.lineCounter),
            message: `other translation with primary subtag "${primary}" here (language "${other.language}")`,
          })),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Pipeline entry points.
// ---------------------------------------------------------------------------

export type TranslationManifestRef = {
  /** Normalized manifest path, relative to the Scenario directory. */
  manifestPath: string;
  /** Range of the `translations` entry in scenario.yaml, for path diagnostics. */
  range: DiagnosticRange | undefined;
};

function readLanguage(value: unknown): string | undefined {
  if (isRecord(value) && typeof value['language'] === 'string') return value['language'];
  return undefined;
}

/**
 * Run stage T1 for one Translation: load its manifest and every file it
 * lists. Returns the loaded package, or the stage's diagnostics when it
 * produced errors. Duplicate-file detection across the whole package runs
 * centrally (see `checkPackageWideDuplicates`); this stage only loads.
 */
function runT1(
  scenarioDir: string,
  ref: TranslationManifestRef,
  push: (diagnostic: Diagnostic) => void,
): LoadedTranslation | undefined {
  const invalidPath = (reason: string): void => {
    push({
      severity: 'error',
      code: 'package/invalid-path',
      message: `listed path "${ref.manifestPath}" ${reason}`,
      file: MANIFEST_FILE,
      range: ref.range,
    });
  };
  if (isAbsolutePath(ref.manifestPath)) {
    invalidPath('is absolute; paths must be relative to the Scenario directory');
    return undefined;
  }
  if (isUrl(ref.manifestPath)) {
    invalidPath('is a URL; paths must be relative to the Scenario directory');
    return undefined;
  }
  if (hasDotDot(ref.manifestPath)) {
    invalidPath('contains ".."; paths must stay inside the Scenario directory');
    return undefined;
  }
  if (!ref.manifestPath.endsWith('.yaml')) {
    invalidPath('lacks the .yaml extension');
  }

  const full = path.join(scenarioDir, ref.manifestPath);
  let stat: fs.Stats | undefined;
  try {
    stat = fs.lstatSync(full);
  } catch {
    stat = undefined;
  }
  if (!stat || stat.isDirectory() || symlinkEscapesDir(scenarioDir, ref.manifestPath)) {
    if (stat && !stat.isDirectory() && symlinkEscapesDir(scenarioDir, ref.manifestPath)) {
      invalidPath('is a symlink resolving outside the Scenario directory');
      return undefined;
    }
    push({
      severity: 'error',
      code: 'package/missing-file',
      message: `listed file "${ref.manifestPath}" is missing or unreadable`,
      file: MANIFEST_FILE,
      range: ref.range,
    });
    return undefined;
  }

  let manifestBytes: Buffer;
  try {
    manifestBytes = fs.readFileSync(full);
  } catch {
    push({
      severity: 'error',
      code: 'package/missing-file',
      message: `listed file "${ref.manifestPath}" is missing or unreadable`,
      file: MANIFEST_FILE,
      range: ref.range,
    });
    return undefined;
  }

  const parsed = parseYamlText(manifestBytes.toString('utf8'), ref.manifestPath, push);
  const doc = parsed.docs[0];
  let value: unknown;
  try {
    value = doc?.toJS();
  } catch {
    value = undefined;
  }
  const manifest: ParsedFile = {
    section: 'manifest',
    file: ref.manifestPath,
    value,
    contents: doc?.contents,
    lineCounter: parsed.lineCounter,
  };
  const listed = collectTranslationSections(doc?.contents, parsed.lineCounter, ref.manifestPath, push);

  const files: LoadedTranslationFile[] = [];
  const fileBytes = new Map<string, Buffer>();
  fileBytes.set(ref.manifestPath, manifestBytes);
  for (const entry of listed) {
    const loaded = checkTranslationListedFile(scenarioDir, ref.manifestPath, entry, push);
    if (loaded) {
      files.push({ section: entry.section, manifestPath: ref.manifestPath, parsed: loaded.parsed, bytes: loaded.bytes });
      fileBytes.set(entry.value, loaded.bytes);
    }
  }
  return { manifestPath: ref.manifestPath, manifest, files, manifestBytes, fileBytes, language: readLanguage(value) };
}

type OwnerEntry = {
  /** The Translation manifest owning this listing, or undefined for the base. */
  owner: string | undefined;
  /** The manifest file where the path is listed. */
  file: string;
  range: DiagnosticRange | undefined;
  /** The listed value, for messages. */
  value: string;
  section: string;
};

/**
 * Stage T1 (rest): `package/duplicate-file` covers the whole package. A
 * Translation that lists a base file is rejected; when two Translations list
 * the same file, both are rejected. Base-internal duplicates were already
 * reported by the base pipeline, so only Translation-involved groups emit
 * here, each tagged with its Translation.
 */
export function checkPackageWideDuplicates(
  baseEntries: { value: string; range: DiagnosticRange | undefined; section: string }[],
  refs: TranslationManifestRef[],
  loaded: LoadedTranslation[],
  pushFor: (manifestPath: string) => (diagnostic: Diagnostic) => void,
): void {
  const byPath = new Map<string, OwnerEntry[]>();
  const add = (value: string, entry: OwnerEntry): void => {
    const key = normalizeListedPath(value);
    const group = byPath.get(key);
    if (group) group.push(entry);
    else byPath.set(key, [entry]);
  };
  add(MANIFEST_FILE, { owner: undefined, file: MANIFEST_FILE, range: undefined, value: MANIFEST_FILE, section: 'manifest' });
  for (const entry of baseEntries) {
    add(entry.value, { owner: undefined, file: MANIFEST_FILE, range: entry.range, value: entry.value, section: entry.section });
  }
  const refByPath = new Map(refs.map((ref) => [normalizeListedPath(ref.manifestPath), ref]));
  for (const translation of loaded) {
    const ref = refByPath.get(normalizeListedPath(translation.manifestPath));
    add(translation.manifestPath, {
      owner: translation.manifestPath,
      file: MANIFEST_FILE,
      range: ref?.range,
      value: translation.manifestPath,
      section: 'translations',
    });
    // The Translation's own listed entries, re-derived from its manifest nodes
    // so ranges point at the listing.
    for (const section of TRANSLATION_SECTIONS) {
      const pair = findPair(translation.manifest.contents, section);
      if (!pair || !isSeq(pair.value)) continue;
      for (const item of pair.value.items) {
        if (isScalar(item) && typeof item.value === 'string') {
          add(item.value, {
            owner: translation.manifestPath,
            file: translation.manifestPath,
            range: nodeRange(item, translation.manifest.lineCounter),
            value: item.value,
            section,
          });
        }
      }
    }
  }

  for (const group of byPath.values()) {
    if (group.length < 2) continue;
    const [first] = group as [OwnerEntry, ...OwnerEntry[]];
    // Every Translation owning a listing in a duplicated group is rejected:
    // one that lists a base file, two that share a file, or one that lists a
    // file twice all land here. (A group owned by the base alone was already
    // reported by the base pipeline.)
    const involved = new Set<string>();
    for (const entry of group) {
      if (entry.owner !== undefined) involved.add(entry.owner);
    }
    for (const manifestPath of involved) {
      const own = group.find((entry) => entry.owner === manifestPath);
      const push = pushFor(manifestPath);
      push({
        severity: 'error',
        code: 'package/duplicate-file',
        message: `file "${own?.value ?? manifestPath}" is listed more than once`,
        file: own?.file ?? manifestPath,
        range: own?.range,
        related:
          first.range === undefined
            ? undefined
            : [
                {
                  file: first.file,
                  range: first.range,
                  message:
                    first.owner === manifestPath
                      ? 'first listed here'
                      : first.owner === undefined
                        ? `first listed here (in base "${first.section}")`
                        : 'first listed here',
                },
              ],
      });
    }
  }
}

/**
 * Run every listed Translation's own pipeline (T1 then T2). Translations whose
 * stage produced any error are rejected with their diagnostics; the rest load.
 * Warnings from accepted Translations are returned separately (warnings never
 * reject, but they still reach the CLI and the startup logs). `contents`
 * covers every Translation T1 managed to read — accepted or rejected, in
 * listing order — so the content hash and the dev watch list cover the
 * rejected ones too.
 */
export function runTranslationPipelines(
  scenarioDir: string,
  refs: TranslationManifestRef[],
  baseEntries: { value: string; range: DiagnosticRange | undefined; section: string }[],
  base: { manifest: ParsedFile; files: ParsedFile[] },
): {
  accepted: LoadedTranslation[];
  rejected: { manifestPath: string; language?: string; diagnostics: Diagnostic[] }[];
  acceptedWarnings: Diagnostic[];
  contents: RejectedTranslationContent[];
} {
  const accepted: LoadedTranslation[] = [];
  const rejected: { manifestPath: string; language?: string; diagnostics: Diagnostic[] }[] = [];
  const acceptedWarnings: Diagnostic[] = [];
  const t1Loaded: LoadedTranslation[] = [];
  const t1Diagnostics = new Map<string, Diagnostic[]>();
  // Every manifest T1 managed to read, even one rejected by a T1 error:
  // translation/duplicate-language counts those too.
  const t1Read: LoadedTranslation[] = [];

  for (const ref of refs) {
    const diagnostics: Diagnostic[] = [];
    const push = (diagnostic: Diagnostic): void => {
      diagnostics.push({ ...diagnostic, translation: ref.manifestPath });
    };
    const loaded = runT1(scenarioDir, ref, push);
    if (loaded !== undefined && !t1Read.some((known) => known.manifestPath === loaded.manifestPath)) {
      t1Read.push(loaded);
    }
    if (loaded === undefined || diagnostics.some((d) => d.severity === 'error')) {
      rejected.push({ manifestPath: ref.manifestPath, language: loaded?.language, diagnostics });
    } else {
      t1Loaded.push(loaded);
      t1Diagnostics.set(ref.manifestPath, diagnostics);
    }
  }

  // Whole-package duplicate-file detection across the base and every T1-clean
  // Translation. A Translation involved in a duplicate is rejected; its T2
  // never runs.
  const dupPushes = new Map<string, Diagnostic[]>();
  checkPackageWideDuplicates(baseEntries, refs, t1Loaded, (manifestPath) => (diagnostic: Diagnostic) => {
    let group = dupPushes.get(manifestPath);
    if (!group) {
      group = [];
      dupPushes.set(manifestPath, group);
    }
    group.push({ ...diagnostic, translation: manifestPath });
  });

  const t2Candidates: LoadedTranslation[] = [];
  for (const loaded of t1Loaded) {
    const extra = dupPushes.get(loaded.manifestPath) ?? [];
    if (extra.length > 0) {
      rejected.push({
        manifestPath: loaded.manifestPath,
        language: loaded.language,
        diagnostics: [...(t1Diagnostics.get(loaded.manifestPath) ?? []), ...extra],
      });
    } else {
      t2Candidates.push(loaded);
    }
  }

  const t3Base = buildBaseIndex(base.manifest, base.files);
  const fullDiagnostics = new Map<string, Diagnostic[]>();
  for (const loaded of t2Candidates) {
    const diagnostics: Diagnostic[] = [...(t1Diagnostics.get(loaded.manifestPath) ?? [])];
    const push = (diagnostic: Diagnostic): void => {
      diagnostics.push({ ...diagnostic, translation: loaded.manifestPath });
    };
    runTranslationStructure(loaded, push);
    if (!diagnostics.some((d) => d.severity === 'error')) {
      runT3(loaded, t3Base, push);
    }
    if (diagnostics.some((d) => d.severity === 'error')) {
      rejected.push({ manifestPath: loaded.manifestPath, language: loaded.language, diagnostics });
    } else {
      // The manifest's `language` may itself be invalid (a T2 error rejects
      // above); refresh it from the parsed value for the summary line.
      loaded.language = readLanguage(loaded.manifest.value) ?? loaded.language;
      accepted.push(loaded);
      fullDiagnostics.set(loaded.manifestPath, diagnostics);
    }
  }

  // translation/duplicate-language runs across every Translation whose
  // manifest declares a valid `language`, even one rejected by another rule
  // (hence t1Read, not just the T1-clean t1Loaded).
  const languageCandidates = t1Read
    .map((loaded) => ({
      manifestPath: loaded.manifestPath,
      manifest: loaded.manifest,
      language: readLanguage(loaded.manifest.value),
    }))
    .filter((candidate): candidate is { manifestPath: string; manifest: ParsedFile; language: string } =>
      candidate.language !== undefined && validLanguageTag(candidate.language),
    );
  checkDuplicateLanguages(
    languageCandidates,
    (manifestPath) => (diagnostic: Diagnostic) => {
      const tagged = { ...diagnostic, translation: manifestPath };
      const acceptedIndex = accepted.findIndex((loaded) => loaded.manifestPath === manifestPath);
      if (acceptedIndex >= 0) {
        const [loaded] = accepted.splice(acceptedIndex, 1);
        const full = [...(fullDiagnostics.get(manifestPath) ?? []), tagged];
        fullDiagnostics.delete(manifestPath);
        rejected.push({ manifestPath, language: loaded?.language, diagnostics: full });
        return;
      }
      const already = rejected.find((entry) => entry.manifestPath === manifestPath);
      if (already) already.diagnostics.push(tagged);
    },
  );
  for (const loaded of accepted) {
    acceptedWarnings.push(
      ...(fullDiagnostics.get(loaded.manifestPath) ?? []).filter((d) => d.severity === 'warning'),
    );
  }
  const contents: RejectedTranslationContent[] = [];
  for (const ref of refs) {
    const loaded = t1Read.find((candidate) => candidate.manifestPath === ref.manifestPath);
    if (loaded !== undefined && !contents.some((known) => known.manifestPath === loaded.manifestPath)) {
      contents.push({
        manifestPath: loaded.manifestPath,
        manifestBytes: loaded.manifestBytes,
        listedPaths: loaded.files.map((file) => file.parsed.file),
        fileBytes: loaded.fileBytes,
      });
    }
  }
  return { accepted, rejected, acceptedWarnings, contents };
}

/**
 * Compile an accepted Translation's text, keyed for a later overlay ticket.
 * Call only when the Translation's pipeline produced no errors; every value
 * below parses because T2 proved its shape. Mechanics stay in the base only.
 */
export function compileTranslation(loaded: LoadedTranslation): CompiledTranslation {
  const manifest = TranslationManifestSchema.parse(loaded.manifest.value) as {
    language: string;
    baseVersion: string;
    translator?: string;
    title: string;
    description: string;
    intro?: string;
  };
  const filesBySection = (section: TranslationSection): unknown[] =>
    loaded.files.filter((file) => file.section === section).map((file) => file.parsed.value);

  const parseLocation = (value: unknown): TranslationLocationText => {
    const parsed = TranslationLocationSchema.parse(value) as {
      id: string;
      name: string;
      description: string;
      connections: { to: string; label?: string }[];
    };
    return { id: parsed.id, name: parsed.name, description: parsed.description, connections: parsed.connections };
  };
  const parseOutcome = (value: { text?: string }): TranslationOutcomeText =>
    value.text === undefined ? {} : { text: value.text };
  const parseChoice = (value: {
    id: string;
    text: string;
    outcome?: { text?: string };
    test?: { success: { text?: string }; failure: { text?: string } };
  }): TranslationChoiceText => ({
    id: value.id,
    text: value.text,
    outcome: value.outcome === undefined ? undefined : parseOutcome(value.outcome),
    test:
      value.test === undefined
        ? undefined
        : { success: parseOutcome(value.test.success), failure: parseOutcome(value.test.failure) },
  });
  const parseScene = (value: unknown): TranslationSceneText => {
    const parsed = TranslationSceneSchema.parse(value) as {
      id: string;
      title: string;
      text: string;
      choices: { id: string; text: string; outcome?: { text?: string }; test?: { success: { text?: string }; failure: { text?: string } } }[];
    };
    return { id: parsed.id, title: parsed.title, text: parsed.text, choices: parsed.choices.map(parseChoice) };
  };
  const parseNamedCatalog = (
    schema: z.ZodTypeAny,
    values: unknown[],
  ): TranslationNamedText[] =>
    values.flatMap(
      (value) =>
        schema.parse(value) as { id: string; name: string; description?: string }[],
    );
  const parseEncounterCatalog = (values: unknown[]): TranslationEncounterText[] =>
    values.flatMap(
      (value) =>
        (TranslationEncountersCatalogSchema.parse(value) as {
          id: string;
          text: string;
          victory?: { text?: string };
          escape: { text?: string };
        }[]).map((entry) => ({
          id: entry.id,
          text: entry.text,
          victory: entry.victory === undefined ? undefined : parseOutcome(entry.victory),
          escape: parseOutcome(entry.escape),
        })),
    );
  const parseEndingCatalog = (values: unknown[]): TranslationEndingText[] =>
    values.flatMap(
      (value) => TranslationEndingsCatalogSchema.parse(value) as { id: string; title: string; text: string }[],
    );
  const parseImageCatalog = (values: unknown[]): TranslationImageText[] =>
    values.flatMap(
      (value) => TranslationImagesCatalogSchema.parse(value) as { id: string; alt: string }[],
    );

  const byId = <T extends { id: string }>(entries: T[]): Record<string, T> => Object.fromEntries(entries.map((e) => [e.id, e]));

  return {
    manifestPath: loaded.manifestPath,
    language: manifest.language,
    baseVersion: manifest.baseVersion,
    translator: manifest.translator,
    title: manifest.title,
    description: manifest.description,
    intro: manifest.intro,
    locations: byId(filesBySection('locations').map(parseLocation)),
    scenes: byId(filesBySection('scenes').map(parseScene)),
    items: byId(parseNamedCatalog(TranslationItemsCatalogSchema, filesBySection('items'))),
    enemies: byId(parseNamedCatalog(TranslationEnemiesCatalogSchema, filesBySection('enemies'))),
    encounters: byId(parseEncounterCatalog(filesBySection('encounters'))),
    templates: byId(parseNamedCatalog(TranslationTemplatesCatalogSchema, filesBySection('templates'))),
    endings: byId(parseEndingCatalog(filesBySection('endings'))),
    images: byId(parseImageCatalog(filesBySection('images'))),
  };
}
