// Shared fixture Scenario for the P6b Companion-lifecycle integration test
// (G1, the #183 "Companion lost" example): the crossroads shape (glade start,
// grove next door) plus a grey-wolf Enemy, one lone-wolf Encounter tuned so a
// bracing hero's party-sentinel Companion falls on round 29 (power 3, the
// content bound; Cover redirects every wolf hit to her: 24 -> 0 in eight
// hits), an on-demand repeatable den Scene whose choices befriend, fight,
// farewell and rejoin, the Astrid companion, and a grief Scene gated by
// `{companionLost: astrid}`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadScenario, type Scenario } from '../../src/content/index';

function write(scenarioDir: string, relative: string, content: string): void {
  const full = path.join(scenarioDir, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export function loadCompanionCombatScenario(name = 'companion-combat'): Scenario {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-companion-combat-'));
  const scenarioDir = path.join(dir, name);
  write(
    scenarioDir,
    'scenario.yaml',
    [
      'schemaVersion: 2',
      `id: ${name}`,
      'title: Companion Combat',
      'description: Teeth wait, and Astrid stands beside you.',
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
      '  - scenes/grief.yaml',
      'enemies:',
      '  - enemies.yaml',
      'encounters:',
      '  - encounters.yaml',
      'companions:',
      '  - companions.yaml',
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
      'scenes: [den, grief]',
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
      'text: A den reeks of wet fur. Astrid waits by the treeline.',
      'choices:',
      '  - id: befriend',
      '    text: Ask Astrid to join you.',
      '    outcome:',
      '      text: Astrid hefts her pack and falls in beside you.',
      '      effects:',
      '        - companion-join: astrid',
      '  - id: fight-lone',
      '    text: Face the lone wolf.',
      '    when: { not: { defeated: lone-fight } }',
      '    outcome:',
      '      start-combat: lone-fight',
      '  - id: farewell',
      '    text: Bid Astrid farewell.',
      '    when: { companion: astrid }',
      '    outcome:',
      '      text: Astrid nods and takes the north path.',
      '      effects:',
      '        - companion-leave: null',
      '  - id: rejoin',
      '    text: Ask Astrid to travel with you again.',
      '    when: { not: { companion: astrid } }',
      '    outcome:',
      '      text: Astrid hefts her pack and falls in beside you.',
      '      effects:',
      '        - companion-join: astrid',
      '  - id: go-home',
      '    text: Slip away home.',
      '    outcome:',
      '      end: home',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'scenes/grief.yaml',
    [
      'id: grief',
      'title: Grief',
      'trigger: on-demand',
      'repeatable: true',
      'when: { companionLost: astrid }',
      'text: The camp is quieter without Astrid.',
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
      '- id: lone-fight',
      '  participants:',
      '    - id: grey',
      '      enemy: grey-wolf',
      '      startRange: melee',
      '      power: 3',
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
    ].join('\n'),
  );
  write(
    scenarioDir,
    'companions.yaml',
    [
      '- id: astrid',
      '  name: Astrid the Skald',
      '  description: A singer with a shield.',
      '  profile: party-sentinel',
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
