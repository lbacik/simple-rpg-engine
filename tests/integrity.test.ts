// Phase 3 (Integrity) validation tests: one invalid fixture per ref/ rule,
// asserting code, file and position, plus the compiled-model acceptance
// criteria. See docs/spec/validation.md (Phase 3), docs/spec/scenario-format.md
// (identity and references, Images) and docs/spec/architecture.md.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/content/index';
import type { Diagnostic } from '../src/content/index';
import { makePng } from './pngFixture';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');

function makeScenarioDir(name: string): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-integrity-')), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePackage(dir: string, files: Record<string, string | Buffer>): void {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

// ---------------------------------------------------------------------------
// Valid fixture: exercises every reference kind. Compact on purpose;
// scenarios/whispering-woods is the full one.
// ---------------------------------------------------------------------------

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
  - scenes/after.yaml
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
`;

const GATE_SCENE = `id: gate
title: The Gate
trigger: on-enter
illustration: gate-img
text: |
  Before you stands a gate, {name}.
choices:
  - id: knock
    text: Knock twice.
    when: { flag: met-elder }
    outcome:
      effects:
        - set-flag: met-elder
        - give-item: { item: bread, quantity: 2 }
        - give-item: { item: seal }
      next: after
  - id: peek
    text: Peek through the bars.
    when: { has: { item: seal } }
    outcome:
      text: |
        Nothing answers.
      move: home
  - id: greet
    text: Call out a greeting.
    outcome:
      effects:
        - set-flag: met-elder
      start-combat: rats
`;

const AFTER_SCENE = `id: after
title: After
text: |
  Silence returns.
choices:
  - id: rest
    text: Rest a while.
    outcome:
      effects:
        - heal: 2
      end: dawn
`;

const ITEMS = `- id: sword
  kind: equipment
  name: Sword
  slot: weapon
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
    move: home
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

const IMAGES = `- id: gate-img
  path: images/gate.png
  alt: An old gate.
`;

/** A fully valid package exercising every reference kind. */
function writeValidPackage(dir: string): void {
  const id = path.basename(dir);
  writePackage(dir, {
    'scenario.yaml': MANIFEST.replace('__ID__', id),
    'locations/home.yaml': LOCATION,
    'scenes/gate.yaml': GATE_SCENE,
    'scenes/after.yaml': AFTER_SCENE,
    'items.yaml': ITEMS,
    'enemies.yaml': ENEMIES,
    'encounters.yaml': ENCOUNTERS,
    'templates.yaml': TEMPLATES,
    'endings.yaml': ENDINGS,
    'images.yaml': IMAGES,
    'images/gate.png': makePng(),
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

describe('integrity phase: ids', () => {
  it('loads a valid package exercising every reference kind with no diagnostics', () => {
    expect(succeed(freshValidDir('valid-integrity'))).toEqual([]);
  });

  it('reports no Integrity-phase diagnostics for scenarios/whispering-woods', () => {
    const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
    expect(result.ok).toBe(true);
  });

  it('ref/invalid-id for an entity id outside [a-z][a-z0-9-]*', () => {
    const dir = freshValidDir('invalid-id');
    mutate(dir, 'locations/home.yaml', 'id: home', 'id: Bad_ID');
    const diags = fail(dir);
    const diag = only(diags, 'ref/invalid-id');
    expect(diag.file).toBe('locations/home.yaml');
    expect(diag.path).toEqual(['id']);
    expect(diag.range).toEqual({ line: 1, column: 5, endLine: 1, endColumn: 11 });
    expect(diag.message).toContain('Bad_ID');
  });

  it('ref/invalid-id for a choice id', () => {
    const dir = freshValidDir('invalid-choice-id');
    mutate(dir, 'scenes/gate.yaml', '- id: knock', '- id: Knock!');
    const diags = fail(dir);
    const diag = only(diags, 'ref/invalid-id');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['choices', 0, 'id']);
  });

  it('ref/duplicate-id for two locations sharing an id, with the first in related', () => {
    const dir = makeScenarioDir('duplicate-location');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': MANIFEST.replace('__ID__', id).replace(
        '  - locations/home.yaml\n',
        '  - locations/a.yaml\n  - locations/b.yaml\n',
      ),
      'locations/a.yaml': LOCATION,
      'locations/b.yaml': LOCATION,
      'scenes/gate.yaml': GATE_SCENE,
      'scenes/after.yaml': AFTER_SCENE,
      'items.yaml': ITEMS,
      'enemies.yaml': ENEMIES,
      'encounters.yaml': ENCOUNTERS,
      'templates.yaml': TEMPLATES,
      'endings.yaml': ENDINGS,
      'images.yaml': IMAGES,
      'images/gate.png': makePng(),
    });
    const diags = fail(dir);
    const diag = only(diags, 'ref/duplicate-id');
    expect(diag.file).toBe('locations/b.yaml');
    expect(diag.path).toEqual(['id']);
    expect(diag.range).toEqual({ line: 1, column: 5, endLine: 1, endColumn: 9 });
    expect(diag.related).toEqual([
      {
        file: 'locations/a.yaml',
        range: { line: 1, column: 5, endLine: 1, endColumn: 9 },
        message: 'first declared here',
      },
    ]);
  });

  it('a location and a scene may share an id', () => {
    const dir = freshValidDir('shared-id');
    mutate(dir, 'scenes/after.yaml', 'id: after', 'id: home');
    mutate(dir, 'scenes/gate.yaml', 'next: after', 'next: home');
    expect(succeed(dir)).toEqual([]);
  });

  it('ref/duplicate-choice-id for two choices of one scene sharing an id', () => {
    const dir = freshValidDir('duplicate-choice');
    mutate(dir, 'scenes/gate.yaml', '- id: peek', '- id: knock');
    const diags = fail(dir);
    const diag = only(diags, 'ref/duplicate-choice-id');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['choices', 1, 'id']);
    expect(diag.range).toEqual({ line: 17, column: 9, endLine: 17, endColumn: 14 });
    expect(diag.related).toHaveLength(1);
    expect(diag.related?.[0]?.file).toBe('scenes/gate.yaml');
  });
});

