// Phase 2 (Structure) validation: docs/spec/validation.md, codes schema/*.
//
// Every listed file is checked against the Zod definitions in schema.ts and
// by the custom checks below. Zod owns strictness (unknown keys), required
// keys, value types, tokens and ranges; the custom checks own every
// cross-field or text rule so that each gets its own stable schema/ code.
// Diagnostics carry the file, the range of the offending YAML node (via the
// `yaml` node ranges) and the path within the document.

import { isMap, isPair, isScalar, isSeq } from 'yaml';
import type { LineCounter } from 'yaml';
import { z } from 'zod';
import type { Diagnostic, DiagnosticRange } from './diagnostic';
import {
  CONDITION_BRANCH_KEYS,
  EFFECT_BRANCH_KEYS,
  EncountersCatalogSchema,
  EnemiesCatalogSchema,
  EndingsCatalogSchema,
  ImagesCatalogSchema,
  ItemsCatalogSchema,
  LocationSchema,
  ManifestSchema,
  SceneSchema,
  TemplatesCatalogSchema,
} from './schema';
import { nodeRange } from './yamlFile';

export type ManifestSection =
  | 'locations'
  | 'scenes'
  | 'items'
  | 'enemies'
  | 'encounters'
  | 'templates'
  | 'endings'
  | 'images';

export type ParsedFile = {
  /** Manifest section listing the file, or 'manifest' for scenario.yaml. */
  section: ManifestSection | 'manifest';
  /** Path relative to the Scenario directory. */
  file: string;
  /** The document's JS value (first document; undefined when unparsable). */
  value: unknown;
  /** The first document's contents node, for position lookup. */
  contents: unknown;
  lineCounter: LineCounter;
};

type Ctx = {
  file: string;
  contents: unknown;
  lineCounter: LineCounter;
  push: (diagnostic: Diagnostic) => void;
};

const SECTION_SCHEMAS: Record<ManifestSection, z.ZodTypeAny> = {
  locations: LocationSchema,
  scenes: SceneSchema,
  items: ItemsCatalogSchema,
  enemies: EnemiesCatalogSchema,
  encounters: EncountersCatalogSchema,
  templates: TemplatesCatalogSchema,
  endings: EndingsCatalogSchema,
  images: ImagesCatalogSchema,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueAtPath(root: unknown, path: readonly (string | number)[]): unknown {
  let node: unknown = root;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(node)) return undefined;
      node = node[segment];
    } else {
      if (!isRecord(node)) return undefined;
      node = node[segment];
    }
  }
  return node;
}

/** The YAML value node at a document path, or undefined when unreachable. */
function nodeAtPath(root: unknown, path: readonly (string | number)[]): unknown {
  let node: unknown = root;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!isSeq(node)) return undefined;
      node = node.items[segment];
    } else {
      if (!isMap(node)) return undefined;
      const pair = node.items.find(
        (item) => isPair(item) && isScalar(item.key) && item.key.value === segment,
      );
      if (!pair || !isPair(pair)) return undefined;
      node = pair.value;
    }
    if (node === null || node === undefined) return undefined;
  }
  return node;
}

/** The key node of one mapping entry, for pointing at unknown keys. */
function keyNodeAtPath(
  root: unknown,
  parentPath: readonly (string | number)[],
  key: string,
): unknown {
  const parent = nodeAtPath(root, parentPath);
  if (!isMap(parent)) return undefined;
  const pair = parent.items.find(
    (item) => isPair(item) && isScalar(item.key) && item.key.value === key,
  );
  return pair && isPair(pair) ? pair.key : undefined;
}

function rangeOf(ctx: Ctx, path: readonly (string | number)[]): DiagnosticRange | undefined {
  return nodeRange(nodeAtPath(ctx.contents, path), ctx.lineCounter);
}

// ---------------------------------------------------------------------------
// Zod issue conversion.
// ---------------------------------------------------------------------------

