// Phase 3 (Integrity) validation: docs/spec/validation.md, codes ref/*.
//
// Every check runs over the parsed files once Phase 2 produced no errors, so
// values already have their expected shapes (records, catalog arrays, string
// IDs); the guards below only protect against programmer error, never author
// input. Diagnostics carry the file, the range of the offending YAML node and
// the path within the document; duplicate-ID diagnostics carry the first
// declaration in `related`.

import fs from 'node:fs';
import path from 'node:path';
import type { Diagnostic, DiagnosticRange } from './diagnostic';
import {
  IMAGE_FORMAT_BY_EXTENSION,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
  hashImageBytes,
  inspectImage,
} from './images';
import type { ImageFormat } from './images';
import { hasDotDot, isAbsolutePath, isUrl, normalizeListedPath, symlinkEscapesDir } from './paths';
import { isRecord, nodeAtPath } from './structure';
import type { ManifestSection, ParsedFile } from './structure';
import { nodeRange } from './yamlFile';

type Ctx = {
  push: (diagnostic: Diagnostic) => void;
};

export const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

type Declaration = {
  id: string;
  file: string;
  path: (string | number)[];
  range: DiagnosticRange | undefined;
  /** The parsed contents root and counter of the declaring file. */
  contents: unknown;
  lineCounter: ParsedFile['lineCounter'];
};

function rangeOf(declaration: Declaration): DiagnosticRange | undefined {
  return nodeRange(nodeAtPath(declaration.contents, declaration.path), declaration.lineCounter);
}

function checkIdSyntax(declaration: Declaration, kind: string, ctx: Ctx): void {
  if (ID_PATTERN.test(declaration.id)) return;
  ctx.push({
    severity: 'error',
    code: 'ref/invalid-id',
    message: `invalid ${kind} id "${declaration.id}"; ids must match [a-z][a-z0-9-]*`,
    file: declaration.file,
    range: rangeOf(declaration),
    path: declaration.path,
  });
}

function checkDuplicates(declarations: Declaration[], kind: string, ctx: Ctx): void {
  const seen = new Map<string, Declaration>();
  for (const declaration of declarations) {
    const first = seen.get(declaration.id);
    if (!first) {
      seen.set(declaration.id, declaration);
      continue;
    }
    ctx.push({
      severity: 'error',
      code: 'ref/duplicate-id',
      message: `duplicate ${kind} id "${declaration.id}"`,
      file: declaration.file,
      range: rangeOf(declaration),
      path: declaration.path,
      related: [{ file: first.file, range: first.range, message: 'first declared here' }],
    });
  }
}

/** Every declared entity id, grouped by namespace (content type). */
export type NamespaceDeclarations = {
  locations: Declaration[];
  scenes: Declaration[];
  items: Declaration[];
  enemies: Declaration[];
  encounters: Declaration[];
  templates: Declaration[];
  endings: Declaration[];
  images: Declaration[];
  flags: Declaration[];
};

const CATALOG_NAMESPACES: readonly ManifestSection[] = [
  'items',
  'enemies',
  'encounters',
  'templates',
  'endings',
  'images',
];

function declarationAt(
  file: ParsedFile,
  path: (string | number)[],
  value: unknown,
): Declaration | undefined {
  if (typeof value !== 'string') return undefined;
  return {
    id: value,
    file: file.file,
    path,
    range: nodeRange(nodeAtPath(file.contents, path), file.lineCounter),
    contents: file.contents,
    lineCounter: file.lineCounter,
  };
}

/**
 * Collect every declared ID: entity ids per namespace, manifest flags, and
 * (returned separately) Choice IDs per Scene file.
 */