describe('integrity phase: references', () => {
  it('ref/unknown-location for a startLocation that does not exist', () => {
    const dir = freshValidDir('unknown-start-location');
    mutate(dir, 'scenario.yaml', 'startLocation: home', 'startLocation: nowhere');
    const diags = fail(dir);
    const diag = only(diags, 'ref/unknown-location');
    expect(diag.file).toBe('scenario.yaml');
    expect(diag.path).toEqual(['startLocation']);
    expect(diag.range).toEqual({ line: 7, column: 16, endLine: 7, endColumn: 23 });
    expect(diag.message).toContain('nowhere');
  });

  it('ref/unknown-location for a connection target that does not exist', () => {
    const dir = freshValidDir('unknown-connection');
    mutate(dir, 'locations/home.yaml', 'scenes: [gate]\n', 'scenes: [gate]\nconnections:\n  - to: nowhere\n');
    const diags = fail(dir);
    const diag = only(diags, 'ref/unknown-location');
    expect(diag.file).toBe('locations/home.yaml');
    expect(diag.path).toEqual(['connections', 0, 'to']);
    expect(diag.range).toEqual({ line: 8, column: 9, endLine: 8, endColumn: 16 });
  });

  it('ref/unknown-scene for a location listing that does not exist', () => {
    const dir = freshValidDir('unknown-scene-listing');
    mutate(dir, 'locations/home.yaml', 'scenes: [gate]', 'scenes: [gate, nowhere]');
    const diags = fail(dir);
    const diag = only(diags, 'ref/unknown-scene');
    expect(diag.file).toBe('locations/home.yaml');
    expect(diag.path).toEqual(['scenes', 1]);
    expect(diag.range).toEqual({ line: 6, column: 16, endLine: 6, endColumn: 23 });
  });

  it('ref/unknown-scene for a next that does not exist', () => {
    const dir = freshValidDir('unknown-next');
    mutate(dir, 'scenes/gate.yaml', 'next: after', 'next: nowhere');
    const diags = fail(dir);
    const diag = only(diags, 'ref/unknown-scene');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['choices', 0, 'outcome', 'next']);
  });

  it('ref/unknown-item for a template item that does not exist', () => {
    const dir = freshValidDir('unknown-item');
    mutate(dir, 'templates.yaml', '- { item: sword }', '- { item: nowhere }');
    const diags = fail(dir);
    const diag = only(diags, 'ref/unknown-item');
    expect(diag.file).toBe('templates.yaml');
    expect(diag.path).toEqual([0, 'items', 0, 'item']);
    expect(diag.range).toEqual({ line: 5, column: 15, endLine: 5, endColumn: 22 });
  });

  it('ref/unknown-enemy for an encounter enemy that does not exist', () => {
    const dir = freshValidDir('unknown-enemy');
    mutate(dir, 'encounters.yaml', 'enemy: rat', 'enemy: nowhere');
    const diags = fail(dir);
    const diag = only(diags, 'ref/unknown-enemy');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0, 'enemy']);
  });

  it('ref/unknown-encounter for a start-combat that does not exist', () => {
    const dir = freshValidDir('unknown-encounter');
    mutate(dir, 'scenes/gate.yaml', 'move: home', 'start-combat: nowhere');
    const diags = fail(dir);
    const diag = only(diags, 'ref/unknown-encounter');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['choices', 1, 'outcome', 'start-combat']);
  });

  it('ref/unknown-ending for an end that does not exist', () => {
    const dir = freshValidDir('unknown-ending');
    mutate(dir, 'scenes/after.yaml', 'end: dawn', 'end: nowhere');
    const diags = fail(dir);
    const diag = only(diags, 'ref/unknown-ending');
    expect(diag.file).toBe('scenes/after.yaml');
    expect(diag.path).toEqual(['choices', 0, 'outcome', 'end']);
  });

  it('ref/unknown-image for an illustration that is not declared', () => {
    const dir = freshValidDir('unknown-image');
    mutate(dir, 'scenes/gate.yaml', 'illustration: gate-img', 'illustration: nowhere');
    const diags = fail(dir);
    const diag = only(diags, 'ref/unknown-image');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['illustration']);
  });

  it('ref/unknown-image for a location illustration that is not declared', () => {
    const dir = freshValidDir('unknown-location-image');
    mutate(dir, 'locations/home.yaml', 'map: { x: 10, y: 20 }', 'illustration: nowhere\nmap: { x: 10, y: 20 }');
    const diags = fail(dir);
    const diag = only(diags, 'ref/unknown-image');
    expect(diag.file).toBe('locations/home.yaml');
    expect(diag.path).toEqual(['illustration']);
  });

  it('ref/undeclared-flag for a condition on a flag outside the manifest', () => {
    const dir = freshValidDir('undeclared-flag-condition');
    mutate(dir, 'scenes/gate.yaml', 'when: { flag: met-elder }', 'when: { flag: stranger }');
    const diags = fail(dir);
    const diag = only(diags, 'ref/undeclared-flag');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['choices', 0, 'when', 'flag']);
  });

  it('ref/undeclared-flag for an effect on a flag outside the manifest', () => {
    const dir = freshValidDir('undeclared-flag-effect');
    mutate(dir, 'scenes/gate.yaml', '- set-flag: met-elder', '- set-flag: stranger');
    const diags = fail(dir);
    const diag = only(diags, 'ref/undeclared-flag');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['choices', 0, 'outcome', 'effects', 0, 'set-flag']);
  });

  it('ref/death-ending-kind when the death ending is not a defeat', () => {
    const dir = freshValidDir('death-kind');
    mutate(dir, 'endings.yaml', '- id: death\n  kind: defeat', '- id: death\n  kind: victory');
    const diags = fail(dir);
    const diag = only(diags, 'ref/death-ending-kind');
    expect(diag.file).toBe('scenario.yaml');
    expect(diag.path).toEqual(['deathEnding']);
    expect(diag.message).toContain('death');
  });

  it('ref/invalid-id for a malformed reference instead of an unknown diagnostic', () => {
    const dir = freshValidDir('invalid-ref');
    mutate(dir, 'scenes/gate.yaml', 'next: after', 'next: Bad!');
    const diags = fail(dir);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('ref/invalid-id');
    expect(diags[0]?.path).toEqual(['choices', 0, 'outcome', 'next']);
  });
});

