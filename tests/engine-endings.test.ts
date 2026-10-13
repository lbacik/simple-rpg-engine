// Engine unit tests for Playthrough endings (docs/spec/playthrough-state.md,
// applying an Outcome, ended Playthroughs, invariants; docs/spec/ui.md,
// endings): the `end` transition, death by a `damage` Effect, the frozen
// `ended` state, and the Ending view.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  applyAction,
  startPlaythrough,
  view,
  type Action,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';
import { executeTurn } from '../src/app/lib/turn';
import { migrateDatabase, openDatabase, PlaythroughStore } from '../src/persistence/index';

const rng: Rng = () => 1;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadWoods(): Scenario {
  const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
  if (!result.ok) {
    throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function startWoods(): { scenario: Scenario; state: PlaythroughState } {
  const scenario = loadWoods();
  const result = startPlaythrough(scenario, 'hunter', 'Robin', rng);
  if (!result.ok) throw new Error(`start failed: ${result.reason}`);
  return { scenario, state: result.state };
}

/** A one-Location package with a lethal choice that has Effects and a transition after the damage. */
function loadDoomScenario(): Scenario {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-endings-'));
  const scenarioDir = path.join(dir, 'doom');
  const write = (relative: string, content: string): void => {
    const full = path.join(scenarioDir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  write(
    'scenario.yaml',
    [
      'schemaVersion: 1',
      'id: doom',
      'title: Doom',
      'description: A package for ending tests.',
      'version: "1.0.0"',
      'language: en',
      'startLocation: hall',
      'deathEnding: death',
      'flags: [f]',
      'locations:',
      '  - locations/hall.yaml',
      'scenes:',
      '  - scenes/doom-scene.yaml',
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
    'locations/hall.yaml',
    'id: hall\nname: Hall\ndescription: A bare hall.\nscenes: [doom-scene]\n',
  );
  write(
    'scenes/doom-scene.yaml',
    [
      'id: doom-scene',
      'title: Doom',
      'trigger: on-enter',
      'text: Choose your fate.',
      'choices:',
      '  - id: doom',
      '    text: Drink the poison.',
      '    outcome:',
      "      text: 'It burns.'",
      '      effects:',
      '        - damage: 12',
      '        - give-item: { item: sword }',
      '        - set-flag: f',
      '      move: hall',
      '  - id: win',
      '    text: Claim victory.',
      '    outcome:',
      '      end: home',
      '  - id: nibble',
      '    text: Stub your toe.',
      '    outcome:',
      '      effects:',
      '        - damage: 2',
      '',
    ].join('\n'),
  );
  write(
    'items.yaml',
    [
      '- id: sword',
      '  kind: equipment',
      '  name: Sword',
      '  slot: weapon',
      '  damage: 3',
      '- id: herb',
      '  kind: consumable',
      '  name: Herb',
      '  heal: 3',
      '',
    ].join('\n'),
  );
  write(
    'templates.yaml',
    [
      '- id: hero',
      '  name: Hero',
      '  attributes: { might: 2, agility: 2, wits: 1, presence: 1 }',
      '  items:',
      '    - { item: herb, quantity: 2 }',
      '',
    ].join('\n'),
  );
  write(
    'endings.yaml',
    [
      '- id: death',
      '  kind: defeat',
      '  title: Gone',
      '  text: The end.',
      '- id: home',
      '  kind: victory',
      '  title: Home',
      '  text: You made it, {name}.',
      '',
    ].join('\n'),
  );
  const result = loadScenario(scenarioDir);
  if (!result.ok) {
    throw new Error(`doom fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function startDoom(): { scenario: Scenario; state: PlaythroughState } {
  const scenario = loadDoomScenario();
  const result = startPlaythrough(scenario, 'hero', 'Alex', rng);
  if (!result.ok) throw new Error(`start failed: ${result.reason}`);
  return { scenario, state: result.state };
}

function choose(scenario: Scenario, state: PlaythroughState, choiceId: string) {
  const result = applyAction(scenario, state, { kind: 'choose', choiceId, expectedStep: state.step }, rng);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`action failed: ${result.reason}`);
  return result;
}

describe('end transition', () => {
  it('ends whispering-woods on the walked-away Ending with its title and narration', () => {
    const { scenario, state } = startWoods();
    const refused = choose(scenario, state, 'refuse');
    expect(refused.state.status).toBe('ended');
    expect(refused.state.endingId).toBe('walked-away');
    expect(refused.state.step).toBe(1);
    expect(refused.journal.at(-1)).toEqual({
      type: 'ending',
      lang: 'en',
      endingId: 'walked-away',
      kind: 'defeat',
      title: 'The Road Goes On',
      text: expect.stringContaining('leave Ashford'),
    });
    const gameView = view(scenario, refused.state);
    expect(gameView).toMatchObject({
      kind: 'ended',
      endingId: 'walked-away',
      endingKind: 'defeat',
      title: 'The Road Goes On',
    });
    expect(gameView.kind === 'ended' ? gameView.text : '').toContain('leave Ashford');
  });

  it('ends on a victory Ending with its kind, title and narration', () => {
    const { scenario, state } = startDoom();
    const won = choose(scenario, state, 'win');
    expect(won.state.status).toBe('ended');
    expect(won.state.endingId).toBe('home');
    expect(won.state.character.health).toBe(12);
    expect(won.journal.at(-1)).toMatchObject({
      type: 'ending',
      lang: 'en',
      endingId: 'home',
      kind: 'victory',
      title: 'Home',
    });
    expect(view(scenario, won.state)).toMatchObject({
      kind: 'ended',
      endingId: 'home',
      endingKind: 'victory',
      title: 'Home',
    });
  });
});

describe('death by damage', () => {
  it('damage: 12 ends on the death Ending, skipping later Effects and the transition', () => {
    const { scenario, state } = startDoom();
    const doomed = choose(scenario, state, 'doom');
    expect(doomed.state.status).toBe('ended');
    expect(doomed.state.endingId).toBe('death');
    expect(doomed.state.character.health).toBe(0);
    // The Effects after the damage never applied: no sword, no flag.
    expect(doomed.state.inventory).toEqual({ herb: 2 });
    expect(doomed.state.flags).toEqual([]);
    // The `move` transition never applied: no re-entered Scene narration.
    expect(doomed.journal.map((entry) => entry.type)).toEqual([
      'choice',
      'outcome',
      'state-change',
      'ending',
    ]);
    expect(doomed.journal[2]).toEqual({
      type: 'state-change',
      lang: 'en',
      change: 'health-lost',
      amount: 12,
    });
    expect(doomed.journal[3]).toMatchObject({
      type: 'ending',
      lang: 'en',
      endingId: 'death',
      kind: 'defeat',
      title: 'Gone',
    });
    expect(doomed.state.activeSceneId).toBe(null);
  });

  it('non-lethal damage neither ends the Playthrough nor touches the Ending', () => {
    const { scenario, state } = startDoom();
    const hurt = choose(scenario, state, 'nibble');
    expect(hurt.state.status).toBe('active');
    expect(hurt.state.endingId).toBeUndefined();
    expect(hurt.state.character.health).toBe(10);
    expect(hurt.journal.map((entry) => entry.type)).toEqual(['choice', 'state-change']);
  });
});

describe('ended Playthroughs are frozen', () => {
  it('rejects every action, including a healing Consumable, leaving state and step unchanged', () => {
    const { scenario, state } = startDoom();
    const ended = choose(scenario, state, 'doom').state;
    const step = ended.step;
    const actions: Action[] = [
      { kind: 'travel', targetLocationId: 'hall', expectedStep: step },
      { kind: 'choose', choiceId: 'win', expectedStep: step },
      { kind: 'continue', expectedStep: step },
      { kind: 'open-scene', sceneId: 'doom-scene', expectedStep: step },
      { kind: 'equip', itemId: 'sword', expectedStep: step },
      { kind: 'unequip', slot: 'weapon', expectedStep: step },
      // A Consumable that would heal a living Character: still rejected.
      { kind: 'use-item', itemId: 'herb', expectedStep: step },
    ];
    for (const action of actions) {
      expect(applyAction(scenario, ended, action, rng)).toEqual({
        ok: false,
        reason: 'ended',
      });
    }
    expect(ended.step).toBe(step);
    expect(ended.character.health).toBe(0);
    expect(ended.inventory).toEqual({ herb: 2 });
  });

  it('writes status and ending_id in the same guarded update with the Ending entry', async () => {
    const scenario = loadWoods();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
      if (!started.ok) throw new Error('fixture start failed');
      const store = new PlaythroughStore(db);
      await store.create(
        {
          id: 'pt-ending',
          sessionId: 'session-hash-1',
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          contentHash: scenario.contentHash,
          status: started.state.status,
          step: started.state.step,
          state: started.state,
        },
        started.journal.map((entry) => {
          const { type, lang, ...payload } = entry;
          return { step: 0, type, lang, payload };
        }),
      );
      const result = await executeTurn(
        db,
        load,
        'pt-ending',
        'session-hash-1',
        { kind: 'choose', choiceId: 'refuse', expectedStep: 0 },
        rng,
      );
      expect(result).toEqual({ ok: true, step: 1 });
      const stored = await store.findById('pt-ending');
      expect(stored?.status).toBe('ended');
      expect(stored?.endingId).toBe('walked-away');
      expect((stored?.state as PlaythroughState).status).toBe('ended');
      expect((stored?.state as PlaythroughState).endingId).toBe('walked-away');
      expect((await store.listJournal('pt-ending')).map((entry) => entry.type)).toEqual([
        'intro',
        'scene',
        'choice',
        'outcome',
        'ending',
      ]);
      // A follow-up action is rejected and changes nothing.
      expect(
        await executeTurn(db, load, 'pt-ending', 'session-hash-1', {
          kind: 'travel',
          targetLocationId: 'forest-edge',
          expectedStep: 1,
        }, rng),
      ).toEqual({ ok: false, reason: 'ended' });
      expect((await store.findById('pt-ending'))?.step).toBe(1);
    } finally {
      await db.destroy();
    }
  });
});

describe('health invariant', () => {
  it('holds Health 0 exactly on the death Ending', () => {
    const { scenario, state } = startDoom();
    const doomed = choose(scenario, state, 'doom').state;
    expect(doomed.status).toBe('ended');
    expect(doomed.endingId).toBe('death');
    expect(doomed.character.health).toBe(0);
    const fresh = startDoom();
    const won = choose(fresh.scenario, fresh.state, 'win').state;
    expect(won.status).toBe('ended');
    expect(won.endingId).toBe('home');
    expect(won.character.health).toBe(12);
    const hurt = choose(fresh.scenario, fresh.state, 'nibble').state;
    expect(hurt.status).toBe('active');
    expect(hurt.character.health).toBe(10);
  });
});