function collectDeclarations(
  manifest: ParsedFile,
  files: ParsedFile[],
): { namespaces: NamespaceDeclarations; choicesByScene: Map<string, Declaration[]> } {
  const namespaces: NamespaceDeclarations = {
    locations: [],
    scenes: [],
    items: [],
    enemies: [],
    encounters: [],
    templates: [],
    endings: [],
    images: [],
    flags: [],
  };
  const choicesByScene = new Map<string, Declaration[]>();

  const manifestFlags = isRecord(manifest.value) ? manifest.value['flags'] : undefined;
  if (Array.isArray(manifestFlags)) {
    manifestFlags.forEach((flag, index) => {
      const declaration = declarationAt(manifest, ['flags', index], flag);
      if (declaration) namespaces.flags.push(declaration);
    });
  }

  for (const file of files) {
    if (file.section === 'manifest') continue;
    if (file.section === 'locations' || file.section === 'scenes') {
      const id = isRecord(file.value) ? file.value['id'] : undefined;
      const declaration = declarationAt(file, ['id'], id);
      if (declaration) {
        namespaces[file.section].push(declaration);
        if (file.section === 'scenes') {
          const choices = isRecord(file.value) ? file.value['choices'] : undefined;
          if (Array.isArray(choices)) {
            const choiceIds: Declaration[] = [];
            choices.forEach((choice, index) => {
              const choiceId = isRecord(choice) ? choice['id'] : undefined;
              const choiceDeclaration = declarationAt(file, ['choices', index, 'id'], choiceId);
              if (choiceDeclaration) choiceIds.push(choiceDeclaration);
            });
            choicesByScene.set(file.file, choiceIds);
          }
        }
      }
      continue;
    }
    if ((CATALOG_NAMESPACES as readonly string[]).includes(file.section) && Array.isArray(file.value)) {
      file.value.forEach((entry, index) => {
        const id = isRecord(entry) ? entry['id'] : undefined;
        const declaration = declarationAt(file, [index, 'id'], id);
        if (declaration) namespaces[file.section as ManifestSection].push(declaration);
      });
    }
  }
  return { namespaces, choicesByScene };
}

function checkChoiceDuplicates(choices: Declaration[], ctx: Ctx): void {
  const seen = new Map<string, Declaration>();
  for (const declaration of choices) {
    const first = seen.get(declaration.id);
    if (!first) {
      seen.set(declaration.id, declaration);
      continue;
    }
    ctx.push({
      severity: 'error',
      code: 'ref/duplicate-choice-id',
      message: `duplicate choice id "${declaration.id}" within this scene`,
      file: declaration.file,
      range: rangeOf(declaration),
      path: declaration.path,
      related: [{ file: first.file, range: first.range, message: 'first declared here' }],
    });
  }
}

// ---------------------------------------------------------------------------
// Typed references.
// ---------------------------------------------------------------------------

type Index = {
  locations: Set<string>;
  scenes: Set<string>;
  items: Set<string>;
  enemies: Set<string>;
  encounters: Set<string>;
  endings: Set<string>;
  images: Set<string>;
  flags: Set<string>;
  /** Ending id to its `kind` (victory | defeat). */
  endingKinds: Map<string, string>;
};

function buildIndex(namespaces: NamespaceDeclarations, files: ParsedFile[]): Index {
  const setOf = (declarations: Declaration[]): Set<string> =>
    new Set(declarations.map((declaration) => declaration.id));
  const endingKinds = new Map<string, string>();
  for (const file of files) {
    if (file.section !== 'endings' || !Array.isArray(file.value)) continue;
    file.value.forEach((entry) => {
      if (isRecord(entry) && typeof entry['id'] === 'string' && typeof entry['kind'] === 'string') {
        endingKinds.set(entry['id'], entry['kind']);
      }
    });
  }
  return {
    locations: setOf(namespaces.locations),
    scenes: setOf(namespaces.scenes),
    items: setOf(namespaces.items),
    enemies: setOf(namespaces.enemies),
    encounters: setOf(namespaces.encounters),
    endings: setOf(namespaces.endings),
    images: setOf(namespaces.images),
    flags: setOf(namespaces.flags),
    endingKinds,
  };
}

function nodeRangeOf(file: ParsedFile, path: (string | number)[]): DiagnosticRange | undefined {
  return nodeRange(nodeAtPath(file.contents, path), file.lineCounter);
}

/**
 * Check one reference value against its target namespace. A malformed value
 * is `ref/invalid-id` (and nothing else, to avoid cascades); a well-formed
 * but undeclared value is the caller's unknown-* code.
 */
