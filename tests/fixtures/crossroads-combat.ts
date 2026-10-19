// Shared fixture Scenario for the P6 Combat-lifecycle integration tests: the
// crossroads shape (glade start, grove next door) plus a grey-wolf Enemy, two
// Encounters (a solo ambush and a wolf pair) and an on-demand den Scene in
// the grove whose choices start each fight. Victory grants a fang; surrender
// and draw retreat to the glade, leaving the Encounter undefeated.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadScenario, type Scenario } from '../../src/content/index';

function write(scenarioDir: string, relative: string, content: string): void {
  const full = path.join(scenarioDir, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export function loadCrossroadsCombatScenario(name = 'crossroads-combat'): Scenario {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-crossroads-combat-'));
  const scenarioDir = path.join(dir, name);
  write(
    scenarioDir,
    'scenario.yaml',
    [
      'schemaVersion: 2',
      `id: ${name}`,
      'title: Crossroads Combat',
      'description: Paths cross here, and teeth wait.',
      'version: "1.0.0"',
      'language: en',
      'intro: You wake at the crossroads.',
      'startLocation: glade',
      'deathEnding: death',
      'locations:',
      '  - locations/glade.yaml',
      '  - locations/grove.yaml',
      'scenes:',
      '  - scenes/den.yaml',
      'enemies:',
      '  - enemies.yaml',
      'encounters:',
      '  - encounters.yaml',
      'templates:',
      '  - templates.yaml',
      'endings:',
      '  - endings.yaml',
      'items:',
      '  - items.yaml',
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
      'connections:',
      '  - to: grove',
      '    label: Walk to the grove',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/grove.yaml',
    [
      'id: grove',
      'name: Grove',
      'description: Old oaks crowd close.',
      'map: { x: 30, y: 40 }',
      'scenes: [den]',
      'connections:',
      '  - to: glade',
      '    label: Walk back to the glade',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'scenes/den.yaml',
    [
      'id: den',
      'title: Den',
      'trigger: on-demand',
      'repeatable: true',
      'text: A den reeks of wet fur.',
      'choices:',
      '  - id: fight-solo',
      '    text: Face the lone wolf.',
      '    when: { not: { defeated: den-fight } }',
      '    outcome:',
      '      start-combat: den-fight',
      '  - id: fight-pack',
      '    text: Face the wolf pack.',
      '    when: { not: { defeated: pack-fight } }',
      '    outcome:',
      '      start-combat: pack-fight',
      '  - id: go-home',
      '    text: Slip away home.',
      '    outcome:',
      '      end: home',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'enemies.yaml',
    [
      '- id: grey-wolf',
      '  name: Grey Wolf',
      '  description: Lean and scarred.',
      '  profile: raider',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'encounters.yaml',
    [
      '- id: den-fight',
      '  enemy: grey-wolf',
      '  startRange: melee',
      '  text: |',
      '    A lone wolf bars the path.',
      '  victory:',
      '    text: |',
      '      The wolf falls silent.',
      '    effects:',
      '      - give-item: { item: fang }',
      '  surrender:',
      '    text: |',
      '      You back away with empty hands.',
      '    move: glade',
      '  draw:',
      '    text: |',
      '      Neither side gives ground.',
      '    move: glade',
      '',
      '- id: pack-fight',
      '  participants:',
      '    - id: alpha',
      '      enemy: grey-wolf',
      '      startRange: melee',
      '    - id: beta',
      '      enemy: grey-wolf',
      '      startRange: near',
      '  text: |',
      '    Two wolves circle out of the dark.',
      '  victory:',
      '    text: |',
      '      The wolves fall silent.',
      '    effects:',
      '      - give-item: { item: fang }',
      '  surrender:',
      '    text: |',
      '      You back away with empty hands.',
      '    move: glade',
      '  draw:',
      '    text: |',
      '      Neither side gives ground.',
      '    move: glade',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'items.yaml',
    [
      '- id: sword',
      '  kind: equipment',
      '  name: Sword',
      '  slot: weapon',
      '- id: fang',
      '  kind: key',
      '  name: Wolf Fang',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'templates.yaml',
    [
      '- id: hunter',
      '  name: Hunter',
      '  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }',
      '  items:',
      '    - { item: sword }',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'endings.yaml',
    [
      '- id: death',
      '  kind: defeat',
      '  title: Gone',
      '  text: The end.',
      '- id: home',
      '  kind: victory',
      '  title: Home',
      '  text: You made it.',
      '',
    ].join('\n'),
  );
  const result = loadScenario(scenarioDir);
  if (!result.ok) {
    throw new Error(`fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}
