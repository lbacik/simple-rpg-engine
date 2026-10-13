// Reference Encounter-participant packages for the tactical Combat
// content-contract tests (docs/spec/tactical-combat-handoff.md, C1-C4).
// Each builder writes a complete, otherwise-clean Scenario package into a
// temp dir: one Location, one on-demand Scene whose only Choice starts the
// Encounter, and a victory Ending reachable through the Encounter, so the
// package loads with no diagnostics. The pair packages exist for loader
// tests, not for turns, and add no narrative branches or Translation fields.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadScenario, type Scenario } from '../../src/content/index';

export type TacticalFixtureKind =
  | 'legacy'
  | 'explicit-solo'
  | 'pair-defaulted'
  | 'pair-wolves'
  | 'pair-heavy';

function write(scenarioDir: string, relative: string, content: string): void {
  const full = path.join(scenarioDir, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

type Behaviour = 'steady' | 'heavy';

const GREY_WOLF = (behaviour: Behaviour | undefined): string =>
  [
    '- id: grey-wolf',
    '  name: Grey Wolf',
    '  description: Lean and scarred.',
    '  attributes: { might: 2, agility: 2, wits: 1, presence: 0 }',
    '  health: 8',
    '  damage: 2',
    '  reach: melee',
    ...(behaviour === undefined ? [] : [`  behaviour: ${behaviour}`]),
    '',
  ].join('\n');

const BANDIT_ARCHER = (behaviour: Behaviour | undefined): string =>
  [
    '- id: bandit-archer',
    '  name: Bandit Archer',
    '  description: A ragged deserter with a longbow.',
    '  attributes: { might: 1, agility: 2, wits: 1, presence: 1 }',
    '  health: 6',
    '  damage: 2',
    '  reach: ranged',
    ...(behaviour === undefined ? [] : [`  behaviour: ${behaviour}`]),
    '',
  ].join('\n');

function encounterDoc(encounterId: string, body: string): string {
  return [
    `- id: ${encounterId}`,
    ...body.split('\n'),
    '  startRange: far',
    '  text: |',
    '    Teeth and arrows in the dark.',
    '  victory:',
    '    text: |',
    '      Quiet returns to the glade.',
    '    end: home',
    '  escape:',
    '    text: |',
    '      You slip away between the trees.',
    '    move: glade',
    '',
  ].join('\n');
}

const FIXTURE_SPECS: Record<
  TacticalFixtureKind,
  { encounterId: string; enemies: string; encounterBody: string }
> = {
  // Unmodified legacy spelling: `enemy:` and no behaviour keys.
  legacy: {
    encounterId: 'legacy-ambush',
    enemies: GREY_WOLF(undefined),
    encounterBody: '  enemy: grey-wolf',
  },
  // One-entry explicit id.
  'explicit-solo': {
    encounterId: 'solo-ambush',
    enemies: GREY_WOLF(undefined),
    encounterBody: '  participants:\n    - id: wolf-solo\n      enemy: grey-wolf',
  },
  // Grey Wolf + Bandit Archer with defaulted ids (steady/heavy).
  'pair-defaulted': {
    encounterId: 'mixed-ambush',
    enemies: GREY_WOLF('steady') + BANDIT_ARCHER('heavy'),
    encounterBody: '  participants:\n    - enemy: grey-wolf\n    - enemy: bandit-archer',
  },
  // Two Grey Wolves with distinct explicit ids.
  'pair-wolves': {
    encounterId: 'wolves-ambush',
    enemies: GREY_WOLF('steady'),
    encounterBody:
      '  participants:\n    - id: wolf-a\n      enemy: grey-wolf\n    - id: wolf-b\n      enemy: grey-wolf',
  },
  // Two-heavy selection fixture: two Bandit Archers with distinct ids.
  'pair-heavy': {
    encounterId: 'archers-ambush',
    enemies: BANDIT_ARCHER('heavy'),
    encounterBody:
      '  participants:\n    - id: archer-a\n      enemy: bandit-archer\n    - id: archer-b\n      enemy: bandit-archer',
  },
};

export function loadTacticalFixture(kind: TacticalFixtureKind): {
  dir: string;
  scenario: Scenario;
} {
  const spec = FIXTURE_SPECS[kind];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rpg-tactical-${kind}-`));
  const name = path.basename(dir);
  const scenarioDir = path.join(dir, name);
  write(
    scenarioDir,
    'scenario.yaml',
    [
      'schemaVersion: 1',
      `id: ${name}`,
      'title: Tactical Fixture',
      'description: Reference participants package.',
      'version: "1.0.0"',
      'language: en',
      'startLocation: glade',
      'deathEnding: death',
      'locations:',
      '  - locations/glade.yaml',
      'scenes:',
      '  - scenes/ambush.yaml',
      'items:',
      '  - items.yaml',
      'enemies:',
      '  - enemies.yaml',
      'encounters:',
      '  - encounters.yaml',
      'templates:',
      '  - templates.yaml',
      'endings:',
      '  - endings.yaml',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/glade.yaml',
    [
      'id: glade',
      'name: Glade',
      'description: Sunlight through leaves.',
      'map: { x: 10, y: 20 }',
      'scenes: [ambush]',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'scenes/ambush.yaml',
    [
      'id: ambush',
      'title: Ambush',
      'trigger: on-demand',
      'text: Something moves beyond the trees.',
      'choices:',
      '  - id: confront',
      '    text: Stand and confront it.',
      '    outcome:',
      `      start-combat: ${spec.encounterId}`,
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'items.yaml',
    '- id: sword\n  kind: equipment\n  name: Sword\n  slot: weapon\n  damage: 3\n',
  );
  write(scenarioDir, 'enemies.yaml', spec.enemies);
  write(scenarioDir, 'encounters.yaml', encounterDoc(spec.encounterId, spec.encounterBody));
  write(
    scenarioDir,
    'templates.yaml',
    '- id: hunter\n  name: Hunter\n  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }\n  items:\n    - { item: sword }\n',
  );
  write(
    scenarioDir,
    'endings.yaml',
    '- id: death\n  kind: defeat\n  title: Gone\n  text: The end.\n- id: home\n  kind: victory\n  title: Home\n  text: You made it.\n',
  );
  const result = loadScenario(scenarioDir);
  if (!result.ok) {
    throw new Error(`tactical fixture ${kind} failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return { dir: scenarioDir, scenario: result.scenario };
}