type Issue = z.core.$ZodIssue;

function convertIssues(issues: readonly Issue[], valueRoot: unknown, ctx: Ctx): void {
  for (const issue of issues) convertIssue(issue, [], valueRoot, ctx);
}

function convertIssue(
  issue: Issue,
  basePath: readonly (string | number)[],
  valueRoot: unknown,
  ctx: Ctx,
): void {
  const rawPath = [...basePath, ...issue.path].filter(
    (segment): segment is string | number =>
      typeof segment === 'string' || typeof segment === 'number',
  );
  if (issue.code === 'unrecognized_keys') {
    for (const key of issue.keys) {
      const path = [...rawPath, key];
      ctx.push({
        severity: 'error',
        code: 'schema/unknown-key',
        message: `unknown key "${key}"`,
        file: ctx.file,
        range: nodeRange(keyNodeAtPath(ctx.contents, rawPath, key), ctx.lineCounter),
        path,
      });
    }
    return;
  }
  if (issue.code === 'invalid_union') {
    convertUnionIssue(issue, rawPath, valueRoot, ctx);
    return;
  }
  const value = valueAtPath(valueRoot, rawPath);
  if (value === undefined && rawPath.length > 0) {
    const field = String(rawPath[rawPath.length - 1]);
    const parent = nodeAtPath(ctx.contents, rawPath.slice(0, -1));
    ctx.push({
      severity: 'error',
      code: 'schema/missing-field',
      message: `missing required key "${field}"`,
      file: ctx.file,
      range: nodeRange(parent, ctx.lineCounter),
      path: rawPath,
    });
    return;
  }
  ctx.push({
    severity: 'error',
    code: 'schema/invalid-value',
    message: issue.message,
    file: ctx.file,
    range: nodeRange(nodeAtPath(ctx.contents, rawPath), ctx.lineCounter),
    path: rawPath,
  });
}

const EFFECT_KEY_SET = new Set<string>(EFFECT_BRANCH_KEYS);
const CONDITION_KEY_SET = new Set<string>(CONDITION_BRANCH_KEYS);