function checkReference(
  file: ParsedFile,
  path: (string | number)[],
  value: unknown,
  kind: string,
  targets: Set<string>,
  code: string,
  ctx: Ctx,
): void {
  if (typeof value !== 'string') return;
  if (!ID_PATTERN.test(value)) {
    ctx.push({
      severity: 'error',
      code: 'ref/invalid-id',
      message: `invalid ${kind} reference "${value}"; ids must match [a-z][a-z0-9-]*`,
      file: file.file,
      range: nodeRangeOf(file, path),
      path: [...path],
    });
    return;
  }
  if (!targets.has(value)) {
    ctx.push({
      severity: 'error',
      code,
      message: `unknown ${kind} "${value}"`,
      file: file.file,
      range: nodeRangeOf(file, path),
      path: [...path],
    });
  }
}

function checkFlagReference(
  file: ParsedFile,
  path: (string | number)[],
  value: unknown,
  index: Index,
  ctx: Ctx,
): void {
  if (typeof value !== 'string') return;
  if (!ID_PATTERN.test(value)) {
    ctx.push({
      severity: 'error',
      code: 'ref/invalid-id',
      message: `invalid flag reference "${value}"; ids must match [a-z][a-z0-9-]*`,
      file: file.file,
      range: nodeRangeOf(file, path),
      path: [...path],
    });
    return;
  }
  if (!index.flags.has(value)) {
    ctx.push({
      severity: 'error',
      code: 'ref/undeclared-flag',
      message: `undeclared flag "${value}"; every flag must be listed in the manifest's "flags"`,
      file: file.file,
      range: nodeRangeOf(file, path),
      path: [...path],
    });
  }
}

function checkCondition(
  file: ParsedFile,
  value: unknown,
  path: (string | number)[],
  index: Index,
  ctx: Ctx,
): void {
  if (!isRecord(value)) return;
  const keys = Object.keys(value);
  if (keys.length !== 1) return;
  const key = keys[0] as string;
  const inner = value[key];
  const innerPath = [...path, key];
  switch (key) {
    case 'flag':
      checkFlagReference(file, innerPath, inner, index, ctx);
      break;
    case 'visited':
      checkReference(file, innerPath, inner, 'location', index.locations, 'ref/unknown-location', ctx);
      break;
    case 'fired':
      checkReference(file, innerPath, inner, 'scene', index.scenes, 'ref/unknown-scene', ctx);
      break;
    case 'defeated':
      checkReference(
        file,
        innerPath,
        inner,
        'encounter',
        index.encounters,
        'ref/unknown-encounter',
        ctx,
      );
      break;
    case 'has':
      if (isRecord(inner)) {
        checkReference(file, [...innerPath, 'item'], inner['item'], 'item', index.items, 'ref/unknown-item', ctx);
      }
      break;
    case 'all':
    case 'any':
      if (Array.isArray(inner)) {
        inner.forEach((entry, entryIndex) =>
          checkCondition(file, entry, [...innerPath, entryIndex], index, ctx),
        );
      }
      break;
    case 'not':
      checkCondition(file, inner, innerPath, index, ctx);
      break;
    default:
      break;
  }
}

function checkEffect(
  file: ParsedFile,
  value: unknown,
  path: (string | number)[],
  index: Index,
  ctx: Ctx,
): void {
  if (!isRecord(value)) return;
  const keys = Object.keys(value);
  if (keys.length !== 1) return;
  const key = keys[0] as string;
  const inner = value[key];
  const innerPath = [...path, key];
  switch (key) {
    case 'set-flag':
    case 'clear-flag':
      checkFlagReference(file, innerPath, inner, index, ctx);
      break;
    case 'reveal':
      checkReference(file, innerPath, inner, 'location', index.locations, 'ref/unknown-location', ctx);
      break;
    case 'give-item':
    case 'take-item':
      if (isRecord(inner)) {
        checkReference(file, [...innerPath, 'item'], inner['item'], 'item', index.items, 'ref/unknown-item', ctx);
      }
      break;
    default:
      break;
  }
}

