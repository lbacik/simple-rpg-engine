// Rich-item fixture for the inventory tests: bonus Equipment in all three
// slots (three +1 Agility sources for the cap test), a plain weapon and
// coat, Consumables, a Key Item and magic markers.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadScenario, type Scenario } from '../../src/content/index';

function write(scenarioDir: string, relative: string, content: string): void {
  const full = path.join(scenarioDir, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export function loadInventoryScenario(name = 'inventory'): Scenario {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-inventory-'));
  const scenarioDir = path.join(dir, name);
  write(
    scenarioDir,
    'scenario.yaml',
    [
      'schemaVersion: 1',
      `id: ${name}`,
      'title: Inventory',
      'description: A pack full of gear.',
      'version: "1.0.0"',
      'language: en',
      'intro: You check your pack.',
      'startLocation: glade',
      'deathEnding: death',
      'locations:',
      '  - locations/glade.yaml',
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
      'scenes: [path]',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'scenes/path.yaml',
    [
      'id: path',
      'title: Path',
      'trigger: on-enter',
      'text: A path leads home.',
      'choices:',
      '  - id: go',
      '    text: Go home.',
      '    outcome:',
      '      end: home',
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
      '  description: A plain steel sword.',
      '  slot: weapon',
      '  damage: 3',
      '- id: swift-blade',
      '  kind: equipment',
      '  name: Swift Blade',
      '  description: Light and quick.',
      '  slot: weapon',
      '  bonus: agility',
      '  damage: 2',
      '- id: cloak',
      '  kind: equipment',
      "  name: Hunter's Cloak",
      '  description: Smells of pine.',
      '  slot: outfit',
      '  bonus: agility',
      '- id: coat',
      '  kind: equipment',
      '  name: Wool Coat',
      '  description: Warm but heavy.',
      '  slot: outfit',
      '- id: boots',
      '  kind: equipment',
      '  name: Silent Boots',
      '  description: Soft soles.',
      '  slot: talisman',
      '  bonus: agility',
      '- id: herbs',
      '  kind: consumable',
      '  name: Herbs',
      '  description: Bitter leaves.',
      '  heal: 3',
      '- id: elixir',
      '  kind: consumable',
      '  name: Moon Elixir',
      '  description: Shimmers faintly.',
      '  heal: 5',
      '  magic: true',
      '- id: charm',
      '  kind: key',
      '  name: Moon Charm',
      '  description: A carved stone.',
      '  magic: true',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'templates.yaml',
    [
      '- id: hunter',
      '  name: Hunter',
      '  description: Knows the woods.',
      '  attributes: { might: 2, agility: 1, wits: 2, presence: 1 }',
      '  items:',
      '    - { item: sword }',
      '    - { item: cloak }',
      '    - { item: boots }',
      '    - { item: herbs, quantity: 2 }',
      '    - { item: elixir }',
      '    - { item: charm }',
      '',
    ].join('\n'),
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