function branchListsOf(issue: Issue): Issue[][] {
  const errors = (issue as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors.filter((entry): entry is Issue[] => Array.isArray(entry));
}

/** True when a branch's own issue list rejects `key` as an unknown key. */
function branchRejectsKey(branch: Issue[], key: string): boolean {
  return branch.some(
    (nested) =>
      nested.code === 'unrecognized_keys' &&
      nested.path.length === 0 &&
      (nested.keys as string[]).includes(key),
  );
}

function oneKeyMessage(keys: string[]): string {
  const effectKeys = keys.filter((key) => EFFECT_KEY_SET.has(key));
  const conditionKeys = keys.filter((key) => CONDITION_KEY_SET.has(key));
  if (effectKeys.length > 0 && conditionKeys.length === 0) {
    return 'effect must have exactly one key (set-flag, clear-flag, reveal, heal, damage, give-item or take-item)';
  }
  if (conditionKeys.length > 0 && effectKeys.length === 0) {
    return 'condition must have exactly one key (flag, visited, fired, defeated, has, attribute, health, all, any or not)';
  }
  return 'mapping must have exactly one key (one Effect or one Condition fact)';
}

/**
 * A failed Effect/Condition union (both are unions of strict one-key
 * objects, so their failures share one shape). Unknown keys are reported
 * per key; a single known key reports that branch's value issues; several
 * known keys violate the one-key mapping rule.
 */
function convertUnionIssue(
  issue: Issue,
  path: readonly (string | number)[],
  valueRoot: unknown,
  ctx: Ctx,
): void {
  const invalidValue = (message: string): void => {
    ctx.push({
      severity: 'error',
      code: 'schema/invalid-value',
      message,
      file: ctx.file,
      range: rangeOf(ctx, path),
      path: [...path],
    });
  };
  // Discriminator failures (an item `kind` outside equipment/consumable/key)
  // are plain invalid values.
  if ((issue as { discriminator?: unknown }).discriminator !== undefined) {
    invalidValue(issue.message);
    return;
  }
  const value = valueAtPath(valueRoot, path);
  if (!isRecord(value)) {
    invalidValue(issue.message);
    return;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    invalidValue('mapping must have exactly one key (one Effect or one Condition fact)');
    return;
  }
  const branches = branchListsOf(issue);
  const reportedUnknown = new Set<string>();
  for (const key of keys) {
    if (branches.length > 0 && branches.every((branch) => branchRejectsKey(branch, key))) {
      reportedUnknown.add(key);
      const keyPath = [...path, key];
      ctx.push({
        severity: 'error',
        code: 'schema/unknown-key',
        message: `unknown key "${key}"`,
        file: ctx.file,
        range: nodeRange(keyNodeAtPath(ctx.contents, path, key), ctx.lineCounter),
        path: keyPath,
      });
    }
  }
  const known = keys.filter((key) => !reportedUnknown.has(key));
  if (known.length === 0) return;
  if (known.length > 1) {
    invalidValue(oneKeyMessage(known));
    return;
  }
  const key = known[0] as string;
  const match = branches.find((branch) => !branchRejectsKey(branch, key));
  if (!match) {
    const keyPath = [...path, key];
    ctx.push({
      severity: 'error',
      code: 'schema/unknown-key',
      message: `unknown key "${key}"`,
      file: ctx.file,
      range: nodeRange(keyNodeAtPath(ctx.contents, path, key), ctx.lineCounter),
      path: keyPath,
    });
    return;
  }
  // The matching branch's own issues, skipping the unrecognized-key reports
  // for keys already reported above.
  for (const nested of match) {
    if (
      nested.code === 'unrecognized_keys' &&
      (nested.keys as string[]).every((k) => reportedUnknown.has(k))
    ) {
      continue;
    }
    convertIssue(nested, path, valueRoot, ctx);
  }
}

// ---------------------------------------------------------------------------
// Custom checks: one stable schema/ code each.
// ---------------------------------------------------------------------------

function checkText(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (typeof value !== 'string') return;
  if (value.trim() === '') {
    const field = String(path[path.length - 1] ?? 'value');
    ctx.push({
      severity: 'error',
      code: 'schema/empty-text',
      message: `"${field}" must not be empty`,
      file: ctx.file,
      range: rangeOf(ctx, path),
      path: [...path],
    });
  }
}

const BRACE_PATTERN = /\{(?!name\})/;
const HEADING_PATTERN = /^ {0,3}#{1,6}(?:\s|$)/m;
const IMAGE_PATTERN = /!\[[^\]]*\]\([^)]*\)/;
const LINK_PATTERN = /(?<!!)\[[^\]]+\]\([^)]*\)/;
const LIST_PATTERN = /^ {0,3}(?:[-+*]|\d{1,9}[.)])\s+/m;
const HTML_PATTERN = /<[A-Za-z/!][^>]*>/;

function checkNarration(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (typeof value !== 'string') return;
  checkText(value, path, ctx);
  if (value.trim() === '') return;
  if (BRACE_PATTERN.test(value)) {
    ctx.push({
      severity: 'error',
      code: 'schema/narration-brace',
      message: 'narration contains "{" outside "{name}"; only "{name}" is allowed',
      file: ctx.file,
      range: rangeOf(ctx, path),
      path: [...path],
    });
  }
  const outside: string[] = [];
  if (HEADING_PATTERN.test(value)) outside.push('headings');
  if (IMAGE_PATTERN.test(value)) outside.push('images');
  else if (LINK_PATTERN.test(value)) outside.push('links');
  if (LIST_PATTERN.test(value)) outside.push('lists');
  if (HTML_PATTERN.test(value)) outside.push('raw HTML');
  if (outside.length > 0) {
    ctx.push({
      severity: 'warning',
      code: 'schema/markdown-outside-subset',
      message: `narration uses Markdown outside the subset (${outside.join(', ')}); it is shown literally`,
      file: ctx.file,
      range: rangeOf(ctx, path),
      path: [...path],
    });
  }
}

