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
  MAX_ILLUSTRATION_BYTES,
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
    if (Array.isArray(entry['participants'])) {
      entry['participants'].forEach((participant, participantIndex) => {
        if (!isRecord(participant)) return;
        const participantBase: (string | number)[] = [...base, 'participants', participantIndex];
        if (participant['enemy'] !== undefined) {
          checkReference(
            file,
            [...participantBase, 'enemy'],
            participant['enemy'],
            'enemy',
            index.enemies,
            'ref/unknown-enemy',
            ctx,
          );
        }
      });
      checkParticipantIds(file, entry, entryIndex, ctx);
    }
    if (entry['victory'] !== undefined) {
      checkOutcome(file, entry['victory'], [...base, 'victory'], index, sceneTriggers, ctx);
    }
    if (entry['escape'] !== undefined) {
      checkOutcome(file, entry['escape'], [...base, 'escape'], index, sceneTriggers, ctx);
    }
  });
}

/**
 * Participant ids within one Encounter (docs/spec/validation.md,
 * ref/duplicate-participant-id): explicit or defaulted from `enemy` (two
 * participants of the same Enemy kind without explicit ids). A defaulted id's
 * syntax is already covered by the `enemy` reference check above, so only
 * explicit ids are syntax-checked here; duplicates are only reported among
 * well-formed ids, to avoid cascades.
 */
