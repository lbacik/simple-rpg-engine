// Content format v2 validation catalogue (#184 Q15): one fixture per rule,
// asserting diagnostic code and source location. Weapon `damage`/`reach`,
// missing `surrender`/`draw`, the unknown-profile case and the shipped
// Scenario pins live in tests/schema.test.ts; the Encounter → Combat builder
// matrix lives in tests/combat-builder.test.ts. See docs/spec/validation.md.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/content/index';
import type { Diagnostic } from '../src/content/index';
import { makePng } from './pngFixture';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(testsDir, 'fixtures', 'scenarios');

function makeScenarioDir(name: string): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-v2-')), name);
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

const MANIFEST = `schemaVersion: 2
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
        - give-item: { item: seal }
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
          - give-item: { item: bow }
        end: dawn
      failure:
        text: |
          It holds.
        effects:
          - damage: 1
  - id: remember
    text: Remember the seal.
    when: { has: { item: seal, atLeast: 2 } }
  - id: fight-rats
    text: Drive off the rats.
    when: { flag: met-elder }
    outcome:
      start-combat: rats
illustration: gate
`;

const ITEMS = `- id: sword
  kind: equipment
  name: Sword
  slot: weapon
- id: cloak
  kind: equipment
  name: Cloak
  slot: outfit
  bonus: agility
- id: bow
  kind: equipment
  name: Bow
  slot: weapon
  bonus: agility
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
  profile: raider
`;

const ENCOUNTERS = `- id: rats
  enemy: rat
  startRange: melee
  text: |
    Rats pour from the walls.
  victory:
    text: |
      Silence returns.
    move: home
  surrender:
    text: |
      You yield.
    move: home
  draw:
    text: |
      You break off.
    move: home
`;

const TEMPLATES = `- id: drifter
  name: Drifter
  attributes: { might: 2, agility: 2, wits: 1, presence: 1 }
  items:
    - { item: sword }
    - { item: bread, quantity: 2 }
    - { item: cloak }
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

const COMPANIONS = `- id: ada
  name: Ada
  profile: party-sentinel