describe('integrity phase: membership and slots', () => {
  it('ref/scene-membership for a triggered scene listed by no location', () => {
    const dir = freshValidDir('unlisted-scene');
    mutate(dir, 'locations/home.yaml', 'scenes: [gate]', 'scenes: []');
    const diags = fail(dir);
    const diag = only(diags, 'ref/scene-membership');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['id']);
    expect(diag.message).toContain('no location');
  });

  it('ref/scene-membership for a triggered scene listed by two locations', () => {
    const dir = makeScenarioDir('multi-listed-scene');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': MANIFEST.replace('__ID__', id).replace(
        '  - locations/home.yaml\n',
        '  - locations/a.yaml\n  - locations/b.yaml\n',
      ),
      'locations/a.yaml': LOCATION,
      'locations/b.yaml': LOCATION.replace('id: home', 'id: second'),
      'scenes/gate.yaml': GATE_SCENE,
      'scenes/after.yaml': AFTER_SCENE,
      'items.yaml': ITEMS,
      'enemies.yaml': ENEMIES,
      'encounters.yaml': ENCOUNTERS,
      'templates.yaml': TEMPLATES,
      'endings.yaml': ENDINGS,
      'images.yaml': IMAGES,
      'images/gate.png': makePng(),
    });
    const diags = fail(dir);
    const diag = only(diags, 'ref/scene-membership');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['id']);
    expect(diag.message).toContain('more than one');
    expect(diag.related).toHaveLength(2);
  });

  it('ref/scene-membership for a follow-on scene listed by a location', () => {
    const dir = freshValidDir('listed-follow-on');
    mutate(dir, 'locations/home.yaml', 'scenes: [gate]', 'scenes: [gate, after]');
    const diags = fail(dir);
    const diag = only(diags, 'ref/scene-membership');
    expect(diag.file).toBe('scenes/after.yaml');
    expect(diag.path).toEqual(['id']);
    expect(diag.message).toContain('follow-on');
  });

  it('ref/next-to-triggered-scene for a next to an on-enter scene', () => {
    const dir = freshValidDir('next-to-triggered');
    mutate(dir, 'scenes/gate.yaml', 'next: after', 'next: gate');
    const diags = fail(dir);
    const diag = only(diags, 'ref/next-to-triggered-scene');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['choices', 0, 'outcome', 'next']);
    expect(diag.message).toContain('gate');
  });

  it('ref/scene-membership for a duplicate scene id whose later declaration is a listed follow-on', () => {
    const dir = freshValidDir('dup-scene-trigger');
    writePackage(dir, {
      'scenario.yaml': fs
        .readFileSync(path.join(dir, 'scenario.yaml'), 'utf8')
        .replace('  - scenes/after.yaml', '  - scenes/after.yaml\n  - scenes/gate-again.yaml'),
      'scenes/gate-again.yaml': 'id: gate\ntitle: Gate Again\ntext: |\n  Again.\n',
    });
    const diags = fail(dir);
    const diag = only(diags, 'ref/scene-membership');
    expect(diag.file).toBe('scenes/gate-again.yaml');
    expect(diag.path).toEqual(['id']);
    expect(diag.message).toContain('follow-on');
  });

  it('ref/next-to-triggered-scene when a later duplicate declaration has the trigger', () => {
    const dir = freshValidDir('dup-scene-next');
    writePackage(dir, {
      'scenario.yaml': fs
        .readFileSync(path.join(dir, 'scenario.yaml'), 'utf8')
        .replace('  - scenes/after.yaml', '  - scenes/after.yaml\n  - scenes/after-again.yaml'),
      'scenes/after-again.yaml':
        'id: after\ntitle: After Again\ntrigger: on-enter\ntext: |\n  Again.\n',
    });
    const diags = fail(dir);
    const diag = only(diags, 'ref/next-to-triggered-scene');
    expect(diag.file).toBe('scenes/gate.yaml');
    expect(diag.path).toEqual(['choices', 0, 'outcome', 'next']);
    expect(diag.message).toContain('after');
  });

  it('ref/template-slot-conflict for two starting weapons', () => {
    const dir = freshValidDir('slot-conflict');
    mutate(dir, 'templates.yaml', '- { item: bread, quantity: 2 }', '- { item: sword }');
    const diags = fail(dir);
    const diag = only(diags, 'ref/template-slot-conflict');
    expect(diag.file).toBe('templates.yaml');
    expect(diag.path).toEqual([0, 'items', 1]);
    expect(diag.message).toContain('weapon');
    expect(diag.related).toHaveLength(1);
  });
});