function checkCondition(
  value: unknown,
  path: readonly (string | number)[],
  ctx: Ctx,
): void {
  if (!isRecord(value)) return;
  const keys = Object.keys(value);
  if (keys.length !== 1) return;
  const key = keys[0] as string;
  const inner = value[key];
  const innerPath = [...path, key];
  if (key === 'attribute' || key === 'health') {
    if (isRecord(inner)) {
      const bounds = ['atLeast', 'atMost'].filter((bound) => inner[bound] !== undefined);
      if (bounds.length !== 1) {
        ctx.push({
          severity: 'error',
          code: 'schema/condition-bounds',
          message: `"${key}" condition must have exactly one of "atLeast", "atMost"`,
          file: ctx.file,
          range: rangeOf(ctx, path),
          path: [...path],
        });
      }
    }
    return;
  }
  if (key === 'all' || key === 'any') {
    if (Array.isArray(inner)) {
      if (inner.length === 0) {
        ctx.push({
          severity: 'error',
          code: 'schema/empty-combinator',
          message: `"${key}" must have at least one entry`,
          file: ctx.file,
          range: rangeOf(ctx, path),
          path: [...path],
        });
      }
      inner.forEach((entry, index) => checkCondition(entry, [...innerPath, index], ctx));
    }
    return;
  }
  if (key === 'not') {
    checkCondition(inner, innerPath, ctx);
  }
}

function checkOutcome(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (!isRecord(value)) return;
  if (value['text'] !== undefined) checkNarration(value['text'], [...path, 'text'], ctx);
  const transitions = ['next', 'move', 'start-combat', 'end'].filter(
    (key) => value[key] !== undefined,
  );
  if (transitions.length > 1) {
    ctx.push({
      severity: 'error',
      code: 'schema/multiple-transitions',
      message: `outcome has more than one transition (${transitions.join(', ')}); at most one of "next", "move", "start-combat", "end" is allowed`,
      file: ctx.file,
      range: rangeOf(ctx, path),
      path: [...path],
    });
  }
}

function checkChoice(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkText(value['text'], [...path, 'text'], ctx);
  if (value['when'] !== undefined) checkCondition(value['when'], [...path, 'when'], ctx);
  if (value['outcome'] !== undefined && value['test'] !== undefined) {
    const id = typeof value['id'] === 'string' ? ` "${value['id']}"` : '';
    ctx.push({
      severity: 'error',
      code: 'schema/outcome-and-test',
      message: `choice${id} has both "outcome" and "test"; at most one is allowed`,
      file: ctx.file,
      range: rangeOf(ctx, path),
      path: [...path],
    });
  }
  if (value['outcome'] !== undefined) checkOutcome(value['outcome'], [...path, 'outcome'], ctx);
  const test = value['test'];
  if (isRecord(test)) {
    if (test['success'] !== undefined) checkOutcome(test['success'], [...path, 'test', 'success'], ctx);
    if (test['failure'] !== undefined) checkOutcome(test['failure'], [...path, 'test', 'failure'], ctx);
  }
}

function checkManifest(value: unknown, ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkText(value['title'], ['title'], ctx);
  checkText(value['description'], ['description'], ctx);
  checkText(value['version'], ['version'], ctx);
  if (value['intro'] !== undefined) checkNarration(value['intro'], ['intro'], ctx);
  const language = value['language'];
  if (typeof language === 'string') {
    let valid = true;
    try {
      Intl.getCanonicalLocales(language);
    } catch {
      valid = false;
    }
    if (!valid) {
      ctx.push({
        severity: 'error',
        code: 'schema/invalid-language',
        message: `invalid BCP 47 language tag "${language}"`,
        file: ctx.file,
        range: rangeOf(ctx, ['language']),
        path: ['language'],
      });
    }
  }
}

