// Tactical Combat content-contract tests (docs/spec/tactical-combat-handoff.md,
// C1-C4): normalised ordered participants, default Behaviour, Encounter
// validation, playability/Condition coverage, generated schemas and the
// Translation projection. Assertions pin codes and source locations, never
// incidental diagnostic prose.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/content/index';
import type { Diagnostic, Scenario } from '../src/content/index';
import { localizeScenario } from '../src/content/localize';
import { TranslationEncounterSchema } from '../src/content/schema';
import { evaluateCondition } from '../src/engine/conditions';
import type { PlaythroughState } from '../src/engine/state';
import { loadTacticalFixture, type TacticalFixtureKind } from './fixtures/tactical';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');

function makeScenarioDir(name: string): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-tactical-')), name);
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

const ENEMIES_BASE = `- id: rat
  name: Rat
  attributes: { might: 1, agility: 2, wits: 0, presence: 0 }
  health: 3
  damage: 1
`;

function encounterDoc(body: string): string {
  return `- id: rats\n${body}\n  text: |\n    Rats.\n  escape:\n    text: |\n      Run.\n    move: home\n`;
}

/** Minimal package whose only possible failure is the Encounter under test. */
function writeEncounterPackage(dir: string, encounters: string, enemies = ENEMIES_BASE): void {
  const id = path.basename(dir);
  writePackage(dir, {
    'scenario.yaml': `schemaVersion: 1\nid: ${id}\ntitle: T\ndescription: D\nversion: "1.0"\nlanguage: en\nstartLocation: home\ndeathEnding: death\nlocations:\n  - locations/home.yaml\nscenes:\n  - scenes/gate.yaml\nenemies:\n  - enemies.yaml\nencounters:\n  - encounters.yaml\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n`,
    'locations/home.yaml': 'id: home\nname: Home\ndescription: A home.\nmap: { x: 10, y: 20 }\nscenes: [gate]\n',
    'scenes/gate.yaml':
      'id: gate\ntitle: G\ntrigger: on-enter\ntext: A gate.\nchoices:\n  - id: go\n    text: Go.\n    outcome:\n      end: dawn\n',
    'enemies.yaml': enemies,
    'encounters.yaml': encounters,
    'templates.yaml':
      '- id: drifter\n  name: Drifter\n  attributes: { might: 2, agility: 2, wits: 1, presence: 1 }\n',
    'endings.yaml':
      '- id: death\n  kind: defeat\n  title: Death\n  text: Dark.\n- id: dawn\n  kind: victory\n  title: Dawn\n  text: Light.\n',
  });
}

function fail(dir: string): Diagnostic[] {
  const result = loadScenario(dir);
  if (result.ok) throw new Error(`expected ${dir} to be rejected, but it loaded`);
  return result.diagnostics;
}