`;

/** A fully valid v2 package exercising every base file kind. */
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

/** The `participants` spelling of the valid encounter, for per-participant fields. */
function toParticipants(dir: string): void {
  mutate(dir, 'encounters.yaml', '  enemy: rat\n  startRange: melee', '  participants:\n    - enemy: rat\n      startRange: melee');
}

describe('content format v2 catalogue (Q15)', () => {
  it('schema/retired-format for a manifest pinned to schemaVersion 1', () => {
    const diag = expectInvalid(
      'retired-format',
      'scenario.yaml',
      'schemaVersion: 2',
      'schemaVersion: 1',
      'schema/retired-format',
    );
    expect(diag.path).toEqual(['schemaVersion']);
  });

  it('schema/retired-field for every retired Enemy statistic', () => {
    const dir = freshValidDir('retired-enemy-stats');
    mutate(
      dir,
      'enemies.yaml',
      '  profile: raider',
      '  profile: raider\n  attributes: { might: 1 }\n  health: 10\n  damage: 2\n  reach: melee\n  behaviour: steady',
    );
    const diags = fail(dir);
    expect(diags).toHaveLength(5);
    for (const diag of diags) {
      expect(diag.code).toBe('schema/retired-field');
      expect(diag.file).toBe('enemies.yaml');
      expect(diag.severity).toBe('error');
    }
    expect(diags.map((d) => d.path).sort()).toEqual([
      [0, 'attributes'],
      [0, 'behaviour'],
      [0, 'damage'],
      [0, 'health'],
      [0, 'reach'],
    ]);
  });

  it('schema/retired-field for an Encounter-level startRange beside participants', () => {
    const dir = freshValidDir('retired-encounter-range');
    toParticipants(dir);
    mutate(
      dir,
      'encounters.yaml',
      '      startRange: melee',
      '      startRange: melee\n  startRange: near',
    );
    const diag = only(fail(dir), 'schema/retired-field');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0, 'startRange']);
  });

  it('schema/retired-field for the retired escape Outcome', () => {
    const diag = expectInvalid(
      'retired-escape',
      'encounters.yaml',
      '  victory:',
      '  escape:\n    text: |\n      You flee.\n    move: home\n  victory:',
      'schema/retired-field',
    );
    expect(diag.path).toEqual([0, 'escape']);
  });

  it('participant count of 0 or 6+ is rejected', () => {
    const empty = freshValidDir('no-participants');
    toParticipants(empty);
    mutate(empty, 'encounters.yaml', '  participants:\n    - enemy: rat\n      startRange: melee', '  participants: []');
    const emptyDiag = only(fail(empty), 'schema/invalid-value');
    expect(emptyDiag.file).toBe('encounters.yaml');

    const many = freshValidDir('too-many-participants');
    toParticipants(many);
    const extra = Array.from(
      { length: 5 },
      (_, index) => `    - id: extra-${index + 1}\n      enemy: rat\n      startRange: near`,
    ).join('\n');
    mutate(many, 'encounters.yaml', '    - enemy: rat\n      startRange: melee', `    - id: first\n      enemy: rat\n      startRange: melee\n${extra}`);
    const manyDiag = only(fail(many), 'schema/invalid-value');
    expect(manyDiag.file).toBe('encounters.yaml');
  });

  it('startRange is required beside the enemy shorthand and limited to melee|near|far', () => {
    const missing = expectInvalid(
      'missing-start-range',
      'encounters.yaml',
      '  enemy: rat\n  startRange: melee',
      '  enemy: rat',
      'schema/missing-field',
    );
    expect(missing.path).toEqual([0, 'startRange']);

    const invalid = expectInvalid(
      'invalid-start-range',
      'encounters.yaml',
      '  startRange: melee',
      '  startRange: distant',
      'schema/invalid-value',
    );
    expect(invalid.path).toEqual([0, 'startRange']);
  });

  it('power is an integer in 0–3', () => {
    const dir = freshValidDir('power-high');
    toParticipants(dir);
    mutate(dir, 'encounters.yaml', '      startRange: melee', '      startRange: melee\n      power: 4');
    expect(only(fail(dir), 'schema/invalid-value').path).toEqual([0, 'participants', 0, 'power']);

    const fractional = freshValidDir('power-fractional');
    toParticipants(fractional);
    mutate(
      fractional,
      'encounters.yaml',
      '      startRange: melee',
      '      startRange: melee\n      power: 1.5',
    );
    expect(only(fail(fractional), 'schema/invalid-value').path).toEqual([
      0,
      'participants',
      0,
      'power',
    ]);
  });

  it('a party profile on an Enemy and an enemy profile on a Companion are rejected', () => {
    const enemy = expectInvalid(
      'party-profile-on-enemy',
      'enemies.yaml',
      '  profile: raider',
      '  profile: party-sentinel',
      'schema/invalid-value',
    );
    expect(enemy.path).toEqual([0, 'profile']);

    const dir = freshValidDir('enemy-profile-on-companion');
    mutate(
      dir,
      'scenario.yaml',
      'encounters:\n  - encounters.yaml',
      'encounters:\n  - encounters.yaml\ncompanions:\n  - companions.yaml',
    );
    writePackage(dir, {
      'companions.yaml': '- id: ada\n  name: Ada\n  profile: raider\n',
    });
    const diags = fail(dir);
    const diag = only(diags, 'schema/invalid-value');
    expect(diag.file).toBe('companions.yaml');
    expect(diag.path).toEqual([0, 'profile']);
  });

  it('ref/phase-offset-out-of-cycle above the profile cycle length', () => {
    // The raider cycle has length 4 (offsets 0–3); see ENEMY_CYCLES.
    const dir = freshValidDir('phase-offset');
    toParticipants(dir);
    mutate(dir, 'encounters.yaml', '      startRange: melee', '      startRange: melee\n      phaseOffset: 4');
    const diag = only(fail(dir), 'ref/phase-offset-out-of-cycle');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0, 'participants', 0, 'phaseOffset']);
  });

  it.each([
    ['companion-join', 'encounters.yaml', '  victory:', '  victory:\n    effects:\n      - companion-join: nobody'],
    ['companion condition', 'scenes/gate.yaml', '    when: { flag: met-elder }', '    when: { companion: nobody }'],
    ['companionLost condition', 'scenes/gate.yaml', '    when: { flag: met-elder }', '    when: { companionLost: nobody }'],
  ])('ref/unknown-companion for %s naming no Companion', (_label, file, from, to) => {
    const dir = freshValidDir(`unknown-companion-${Date.now() % 100000}`);
    mutate(dir, file, from, to);
    const diag = only(fail(dir), 'ref/unknown-companion');
    expect(diag.file).toBe(file);
  });

  it('ref/duplicate-id for two Companions with one id', () => {
    const dir = freshValidDir('duplicate-companion');
    mutate(
      dir,
      'scenario.yaml',
      'encounters:\n  - encounters.yaml',
      'encounters:\n  - encounters.yaml\ncompanions:\n  - companions.yaml',
    );
    writePackage(dir, { 'companions.yaml': `${COMPANIONS}- id: ada\n  name: Ada Again\n  profile: party-archer\n` });
    const diag = only(fail(dir), 'ref/duplicate-id');
    expect(diag.file).toBe('companions.yaml');
    expect(diag.message).toContain('duplicate companion id "ada"');
  });

  it('ref/duplicate-participant-id for defaulted ids of one Enemy kind', () => {
    const dir = freshValidDir('duplicate-participant');
    toParticipants(dir);
    mutate(
      dir,
      'encounters.yaml',
      '    - enemy: rat\n      startRange: melee',
      '    - enemy: rat\n      startRange: melee\n    - enemy: rat\n      startRange: near',
    );
    const diag = only(fail(dir), 'ref/duplicate-participant-id');
    expect(diag.file).toBe('encounters.yaml');
  });

  it('play/companion-unused warns for a Companion that no companion-join references', () => {
    const dir = freshValidDir('companion-unused');
    mutate(
      dir,
      'scenario.yaml',
      'encounters:\n  - encounters.yaml',
      'encounters:\n  - encounters.yaml\ncompanions:\n  - companions.yaml',
    );
    writePackage(dir, { 'companions.yaml': COMPANIONS });
    const warning = only(succeed(dir), 'play/companion-unused');
    expect(warning.severity).toBe('warning');
    expect(warning.file).toBe('companions.yaml');
    expect(warning.path).toEqual(['id']);
  });

  it('companion and companionLost are unknown facts for playability, like health', () => {
    // The only route to the dawn ending sits behind a companion condition.
    // An unknown fact keeps the route reachable; a false one would report
    // play/unreachable-ending and reject the package.
    const dir = freshValidDir('companion-facts');
    mutate(
      dir,
      'scenario.yaml',
      'encounters:\n  - encounters.yaml',
      'encounters:\n  - encounters.yaml\ncompanions:\n  - companions.yaml',
    );
    writePackage(dir, { 'companions.yaml': COMPANIONS });
    mutate(
      dir,
      'scenes/gate.yaml',
      '  - id: test-luck\n    text: Try the handle.',
      '  - id: test-luck\n    text: Try the handle.\n    when: { companion: ada }',
    );
    mutate(
      dir,
      'encounters.yaml',
      '    move: home\n  surrender:',
      '    move: home\n    effects:\n      - companion-join: ada\n  surrender:',
    );
    const warnings = succeed(dir);
    expect(warnings.filter((d) => d.code === 'play/unreachable-ending')).toHaveLength(0);
  });
});

/** Copy a shipped fixture to a temp directory under its own name (id rule). */
function copyFixture(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-v2-tr-'));
  const dest = path.join(dir, name);
  fs.cpSync(path.join(fixturesDir, name), dest, { recursive: true });
  return dest;
}

describe('content format v2 translations (Q15)', () => {
  it('surrender and draw text are required in a Translation like victory text', () => {
    const dir = copyFixture('two-bridges');
    const file = 'translations/pl/encounters.yaml';
    const full = path.join(dir, file);
    const source = fs.readFileSync(full, 'utf8');
    // The keys are required (T2), but an empty branch carries no text (T3).
    const stripped = source
      .replace(
        '  surrender:\n    text: |\n      Spuszczasz wzrok i wycofujesz się w płyciznę, aż trzciny cię ukryją.\n      Wilk patrzy, po czym odwraca się.\n',
        '  surrender: {}\n',
      )
      .replace(
        '  draw:\n    text: |\n      Trwasz w miejscu bez ataku. Wilk zatacza krąg i znika w trzcinach.\n',
        '  draw: {}\n',
      );
    expect(stripped).not.toBe(source);
    fs.writeFileSync(full, stripped);
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const diags = result.rejectedTranslations[0]?.diagnostics ?? [];
    expect(result.rejectedTranslations).toHaveLength(1);
    expect(diags.filter((d) => d.code === 'translation/missing-text')).toHaveLength(2);
    expect(diags.map((d) => d.message).join('\n')).toContain('surrender');
    expect(diags.map((d) => d.message).join('\n')).toContain('draw');
  });

  it('companions.yaml must be complete in a Translation', () => {
    const dir = copyFixture('two-bridges');
    writePackage(dir, {
      'companions.yaml': '- id: ada\n  name: Ada\n  profile: party-sentinel\n- id: bryn\n  name: Bryn\n  profile: party-archer\n',
      'translations/pl/companions.yaml': '- id: ada\n  name: Ada\n',
    });
    const scenarioFile = path.join(dir, 'scenario.yaml');
    fs.writeFileSync(
      scenarioFile,
      fs
        .readFileSync(scenarioFile, 'utf8')
        .replace('templates: [templates.yaml]', 'templates: [templates.yaml]\ncompanions: [companions.yaml]'),
    );
    const manifestFile = path.join(dir, 'translations/pl/translation.yaml');
    fs.writeFileSync(
      manifestFile,
      fs
        .readFileSync(manifestFile, 'utf8')
        .replace(
          'encounters: [translations/pl/encounters.yaml]',
          'encounters: [translations/pl/encounters.yaml]\ncompanions: [translations/pl/companions.yaml]',
        ),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejectedTranslations).toHaveLength(1);
    const diags = result.rejectedTranslations[0]?.diagnostics ?? [];
    const missing = diags.filter((d) => d.code === 'translation/missing-text');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.message).toContain('bryn');
  });
});