function checkLocation(value: unknown, ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkText(value['name'], ['name'], ctx);
  if (value['description'] !== undefined) {
    checkNarration(value['description'], ['description'], ctx);
  }
  const connections = value['connections'];
  if (Array.isArray(connections)) {
    connections.forEach((connection, index) => {
      if (!isRecord(connection)) return;
      const base: (string | number)[] = ['connections', index];
      if (connection['label'] !== undefined) checkText(connection['label'], [...base, 'label'], ctx);
      if (connection['when'] !== undefined) checkCondition(connection['when'], [...base, 'when'], ctx);
    });
  }
}

function checkScene(value: unknown, ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkText(value['title'], ['title'], ctx);
  if (value['text'] !== undefined) checkNarration(value['text'], ['text'], ctx);
  if (value['trigger'] === undefined && value['when'] !== undefined) {
    const id = typeof value['id'] === 'string' ? ` "${value['id']}"` : '';
    ctx.push({
      severity: 'error',
      code: 'schema/when-on-follow-on',
      message: `follow-on scene${id} (no "trigger") must not have "when"`,
      file: ctx.file,
      range: rangeOf(ctx, ['when']),
      path: ['when'],
    });
  }
  if (value['when'] !== undefined) checkCondition(value['when'], ['when'], ctx);
  const choices = value['choices'];
  if (Array.isArray(choices)) {
    choices.forEach((choice, index) => checkChoice(choice, ['choices', index], ctx));
  }
}

function checkItem(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkText(value['name'], [...path, 'name'], ctx);
  if (value['description'] !== undefined) checkText(value['description'], [...path, 'description'], ctx);
  if (value['kind'] !== 'equipment') return;
  const slot = value['slot'];
  const reach = value['reach'];
  const damage = value['damage'];
  if (slot !== 'weapon') {
    // A non-weapon (or an item whose slot is itself invalid and left for
    // schema/invalid-value) must not carry weapon fields.
    if (slot !== undefined && (typeof slot !== 'string' || ['outfit', 'talisman'].includes(slot))) {
      for (const field of ['reach', 'damage'] as const) {
        if (value[field] !== undefined) {
          ctx.push({
            severity: 'error',
            code: 'schema/weapon-only-field',
            message: `"${field}" is only allowed on weapons (slot "weapon")`,
            file: ctx.file,
            range: rangeOf(ctx, [...path, field]),
            path: [...path, field],
          });
        }
      }
    }
    return;
  }
  if (damage === undefined) {
    const id = typeof value['id'] === 'string' ? ` "${value['id']}"` : '';
    ctx.push({
      severity: 'error',
      code: 'schema/weapon-only-field',
      message: `weapon${id} must have "damage"`,
      file: ctx.file,
      range: rangeOf(ctx, path),
      path: [...path],
    });
    return;
  }
  // Zod already rejects anything outside 2-4; only 4 needs narrowing here.
  if (reach === 'ranged' && damage === 4) {
    ctx.push({
      severity: 'error',
      code: 'schema/invalid-value',
      message: `ranged weapon damage must be 2-3 (melee weapons allow 2-4)`,
      file: ctx.file,
      range: rangeOf(ctx, [...path, 'damage']),
      path: [...path, 'damage'],
    });
  }
}

