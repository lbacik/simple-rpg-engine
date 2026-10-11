// Shared fixture Scenario for the travel/turn tests: three Locations where
// the glade connects to the grove (visible) and to the cave (hidden behind
// the gate-open flag), plus an on-demand Scene so the package validates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadScenario, type Scenario } from '../../src/content/index';

function write(scenarioDir: string, relative: string, content: string): void {
  const full = path.join(scenarioDir, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export function loadCrossroadsScenario(name = 'crossroads'): Scenario {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-crossroads-'));
  const scenarioDir = path.join(dir, name);
  write(
    scenarioDir,
    'scenario.yaml',
    [
      'schemaVersion: 1',
      `id: ${name}`,
      'title: Crossroads',
      'description: Paths cross here.',
      'version: "1.0.0"',
      'language: en',
      'intro: You wake at the crossroads.',
      'startLocation: glade',
      'deathEnding: death',
      'flags: [gate-open]',
      'locations:',
      '  - locations/glade.yaml',
      '  - locations/grove.yaml',
      '  - locations/cave.yaml',
      'scenes:',
      '  - scenes/path.yaml',
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
      '  - to: cave',
      '    label: Enter the cave',
      '    when: { flag: gate-open }',
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
      'scenes: [path]',
      'connections:',
      '  - to: glade',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/cave.yaml',
    [
      'id: cave',
      'name: Cave',
      'description: Dark and damp.',
      'map: { x: 50, y: 60 }',
      'connections:',
      '  - to: glade',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'scenes/path.yaml',
    [
      'id: path',
      'title: Path',
      'trigger: on-demand',
      'text: A path leads home.',
      'choices:',
      '  - id: go',
      '    text: Go home.',
      '    outcome:',
      '      end: home',
      '  - id: open',
      '    text: Open the gate.',
      '    outcome:',
      '      effects:',
      '        - set-flag: gate-open',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'items.yaml',
    '- id: sword\n  kind: equipment\n  name: Sword\n  slot: weapon\n  damage: 3\n',
  );
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
    throw new Error(`fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}