function checkParticipantIds(
  file: ParsedFile,
  entry: Record<string, unknown>,
  entryIndex: number,
  ctx: Ctx,
): void {
  const raw = entry['participants'];
  if (!Array.isArray(raw)) return;
  const seen = new Map<string, (string | number)[]>();
  raw.forEach((participant, participantIndex) => {
    const participantBase: (string | number)[] = [entryIndex, 'participants', participantIndex];
    const idValue = isRecord(participant) ? participant['id'] : undefined;
    const enemyValue = isRecord(participant) ? participant['enemy'] : undefined;
    const explicit = typeof idValue === 'string';
    const id = explicit ? idValue : typeof enemyValue === 'string' ? enemyValue : undefined;
    if (id === undefined) return;
    const idPath: (string | number)[] = explicit
      ? [...participantBase, 'id']
      : [...participantBase, 'enemy'];
    if (explicit && !ID_PATTERN.test(id)) {
      ctx.push({
        severity: 'error',
        code: 'ref/invalid-id',
        message: `invalid participant id "${id}"; ids must match [a-z][a-z0-9-]*`,
        file: file.file,
        range: nodeRangeOf(file, idPath),
        path: [...idPath],
      });
      return;
    }
    if (!ID_PATTERN.test(id)) return;
    const first = seen.get(id);
    if (!first) {
      seen.set(id, idPath);
      return;
    }
    ctx.push({
      severity: 'error',
      code: 'ref/duplicate-participant-id',
      message: `duplicate participant id "${id}" within this encounter; give the participants explicit, distinct "id" values`,
      file: file.file,
      range: nodeRangeOf(file, idPath),
      path: [...idPath],
      related: [
        {
          file: file.file,
          range: nodeRangeOf(file, first),
          message: 'first declared here',
        },
      ],
    });
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

function checkDuplicateConnectionTargets(files: ParsedFile[], ctx: Ctx): void {
  for (const file of files) {
    if (file.section !== 'locations' || !isRecord(file.value)) continue;
    const locationId = typeof file.value['id'] === 'string' ? file.value['id'] : undefined;
    const connections = file.value['connections'];
    if (!Array.isArray(connections)) continue;
    const seen = new Map<string, (string | number)[]>();
    connections.forEach((connection, connectionIndex) => {
      if (!isRecord(connection) || typeof connection['to'] !== 'string') return;
      const target = connection['to'];
      const path: (string | number)[] = ['connections', connectionIndex, 'to'];
      const first = seen.get(target);
      if (!first) {
        seen.set(target, path);
        return;
      }
      ctx.push({
        severity: 'error',
        code: 'ref/duplicate-connection-target',
        message:
          locationId === undefined
            ? `duplicate connection target "${target}" within this location`
            : `location "${locationId}" has two connections to "${target}"`,
        file: file.file,
        range: nodeRangeOf(file, path),
        path,
        related: [
          {
            file: file.file,
            range: nodeRangeOf(file, first),
            message: 'first connection to this target here',
          },
        ],
      });
    });
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
  /**
   * One entry per distinct Layer file of the image's Motion, in first-use
   * order (docs/spec/scenario-format.md, Images; ADR 0007). Empty for an
   * Illustration without Motion.
   */
  layers: IntegrityLayerFile[];
  /** The image's Motion with every Layer's declaration, when it has one. */
  motion?: IntegrityMotion;
};

/** One distinct Layer file of an Illustration's Motion, as the registry holds it. */
export type IntegrityLayerFile = {
  path: string;
  format: ImageFormat;
  width: number;
  height: number;
  hash: string;
};

/** A Layer's Drift as the registry holds it: declaration with defaults applied. */
export type IntegrityDrift = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  duration: number;
  delay: number;
  loop: boolean;
};

/** One Motion Layer with its declaration (defaults applied) and its file. */
export type IntegrityMotionLayer = {
  path: string;
  at: { x: number; y: number };
  anchor: { x: number; y: number };
  width: number;
  /** The sprite strip frame count; present exactly when `fps` is. */
  frames?: number;
  /** Frames per second; present exactly when `frames` is. */
  fps?: number;
  /** The Flicker depth, the deepest opacity dip in percent; present only when the Layer flickers. */
  flicker?: { depth: number };
  blend: 'normal' | 'multiply' | 'screen';
  drift?: IntegrityDrift;
  file: IntegrityLayerFile;
};

/** An image entry's Motion, in Layer list order. */
export type IntegrityMotion = {
  layers: IntegrityMotionLayer[];
};

type ImageEntry = {
  id: string;
  imagePath: string;
  alt: string;
  motion: unknown;
  file: ParsedFile;
  index: number;
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
        motion: entry['motion'],
        file,
        index: entryIndex,
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
): { images: IntegrityImage[]; imageBytes: Map<string, Buffer>; layerBytes: Map<string, Buffer> } {
  const images: IntegrityImage[] = [];
  const imageBytes = new Map<string, Buffer>();
  const layerBytes = new Map<string, Buffer>();
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

    // Layer `path` values follow the same path rules but are not catalog
    // entries: one file may serve several Layers and several Illustrations,
    // so they never join `seenPaths` (docs/spec/validation.md,
    // ref/duplicate-image-path).
    const still = readImageFile(
      scenarioDir,
      entry.imagePath,
      'image file',
      entry.file,
      entry.path,
      ctx,
    );
    if (still === undefined) continue;
    const layers = checkMotionLayers(entry, still.bytes.length, scenarioDir, layerBytes, ctx);
    if (layers === undefined) continue;

    images.push({
      id: entry.id,
      path: entry.imagePath,
      format: still.format,
      width: still.width,
      height: still.height,
      hash: hashImageBytes(still.bytes),
      alt: entry.alt,
      layers,
    });
    imageBytes.set(entry.id, still.bytes);
  }
  return { images, imageBytes, layerBytes };
}

type ReadImage = {
  bytes: Buffer;
  format: ImageFormat;
  width: number;
  height: number;
};

/**
 * Read and inspect one Scenario image file: a Still or a Layer file. Reports
 * the ref/ image codes (invalid-image-path, missing-image-file,
 * image-format-mismatch, image-too-large) against `nodePath` and returns
 * undefined on any of them.
 */
function readImageFile(
  scenarioDir: string,
  imagePath: string,
  noun: string,
  file: ParsedFile,
  nodePath: (string | number)[],
  ctx: Ctx,
): ReadImage | undefined {
  const at = {
    file: file.file,
    range: nodeRangeOf(file, nodePath),
    path: nodePath,
  };
  const invalidReason = imagePathViolation(scenarioDir, imagePath);
  if (invalidReason !== undefined) {
    ctx.push({
      severity: 'error',
      code: 'ref/invalid-image-path',
      message: `invalid image path "${imagePath}" ${invalidReason}`,
      ...at,
    });
    return undefined;
  }

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(path.join(scenarioDir, imagePath));
  } catch {
    ctx.push({
      severity: 'error',
      code: 'ref/missing-image-file',
      message: `${noun} "${imagePath}" is missing or unreadable`,
      ...at,
    });
    return undefined;
  }

  const expected = IMAGE_FORMAT_BY_EXTENSION[path.extname(imagePath)];
  const inspected = inspectImage(bytes);
  if (expected === undefined || inspected === undefined || inspected.format !== expected) {
    ctx.push({
      severity: 'error',
      code: 'ref/image-format-mismatch',
      message:
        `${noun} "${imagePath}" does not match its extension; ` +
        `the signature must match ${expected === undefined ? 'a supported format' : `".${expected === 'jpeg' ? 'jpg"/".jpeg' : expected}"`} ` +
        `(.png, .jpg, .jpeg or .webp, lowercase)`,
      ...at,
    });
    return undefined;
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
      message: `${noun} "${imagePath}" ${detail}`,
      ...at,
    });
    return undefined;
  }

  if (inspected.width === undefined || inspected.height === undefined) {
    ctx.push({
      severity: 'error',
      code: 'ref/image-format-mismatch',
      message:
        `${noun} "${imagePath}" could not be read as ".${expected}"; ` +
        `the file may be truncated or corrupt`,
      ...at,
    });
    return undefined;
  }
  return { bytes, format: inspected.format, width: inspected.width, height: inspected.height };
}

