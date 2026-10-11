// Phase 2 (Structure) validation tests: one invalid fixture per schema/
// rule, asserting code, file, range and path, plus both sides of every
// mechanics range boundary. See docs/spec/validation.md (Phase 2) and
// docs/spec/scenario-format.md.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/content/index';
import type { Diagnostic } from '../src/content/index';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');

function makeScenarioDir(name: string): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-schema-')), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePackage(dir: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

const MANIFEST = `schemaVersion: 1
id: __ID__
title: Test Scenario
description: A test scenario.
version: "1.0"
language: en
startLocation: home
deathEnding: death
flags:
  - met-elder
locations:
  - locations/home.yaml
scenes:
  - scenes/gate.yaml
items:
  - items.yaml
enemies:
  - enemies.yaml
encounters:
  - encounters.yaml
templates:
  - templates.yaml
endings:
  - endings.yaml
images:
  - images.yaml
`;

const LOCATION = `id: home
name: Home
description: |
  A quiet home, {name}.
map: { x: 10, y: 20 }
scenes: [gate]
connections:
  - to: home
    label: Go home
    when: { flag: met-elder }
`;

const SCENE = `id: gate
title: The Gate
trigger: on-enter
text: |
  Before you stands a gate, {name}.

  It is **old** and *patient*.
choices:
  - id: knock
    text: Knock twice.
    outcome:
      text: |
        Nothing answers.
      effects:
        - set-flag: met-elder
        - heal: 2
      move: home
  - id: test-luck
    text: Try the handle.
    test:
      attribute: wits
      difficulty: very-hard
      success:
        text: |
          It opens.
        effects:
          - give-item: { item: bread, quantity: 2 }
      failure:
        text: |
          It holds.
        effects:
          - damage: 1
  - id: remember
    text: Remember the seal.
    when: { has: { item: seal, atLeast: 2 } }
`;

const ITEMS = `- id: sword
  kind: equipment
  name: Sword
  slot: weapon
  damage: 3
- id: cloak
  kind: equipment
  name: Cloak
  slot: outfit
  bonus: agility
- id: bow
  kind: equipment
  name: Bow
  slot: weapon
  reach: ranged
  damage: 3
- id: bread
  kind: consumable
  name: Bread
  heal: 2
- id: seal
  kind: key
  name: Seal
`;

const ENEMIES = `- id: rat
  name: Rat
  attributes: { might: 1, agility: 2, wits: 0, presence: 0 }
  health: 3
  damage: 1
`;

const ENCOUNTERS = `- id: rats
  enemy: rat
  text: |
    Rats pour from the walls.
  victory:
    text: |
      Silence returns.
  escape:
    text: |
      You run.
    move: home
`;

const TEMPLATES = `- id: drifter
  name: Drifter
  attributes: { might: 2, agility: 2, wits: 1, presence: 1 }
  items:
    - { item: sword }
    - { item: bread, quantity: 2 }
`;

const ENDINGS = `- id: death
  kind: defeat
  title: Death
  text: |
    Darkness takes you.
- id: dawn
  kind: victory
  title: Dawn
  text: |
    Morning comes.
`;

const IMAGES = `- id: gate
  path: images/gate.png
  alt: An old gate.
`;

/** A fully valid package exercising every file kind. */
function writeValidPackage(dir: string): void {
  const id = path.basename(dir);
  writePackage(dir, {
    'scenario.yaml': MANIFEST.replace('__ID__', id),
    'locations/home.yaml': LOCATION,
    'scenes/gate.yaml': SCENE,
    'items.yaml': ITEMS,
    'enemies.yaml': ENEMIES,
    'encounters.yaml': ENCOUNTERS,
    'templates.yaml': TEMPLATES,
    'endings.yaml': ENDINGS,
    'images.yaml': IMAGES,
  });
}

function freshValidDir(name: string): string {
  const dir = makeScenarioDir(name);
  writeValidPackage(dir);
  return dir;
}