function loadValid(dir: string): Scenario {
  const result = loadScenario(dir);
  if (!result.ok) {
    throw new Error(`expected ${dir} to load, but got: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function warningsOf(dir: string): Diagnostic[] {
  const result = loadScenario(dir);
  if (!result.ok) throw new Error(`expected ${dir} to load: ${JSON.stringify(result.diagnostics)}`);
  return result.warnings;
}

function matching(diags: Diagnostic[], code: string): Diagnostic {
  const match = diags.find((diag) => diag.code === code);
  if (!match) throw new Error(`expected a ${code} diagnostic, got: ${JSON.stringify(diags)}`);
  return match;
}

function runValidate(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', 'src/cli/validate.ts', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120_000,
    });
    return { stdout, status: 0 };
  } catch (error) {
    const failure = error as { status?: unknown; stdout?: unknown };
    return {
      stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
      status: typeof failure.status === 'number' ? failure.status : 1,
    };
  }
}

// ---------------------------------------------------------------------------
// C1: shorthand and explicit spellings, default Behaviour, schemaVersion.
// ---------------------------------------------------------------------------

describe('tactical content C1', () => {
  it('loads legacy `enemy:` as a single participant defaulted to the Enemy id', () => {
    const { scenario } = loadTacticalFixture('legacy');
    const encounter = scenario.encountersById['legacy-ambush'];
    expect(encounter?.participants.map((p) => [p.id, p.enemy.id])).toEqual([
      ['grey-wolf', 'grey-wolf'],
    ]);
    expect(encounter?.startRange).toBe('far');
  });

  it('loads `participants: [{ enemy: X }]` as the same ordered model', () => {
    const { dir, scenario } = loadTacticalFixture('legacy');
    const baseline = scenario.encountersById['legacy-ambush'];
    const full = path.join(dir, 'encounters.yaml');
    fs.writeFileSync(
      full,
      fs.readFileSync(full, 'utf8').replace('  enemy: grey-wolf', '  participants:\n    - enemy: grey-wolf'),
    );
    const converted = loadValid(dir).encountersById['legacy-ambush'];
    expect(converted?.participants.map((p) => [p.id, p.enemy.id])).toEqual(
      baseline?.participants.map((p) => [p.id, p.enemy.id]),
    );
    expect(converted?.startRange).toBe(baseline?.startRange);
  });

  it('defaults omitted Behaviour to steady', () => {
    const { scenario } = loadTacticalFixture('legacy');
    expect(scenario.enemiesById['grey-wolf']?.behaviour).toBe('steady');
    const solo = loadTacticalFixture('explicit-solo').scenario;
    expect(solo.enemiesById['grey-wolf']?.behaviour).toBe('steady');
    expect(solo.encountersById['solo-ambush']?.participants.map((p) => p.id)).toEqual([
      'wolf-solo',
    ]);
  });

  it('keeps manifest schemaVersion at 1 and loads shipped Scenarios without edits', () => {
    for (const name of ['whispering-woods', 'the-drowned-ledger']) {
      const text = fs.readFileSync(path.join(repoRoot, 'scenarios', name, 'scenario.yaml'), 'utf8');
      expect(text).toContain('schemaVersion: 1');
      const result = loadScenario(path.join(repoRoot, 'scenarios', name));
      expect(result.ok).toBe(true);
    }
  });

  it('applies the accepted Behaviour assignments to the shipped Scenarios', () => {
    const woods = loadValid(path.join(repoRoot, 'scenarios', 'whispering-woods'));
    expect(woods.enemiesById['grey-wolf']?.behaviour).toBe('steady');
    expect(woods.enemiesById['bandit-archer']?.behaviour).toBe('heavy');
    expect(woods.enemiesById['barrow-wight']?.behaviour).toBe('heavy');
    const ledger = loadValid(path.join(repoRoot, 'scenarios', 'the-drowned-ledger'));
    expect(ledger.enemiesById['drowned-porter']?.behaviour).toBe('steady');
    expect(ledger.enemiesById['iron-foreman']?.behaviour).toBe('heavy');
    expect(ledger.enemiesById['channel-watchman']?.behaviour).toBe('heavy');
    expect(ledger.enemiesById['brass-auditor']?.behaviour).toBe('steady');
  });
});

// ---------------------------------------------------------------------------
// C2: participant counts, spellings, ids and references.
// ---------------------------------------------------------------------------

describe('tactical content C2', () => {
  it('accepts one or two participants, including explicit wolf-a/wolf-b', () => {
    for (const kind of ['legacy', 'explicit-solo', 'pair-defaulted', 'pair-wolves', 'pair-heavy'] as const) {
      expect(loadTacticalFixture(kind).scenario.id.length).toBeGreaterThan(0);
    }
    const wolves = loadTacticalFixture('pair-wolves').scenario;
    expect(wolves.encountersById['wolves-ambush']?.participants.map((p) => p.id)).toEqual([
      'wolf-a',
      'wolf-b',
    ]);
  });

  it('rejects zero participants', () => {
    const dir = makeScenarioDir('zero-participants');
    writeEncounterPackage(dir, encounterDoc('  participants: []'));
    const diag = matching(fail(dir), 'schema/invalid-value');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0, 'participants']);
  });

  it('rejects three participants', () => {
    const dir = makeScenarioDir('three-participants');
    writeEncounterPackage(
      dir,
      encounterDoc('  participants:\n    - { enemy: rat }\n    - { enemy: rat, id: b }\n    - { enemy: rat, id: c }'),
    );
    const diag = matching(fail(dir), 'schema/invalid-value');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0, 'participants']);
  });

  it('rejects an invalid Behaviour', () => {
    const dir = makeScenarioDir('invalid-behaviour');
    writeEncounterPackage(
      dir,
      encounterDoc('  enemy: rat'),
      '- id: rat\n  name: Rat\n  attributes: { might: 1, agility: 2, wits: 0, presence: 0 }\n  health: 3\n  damage: 1\n  behaviour: ferocious\n',
    );
    const diag = matching(fail(dir), 'schema/invalid-value');
    expect(diag.file).toBe('enemies.yaml');
    expect(diag.path).toEqual([0, 'behaviour']);
  });

  it('rejects both spellings with schema/encounter-enemies', () => {
    const dir = makeScenarioDir('both-spellings');
    writeEncounterPackage(dir, encounterDoc('  enemy: rat\n  participants:\n    - { enemy: rat }'));
    const diag = matching(fail(dir), 'schema/encounter-enemies');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0]);
  });

  it('rejects neither spelling with schema/encounter-enemies', () => {
    const dir = makeScenarioDir('neither-spelling');
    writeEncounterPackage(dir, encounterDoc('  startRange: near'));
    const diag = matching(fail(dir), 'schema/encounter-enemies');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0]);
  });

  it('rejects duplicate explicit ids with the first declaration related', () => {
    const dir = makeScenarioDir('duplicate-explicit');
    writeEncounterPackage(
      dir,
      encounterDoc('  participants:\n    - { id: wolf-a, enemy: rat }\n    - { id: wolf-a, enemy: rat }'),
    );
    const diag = matching(fail(dir), 'ref/duplicate-participant-id');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0, 'participants', 1, 'id']);
    expect(diag.related).toHaveLength(1);
  });

  it('rejects duplicate defaulted ids with the first declaration related', () => {
    const dir = makeScenarioDir('duplicate-defaulted');
    writeEncounterPackage(dir, encounterDoc('  participants:\n    - { enemy: rat }\n    - { enemy: rat }'));
    const diag = matching(fail(dir), 'ref/duplicate-participant-id');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0, 'participants', 1, 'enemy']);
    expect(diag.related).toHaveLength(1);
  });

  it('rejects an invalid explicit participant id', () => {
    const dir = makeScenarioDir('invalid-participant-id');
    writeEncounterPackage(dir, encounterDoc('  participants:\n    - { id: Bad_ID, enemy: rat }'));
    const diag = matching(fail(dir), 'ref/invalid-id');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0, 'participants', 0, 'id']);
  });

  it('rejects an unknown Enemy reference per participant', () => {
    const dir = makeScenarioDir('unknown-participant-enemy');
    writeEncounterPackage(dir, encounterDoc('  participants:\n    - { enemy: ghost }'));
    const diag = matching(fail(dir), 'ref/unknown-enemy');
    expect(diag.file).toBe('encounters.yaml');
    expect(diag.path).toEqual([0, 'participants', 0, 'enemy']);
  });
});

// ---------------------------------------------------------------------------
// C3: playability, Conditions, schemas and the CLI.
// ---------------------------------------------------------------------------

describe('tactical content C3', () => {
  const kinds: TacticalFixtureKind[] = [
    'legacy',
    'explicit-solo',
    'pair-defaulted',
    'pair-wolves',
    'pair-heavy',
  ];

  it('loads every reference fixture with no warnings', () => {
    for (const kind of kinds) {
      const { dir } = loadTacticalFixture(kind);
      expect(warningsOf(dir)).toEqual([]);
    }
  });

  it('play/enemy-unused sees every participant, including the second of a pair', () => {
    const { dir } = loadTacticalFixture('pair-defaulted');
    expect(warningsOf(dir).map((w) => w.code)).not.toContain('play/enemy-unused');
    const full = path.join(dir, 'encounters.yaml');
    fs.writeFileSync(
      full,
      fs.readFileSync(full, 'utf8').replace('    - enemy: bandit-archer\n', ''),
    );
    const warning = matching(warningsOf(dir), 'play/enemy-unused');
    expect(warning.file).toBe('enemies.yaml');
  });

  it('adds no numerical balance check for a two-heavy pair', () => {
    const { dir } = loadTacticalFixture('pair-heavy');
    expect(warningsOf(dir)).toEqual([]);
  });

  it('defeated tests every participant of a mixed pair', () => {
    const { scenario } = loadTacticalFixture('pair-defaulted');
    const encounter = scenario.encountersById['mixed-ambush'];
    expect(encounter?.participants.map((p) => [p.id, p.enemy.health])).toEqual([
      ['grey-wolf', 8],
      ['bandit-archer', 6],
    ]);
    constFixtureCheck(scenario, 'mixed-ambush', 5, false);
    constFixtureCheck(scenario, 'mixed-ambush', 6, false);
    constFixtureCheck(scenario, 'mixed-ambush', 8, true);
  });

  it('defeated on a single participant matches the legacy comparison', () => {
    const { scenario } = loadTacticalFixture('legacy');
    constFixtureCheck(scenario, 'legacy-ambush', 7, false);
    constFixtureCheck(scenario, 'legacy-ambush', 8, true);
  });

  function constFixtureCheck(
    scenario: Scenario,
    encounterId: string,
    taken: number,
    expected: boolean,
  ): void {
    // D1 (issue #120): wounds are per participant in v2. The single `taken`
    // value applies to every participant, preserving the original expectations
    // (a mixed pair is defeated only when the toughest participant falls).
    const encounter = scenario.encountersById[encounterId];
    const wounds: Record<string, number> = {};
    for (const participant of encounter?.participants ?? []) {
      wounds[participant.id] = taken;
    }
    const state = { encounters: { [encounterId]: wounds } } as unknown as PlaythroughState;
    expect(evaluateCondition(scenario, state, { defeated: encounterId })).toBe(expected);
  }

  it('exposes participants and behaviour in the generated schemas', () => {
    const encounters = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'schemas', 'encounters.json'), 'utf8'),
    ) as {
      items: { properties: Record<string, unknown>; required: string[] };
    };
    const encounterProps = encounters.items.properties;    const participants = (encounterProps['participants'] ?? {}) as Record<string, unknown>;
    expect(participants['minItems']).toBe(1);
    expect(participants['maxItems']).toBe(2);
    expect(encounters.items.required).not.toContain('enemy');
    const enemies = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'schemas', 'enemies.json'), 'utf8'),
    ) as { items: { properties: Record<string, unknown> } };
    expect(enemies.items.properties['behaviour']).toMatchObject({
      default: 'steady',
      enum: ['steady', 'heavy'],
    });
  });

  it('exercises the loader-only spelling refinement through the CLI', () => {
    const dir = makeScenarioDir('cli-both-spellings');
    writeEncounterPackage(dir, encounterDoc('  enemy: rat\n  participants:\n    - { enemy: rat }'));
    const { stdout, status } = runValidate([dir]);
    expect(status).toBe(1);
    expect(stdout).toContain('schema/encounter-enemies');
  });
});

// ---------------------------------------------------------------------------
// C4: no Translation text, projection stability and the content hash.
// ---------------------------------------------------------------------------

describe('tactical content C4', () => {
  it('adds no translatable Encounter fields', () => {
    expect(Object.keys(TranslationEncounterSchema.shape)).toEqual([
      'id',
      'text',
      'victory',
      'escape',
    ]);
  });

  it('loads existing Translations unchanged', () => {
    const result = loadScenario(path.join(testsDir, 'fixtures', 'scenarios', 'two-bridges'));
    expect(result.ok).toBe(true);
  });

  it('keeps the Translation projection across shorthand conversion and participant edits', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-tactical-i18n-'));
    const dir = path.join(parent, 'two-bridges');
    fs.cpSync(path.join(testsDir, 'fixtures', 'scenarios', 'two-bridges'), dir, {
      recursive: true,
    });
    const projection = (scenario: Scenario): unknown => {
      const { scenario: pl } = localizeScenario(scenario, 'pl');
      const ambush = pl.encountersById['wolf-ambush'];
      // The Translation projection is text (plus which Enemy each participant
      // places): participant identity itself is mechanics, not text.
      return {
        text: ambush?.text,
        victory: ambush?.victory?.text,
        escape: ambush?.escape?.text,
        enemies: ambush?.participants.map((p) => p.enemy.id),
      };
    };
    const baseline = loadValid(dir);
    const baselineProjection = projection(baseline);
    const encountersFile = path.join(dir, 'encounters.yaml');
    fs.writeFileSync(
      encountersFile,
      fs.readFileSync(encountersFile, 'utf8').replace('  enemy: river-wolf', '  participants:\n    - enemy: river-wolf'),
    );
    const converted = loadValid(dir);
    expect(converted.encountersById['wolf-ambush']?.participants.map((p) => p.id)).toEqual([
      'river-wolf',
    ]);
    expect(projection(converted)).toEqual(baselineProjection);
    expect(converted.contentHash).not.toBe(baseline.contentHash);
    fs.writeFileSync(
      encountersFile,
      fs.readFileSync(encountersFile, 'utf8').replace('    - enemy: river-wolf', '    - id: wolf-a\n      enemy: river-wolf'),
    );
    const edited = loadValid(dir);
    expect(edited.encountersById['wolf-ambush']?.participants.map((p) => p.id)).toEqual([
      'wolf-a',
    ]);
    expect(projection(edited)).toEqual(baselineProjection);
    expect(edited.contentHash).not.toBe(converted.contentHash);
  });

  it('changes the content hash on mechanical participant edits', () => {
    const { dir } = loadTacticalFixture('pair-wolves');
    const baseline = loadValid(dir).contentHash;
    const full = path.join(dir, 'encounters.yaml');
    fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replace('id: wolf-a', 'id: wolf-c'));
    expect(loadValid(dir).contentHash).not.toBe(baseline);
  });
});