function checkOutcome(
  file: ParsedFile,
  value: unknown,
  path: (string | number)[],
  index: Index,
  sceneTriggers: Map<string, string | undefined>,
  ctx: Ctx,
): void {
  if (!isRecord(value)) return;
  if (Array.isArray(value['effects'])) {
    value['effects'].forEach((effect, effectIndex) =>
      checkEffect(file, effect, [...path, 'effects', effectIndex], index, ctx),
    );
  }
  if (value['next'] !== undefined) {
    checkReference(file, [...path, 'next'], value['next'], 'scene', index.scenes, 'ref/unknown-scene', ctx);
    const next = value['next'];
    if (typeof next === 'string' && ID_PATTERN.test(next) && index.scenes.has(next)) {
      const trigger = sceneTriggers.get(next);
      if (trigger !== undefined) {
        ctx.push({
          severity: 'error',
          code: 'ref/next-to-triggered-scene',
          message: `next targets scene "${next}", which has trigger "${trigger}"; next must target a follow-on scene`,
          file: file.file,
          range: nodeRangeOf(file, [...path, 'next']),
          path: [...path, 'next'],
        });
      }
    }
  }
  if (value['move'] !== undefined) {
    checkReference(file, [...path, 'move'], value['move'], 'location', index.locations, 'ref/unknown-location', ctx);
  }
  if (value['start-combat'] !== undefined) {
    checkReference(
      file,
      [...path, 'start-combat'],
      value['start-combat'],
      'encounter',
      index.encounters,
      'ref/unknown-encounter',
      ctx,
    );
  }
  if (value['end'] !== undefined) {
    checkReference(file, [...path, 'end'], value['end'], 'ending', index.endings, 'ref/unknown-ending', ctx);
  }
}

function checkChoice(
  file: ParsedFile,
  value: unknown,
  path: (string | number)[],
  index: Index,
  sceneTriggers: Map<string, string | undefined>,
  ctx: Ctx,
): void {
  if (!isRecord(value)) return;
  if (value['when'] !== undefined) checkCondition(file, value['when'], [...path, 'when'], index, ctx);
  if (value['outcome'] !== undefined) {
    checkOutcome(file, value['outcome'], [...path, 'outcome'], index, sceneTriggers, ctx);
  }
  const test = value['test'];
  if (isRecord(test)) {
    if (test['success'] !== undefined) {
      checkOutcome(file, test['success'], [...path, 'test', 'success'], index, sceneTriggers, ctx);
    }
    if (test['failure'] !== undefined) {
      checkOutcome(file, test['failure'], [...path, 'test', 'failure'], index, sceneTriggers, ctx);
    }
  }
}

function checkManifestReferences(manifest: ParsedFile, index: Index, ctx: Ctx): void {
  if (!isRecord(manifest.value)) return;
  if (manifest.value['startLocation'] !== undefined) {
    checkReference(
      manifest,
      ['startLocation'],
      manifest.value['startLocation'],
      'location',
      index.locations,
      'ref/unknown-location',
      ctx,
    );
  }
  const deathEnding = manifest.value['deathEnding'];
  if (deathEnding !== undefined) {
    checkReference(manifest, ['deathEnding'], deathEnding, 'ending', index.endings, 'ref/unknown-ending', ctx);
    if (typeof deathEnding === 'string' && ID_PATTERN.test(deathEnding) && index.endings.has(deathEnding)) {
      const kind = index.endingKinds.get(deathEnding);
      if (kind !== undefined && kind !== 'defeat') {
        ctx.push({
          severity: 'error',
          code: 'ref/death-ending-kind',
          message: `death ending "${deathEnding}" is of kind "${kind}"; the death ending must be a defeat`,
          file: manifest.file,
          range: nodeRangeOf(manifest, ['deathEnding']),
          path: ['deathEnding'],
        });
      }
    }
  }
}

function checkLocationReferences(file: ParsedFile, index: Index, ctx: Ctx): void {
  if (!isRecord(file.value)) return;
  if (Array.isArray(file.value['scenes'])) {
    file.value['scenes'].forEach((scene, sceneIndex) => {
      checkReference(file, ['scenes', sceneIndex], scene, 'scene', index.scenes, 'ref/unknown-scene', ctx);
    });
  }
  if (Array.isArray(file.value['connections'])) {
    file.value['connections'].forEach((connection, connectionIndex) => {
      if (!isRecord(connection)) return;
      const base: (string | number)[] = ['connections', connectionIndex];
      if (connection['to'] !== undefined) {
        checkReference(file, [...base, 'to'], connection['to'], 'location', index.locations, 'ref/unknown-location', ctx);
      }
      if (connection['when'] !== undefined) {
        checkCondition(file, connection['when'], [...base, 'when'], index, ctx);
      }
    });
  }
}

