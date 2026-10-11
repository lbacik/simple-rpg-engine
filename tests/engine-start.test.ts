// Engine unit tests for startPlaythrough with a deterministic RNG.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import { parsePlaythroughState, startPlaythrough, view, type Rng } from '../src/engine/index';

const rng: Rng = () => 1;

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

/** Small playable fixture Scenario. Its on-enter Scene, which reaches the
 * victory ending, is not activated yet (on-enter activation lands later). */
function loadFixture(): Scenario {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-start-'));
  const name = 'meadow';
  const scenarioDir = path.join(dir, name);
  writeFiles(scenarioDir, {
    'scenario.yaml': [
      'schemaVersion: 1',
      `id: ${name}`,
      'title: Meadow',
      'description: A quiet meadow.',
      'author: Test',
      'version: "1.0.0"',
      'language: en',
      'intro: |',
      '  You wake in the grass.',
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
    'locations/glade.yaml':
      'id: glade\nname: Glade\ndescription: Sunlight through leaves.\nmap: { x: 10, y: 20 }\nscenes: [path]\n',
    'scenes/path.yaml':
      'id: path\ntitle: Path\ntrigger: on-enter\ntext: A path leads home.\nchoices:\n  - id: go\n    text: Go home.\n    outcome:\n      end: home\n',
    'items.yaml': [
      '- id: sword',
      '  kind: equipment',
      '  name: Sword',
      '  slot: weapon',
      '  damage: 3',
      '- id: cloak',
      '  kind: equipment',
      '  name: Cloak',
      '  slot: outfit',
      '  bonus: agility',
      '- id: herbs',
      '  kind: consumable',
      '  name: Herbs',
      '  heal: 3',
      '',
    ].join('\n'),
    'templates.yaml': [
      '- id: hunter',
      '  name: Hunter',
      '  description: Knows the woods.',
      '  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }',
      '  items:',
      '    - { item: sword }',
      '    - { item: cloak }',
      '    - { item: herbs, quantity: 2 }',
      '',
    ].join('\n'),
    'endings.yaml':
      '- id: death\n  kind: defeat\n  title: Gone\n  text: The end.\n- id: home\n  kind: victory\n  title: Home\n  text: You made it.\n',
  });
  const result = loadScenario(scenarioDir);
  if (!result.ok) throw new Error(`fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
  return result.scenario;
}

describe('startPlaythrough', () => {
  it('creates the character, inventory, position and intro entry', () => {
    const scenario = loadFixture();
    const result = startPlaythrough(scenario, 'hunter', '  Robin  ', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.character.name).toBe('Robin');
    expect(result.state.character.baseAttributes).toEqual({
      might: 1,
      agility: 3,
      wits: 2,
      presence: 0,
    });
    expect(result.state.character.health).toBe(12);
    expect(result.state.character.templateId).toBe('hunter');
    expect(result.state.inventory).toEqual({ sword: 1, cloak: 1, herbs: 2 });
    expect(result.state.equipment).toEqual({ weapon: 'sword', outfit: 'cloak' });
    expect(result.state.currentLocationId).toBe('glade');
    expect(result.state.visited).toEqual(['glade']);
    expect(result.state.step).toBe(0);
    expect(result.state.status).toBe('active');
    expect(result.state.flags).toEqual([]);
    expect(result.state.scenarioId).toBe(scenario.id);
    expect(result.state.contentHash).toBe(scenario.contentHash);
    expect(result.journal).toEqual([{ type: 'intro', text: scenario.intro }]);
    // The stored document validates.
    expect(parsePlaythroughState(JSON.parse(JSON.stringify(result.state)))).toEqual(result.state);
  });

  it('rejects an empty name, a 41-character name and an unknown template', () => {
    const scenario = loadFixture();
    expect(startPlaythrough(scenario, 'hunter', '   ', rng)).toEqual({
      ok: false,
      reason: 'invalid-name',
    });
    expect(startPlaythrough(scenario, 'hunter', 'x'.repeat(41), rng)).toEqual({
      ok: false,
      reason: 'invalid-name',
    });
    expect(startPlaythrough(scenario, 'nope', 'Robin', rng)).toEqual({
      ok: false,
      reason: 'unknown-template',
    });
    // 40 characters after trimming is accepted.
    const edge = startPlaythrough(scenario, 'hunter', `  ${'y'.repeat(40)}  `, rng);
    expect(edge.ok).toBe(true);
  });

  it('views the current Location', () => {
    const scenario = loadFixture();
    const result = startPlaythrough(scenario, 'hunter', 'Robin', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(view(scenario, result.state)).toEqual({
      kind: 'location',
      locationId: 'glade',
      name: 'Glade',
      description: 'Sunlight through leaves.',
    });
  });
});