/**
 * Check an image entry's Motion Layers (docs/spec/validation.md, Phase 3):
 * every Layer `path` gets the image codes with the range on the Layer's
 * `path`, a Layer with `frames` gets ref/sprite-strip-width there when the
 * file's pixel width does not divide by `frames`, and the Still plus every
 * distinct Layer file must total at most 4 MiB (ref/illustration-too-large).
 * Returns the registry's distinct Layer files in first-use order, or
 * undefined when the image is rejected.
 *
 * Phase 2 already proved the shapes, so the guards below only protect
 * against programmer error: a non-record motion, a non-list `layers` or a
 * Layer without a string `path` is skipped here.
 */
function checkMotionLayers(
  entry: ImageEntry,
  stillBytes: number,
  scenarioDir: string,
  layerBytes: Map<string, Buffer>,
  ctx: Ctx,
): IntegrityLayerFile[] | undefined {
  const layers: IntegrityLayerFile[] = [];
  const distinctSizes = new Map<string, number>();
  let failed = false;
  const motion = entry.motion;
  const rawLayers = isRecord(motion) && Array.isArray(motion['layers']) ? motion['layers'] : [];
  rawLayers.forEach((layer, layerIndex) => {
    if (!isRecord(layer) || typeof layer['path'] !== 'string') return;
    const layerPath = layer['path'];
    const nodePath: (string | number)[] = [entry.index, 'motion', 'layers', layerIndex, 'path'];
    const read = readImageFile(scenarioDir, layerPath, 'Layer file', entry.file, nodePath, ctx);
    if (read === undefined) {
      failed = true;
      return;
    }
    // A sprite strip's frames must fall on whole pixels: the file's pixel
    // width divided by `frames` (docs/spec/validation.md,
    // ref/sprite-strip-width). Phase 2 proved `frames` an integer 2-64, so a
    // non-integer here only guards against programmer error.
    const frames = isRecord(layer) && typeof layer['frames'] === 'number' ? layer['frames'] : undefined;
    if (
      frames !== undefined &&
      Number.isInteger(frames) &&
      frames > 0 &&
      read.width % frames !== 0
    ) {
      failed = true;
      ctx.push({
        severity: 'error',
        code: 'ref/sprite-strip-width',
        message:
          `Layer file "${layerPath}" is ${read.width} px wide, which does not divide ` +
          `by the Layer's "frames" (${frames}); its frames would fall on fractions of a pixel`,
        file: entry.file.file,
        range: nodeRangeOf(entry.file, nodePath),
        path: nodePath,
      });
      return;
    }
    const key = normalizeListedPath(layerPath);
    if (!distinctSizes.has(key)) {
      distinctSizes.set(key, read.bytes.length);
      // The registry path is the normalized package path, so `./glow.png`
      // and `glow.png` are one distinct Layer file everywhere downstream
      // (registry, content hash, asset route).
      layers.push({
        path: key,
        format: read.format,
        width: read.width,
        height: read.height,
        hash: hashImageBytes(read.bytes),
      });
      if (!layerBytes.has(key)) layerBytes.set(key, read.bytes);
    }
  });

  const total = stillBytes + [...distinctSizes.values()].reduce((sum, size) => sum + size, 0);
  if (total > MAX_ILLUSTRATION_BYTES) {
    failed = true;
    const nodePath: (string | number)[] = [entry.index, 'motion'];
    ctx.push({
      severity: 'error',
      code: 'ref/illustration-too-large',
      message:
        `illustration "${entry.id}" is ${total} bytes with its distinct Layer files; ` +
        `a Still plus its distinct Layer files must total at most 4 MiB`,
      file: entry.file.file,
      range: nodeRangeOf(entry.file, nodePath),
      path: nodePath,
    });
  }
  return failed ? undefined : layers;
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
 * registry entries (with one entry per distinct Layer file of each image's
 * Motion) for the compiled model, with the Still bytes by image id and the
 * Layer bytes by package path; the caller must ignore them when the phase
 * produced errors.
 */
export function runIntegrityPhase(
  manifest: ParsedFile,
  files: ParsedFile[],
  scenarioDir: string,
  push: (diagnostic: Diagnostic) => void,
): { images: IntegrityImage[]; imageBytes: Map<string, Buffer>; layerBytes: Map<string, Buffer> } {
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
  checkDuplicateConnectionTargets(files, ctx);
  checkSceneMembership(declarations, listings, ctx);
  checkTemplateSlots(files, collectItemSlots(files), ctx);
  return checkImages(files, scenarioDir, ctx);
}
