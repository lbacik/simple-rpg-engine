// Translation pipelines T1 (Package) and T2 (Structure):
// docs/spec/validation.md, Translations; docs/spec/scenario-format.md,
// Translation files; ADR 0002.
//
// Each Translation listed under the base manifest's `translations` runs its
// own pipeline once the base has passed Integrity (phase 3), independent of
// the other Translations. Any error rejects only that Translation; warnings
// never reject. Every diagnostic of the pipeline carries the Translation's
// manifest path in `translation`.
//
// Stage T3 (Match: completeness, language tags, staleness) is a later ticket;
// this module stops after T2, and the compiled model holds the accepted
// Translations' text keyed for a later overlay.

import fs from 'node:fs';
import path from 'node:path';
import { isMap, isPair, isScalar, isSeq } from 'yaml';
import { z } from 'zod';
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
  runZodCheck,
} from './structure';
import type { Ctx, ManifestSection, ParsedFile } from './structure';
import { nodeRange, parseYamlText } from './yamlFile';
import type {
  CompiledTranslation,
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
 */
export function runTranslationPipelines(
  scenarioDir: string,
  refs: TranslationManifestRef[],
  baseEntries: { value: string; range: DiagnosticRange | undefined; section: string }[],
): { accepted: LoadedTranslation[]; rejected: { manifestPath: string; language?: string; diagnostics: Diagnostic[] }[] } {
  const accepted: LoadedTranslation[] = [];
  const rejected: { manifestPath: string; language?: string; diagnostics: Diagnostic[] }[] = [];
  const t1Loaded: LoadedTranslation[] = [];
  const t1Diagnostics = new Map<string, Diagnostic[]>();

  for (const ref of refs) {
    const diagnostics: Diagnostic[] = [];
    const push = (diagnostic: Diagnostic): void => {
      diagnostics.push({ ...diagnostic, translation: ref.manifestPath });
    };
    const loaded = runT1(scenarioDir, ref, push);
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

  for (const loaded of t2Candidates) {
    const diagnostics: Diagnostic[] = [...(t1Diagnostics.get(loaded.manifestPath) ?? [])];
    const push = (diagnostic: Diagnostic): void => {
      diagnostics.push({ ...diagnostic, translation: loaded.manifestPath });
    };
    runTranslationStructure(loaded, push);
    if (diagnostics.some((d) => d.severity === 'error')) {
      rejected.push({ manifestPath: loaded.manifestPath, language: loaded.language, diagnostics });
    } else {
      // The manifest's `language` may itself be invalid (a T2 error rejects
      // above); refresh it from the parsed value for the summary line.
      loaded.language = readLanguage(loaded.manifest.value) ?? loaded.language;
      accepted.push(loaded);
    }
  }
  return { accepted, rejected };
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
