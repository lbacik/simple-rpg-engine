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
  transitionKeys,
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

export type Ctx = {
  file: string;
  contents: unknown;
  lineCounter: LineCounter;
  push: (diagnostic: Diagnostic) => void;
};

/** Run one Zod definition and convert every issue to a schema/ diagnostic. */
export function runZodCheck(schema: z.ZodTypeAny, value: unknown, ctx: Ctx): void {
  const result = schema.safeParse(value);
  if (!result.success) {
    convertIssues(result.error.issues, value, ctx);
  }
}

/** The schema/invalid-language check for a BCP 47 tag value. */
export function checkLanguageTag(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (typeof value !== 'string') return;
  // An empty tag is never valid BCP 47. Runtimes disagree on it (some
  // throw in Intl.getCanonicalLocales, others return []), so rule it out
  // explicitly and require a canonical result otherwise.
  let valid = value.trim() !== '';
  if (valid) {
    try {
      valid = Intl.getCanonicalLocales(value).length > 0;
    } catch {
      valid = false;
    }
  }
  if (!valid) {
    ctx.push({
      severity: 'error',
      code: 'schema/invalid-language',
      message: `invalid BCP 47 language tag "${value}"`,
      file: ctx.file,
      range: rangeOf(ctx, path),
      path: [...path],
    });
  }
}

/** The schema/empty-text check for a text value (also applied by checkNarration). */
export function checkTextValue(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  checkText(value, path, ctx);
}

/** The narration checks: schema/empty-text, schema/narration-brace and the markdown warning. */
export function checkNarrationValue(
  value: unknown,
  path: readonly (string | number)[],
  ctx: Ctx,
): void {
  checkNarration(value, path, ctx);
}

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