describe('integrity phase: images', () => {
  it('ref/duplicate-image-path for two entries declaring the same path', () => {
    const dir = freshValidDir('duplicate-image-path');
    fs.appendFileSync(
      path.join(dir, 'images.yaml'),
      '- id: gate-img-again\n  path: images/gate.png\n  alt: The gate again.\n',
    );
    const diags = fail(dir);
    const diag = only(diags, 'ref/duplicate-image-path');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([1, 'path']);
    expect(diag.message).toContain('images/gate.png');
    expect(diag.related).toHaveLength(1);
  });

  it('ref/invalid-image-path for an unsupported extension', () => {
    const dir = freshValidDir('invalid-image-path');
    mutate(dir, 'images.yaml', 'path: images/gate.png', 'path: images/gate.gif');
    const diags = fail(dir);
    const diag = only(diags, 'ref/invalid-image-path');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'path']);
    expect(diag.message).toContain('images/gate.gif');
  });

  it('ref/missing-image-file for a declared image that is not on disk', () => {
    const dir = freshValidDir('missing-image');
    mutate(dir, 'images.yaml', 'path: images/gate.png', 'path: images/ghost.png');
    const diags = fail(dir);
    const diag = only(diags, 'ref/missing-image-file');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'path']);
    expect(diag.message).toContain('images/ghost.png');
  });

  it('ref/image-format-mismatch when the signature does not match the extension', () => {
    const dir = freshValidDir('format-mismatch');
    writePackage(dir, { 'images/gate.jpg': makePng() });
    mutate(dir, 'images.yaml', 'path: images/gate.png', 'path: images/gate.jpg');
    const diags = fail(dir);
    const diag = only(diags, 'ref/image-format-mismatch');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'path']);
  });

  it('ref/image-format-mismatch for a truncated file with unreadable dimensions', () => {
    const dir = freshValidDir('truncated-image');
    writePackage(dir, { 'images/gate.png': makePng().subarray(0, 16) });
    const diags = fail(dir);
    const diag = only(diags, 'ref/image-format-mismatch');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'path']);
    expect(diag.message).toContain('images/gate.png');
  });

  it('ref/invalid-image-path for an image under a directory symlinked outside', () => {
    const dir = freshValidDir('image-symlinked-dir');
    const outside = path.join(path.dirname(dir), 'outside-images');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'gate.png'), makePng());
    fs.rmSync(path.join(dir, 'images'), { recursive: true, force: true });
    fs.symlinkSync(outside, path.join(dir, 'images'));
    const diags = fail(dir);
    const diag = only(diags, 'ref/invalid-image-path');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'path']);
    expect(diag.message).toContain('symlink');
  });

  it('ref/image-too-large for a side over 4096 px', () => {
    const dir = freshValidDir('image-too-large-dims');
    writePackage(dir, { 'images/gate.png': makePng(5000, 10) });
    const diags = fail(dir);
    const diag = only(diags, 'ref/image-too-large');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'path']);
    expect(diag.message).toContain('5000');
  });

  it('ref/image-too-large for a file over 2 MiB', () => {
    const dir = freshValidDir('image-too-large-bytes');
    const padding = Buffer.alloc(2 * 1024 * 1024 + 1 - 33, 0);
    writePackage(dir, { 'images/gate.png': Buffer.concat([makePng(), padding]) });
    const diags = fail(dir);
    const diag = only(diags, 'ref/image-too-large');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'path']);
  });
});