function checkTemplate(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkText(value['name'], [...path, 'name'], ctx);
  if (value['description'] !== undefined) checkText(value['description'], [...path, 'description'], ctx);
  const attributes = value['attributes'];
  if (isRecord(attributes)) {
    const names = ['might', 'agility', 'wits', 'presence'];
    const numbers = names.map((name) => attributes[name]);
    if (
      numbers.every(
        (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 3,
      )
    ) {
      const sum = (numbers as number[]).reduce((a, b) => a + b, 0);
      if (sum !== 6) {
        const id = typeof value['id'] === 'string' ? ` "${value['id']}"` : '';
        ctx.push({
          severity: 'error',
          code: 'schema/template-points',
          message: `template${id} attributes sum to ${sum}; they must sum to exactly 6`,
          file: ctx.file,
          range: rangeOf(ctx, path),
          path: [...path],
        });
      }
    }
  }
}

function checkEnemy(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkText(value['name'], [...path, 'name'], ctx);
  if (value['description'] !== undefined) checkText(value['description'], [...path, 'description'], ctx);
}

function checkEncounter(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (!isRecord(value)) return;
  if (value['text'] !== undefined) checkNarration(value['text'], [...path, 'text'], ctx);
  if (value['victory'] !== undefined) checkOutcome(value['victory'], [...path, 'victory'], ctx);
  if (value['escape'] !== undefined) checkOutcome(value['escape'], [...path, 'escape'], ctx);
}

function checkEnding(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkText(value['title'], [...path, 'title'], ctx);
  if (value['text'] !== undefined) checkNarration(value['text'], [...path, 'text'], ctx);
}

function checkImage(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (!isRecord(value)) return;
  checkText(value['alt'], [...path, 'alt'], ctx);
}

function checkCatalog(
  section: ManifestSection,
  value: unknown,
  ctx: Ctx,
): void {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    const path: (string | number)[] = [index];
    switch (section) {
      case 'items':
        checkItem(entry, path, ctx);
        break;
      case 'enemies':
        checkEnemy(entry, path, ctx);
        break;
      case 'encounters':
        checkEncounter(entry, path, ctx);
        break;
      case 'templates':
        checkTemplate(entry, path, ctx);
        break;
      case 'endings':
        checkEnding(entry, path, ctx);
        break;
      case 'images':
        checkImage(entry, path, ctx);
        break;
      case 'locations':
      case 'scenes':
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// Phase entry point.
// ---------------------------------------------------------------------------

/**
 * Run the Structure phase over the manifest and every listed content file.
 * Call only when Phase 1 produced no errors.
 */
export function runStructurePhase(
  manifest: ParsedFile,
  files: ParsedFile[],
  push: (diagnostic: Diagnostic) => void,
): void {
  const manifestCtx: Ctx = {
    file: manifest.file,
    contents: manifest.contents,
    lineCounter: manifest.lineCounter,
    push,
  };
  const manifestResult = ManifestSchema.safeParse(manifest.value);
  if (!manifestResult.success) {
    convertIssues(manifestResult.error.issues, manifest.value, manifestCtx);
  }
  checkManifest(manifest.value, manifestCtx);

  for (const file of files) {
    if (file.section === 'manifest') continue;
    const schema = SECTION_SCHEMAS[file.section];
    const ctx: Ctx = {
      file: file.file,
      contents: file.contents,
      lineCounter: file.lineCounter,
      push,
    };
    const result = schema.safeParse(file.value);
    if (!result.success) {
      convertIssues(result.error.issues, file.value, ctx);
    }
    switch (file.section) {
      case 'locations':
        checkLocation(file.value, ctx);
        break;
      case 'scenes':
        checkScene(file.value, ctx);
        break;
      default:
        checkCatalog(file.section, file.value, ctx);
        break;
    }
  }

  // At least one Character Template in total across the templates catalogs.
  const templateFiles = files.filter((file) => file.section === 'templates');
  if (templateFiles.length > 0 && templateFiles.every((file) => Array.isArray(file.value))) {
    const total = templateFiles.reduce(
      (sum, file) => sum + (file.value as unknown[]).length,
      0,
    );
    if (total === 0) {
      push({
        severity: 'error',
        code: 'schema/invalid-value',
        message: 'the scenario must define at least one character template in total',
        file: manifest.file,
        range: nodeRange(
          nodeAtPath(manifest.contents, ['templates']),
          manifest.lineCounter,
        ),
        path: ['templates'],
      });
    }
  }
}