export function isRecord(value: unknown): value is Record<string, unknown> {
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
export function nodeAtPath(root: unknown, path: readonly (string | number)[]): unknown {
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
  // The only array minimum in the definitions is min(1) on `all`/`any`
  // (schema.ts): an empty combinator gets its own stable code here, so the
  // CLI reports one diagnostic for it instead of a generic invalid value.
  if (
    issue.code === 'too_small' &&
    (issue as { origin?: unknown }).origin === 'array' &&
    (issue as { minimum?: unknown }).minimum === 1 &&
    rawPath.length > 0 &&
    (rawPath[rawPath.length - 1] === 'all' || rawPath[rawPath.length - 1] === 'any')
  ) {
    const key = String(rawPath[rawPath.length - 1]);
    ctx.push({
      severity: 'error',
      code: 'schema/empty-combinator',
      message: `"${key}" must have at least one entry`,
      file: ctx.file,
      range: nodeRange(nodeAtPath(ctx.contents, rawPath), ctx.lineCounter),
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
const SETEXT_PATTERN = /^.+\n {0,3}(=+|-+)[ \t]*$/m;
const IMAGE_PATTERN = /!\[[^\]]*\]\([^)]*\)/;
const REF_IMAGE_PATTERN = /!\[[^\]]*\]\[[^\]]*\]/;
const LINK_PATTERN = /(?<!!)\[[^\]]+\]\([^)]*\)/;
const REF_LINK_PATTERN = /(?<!!)\[[^\]]+\]\[[^\]]*\]/;
const AUTOLINK_PATTERN = /<[A-Za-z][A-Za-z0-9+.-]*:[^<>\s]*>/;
const AUTOLINK_PATTERN_G = /<[A-Za-z][A-Za-z0-9+.-]*:[^<>\s]*>/g;
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
  if (HEADING_PATTERN.test(value) || SETEXT_PATTERN.test(value)) outside.push('headings');
  if (REF_IMAGE_PATTERN.test(value) || IMAGE_PATTERN.test(value)) outside.push('images');
  else if (REF_LINK_PATTERN.test(value) || LINK_PATTERN.test(value) || AUTOLINK_PATTERN.test(value)) {
    outside.push('links');
  }
  if (LIST_PATTERN.test(value)) outside.push('lists');
  // Autolinks also match the HTML pattern; strip them so `<https://…>`
  // reports as a link rather than raw HTML.
  if (HTML_PATTERN.test(value.replace(AUTOLINK_PATTERN_G, ''))) outside.push('raw HTML');
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
    // Emptiness is rejected by the Zod minimum and mapped to
    // schema/empty-combinator in convertIssue; only recurse here.
    if (Array.isArray(inner)) {
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
  const transitions = transitionKeys.filter((key) => value[key] !== undefined);
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
    // An empty tag is never valid BCP 47. Runtimes disagree on it (some
    // throw in Intl.getCanonicalLocales, others return []), so rule it out
    // explicitly and require a canonical result otherwise.
    let valid = language.trim() !== '';
    if (valid) {
      try {
        valid = Intl.getCanonicalLocales(language).length > 0;
      } catch {
        valid = false;
      }
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
  if (value['kind'] !== 'equipment') {
    // Consumables, keys and anything else that is not a weapon must not
    // carry weapon fields (docs/spec/validation.md, schema/weapon-only-field).
    // Zod's strict objects also report these keys as schema/unknown-key;
    // both findings are correct.
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
    return;
  }
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
  // Exactly one of `enemy` and `participants` (docs/spec/validation.md,
  // schema/encounter-enemies). The 1-2 length limit and each entry's `enemy`
  // are Zod ranges (schema/invalid-value, schema/missing-field); only the
  // mutually exclusive spelling is a loader-only refinement here, since JSON
  // Schema cannot express it.
  const hasEnemy = value['enemy'] !== undefined;
  const hasParticipants = value['participants'] !== undefined;
  if (hasEnemy === hasParticipants) {
    const id = typeof value['id'] === 'string' ? ` "${value['id']}"` : '';
    ctx.push({
      severity: 'error',
      code: 'schema/encounter-enemies',
      message: hasEnemy
        ? `encounter${id} has both "enemy" and "participants"; exactly one of the two spellings is allowed`
        : `encounter${id} has neither "enemy" nor "participants"; exactly one of the two spellings is required`,
      file: ctx.file,
      range: rangeOf(ctx, path),
      path: [...path],
    });
  }
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
  if (value['motion'] !== undefined) checkMotion(value['motion'], [...path, 'motion'], ctx);
}

// PROTOTYPE (#209): the Motion refinements from the validator rules (#202).
function checkMotion(value: unknown, path: readonly (string | number)[], ctx: Ctx): void {
  if (!isRecord(value)) return;
  const layers = value['layers'];
  if ((layers === undefined && value['camera'] === undefined) || (Array.isArray(layers) && layers.length === 0)) {
    ctx.push({
      severity: 'error',
      code: 'schema/empty-motion',
      message: '"motion" must declare at least one Layer or a "camera"',
      file: ctx.file,
      range: rangeOf(ctx, [...path]),
      path: [...path],
    });
  }
  if (!Array.isArray(layers)) return;
  layers.forEach((layer, index) => {
    if (!isRecord(layer)) return;
    const base = [...path, 'layers', index];
    if (layer['drift'] !== undefined && layer['at'] !== undefined) {
      ctx.push({
        severity: 'error',
        code: 'schema/drift-and-at',
        message: 'a Layer with "drift" must not have "at"; the Drift points place it',
        file: ctx.file,
        range: rangeOf(ctx, [...base, 'at']),
        path: [...base, 'at'],
      });
    }
    if ((layer['frames'] === undefined) !== (layer['fps'] === undefined)) {
      const present = layer['frames'] === undefined ? 'fps' : 'frames';
      ctx.push({
        severity: 'error',
        code: 'schema/frames-fps',
        message: '"frames" and "fps" go together: a sprite strip needs both, a single picture neither',
        file: ctx.file,
        range: rangeOf(ctx, [...base, present]),
        path: [...base, present],
      });
    }
  });
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

  // At least one Character Template in total across the templates catalogs
  // (docs/spec/validation.md, Phase 2): zero catalog files counts as zero.
  const templateFiles = files.filter((file) => file.section === 'templates');
  if (templateFiles.every((file) => Array.isArray(file.value))) {
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