function checkSceneReferences(
  file: ParsedFile,
  index: Index,
  sceneTriggers: Map<string, string | undefined>,
  ctx: Ctx,
): void {
  if (!isRecord(file.value)) return;
  if (file.value['illustration'] !== undefined) {
    checkReference(
      file,
      ['illustration'],
      file.value['illustration'],
      'image',
      index.images,
      'ref/unknown-image',
      ctx,
    );
  }
  if (file.value['when'] !== undefined) {
    checkCondition(file, file.value['when'], ['when'], index, ctx);
  }
  if (Array.isArray(file.value['choices'])) {
    file.value['choices'].forEach((choice, choiceIndex) => {
      checkChoice(file, choice, ['choices', choiceIndex], index, sceneTriggers, ctx);
    });
  }
}

function checkEncounterReferences(
  file: ParsedFile,
  index: Index,
  sceneTriggers: Map<string, string | undefined>,
  ctx: Ctx,
): void {
  if (!Array.isArray(file.value)) return;
  file.value.forEach((entry, entryIndex) => {
    if (!isRecord(entry)) return;
    const base: (string | number)[] = [entryIndex];
    if (entry['enemy'] !== undefined) {
      checkReference(file, [...base, 'enemy'], entry['enemy'], 'enemy', index.enemies, 'ref/unknown-enemy', ctx);
    }
    if (entry['victory'] !== undefined) {
      checkOutcome(file, entry['victory'], [...base, 'victory'], index, sceneTriggers, ctx);
    }
    if (entry['escape'] !== undefined) {
      checkOutcome(file, entry['escape'], [...base, 'escape'], index, sceneTriggers, ctx);
    }
  });
}

function checkTemplateReferences(file: ParsedFile, index: Index, ctx: Ctx): void {
  if (!Array.isArray(file.value)) return;
  file.value.forEach((entry, entryIndex) => {
    if (!isRecord(entry) || !Array.isArray(entry['items'])) return;
    entry['items'].forEach((templateItem, itemIndex) => {
      if (!isRecord(templateItem)) return;
      checkReference(
        file,
        [entryIndex, 'items', itemIndex, 'item'],
        templateItem['item'],
        'item',
        index.items,
        'ref/unknown-item',
        ctx,
      );
    });
  });
}