describe('compiled scenario model', () => {
  function loadValid(dir: string) {
    const result = loadScenario(dir);
    if (!result.ok) {
      throw new Error(`expected ${dir} to load, but got: ${JSON.stringify(result.diagnostics)}`);
    }
    return result.scenario;
  }

  it('whispering-woods compiles with resolved references, image dimensions and a content hash', () => {
    const scenario = loadValid(path.join(repoRoot, 'scenarios', 'whispering-woods'));
    expect(scenario.id).toBe('whispering-woods');
    expect(scenario.startLocation.id).toBe('ashford');
    expect(scenario.startLocation.scenes.map((scene) => scene.id)).toEqual([
      'arrival',
      'village-return',
      'well-rumours',
    ]);
    expect(scenario.deathEnding.id).toBe('death');
    expect(scenario.deathEnding.kind).toBe('defeat');

    const arrival = scenario.scenes.find((scene) => scene.id === 'arrival');
    expect(arrival?.location?.id).toBe('ashford');
    expect(arrival?.choices.find((choice) => choice.id === 'listen')?.outcome?.next?.id).toBe(
      'elder-plea',
    );
    const elderPlea = scenario.scenes.find((scene) => scene.id === 'elder-plea');
    expect(elderPlea?.location).toBeUndefined();

    // Defaults applied: chapel-prayer omits repeatable, which resolves to false.
    expect(scenario.scenes.find((scene) => scene.id === 'chapel-prayer')?.repeatable).toBe(false);

    expect(scenario.images).toHaveLength(21);
    const ashfordLoc = scenario.locations.find((loc) => loc.id === 'ashford');
    expect(ashfordLoc?.illustration?.id).toBe('loc-ashford');
    const chapelAltar = scenario.images.find((image) => image.id === 'chapel-altar');
    expect(chapelAltar).toMatchObject({
      id: 'chapel-altar',
      path: 'images/chapel-altar.png',
      format: 'png',
      width: 640,
      height: 360,
    });
    expect(chapelAltar?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(chapelAltar?.alt).toContain('chapel');
    expect(scenario.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('resolves template items and encounter enemies', () => {
    const scenario = loadValid(freshValidDir('compiled-refs'));
    const drifter = scenario.templates.find((template) => template.id === 'drifter');
    expect(drifter?.items.map((entry) => [entry.item.id, entry.quantity])).toEqual([
      ['sword', 1],
      ['bread', 2],
    ]);
    expect(scenario.encounters.find((encounter) => encounter.id === 'rats')?.participants.map((p) => [p.id, p.enemy.id])).toEqual([['rat', 'rat']]);
    expect(scenario.locationsById['home']?.scenes.map((scene) => scene.id)).toEqual(['gate']);
  });

  it('defaults a labelless connection label to the target location name', () => {
    const dir = freshValidDir('label-default');
    mutate(dir, 'locations/home.yaml', 'scenes: [gate]', 'scenes: [gate]\nconnections:\n  - to: home');
    const scenario = loadValid(dir);
    expect(scenario.locationsById['home']?.connections.map((connection) => connection.label)).toEqual(
      ['Home'],
    );
  });

  it('computes a content hash stable across runs', () => {
    const dir = freshValidDir('hash-stable');
    expect(loadValid(dir).contentHash).toBe(loadValid(dir).contentHash);
  });

  it('changes the content hash when a listed file, the manifest or an image changes', () => {
    const dir = freshValidDir('hash-changes');
    const baseline = loadValid(dir).contentHash;
    mutate(dir, 'scenes/gate.yaml', 'Knock twice.', 'Knock thrice.');
    expect(loadValid(dir).contentHash).not.toBe(baseline);

    const afterFile = loadValid(dir).contentHash;
    mutate(dir, 'scenario.yaml', 'title: Test Scenario', 'title: Retitled Scenario');
    expect(loadValid(dir).contentHash).not.toBe(afterFile);

    const afterManifest = loadValid(dir).contentHash;
    writePackage(dir, { 'images/gate.png': makePng(2, 2) });
    expect(loadValid(dir).contentHash).not.toBe(afterManifest);
  });

  it('freezes the compiled model so mutations throw', () => {
    const scenario = loadValid(freshValidDir('frozen-model'));
    expect(Object.isFrozen(scenario)).toBe(true);
    expect(Object.isFrozen(scenario.locations)).toBe(true);
    expect(Object.isFrozen(scenario.locations[0])).toBe(true);
    expect(Object.isFrozen(scenario.locations[0]?.scenes)).toBe(true);
    expect(() => {
      (scenario as unknown as Record<string, unknown>)['title'] = 'Changed';
    }).toThrow(TypeError);
    expect(() => {
      (scenario.locations[0] as unknown as Record<string, unknown>)['name'] = 'Changed';
    }).toThrow(TypeError);
  });
});