function mutate(dir: string, file: string, from: string, to: string): void {
  const full = path.join(dir, file);
  const source = fs.readFileSync(full, 'utf8');
  if (!source.includes(from)) throw new Error(`mutation source not found in ${file}: ${from}`);
  fs.writeFileSync(full, source.replace(from, to));
}

function fail(dir: string): Diagnostic[] {
  const result = loadScenario(dir);
  if (result.ok) throw new Error(`expected ${dir} to be rejected, but it loaded`);
  return result.diagnostics;
}

function succeed(dir: string): Diagnostic[] {
  const result = loadScenario(dir);
  if (!result.ok) {
    throw new Error(`expected ${dir} to load, but got: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.warnings;
}

function only(diags: Diagnostic[], code: string): Diagnostic {
  const match = diags.filter((d) => d.code === code);
  expect(match).toHaveLength(1);
  return match[0] as Diagnostic;
}

/** Mutate one file of a fresh valid package and expect one diagnostic. */
function expectInvalid(
  name: string,
  file: string,
  from: string,
  to: string,
  code: string,
): Diagnostic {
  const dir = freshValidDir(name);
  mutate(dir, file, from, to);
  const diags = fail(dir);
  expect(diags).toHaveLength(1);
  const diag = diags[0] as Diagnostic;
  expect(diag.code).toBe(code);
  expect(diag.file).toBe(file);
  expect(diag.severity).toBe('error');
  return diag;
}

/** Mutate one file of a fresh valid package and expect it to still load. */
function expectValid(name: string, file: string, from: string, to: string): void {
  const dir = freshValidDir(name);
  mutate(dir, file, from, to);
  expect(succeed(dir)).toEqual([]);
}

describe('structure phase', () => {
  it('loads a valid package exercising every file kind with no diagnostics', () => {
    // The fixture uses very-hard, {name}, bold/italic, a quoted version
    // "1.0" and an empty Outcome (a choice with neither outcome nor test),
    // proving those forms are accepted.
    expect(succeed(freshValidDir('valid-structure'))).toEqual([]);
  });

  it('reports no Structure-phase diagnostics for scenarios/whispering-woods', () => {
    const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
    expect(result.ok).toBe(true);
  });

  it('schema/unknown-key for an unknown manifest key', () => {
    const diag = expectInvalid(
      'unknown-key-manifest',
      'scenario.yaml',
      'images:\n  - images.yaml\n',
      'images:\n  - images.yaml\nbogusKey: 1\n',
      'schema/unknown-key',
    );
    expect(diag.path).toEqual(['bogusKey']);
    expect(diag.range).toEqual({ line: 27, column: 1, endLine: 27, endColumn: 9 });
    expect(diag.message).toContain('bogusKey');
  });

  it('schema/unknown-key for a snake_case manifest key (keys are camelCase)', () => {
    const dir = freshValidDir('unknown-key-snake');
    mutate(dir, 'scenario.yaml', 'startLocation: home', 'start_location: home');
    const diags = fail(dir);
    expect(diags.map((d) => d.code).sort()).toEqual([
      'schema/missing-field',
      'schema/unknown-key',
    ]);
    const unknown = only(diags, 'schema/unknown-key');
    expect(unknown.path).toEqual(['start_location']);
    expect(unknown.range).toEqual({ line: 7, column: 1, endLine: 7, endColumn: 15 });
  });

  it('schema/unknown-key for an unknown nested key', () => {
    const diag = expectInvalid(
      'unknown-key-nested',
      'scenes/gate.yaml',
      '  - id: knock\n    text: Knock twice.\n',
      '  - id: knock\n    text: Knock twice.\n    bogus: 1\n',
      'schema/unknown-key',
    );
    expect(diag.path).toEqual(['choices', 0, 'bogus']);
    expect(diag.range).toEqual({ line: 11, column: 5, endLine: 11, endColumn: 10 });
  });

  it('schema/unknown-key for an unknown item key', () => {
    const diag = expectInvalid(
      'unknown-key-item',
      'items.yaml',
      '- id: seal\n  kind: key\n  name: Seal\n',
      '- id: seal\n  kind: key\n  name: Seal\n  bogus: 1\n',
      'schema/unknown-key',
    );
    expect(diag.path).toEqual([4, 'bogus']);
    expect(diag.range).toEqual({ line: 24, column: 3, endLine: 24, endColumn: 8 });
  });

  it('schema/missing-field for a missing required key', () => {
    const dir = freshValidDir('missing-field');
    mutate(dir, 'scenes/gate.yaml', 'title: The Gate\n', '');
    const diags = fail(dir);
    const diag = only(diags, 'schema/missing-field');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['title']);
    expect(diag.message).toContain('title');
    expect(diag.range).toBeDefined();
  });

  it('schema/missing-field for a missing encounter escape', () => {
    const diag = expectInvalid(
      'missing-escape',
      'encounters.yaml',
      '  escape:\n    text: |\n      You run.\n    move: home\n',
      '',
      'schema/missing-field',
    );
    expect(diag.path).toEqual([0, 'escape']);
  });

  it('schema/invalid-value for a mistyped text field', () => {
    const diag = expectInvalid(
      'invalid-type',
      'scenes/gate.yaml',
      'title: The Gate',
      'title: 42',
      'schema/invalid-value',
    );
    expect(diag.path).toEqual(['title']);
    expect(diag.range).toEqual({ line: 2, column: 8, endLine: 2, endColumn: 10 });
  });

  it('schema/invalid-value for `very hard`, while `very-hard` is accepted', () => {
    const diag = expectInvalid(
      'very-hard',
      'scenes/gate.yaml',
      'difficulty: very-hard',
      'difficulty: very hard',
      'schema/invalid-value',
    );
    expect(diag.path).toEqual(['choices', 1, 'test', 'difficulty']);
    expect(diag.range).toEqual({ line: 22, column: 19, endLine: 22, endColumn: 28 });
  });

  it('schema/empty-text for an empty required text field', () => {
    for (const empty of ['""', '"   "']) {
      const diag = expectInvalid(
        `empty-text-${empty.length}`,
        'scenes/gate.yaml',
        'title: The Gate',
        `title: ${empty}`,
        'schema/empty-text',
      );
      expect(diag.path).toEqual(['title']);
      expect(diag.range).toEqual({ line: 2, column: 8, endLine: 2, endColumn: 8 + empty.length });
    }
  });

  it('schema/empty-text for a present-but-empty optional text field', () => {
    const diag = expectInvalid(
      'empty-optional',
      'locations/home.yaml',
      'label: Go home',
      'label: ""',
      'schema/empty-text',
    );
    expect(diag.path).toEqual(['connections', 0, 'label']);
    // An omitted optional field is fine (covered by the valid fixture).
  });

  it('schema/template-points when attributes do not sum to 6', () => {
    const low = expectInvalid(
      'template-points-low',
      'templates.yaml',
      'attributes: { might: 2, agility: 2, wits: 1, presence: 1 }',
      'attributes: { might: 2, agility: 2, wits: 1, presence: 0 }',
      'schema/template-points',
    );
    expect(low.path).toEqual([0]);
    expect(low.message).toContain('5');
    const high = expectInvalid(
      'template-points-high',
      'templates.yaml',
      'attributes: { might: 2, agility: 2, wits: 1, presence: 1 }',
      'attributes: { might: 3, agility: 2, wits: 1, presence: 1 }',
      'schema/template-points',
    );
    expect(high.path).toEqual([0]);
    expect(high.message).toContain('7');
  });

  it('schema/multiple-transitions for two transitions in one outcome', () => {
    const diag = expectInvalid(
      'multiple-transitions',
      'scenes/gate.yaml',
      '      move: home\n',
      '      move: home\n      next: elder-plea\n',
      'schema/multiple-transitions',
    );
    expect(diag.path).toEqual(['choices', 0, 'outcome']);
  });

  it('schema/outcome-and-test for a choice with both', () => {
    const diag = expectInvalid(
      'outcome-and-test',
      'scenes/gate.yaml',
      '  - id: remember\n    text: Remember the seal.\n    when: { has: { item: seal, atLeast: 2 } }\n',
      '  - id: remember\n    text: Remember the seal.\n    outcome:\n      move: home\n    test:\n      attribute: wits\n      difficulty: easy\n      success: {}\n      failure: {}\n',
      'schema/outcome-and-test',
    );
    expect(diag.path).toEqual(['choices', 2]);
  });

  it('schema/when-on-follow-on for `when` on a scene without trigger', () => {
    const diag = expectInvalid(
      'when-on-follow-on',
      'scenes/gate.yaml',
      'id: gate\ntitle: The Gate\ntrigger: on-enter\n',
      'id: gate\ntitle: The Gate\nwhen: { flag: met-elder }\n',
      'schema/when-on-follow-on',
    );
    expect(diag.path).toEqual(['when']);
    expect(diag.range).toEqual({ line: 3, column: 7, endLine: 3, endColumn: 26 });
  });

  it('schema/condition-bounds for zero or two bounds', () => {
    const dir = freshValidDir('condition-bounds-zero');
    mutate(
      dir,
      'locations/home.yaml',
      'when: { flag: met-elder }',
      'when: { attribute: { name: might } }',
    );
    const zero = only(fail(dir), 'schema/condition-bounds');
    expect(zero.path).toEqual(['connections', 0, 'when']);

    const both = expectInvalid(
      'condition-bounds-both',
      'locations/home.yaml',
      'when: { flag: met-elder }',
      'when: { health: { atLeast: 3, atMost: 5 } }',
      'schema/condition-bounds',
    );
    expect(both.path).toEqual(['connections', 0, 'when']);
  });

  it('schema/empty-combinator for empty all/any', () => {
    const all = expectInvalid(
      'empty-all',
      'locations/home.yaml',
      'when: { flag: met-elder }',
      'when: { all: [] }',
      'schema/empty-combinator',
    );
    expect(all.path).toEqual(['connections', 0, 'when']);
    const any = expectInvalid(
      'empty-any',
      'locations/home.yaml',
      'when: { flag: met-elder }',
      'when: { any: [] }',
      'schema/empty-combinator',
    );
    expect(any.path).toEqual(['connections', 0, 'when']);
  });

  it('schema/weapon-only-field for reach/damage off-weapon and damage-less weapons', () => {
    const reach = expectInvalid(
      'weapon-only-reach',
      'items.yaml',
      '  slot: outfit\n  bonus: agility\n',
      '  slot: outfit\n  bonus: agility\n  reach: ranged\n',
      'schema/weapon-only-field',
    );
    expect(reach.path).toEqual([1, 'reach']);

    const nodamage = expectInvalid(
      'weapon-only-nodamage',
      'items.yaml',
      '  slot: weapon\n  damage: 3\n- id: cloak',
      '  slot: weapon\n- id: cloak',
      'schema/weapon-only-field',
    );
    expect(nodamage.path).toEqual([0]);
  });

  it('schema/invalid-language for a bad BCP 47 tag', () => {
    const diag = expectInvalid(
      'invalid-language',
      'scenario.yaml',
      'language: en',
      'language: not a language!',
      'schema/invalid-language',
    );
    expect(diag.path).toEqual(['language']);
    expect(diag.range).toEqual({ line: 6, column: 11, endLine: 6, endColumn: 26 });
    expectValid('valid-language-tag', 'scenario.yaml', 'language: en', 'language: en-US');
  });

  it('schema/narration-brace for a brace outside {name}', () => {
    const diag = expectInvalid(
      'narration-brace',
      'scenes/gate.yaml',
      'Nothing answers.',
      'Nothing answers, {nmae}.',
      'schema/narration-brace',
    );
    expect(diag.path).toEqual(['choices', 0, 'outcome', 'text']);
  });

  it('schema/markdown-outside-subset warns without blocking', () => {
    const cases: [string, string][] = [
      ['heading', '# A heading'],
      ['link', 'See [the tale](https://example.com).'],
      ['image', 'See ![the gate](gate.png).'],
      ['list', '- first\n        - second'],
      ['html', 'A <b>bold</b> claim.'],
    ];
    for (const [name, narration] of cases) {
      const dir = freshValidDir(`markdown-${name}`);
      mutate(dir, 'scenes/gate.yaml', 'Nothing answers.', narration);
      const warnings = succeed(dir);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        severity: 'warning',
        code: 'schema/markdown-outside-subset',
        file: 'scenes/gate.yaml',
        path: ['choices', 0, 'outcome', 'text'],
      });
    }
  });

  it('an unquoted version is an error; a quoted version is fine', () => {
    const diag = expectInvalid(
      'version-number',
      'scenario.yaml',
      'version: "1.0"',
      'version: 1.0',
      'schema/invalid-value',
    );
    expect(diag.path).toEqual(['version']);
    expect(diag.range).toEqual({ line: 5, column: 10, endLine: 5, endColumn: 13 });
  });

  it('no character template at all is an error on the manifest', () => {
    const dir = freshValidDir('no-templates');
    fs.writeFileSync(path.join(dir, 'templates.yaml'), '[]\n');
    const diags = fail(dir);
    const diag = only(diags, 'schema/invalid-value');
    expect(diag.file).toBe('scenario.yaml');
    expect(diag.path).toEqual(['templates']);
  });

  it('an unknown item kind is an error', () => {
    const diag = expectInvalid(
      'unknown-kind',
      'items.yaml',
      'kind: key\n  name: Seal',
      'kind: potion\n  name: Seal',
      'schema/invalid-value',
    );
    expect(diag.path).toEqual([4, 'kind']);
  });

  it('an effect with two keys is an error at the effect', () => {
    const diag = expectInvalid(
      'effect-two-keys',
      'scenes/gate.yaml',
      '        - set-flag: met-elder\n',
      '        - set-flag: met-elder\n          clear-flag: other\n',
      'schema/invalid-value',
    );
    expect(diag.path).toEqual(['choices', 0, 'outcome', 'effects', 0]);
    expect(diag.message).toContain('exactly one key');
  });

  it('a condition with two facts is an error at the condition', () => {
    const diag = expectInvalid(
      'condition-two-keys',
      'locations/home.yaml',
      'when: { flag: met-elder }',
      'when: { flag: met-elder, visited: home }',
      'schema/invalid-value',
    );
    expect(diag.path).toEqual(['connections', 0, 'when']);
    expect(diag.message).toContain('exactly one key');
  });

  it('an effect in the wrong form is an error', () => {
    const diag = expectInvalid(
      'effect-form',
      'scenes/gate.yaml',
      '- give-item: { item: bread, quantity: 2 }',
      '- give-item: bread',
      'schema/invalid-value',
    );
    expect(diag.path).toEqual(['choices', 1, 'test', 'success', 'effects', 0, 'give-item']);
  });

  it('a structure error stops the pipeline with only schema/ diagnostics', () => {
    // `next: nowhere` would be a ref/ error in phase 3; phase 2 must stop
    // before it while reporting its own error.
    const dir = freshValidDir('gating');
    mutate(dir, 'scenes/gate.yaml', 'title: The Gate', 'title: 42');
    mutate(dir, 'scenes/gate.yaml', 'move: home', 'move: nowhere');
    const diags = fail(dir);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.every((d) => d.code.startsWith('schema/'))).toBe(true);
  });
});

describe('structure range boundaries', () => {
  it('location map 0-100', () => {
    expectValid('map-max', 'locations/home.yaml', 'map: { x: 10, y: 20 }', 'map: { x: 0, y: 100 }');
    const low = expectInvalid(
      'map-low',
      'locations/home.yaml',
      'map: { x: 10, y: 20 }',
      'map: { x: -1, y: 20 }',
      'schema/invalid-value',
    );
    expect(low.path).toEqual(['map', 'x']);
    const high = expectInvalid(
      'map-high',
      'locations/home.yaml',
      'map: { x: 10, y: 20 }',
      'map: { x: 10, y: 101 }',
      'schema/invalid-value',
    );
    expect(high.path).toEqual(['map', 'y']);
  });

  it('effect heal and damage 1-12', () => {
    expectValid('heal-min', 'scenes/gate.yaml', '- heal: 2', '- heal: 1');
    expectValid('heal-max', 'scenes/gate.yaml', '- heal: 2', '- heal: 12');
    const healLow = expectInvalid(
      'heal-low',
      'scenes/gate.yaml',
      '- heal: 2',
      '- heal: 0',
      'schema/invalid-value',
    );
    expect(healLow.path).toEqual(['choices', 0, 'outcome', 'effects', 1, 'heal']);
    const healHigh = expectInvalid(
      'heal-high',
      'scenes/gate.yaml',
      '- heal: 2',
      '- heal: 13',
      'schema/invalid-value',
    );
    expect(healHigh.path).toEqual(['choices', 0, 'outcome', 'effects', 1, 'heal']);
    expectValid('damage-min', 'scenes/gate.yaml', '- damage: 1', '- damage: 1');
    expectValid('damage-max', 'scenes/gate.yaml', '- damage: 1', '- damage: 12');
    expectInvalid('damage-low', 'scenes/gate.yaml', '- damage: 1', '- damage: 0', 'schema/invalid-value');
    expectInvalid('damage-high', 'scenes/gate.yaml', '- damage: 1', '- damage: 13', 'schema/invalid-value');
  });

  it('give-item quantity of at least 1 with no upper bound', () => {
    expectValid('quantity-min', 'scenes/gate.yaml', 'quantity: 2', 'quantity: 1');
    expectValid('quantity-huge', 'scenes/gate.yaml', 'quantity: 2', 'quantity: 999');
    const diag = expectInvalid(
      'quantity-low',
      'scenes/gate.yaml',
      'quantity: 2',
      'quantity: 0',
      'schema/invalid-value',
    );
    expect(diag.path).toEqual(['choices', 1, 'test', 'success', 'effects', 0, 'give-item', 'quantity']);
  });

  it('has atLeast of at least 1 with no upper bound', () => {
    expectValid('has-min', 'scenes/gate.yaml', 'atLeast: 2', 'atLeast: 1');
    expectValid('has-huge', 'scenes/gate.yaml', 'atLeast: 2', 'atLeast: 999');
    const diag = expectInvalid(
      'has-low',
      'scenes/gate.yaml',
      'atLeast: 2',
      'atLeast: 0',
      'schema/invalid-value',
    );
    expect(diag.path).toEqual(['choices', 2, 'when', 'has', 'atLeast']);
  });

  it('attribute bounds atLeast 1-5 and atMost 0-4', () => {
    const file = 'locations/home.yaml';
    const from = 'when: { flag: met-elder }';
    expectValid('attr-least-min', file, from, 'when: { attribute: { name: might, atLeast: 1 } }');
    expectValid('attr-least-max', file, from, 'when: { attribute: { name: might, atLeast: 5 } }');
    expectInvalid('attr-least-low', file, from, 'when: { attribute: { name: might, atLeast: 0 } }', 'schema/invalid-value');
    expectInvalid('attr-least-high', file, from, 'when: { attribute: { name: might, atLeast: 6 } }', 'schema/invalid-value');
    expectValid('attr-most-min', file, from, 'when: { attribute: { name: might, atMost: 0 } }');
    expectValid('attr-most-max', file, from, 'when: { attribute: { name: might, atMost: 4 } }');
    expectInvalid('attr-most-low', file, from, 'when: { attribute: { name: might, atMost: -1 } }', 'schema/invalid-value');
    expectInvalid('attr-most-high', file, from, 'when: { attribute: { name: might, atMost: 5 } }', 'schema/invalid-value');
  });

  it('health bounds atLeast 2-12 and atMost 1-11', () => {
    const file = 'locations/home.yaml';
    const from = 'when: { flag: met-elder }';
    expectValid('health-least-min', file, from, 'when: { health: { atLeast: 2 } }');
    expectValid('health-least-max', file, from, 'when: { health: { atLeast: 12 } }');
    expectInvalid('health-least-low', file, from, 'when: { health: { atLeast: 1 } }', 'schema/invalid-value');
    expectInvalid('health-least-high', file, from, 'when: { health: { atLeast: 13 } }', 'schema/invalid-value');
    expectValid('health-most-min', file, from, 'when: { health: { atMost: 1 } }');
    expectValid('health-most-max', file, from, 'when: { health: { atMost: 11 } }');
    expectInvalid('health-most-low', file, from, 'when: { health: { atMost: 0 } }', 'schema/invalid-value');
    expectInvalid('health-most-high', file, from, 'when: { health: { atMost: 12 } }', 'schema/invalid-value');
  });

  it('melee weapon damage 2-4', () => {
    expectValid('melee-min', 'items.yaml', 'slot: weapon\n  damage: 3', 'slot: weapon\n  damage: 2');
    expectValid('melee-max', 'items.yaml', 'slot: weapon\n  damage: 3', 'slot: weapon\n  damage: 4');
    expectInvalid('melee-low', 'items.yaml', 'slot: weapon\n  damage: 3', 'slot: weapon\n  damage: 1', 'schema/invalid-value');
    expectInvalid('melee-high', 'items.yaml', 'slot: weapon\n  damage: 3', 'slot: weapon\n  damage: 5', 'schema/invalid-value');
  });

  it('ranged weapon damage 2-3', () => {
    expectValid('ranged-min', 'items.yaml', 'reach: ranged\n  damage: 3', 'reach: ranged\n  damage: 2');
    const diag = expectInvalid(
      'ranged-high',
      'items.yaml',
      'reach: ranged\n  damage: 3',
      'reach: ranged\n  damage: 4',
      'schema/invalid-value',
    );
    expect(diag.path).toEqual([2, 'damage']);
    expectInvalid('ranged-low', 'items.yaml', 'reach: ranged\n  damage: 3', 'reach: ranged\n  damage: 1', 'schema/invalid-value');
  });

  it('consumable heal 1-12', () => {
    expectValid('consumable-min', 'items.yaml', 'name: Bread\n  heal: 2', 'name: Bread\n  heal: 1');
    expectValid('consumable-max', 'items.yaml', 'name: Bread\n  heal: 2', 'name: Bread\n  heal: 12');
    expectInvalid('consumable-low', 'items.yaml', 'name: Bread\n  heal: 2', 'name: Bread\n  heal: 0', 'schema/invalid-value');
    expectInvalid('consumable-high', 'items.yaml', 'name: Bread\n  heal: 2', 'name: Bread\n  heal: 13', 'schema/invalid-value');
  });

  it('enemy attributes 0-3, health 1-30, damage 1-6', () => {
    const file = 'enemies.yaml';
    expectValid('enemy-attr-min', file, 'might: 1', 'might: 0');
    expectValid('enemy-attr-max', file, 'might: 1', 'might: 3');
    expectInvalid('enemy-attr-low', file, 'might: 1', 'might: -1', 'schema/invalid-value');
    expectInvalid('enemy-attr-high', file, 'might: 1', 'might: 4', 'schema/invalid-value');
    expectValid('enemy-health-min', file, 'health: 3', 'health: 1');
    expectValid('enemy-health-max', file, 'health: 3', 'health: 30');
    expectInvalid('enemy-health-low', file, 'health: 3', 'health: 0', 'schema/invalid-value');
    expectInvalid('enemy-health-high', file, 'health: 3', 'health: 31', 'schema/invalid-value');
    expectValid('enemy-damage-min', file, 'damage: 1', 'damage: 1');
    expectValid('enemy-damage-max', file, 'damage: 1', 'damage: 6');
    expectInvalid('enemy-damage-low', file, 'damage: 1', 'damage: 0', 'schema/invalid-value');
    expectInvalid('enemy-damage-high', file, 'damage: 1', 'damage: 7', 'schema/invalid-value');
  });

  it('template starting-item quantity of at least 1', () => {
    expectValid('template-qty', 'templates.yaml', 'quantity: 2', 'quantity: 1');
    expectInvalid('template-qty-low', 'templates.yaml', 'quantity: 2', 'quantity: 0', 'schema/invalid-value');
  });
});