function checkReferences(
  manifest: ParsedFile,
  files: ParsedFile[],
  index: Index,
  sceneTriggers: Map<string, string | undefined>,
  ctx: Ctx,
): void {
  checkManifestReferences(manifest, index, ctx);
  for (const file of files) {
    switch (file.section) {
      case 'locations':
        checkLocationReferences(file, index, ctx);
        break;
      case 'scenes':
        checkSceneReferences(file, index, sceneTriggers, ctx);
        break;
      case 'encounters':
        checkEncounterReferences(file, index, sceneTriggers, ctx);
        break;
      case 'templates':
        checkTemplateReferences(file, index, ctx);
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Scene membership and Template slots.
// ---------------------------------------------------------------------------

type SceneDeclaration = {
  id: string;
  file: ParsedFile;
  /** The `trigger` value (`on-enter` | `on-demand`), or undefined for follow-on. */
  trigger: string | undefined;
};

type Listing = {
  sceneId: string;
  file: ParsedFile;
  path: (string | number)[];
};

function collectSceneData(files: ParsedFile[]): {
  declarations: SceneDeclaration[];
  listings: Listing[];
} {
  const declarations: SceneDeclaration[] = [];
  const listings: Listing[] = [];
  for (const file of files) {
    if (file.section === 'scenes' && isRecord(file.value) && typeof file.value['id'] === 'string') {
      const trigger = file.value['trigger'];
      declarations.push({
        id: file.value['id'],
        file,
        trigger: typeof trigger === 'string' ? trigger : undefined,
      });
    }
    if (file.section === 'locations' && isRecord(file.value) && Array.isArray(file.value['scenes'])) {
      file.value['scenes'].forEach((scene, sceneIndex) => {
        if (typeof scene === 'string') {
          listings.push({ sceneId: scene, file, path: ['scenes', sceneIndex] });
        }
      });
    }
  }
  return { declarations, listings };
}

function checkSceneMembership(
  declarations: SceneDeclaration[],
  listings: Listing[],
  ctx: Ctx,
): void {
  const byScene = new Map<string, Listing[]>();
  for (const listing of listings) {
    const group = byScene.get(listing.sceneId);
    if (group) group.push(listing);
    else byScene.set(listing.sceneId, [listing]);
  }
  const listedHere = (listing: Listing): { file: string; range?: DiagnosticRange; message: string } => ({
    file: listing.file.file,
    range: nodeRangeOf(listing.file, listing.path),
    message: 'listed here',
  });
  // Every declaration is evaluated on its own trigger, so a later duplicate
  // declaration's trigger is not hidden by the first. Cardinality (exactly one
  // listing) is about the id and reported once, at the first declaration.
  const cardinalityReported = new Set<string>();
  for (const declaration of declarations) {
    const sceneId = declaration.id;
    const sceneListings = byScene.get(sceneId) ?? [];
    const idRange = nodeRangeOf(declaration.file, ['id']);
    if (declaration.trigger === undefined) {
      if (sceneListings.length > 0) {
        ctx.push({
          severity: 'error',
          code: 'ref/scene-membership',
          message: `follow-on scene "${sceneId}" must not be listed by any location`,
          file: declaration.file.file,
          range: idRange,
          path: ['id'],
          related: sceneListings.map(listedHere),
        });
      }
      continue;
    }
    if (sceneListings.length === 0) {
      if (cardinalityReported.has(sceneId)) continue;
      cardinalityReported.add(sceneId);
      ctx.push({
        severity: 'error',
        code: 'ref/scene-membership',
        message: `"${declaration.trigger}" scene "${sceneId}" is listed by no location; it must be listed by exactly one location`,
        file: declaration.file.file,
        range: idRange,
        path: ['id'],
      });
    } else if (sceneListings.length > 1) {
      if (cardinalityReported.has(sceneId)) continue;
      cardinalityReported.add(sceneId);
      ctx.push({
        severity: 'error',
        code: 'ref/scene-membership',
        message: `"${declaration.trigger}" scene "${sceneId}" is listed by more than one location; it must be listed by exactly one location`,
        file: declaration.file.file,
        range: idRange,
        path: ['id'],
        related: sceneListings.map(listedHere),
      });
    }
  }
}

function collectItemSlots(files: ParsedFile[]): Map<string, string> {
  const slots = new Map<string, string>();
  for (const file of files) {
    if (file.section !== 'items' || !Array.isArray(file.value)) continue;
    file.value.forEach((entry) => {
      if (
        isRecord(entry) &&
        entry['kind'] === 'equipment' &&
        typeof entry['id'] === 'string' &&
        typeof entry['slot'] === 'string' &&
        !slots.has(entry['id'])
      ) {
        slots.set(entry['id'], entry['slot']);
      }
    });
  }
  return slots;
}

function checkTemplateSlots(files: ParsedFile[], itemSlots: Map<string, string>, ctx: Ctx): void {
  for (const file of files) {
    if (file.section !== 'templates' || !Array.isArray(file.value)) continue;
    file.value.forEach((entry, entryIndex) => {
      if (!isRecord(entry) || typeof entry['id'] !== 'string' || !Array.isArray(entry['items'])) {
        return;
      }
      const templateId = entry['id'];
      const firstBySlot = new Map<string, (string | number)[]>();
      entry['items'].forEach((templateItem, itemIndex) => {
        if (!isRecord(templateItem) || typeof templateItem['item'] !== 'string') return;
        const slot = itemSlots.get(templateItem['item']);
        if (slot === undefined) return;
        const path: (string | number)[] = [entryIndex, 'items', itemIndex];
        const first = firstBySlot.get(slot);
        if (!first) {
          firstBySlot.set(slot, path);
          return;
        }
        ctx.push({
          severity: 'error',
          code: 'ref/template-slot-conflict',
          message: `template "${templateId}" has two equipment items for slot "${slot}"`,
          file: file.file,
          range: nodeRangeOf(file, path),
          path,
          related: [
            {
              file: file.file,
              range: nodeRangeOf(file, first),
              message: 'first item for this slot here',
            },
          ],
        });
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Phase entry point.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Images.
// ---------------------------------------------------------------------------

export type IntegrityImage = {
  id: string;
  path: string;
  format: ImageFormat;
  width: number;
  height: number;
  hash: string;
  alt: string;
};

type ImageEntry = {
  id: string;
  imagePath: string;
  alt: string;
  file: ParsedFile;
  path: (string | number)[];
};

function collectImageEntries(files: ParsedFile[]): ImageEntry[] {
  const entries: ImageEntry[] = [];
  for (const file of files) {
    if (file.section !== 'images' || !Array.isArray(file.value)) continue;
    file.value.forEach((entry, entryIndex) => {
      if (!isRecord(entry) || typeof entry['id'] !== 'string') return;
      entries.push({
        id: entry['id'],
        imagePath: typeof entry['path'] === 'string' ? entry['path'] : '',
        alt: typeof entry['alt'] === 'string' ? entry['alt'] : '',
        file,
        path: [entryIndex, 'path'],
      });
    });
  }
  return entries;
}

function checkImages(
  files: ParsedFile[],
  scenarioDir: string,
  ctx: Ctx,
): { images: IntegrityImage[]; imageBytes: Map<string, Buffer> } {
  const images: IntegrityImage[] = [];
  const imageBytes = new Map<string, Buffer>();
  const seenPaths = new Map<string, ImageEntry>();
  for (const entry of collectImageEntries(files)) {
    const first = seenPaths.get(normalizeListedPath(entry.imagePath));
    if (first) {
      ctx.push({
        severity: 'error',
        code: 'ref/duplicate-image-path',
        message: `duplicate image path "${entry.imagePath}"`,
        file: entry.file.file,
        range: nodeRangeOf(entry.file, entry.path),
        path: entry.path,
        related: [
          {
            file: first.file.file,
            range: nodeRangeOf(first.file, first.path),
            message: 'first declared here',
          },
        ],
      });
      continue;
    }
    seenPaths.set(normalizeListedPath(entry.imagePath), entry);

    const invalidReason = imagePathViolation(scenarioDir, entry.imagePath);
    if (invalidReason !== undefined) {
      ctx.push({
        severity: 'error',
        code: 'ref/invalid-image-path',
        message: `invalid image path "${entry.imagePath}" ${invalidReason}`,
        file: entry.file.file,
        range: nodeRangeOf(entry.file, entry.path),
        path: entry.path,
      });
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(path.join(scenarioDir, entry.imagePath));
    } catch {
      ctx.push({
        severity: 'error',
        code: 'ref/missing-image-file',
        message: `image file "${entry.imagePath}" is missing or unreadable`,
        file: entry.file.file,
        range: nodeRangeOf(entry.file, entry.path),
        path: entry.path,
      });
      continue;
    }

    const expected = IMAGE_FORMAT_BY_EXTENSION[path.extname(entry.imagePath)];
    const inspected = inspectImage(bytes);
    if (expected === undefined || inspected === undefined || inspected.format !== expected) {
      ctx.push({
        severity: 'error',
        code: 'ref/image-format-mismatch',
        message:
          `image file "${entry.imagePath}" does not match its extension; ` +
          `the signature must match ${expected === undefined ? 'a supported format' : `".${expected === 'jpeg' ? 'jpg"/".jpeg' : expected}"`} ` +
          `(.png, .jpg, .jpeg or .webp, lowercase)`,
        file: entry.file.file,
        range: nodeRangeOf(entry.file, entry.path),
        path: entry.path,
      });
      continue;
    }

    const tooLarge =
      bytes.length > MAX_IMAGE_BYTES ||
      (inspected.width !== undefined &&
        inspected.height !== undefined &&
        (inspected.width > MAX_IMAGE_SIDE || inspected.height > MAX_IMAGE_SIDE));
    if (tooLarge) {
      const detail =
        bytes.length > MAX_IMAGE_BYTES
          ? `is ${bytes.length} bytes; files must be at most 2 MiB`
          : `is ${inspected.width}x${inspected.height} px; no side may exceed 4096 px`;
      ctx.push({
        severity: 'error',
        code: 'ref/image-too-large',
        message: `image file "${entry.imagePath}" ${detail}`,
        file: entry.file.file,
        range: nodeRangeOf(entry.file, entry.path),
        path: entry.path,
      });
      continue;
    }

    if (inspected.width === undefined || inspected.height === undefined) {
      ctx.push({
        severity: 'error',
        code: 'ref/image-format-mismatch',
        message:
          `image file "${entry.imagePath}" could not be read as ".${expected}"; ` +
          `the file may be truncated or corrupt`,
        file: entry.file.file,
        range: nodeRangeOf(entry.file, entry.path),
        path: entry.path,
      });
      continue;
    }
    images.push({
      id: entry.id,
      path: entry.imagePath,
      format: inspected.format,
      width: inspected.width,
      height: inspected.height,
      hash: hashImageBytes(bytes),
      alt: entry.alt,
    });
    imageBytes.set(entry.id, bytes);
  }
  return { images, imageBytes };
}

/** The invalid-image-path reason, or undefined when the path is acceptable. */
function imagePathViolation(scenarioDir: string, imagePath: string): string | undefined {
  if (isAbsolutePath(imagePath)) return 'is absolute; paths must be relative to the Scenario directory';
  if (isUrl(imagePath)) return 'is a URL; paths must be relative to the Scenario directory';
  if (hasDotDot(imagePath)) return 'contains ".."; paths must stay inside the Scenario directory';
  if (symlinkEscapesDir(scenarioDir, imagePath)) {
    return 'is a symlink resolving outside the Scenario directory';
  }
  if (IMAGE_FORMAT_BY_EXTENSION[path.extname(imagePath)] === undefined) {
    return 'has an unsupported extension; use .png, .jpg, .jpeg or .webp (lowercase)';
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Phase entry point.
// ---------------------------------------------------------------------------

/**
 * Run the Integrity phase over the manifest and every listed content file.
 * Call only when Phase 2 produced no errors. Returns the resolved image
 * registry entries for the compiled model; the caller must ignore them when
 * the phase produced errors.
 */
export function runIntegrityPhase(
  manifest: ParsedFile,
  files: ParsedFile[],
  scenarioDir: string,
  push: (diagnostic: Diagnostic) => void,
): { images: IntegrityImage[]; imageBytes: Map<string, Buffer> } {
  const ctx: Ctx = { push };
  const { namespaces, choicesByScene } = collectDeclarations(manifest, files);

  const kinds: [keyof NamespaceDeclarations, string][] = [
    ['locations', 'location'],
    ['scenes', 'scene'],
    ['items', 'item'],
    ['enemies', 'enemy'],
    ['encounters', 'encounter'],
    ['templates', 'template'],
    ['endings', 'ending'],
    ['images', 'image'],
    ['flags', 'flag'],
  ];
  for (const [namespace, kind] of kinds) {
    for (const declaration of namespaces[namespace]) checkIdSyntax(declaration, kind, ctx);
    checkDuplicates(namespaces[namespace], kind, ctx);
  }
  for (const choices of choicesByScene.values()) {
    for (const declaration of choices) checkIdSyntax(declaration, 'choice', ctx);
    checkChoiceDuplicates(choices, ctx);
  }

  const index = buildIndex(namespaces, files);
  const { declarations, listings } = collectSceneData(files);
  // Any declaration's trigger counts: a `next` edge to an id with a triggered
  // declaration anywhere is broken, whichever declaration came first.
  const sceneTriggers = new Map<string, string | undefined>();
  for (const declaration of declarations) {
    if (sceneTriggers.get(declaration.id) === undefined) {
      sceneTriggers.set(declaration.id, declaration.trigger);
    }
  }
  checkReferences(manifest, files, index, sceneTriggers, ctx);
  checkSceneMembership(declarations, listings, ctx);
  checkTemplateSlots(files, collectItemSlots(files), ctx);
  return checkImages(files, scenarioDir, ctx);
}
