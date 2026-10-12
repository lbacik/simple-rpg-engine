// Engine unit tests for Combat (docs/spec/mechanics.md, Combat;
// docs/spec/content-semantics.md, encounters and Combat;
// docs/spec/playthrough-state.md, Combat): `start-combat`, the turn pipeline
// (Advance, Attack, Defend), the Enemy response, victory, death and the
// Journal-derived guard marker. A small synthetic Scenario gives precise
// control over Attributes and dice; the Whispering Woods Scenario covers the
// end-to-end fight to victory.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  applyAction,
  combatActions,
  combatGuardUp,
  combatRounds,
  startPlaythrough,
  view,
  type Action,
  type ApplyActionResult,
  type CombatAction,
  type NewJournalEntry,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Success = Extract<ApplyActionResult, { ok: true }>;

/** A deterministic RNG dealing the given dice in order, cycling. */
function diceRng(dice: number[]): Rng {
  let index = 0;
  return () => {
    const die = dice[index % dice.length];
    index += 1;
    if (die === undefined) throw new Error('dice ran out');
    return die;
  };
}

function succeed(
  scenario: Scenario,
  state: PlaythroughState,
  action: Action,
  rng: Rng,
): Success {
  const result = applyAction(scenario, state, action, rng);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`action failed: ${result.reason}`);
  return result;
}

function combat(
  scenario: Scenario,
  state: PlaythroughState,
  combatAction: CombatAction,
  rng: Rng,
): Success {
  return succeed(
    scenario,
    state,
    { kind: 'combat', combatAction, expectedStep: state.step },
    rng,
  );
}

function roundsOf(journal: NewJournalEntry[]): Extract<NewJournalEntry, { type: 'combat-round' }>[] {
  return journal.filter(
    (entry): entry is Extract<NewJournalEntry, { type: 'combat-round' }> =>
      entry.type === 'combat-round',
  );
}

/** Stored-shape rows, as the play page builds them from the Journal table. */
function storedRows(journal: NewJournalEntry[]): { type: string; payload: Record<string, unknown> }[] {
  return journal.map((entry) => {
    const { type, ...payload } = entry;
    return { type, payload };
  });
}

// ---------------------------------------------------------------------------
// Synthetic arena Scenario.
// ---------------------------------------------------------------------------

function writeFile(scenarioDir: string, relative: string, content: string): void {
  const full = path.join(scenarioDir, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/**
 * A yard with one on-demand Scene offering a fight per Encounter. The fighter
 * (Might 1, Agility 1, sword: melee 3) faces:
 * - dummy-melee (Might 1, Agility 1, Health 4, Damage 1, melee);
 * - dummy-ranged (same stats, ranged);
 * - brute (Might 3, Agility 0, Health 30, Damage 6, melee);
 * - weakling (Might 0, Agility 0, Health 1, Damage 1, melee).
 */
function loadArenaScenario(): Scenario {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-arena-'));
  const scenarioDir = path.join(dir, 'arena');
  writeFile(
    scenarioDir,
    'scenario.yaml',
    [
      'schemaVersion: 1',
      'id: arena',
      'title: Arena',
      'description: A yard for sparring.',
      'version: "1.0.0"',
      'language: en',
      'startLocation: yard',
      'deathEnding: death',
      'locations:',
      '  - locations/yard.yaml',
      'scenes:',
      '  - scenes/arena.yaml',
      'templates:',
      '  - templates.yaml',
      'endings:',
      '  - endings.yaml',
      'items:',
      '  - items.yaml',
      'enemies:',
      '  - enemies.yaml',
      'encounters:',
      '  - encounters.yaml',
      '',
    ].join('\n'),
  );
  writeFile(
    scenarioDir,
    'locations/yard.yaml',
    [
      'id: yard',
      'name: Yard',
      'description: Packed earth and sawdust.',
      'scenes: [arena-call]',
      'connections: []',
      '',
    ].join('\n'),
  );
  const fights = [
    ['melee', 'arena-melee'],
    ['ranged', 'arena-ranged'],
    ['near', 'arena-near'],
    ['no-victory', 'arena-no-victory'],
    ['death', 'arena-death'],
    ['counter', 'arena-counter'],
  ]
    .map(
      ([choice, encounter]) =>
        `  - id: fight-${choice}\n    text: Fight ${choice}.\n    outcome:\n      start-combat: ${encounter}`,
    )
    .join('\n');
  const leave = '  - id: leave\n    text: Leave the yard.\n    outcome:\n      end: home';
  writeFile(
    scenarioDir,
    'scenes/arena.yaml',
    ['id: arena-call', 'title: Sparring', 'trigger: on-demand', 'repeatable: true', 'text: Choose an opponent.', 'choices:', fights, leave, '']
      .join('\n'),
  );
  writeFile(
    scenarioDir,
    'items.yaml',
    [
      '- id: sword',
      '  kind: equipment',
      '  name: Sword',
      '  slot: weapon',
      '  damage: 3',
      '- id: bow',
      '  kind: equipment',
      '  name: Bow',
      '  slot: weapon',
      '  reach: ranged',
      '  damage: 3',
      '- id: herbs',
      '  kind: consumable',
      '  name: Healing Herbs',
      '  heal: 3',
      '',
    ].join('\n'),
  );
  writeFile(
    scenarioDir,
    'templates.yaml',
    [
      '- id: fighter',
      '  name: Fighter',
      '  attributes: { might: 1, agility: 1, wits: 2, presence: 2 }',
      '  items:',
      '    - { item: sword }',
      '    - { item: herbs }',
      '',
    ].join('\n'),
  );
  writeFile(
    scenarioDir,
    'enemies.yaml',
    [
      '- id: dummy-melee',
      '  name: Training Dummy',
      '  attributes: { might: 1, agility: 1, wits: 0, presence: 0 }',
      '  health: 4',
      '  damage: 1',
      '- id: dummy-ranged',
      '  name: Sling Dummy',
      '  attributes: { might: 1, agility: 1, wits: 0, presence: 0 }',
      '  health: 4',
      '  damage: 1',
      '  reach: ranged',
      '- id: brute',
      '  name: Brute',
      '  attributes: { might: 3, agility: 0, wits: 0, presence: 0 }',
      '  health: 30',
      '  damage: 6',
      '- id: weakling',
      '  name: Weakling',
      '  attributes: { might: 0, agility: 0, wits: 0, presence: 0 }',
      '  health: 1',
      '  damage: 1',
      '',
    ].join('\n'),
  );
  const encounter = (
    id: string,
    enemy: string,
    startRange: string,
    victory: string,
  ): string =>
    [
      `- id: ${id}`,
      `  enemy: ${enemy}`,
      `  startRange: ${startRange}`,
      '  text: |',
      `    The ${id} begins.`,
      victory,
      '  escape:',
      '    text: You step out of the yard.',
      '',
    ].join('\n');
  writeFile(
    scenarioDir,
    'encounters.yaml',
    [
      encounter('arena-melee', 'dummy-melee', 'far', '  victory:\n    text: The melee dummy falls.'),
      encounter('arena-ranged', 'dummy-ranged', 'far', '  victory:\n    text: The ranged dummy falls.'),
      encounter('arena-near', 'dummy-melee', 'near', '  victory:\n    text: The near dummy falls.'),
      // No victory Outcome: the Enemy-defeated notice applies instead.
      encounter('arena-no-victory', 'dummy-melee', 'near', ''),
      encounter('arena-death', 'brute', 'near', '  victory:\n    text: The brute falls.'),
      encounter('arena-counter', 'weakling', 'near', '  victory:\n    text: The weakling falls.'),
    ].join('\n'),
  );
  writeFile(
    scenarioDir,
    'endings.yaml',
    [
      '- id: death',
      '  kind: defeat',
      '  title: Dead',
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
    throw new Error(`arena failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function startArena(): { scenario: Scenario; state: PlaythroughState } {
  const scenario = loadArenaScenario();
  const started = startPlaythrough(scenario, 'fighter', 'Robin', diceRng([1]));
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);
  return { scenario, state: started.state };
}

/** Open the sparring Scene and start the given fight. */
function startFight(
  scenario: Scenario,
  state: PlaythroughState,
  choiceId: string,
  rng: Rng,
): Success {
  const opened = succeed(
    scenario,
    state,
    { kind: 'open-scene', sceneId: 'arena-call', expectedStep: state.step },
    rng,
  );
  return succeed(
    scenario,
    opened.state,
    { kind: 'choose', choiceId, expectedStep: opened.state.step },
    rng,
  );
}

describe('start-combat', () => {
  it('creates the record, sets Combat at startRange round 1 and appends the opening narration', () => {
    const { scenario, state } = startArena();
    const result = startFight(scenario, state, 'fight-melee', diceRng([1]));
    expect(result.state.activeCombat).toEqual({
      encounterId: 'arena-melee',
      range: 'far',
      round: 1,
    });
    expect(result.state.activeSceneId).toBeNull();
    expect(result.state.encounterDamage['arena-melee']).toBe(0);
    const start = result.journal.find((entry) => entry.type === 'combat-start');
    expect(start).toMatchObject({ encounterId: 'arena-melee', enemyName: 'Training Dummy' });
    expect((start as Extract<NewJournalEntry, { type: 'combat-start' }>).text).toContain(
      'The arena-melee begins.',
    );
  });

  it('is a no-op on a defeated Encounter: no fight, no victory Outcome', () => {
    const { scenario, state } = startArena();
    const rng = diceRng([6]);
    const fought = startFight(scenario, state, 'fight-counter', rng);
    // The weakling has Health 1: one sword hit kills it outright.
    const kill = combat(scenario, fought.state, 'attack', rng);
    expect(kill.state.activeCombat).toBeNull();
    // Start the same Encounter again: back to the Location view, nothing appended.
    const reopened = succeed(
      scenario,
      kill.state,
      { kind: 'open-scene', sceneId: 'arena-call', expectedStep: kill.state.step },
      rng,
    );
    const again = succeed(
      scenario,
      reopened.state,
      { kind: 'choose', choiceId: 'fight-counter', expectedStep: reopened.state.step },
      rng,
    );
    expect(again.state.activeCombat).toBeNull();
    expect(again.state.activeSceneId).toBeNull();
    expect(again.journal.some((entry) => entry.type === 'combat-start')).toBe(false);
    expect(again.journal.some((entry) => entry.type === 'combat-end')).toBe(false);
    expect(again.journal.some((entry) => entry.type === 'outcome')).toBe(false);
  });
});

describe('the hit formula', () => {
  it('hits on 2d6 + Might equal to 7 + Agility (boundary)', () => {
    // Fighter Might 1 against Agility 1: target 8. Dice 3+4: 3+4+1 = 8, a hit.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const result = combat(scenario, started.state, 'attack', diceRng([3, 4, 1, 1]));
    const [strike] = roundsOf(result.journal)[0]?.rolls ?? [];
    expect(strike).toMatchObject({
      side: 'character',
      die1: 3,
      die2: 4,
      modifier: 1,
      total: 8,
      target: 8,
      hit: true,
      damage: 3,
    });
    expect(roundsOf(result.journal)[0]).toMatchObject({
      action: 'attack',
      enemyName: 'Training Dummy',
      weaponName: 'Sword',
    });
    expect(result.state.encounterDamage['arena-near']).toBe(3);
  });

  it('misses one below the target and deals no Damage', () => {
    // Dice 2+4: 2+4+1 = 7 against 8, a miss.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const result = combat(scenario, started.state, 'attack', diceRng([2, 4, 1, 1]));
    const [strike] = roundsOf(result.journal)[0]?.rolls ?? [];
    expect(strike).toMatchObject({ total: 7, target: 8, hit: false, damage: 0 });
    expect(result.state.encounterDamage['arena-near']).toBe(0);
  });
});

describe('Defend', () => {
  it('adds +2 to the Enemy target and counterattacks for 1 on a miss', () => {
    // Brute-force dice the Enemy would hit without the bonus: 4+4+1 = 9
    // against 7 + Agility 1 = 8. With Defend the target is 10: a miss, so the
    // counterattack deals 1 Damage and the Character keeps full Health.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const result = combat(scenario, started.state, 'defend', diceRng([4, 4]));
    const [strike] = roundsOf(result.journal)[0]?.rolls ?? [];
    expect(strike).toMatchObject({
      side: 'enemy',
      total: 9,
      target: 10,
      hit: false,
    });
    expect(result.state.encounterDamage['arena-near']).toBe(1);
    expect(result.state.character.health).toBe(12);
    expect(roundsOf(result.journal)[0]?.guard).toBe(true);
  });

  it('hits on the same dice without Defend', () => {
    // Attack first (dice 1+1 miss), then the Enemy rolls 4+4+1 = 9 ≥ 8: a hit.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const result = combat(scenario, started.state, 'attack', diceRng([1, 1, 4, 4]));
    const [, response] = roundsOf(result.journal)[0]?.rolls ?? [];
    expect(response).toMatchObject({ side: 'enemy', target: 8, hit: true, damage: 1 });
    expect(result.state.character.health).toBe(11);
  });
});

describe('the Enemy response', () => {
  it('a melee Enemy at Far closes to Near without attacking', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-melee', diceRng([1]));
    const result = combat(scenario, started.state, 'defend', diceRng([6, 6]));
    expect(result.state.activeCombat).toMatchObject({ range: 'near', round: 2 });
    expect(result.state.character.health).toBe(12);
    expect(result.state.encounterDamage['arena-melee']).toBe(0);
    const [round] = roundsOf(result.journal);
    expect(round?.rolls).toHaveLength(0);
    expect(round?.rangeBefore).toBe('far');
    expect(round?.rangeAfter).toBe('near');
    // No Enemy roll and the Range closed: the melee Enemy closed in instead of
    // attacking. The wording lives in the catalogue, not the entry.
    expect(round).toMatchObject({
      action: 'defend',
      encounterId: 'arena-melee',
      guard: true,
      enemyName: 'Training Dummy',
    });
  });

  it('a ranged Enemy attacks from Far and never moves', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-ranged', diceRng([1]));
    const result = combat(scenario, started.state, 'defend', diceRng([1, 2]));
    expect(result.state.activeCombat).toMatchObject({ range: 'far', round: 2 });
    const [round] = roundsOf(result.journal);
    expect(round?.rolls).toHaveLength(1);
    expect(round?.rolls[0]).toMatchObject({ side: 'enemy', hit: false });
    // The miss against a Defend is a counterattack.
    expect(result.state.encounterDamage['arena-ranged']).toBe(1);
  });
});

describe('Advance and Reach', () => {
  it('Advance moves Far to Near with no roll', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-ranged', diceRng([1]));
    // Dice 6+6 would hit; the ranged dummy still attacks afterwards.
    const result = combat(scenario, started.state, 'advance', diceRng([6, 6]));
    expect(result.state.activeCombat).toMatchObject({ range: 'near', round: 2 });
    const [round] = roundsOf(result.journal);
    expect(round?.rolls).toHaveLength(1);
    expect(round).toMatchObject({
      action: 'advance',
      rangeBefore: 'far',
      rangeAfter: 'near',
      enemyName: 'Sling Dummy',
    });
  });

  it('a melee Attack at Far is disabled with a reason, and rejected if submitted', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-melee', diceRng([1]));
    const actions = combatActions(scenario, started.state);
    const attack = actions.find((action) => action.id === 'attack');
    expect(attack?.enabled).toBe(false);
    expect(attack).toMatchObject({
      group: 'fight',
      reason: 'needs-near',
      weaponId: 'sword',
      weaponName: 'Sword',
    });
    const step = started.state.step;
    const result = applyAction(
      scenario,
      started.state,
      { kind: 'combat', combatAction: 'attack', expectedStep: step },
      diceRng([6]),
    );
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
  });
});

describe('victory and death', () => {
  it('a counterattack can kill: no Enemy Damage, Combat end, then the victory Outcome', () => {
    // The weakling (Health 1) attacks into the guard and misses: the
    // counterattack's 1 Damage kills it.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-counter', diceRng([1]));
    const result = combat(scenario, started.state, 'defend', diceRng([1, 1]));
    expect(result.state.activeCombat).toBeNull();
    expect(result.state.activeSceneId).toBeNull();
    expect(result.state.character.health).toBe(12);
    expect(result.state.encounterDamage['arena-counter']).toBe(1);
    const types = result.journal.map((entry) => entry.type);
    expect(types).toEqual(['combat-round', 'combat-end', 'outcome']);
    expect(result.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'arena-counter',
      enemyName: 'Weakling',
      howEnded: 'victory',
    });
    expect(result.journal.find((entry) => entry.type === 'outcome')).toMatchObject({
      text: 'The weakling falls.',
    });
  });

  it('without a victory Outcome the Enemy-defeated notice returns to the Location view', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-no-victory', diceRng([1]));
    // Sword 3 Damage: two hits kill the Health 4 dummy. The dummy's replies
    // miss on dice 1+1 (1+1+1 = 3 against 8).
    const first = combat(scenario, started.state, 'attack', diceRng([6, 6, 1, 1]));
    expect(first.state.activeCombat).toMatchObject({ round: 2 });
    const second = combat(scenario, first.state, 'attack', diceRng([6, 6]));
    expect(second.state.activeCombat).toBeNull();
    expect(second.state.activeSceneId).toBeNull();
    const types = second.journal.map((entry) => entry.type);
    expect(types).toEqual(['combat-round', 'combat-end', 'enemy-defeated']);
    expect(second.journal.find((entry) => entry.type === 'enemy-defeated')).toMatchObject({
      encounterId: 'arena-no-victory',
      enemyName: 'Training Dummy',
    });
    expect(second.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'arena-no-victory',
      enemyName: 'Training Dummy',
      howEnded: 'victory',
    });
  });

  it('death ends the Playthrough on the death Ending', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-death', diceRng([1]));
    const wounded: PlaythroughState = {
      ...started.state,
      character: { ...started.state.character, health: 5 },
    };
    // Brute Might 3 on dice 6+6: 15 against 7 + Agility 1 + 2 = 10, a hit for
    // 6 Damage: lethal from 5 Health.
    const result = combat(scenario, wounded, 'defend', diceRng([6, 6]));
    expect(result.state.status).toBe('ended');
    expect(result.state.endingId).toBe('death');
    expect(result.state.character.health).toBe(0);
    expect(result.state.activeCombat).toBeNull();
    const types = result.journal.map((entry) => entry.type);
    expect(types).toEqual(['combat-round', 'ending']);
    expect(result.journal.find((entry) => entry.type === 'ending')).toMatchObject({
      endingId: 'death',
      kind: 'defeat',
    });
  });
});

describe('the Combat panel data', () => {
  it('derives the guard marker from the latest round and keeps it across a reload', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const defended = combat(scenario, started.state, 'defend', diceRng([1, 1]));
    // A reload re-reads the persisted Journal: emulate it with a JSON round
    // trip of the entries (the Defend bonus itself was never stored).
    const reloaded = JSON.parse(JSON.stringify(storedRows(defended.journal))) as {
      type: string;
      payload: Record<string, unknown>;
    }[];
    expect(combatGuardUp(reloaded, 'arena-near')).toBe(true);
    const struck = combat(scenario, defended.state, 'attack', diceRng([1, 1, 1, 1]));
    const reloadedAll = JSON.parse(
      JSON.stringify([...storedRows(defended.journal), ...storedRows(struck.journal)]),
    ) as { type: string; payload: Record<string, unknown> }[];
    expect(combatGuardUp(reloadedAll, 'arena-near')).toBe(false);
  });

  it('logs only the current Combat rounds', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const defended = combat(scenario, started.state, 'defend', diceRng([1, 1]));
    const rows = storedRows(defended.journal);
    const log = combatRounds(rows, 'arena-near');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ round: 1, action: 'defend', guard: true });
    expect(log[0]?.rolls).toHaveLength(1);
    // The dummy's attack missed into the guard: the counterattack's 1 Damage
    // is recorded on the Enemy roll's miss, not in stored text.
    expect(log[0]?.rolls[0]).toMatchObject({ side: 'enemy', hit: false });
  });

  it('shows the Combat view with tokens and actions', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const gameView = view(scenario, started.state);
    expect(gameView.kind).toBe('combat');
    if (gameView.kind !== 'combat') throw new Error('expected combat view');
    expect(gameView.encounterName).toBe('Training Dummy');
    expect(gameView.range).toBe('near');
    expect(gameView.round).toBe(1);
    expect(gameView.character).toMatchObject({
      health: 12,
      maxHealth: 12,
      weaponName: 'Sword',
      reach: 'melee',
      damage: 3,
    });
    expect(gameView.enemy).toMatchObject({
      name: 'Training Dummy',
      health: 4,
      maxHealth: 4,
      reach: 'melee',
    });
    expect(gameView.actions.find((action) => action.id === 'attack')?.enabled).toBe(true);
  });
});

describe('Fall back', () => {
  it('success at Near moves to Far; a melee Enemy closes back without attacking', () => {
    // Fighter Agility 1 against Agility 1: target 8. Dice 3+4: 3+4+1 = 8.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const result = combat(scenario, started.state, 'fall-back', diceRng([3, 4]));
    const [round] = roundsOf(result.journal);
    expect(round?.rolls).toHaveLength(1);
    expect(round?.rolls[0]).toMatchObject({
      side: 'character',
      die1: 3,
      die2: 4,
      modifier: 1,
      total: 8,
      target: 8,
      hit: true,
      damage: 0,
    });
    expect(round?.rangeBefore).toBe('near');
    // The fall back reached Far, then the melee dummy closed back to Near.
    expect(round?.rangeAfter).toBe('near');
    // One roll, the successful manoeuvre, and no Enemy attack: the dummy
    // closed back in instead.
    expect(round).toMatchObject({ action: 'fall-back', enemyName: 'Training Dummy' });
    expect(result.state.activeCombat).toMatchObject({ range: 'near', round: 2 });
    expect(result.state.character.health).toBe(12);
  });

  it('failure stays Near and the Enemy responds', () => {
    // Dice 1+1: 1+1+1 = 3 against 8, a failure. The dummy then hits on
    // 6+6+1 = 13 against 8 for 1 Damage.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const result = combat(scenario, started.state, 'fall-back', diceRng([1, 1, 6, 6]));
    const [round] = roundsOf(result.journal);
    expect(round?.rolls).toHaveLength(2);
    expect(round?.rolls[0]).toMatchObject({ total: 3, target: 8, hit: false });
    expect(round?.rolls[1]).toMatchObject({ side: 'enemy', hit: true, damage: 1 });
    expect(round?.rangeBefore).toBe('near');
    expect(round?.rangeAfter).toBe('near');
    expect(round).toMatchObject({ action: 'fall-back', enemyName: 'Training Dummy' });
    expect(result.state.character.health).toBe(11);
    expect(result.state.activeCombat).toMatchObject({ range: 'near', round: 2 });
  });

  it('is disabled at Far with a reason, and rejected if submitted', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-melee', diceRng([1]));
    const actions = combatActions(scenario, started.state);
    const fallBack = actions.find((action) => action.id === 'fall-back');
    expect(fallBack?.enabled).toBe(false);
    expect(fallBack).toMatchObject({ group: 'position', reason: 'already-far' });
    const step = started.state.step;
    const result = applyAction(
      scenario,
      started.state,
      { kind: 'combat', combatAction: 'fall-back', expectedStep: step },
      diceRng([6]),
    );
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
  });
});

describe('Escape', () => {
  it('adds +2 at Far: dice that fail at Near succeed at Far', () => {
    // Fighter Agility 1 against Agility 1: target 8. Dice 2+3: 2+3+1 = 6, a
    // failure — but at Far the +2 makes 8, a success.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-melee', diceRng([1]));
    const result = combat(scenario, started.state, 'escape', diceRng([2, 3]));
    const [round] = roundsOf(result.journal);
    expect(round?.rolls[0]).toMatchObject({
      die1: 2,
      die2: 3,
      modifier: 3,
      total: 8,
      target: 8,
      hit: true,
    });
    expect(result.state.activeCombat).toBeNull();
    expect(result.state.activeSceneId).toBeNull();
  });

  it('the same dice fail at Near, and the Enemy responds', () => {
    // Dice 2+3: 2+3+1 = 6 against 8, a failure with no Far bonus. The dummy
    // then misses on 1+1+1 = 3 against 8.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const result = combat(scenario, started.state, 'escape', diceRng([2, 3, 1, 1]));
    const [round] = roundsOf(result.journal);
    expect(round?.rolls).toHaveLength(2);
    expect(round?.rolls[0]).toMatchObject({ total: 6, target: 8, hit: false });
    expect(round?.rolls[1]).toMatchObject({ side: 'enemy', hit: false });
    expect(round).toMatchObject({ action: 'escape', enemyName: 'Training Dummy' });
    expect(result.state.activeCombat).toMatchObject({ range: 'near', round: 2 });
    expect(result.state.character.health).toBe(12);
  });

  it('a failed Escape lets the Enemy hit', () => {
    // Dice 2+3 fail the escape; the dummy hits on 6+6+1 = 13 against 8.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const result = combat(scenario, started.state, 'escape', diceRng([2, 3, 6, 6]));
    expect(result.state.character.health).toBe(11);
    expect(result.state.activeCombat).toMatchObject({ round: 2 });
  });

  it('success ends the Combat with no Enemy response and applies the escape Outcome', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const result = combat(scenario, started.state, 'escape', diceRng([6, 6]));
    expect(result.state.activeCombat).toBeNull();
    expect(result.state.activeSceneId).toBeNull();
    expect(result.state.encounterDamage['arena-near']).toBe(0);
    const types = result.journal.map((entry) => entry.type);
    expect(types).toEqual(['combat-round', 'combat-end', 'outcome']);
    expect(result.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'arena-near',
      enemyName: 'Training Dummy',
      howEnded: 'escape',
    });
    expect(result.journal.find((entry) => entry.type === 'outcome')).toMatchObject({
      text: 'You step out of the yard.',
    });
  });
});

describe('Consumables in Combat', () => {
  function useItem(
    scenario: Scenario,
    state: PlaythroughState,
    itemId: string,
    rng: Rng,
  ): Success {
    return succeed(
      scenario,
      state,
      { kind: 'combat', combatAction: 'use-item', itemId, expectedStep: state.step },
      rng,
    );
  }

  it('at full Health the Use is disabled with a reason, and rejected with no state or step change', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    const actions = combatActions(scenario, started.state);
    const use = actions.find((action) => action.id === 'use-item' && action.itemId === 'herbs');
    expect(use).toMatchObject({
      group: 'items',
      enabled: false,
      reason: 'full-health',
      itemId: 'herbs',
      itemName: 'Healing Herbs',
    });
    const step = started.state.step;
    const before = started.state;
    const result = applyAction(
      scenario,
      started.state,
      { kind: 'combat', combatAction: 'use-item', itemId: 'herbs', expectedStep: step },
      diceRng([6]),
    );
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
    expect(started.state).toEqual(before);
    expect(started.state.step).toBe(step);
  });

  it('heals, consumes one copy, and the Enemy responds', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    // The Character misses (1+1+1 = 3) and the dummy hits (6+6+1 = 13): 11 Health.
    const wounded = combat(scenario, started.state, 'attack', diceRng([1, 1, 6, 6]));
    expect(wounded.state.character.health).toBe(11);
    // Herbs heal 3, capped: 11 + 1 = 12. The dummy misses on 1+1+1 = 3.
    const result = useItem(scenario, wounded.state, 'herbs', diceRng([1, 1]));
    expect(result.state.character.health).toBe(12);
    expect(result.state.inventory['herbs']).toBeUndefined();
    expect(result.state.activeCombat).toMatchObject({ range: 'near', round: 3 });
    const [round] = roundsOf(result.journal);
    expect(round).toMatchObject({
      action: 'use-item',
      itemName: 'Healing Herbs',
      healed: 1,
      enemyName: 'Training Dummy',
    });
  });

  it('two Encounters with the same Enemy track Damage independently', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', diceRng([1]));
    // Sword 3 Damage on dice 6+6; the dummy replies and misses on 1+1.
    const struck = combat(scenario, started.state, 'attack', diceRng([6, 6, 1, 1]));
    expect(struck.state.encounterDamage['arena-near']).toBe(3);
    expect(struck.state.encounterDamage['arena-melee'] ?? 0).toBe(0);
    // Leave this fight, then start the other placement of the same Enemy.
    const escaped = combat(scenario, struck.state, 'escape', diceRng([6, 6]));
    expect(escaped.state.activeCombat).toBeNull();
    const reopened = succeed(
      scenario,
      escaped.state,
      { kind: 'open-scene', sceneId: 'arena-call', expectedStep: escaped.state.step },
      diceRng([1]),
    );
    const other = succeed(
      scenario,
      reopened.state,
      { kind: 'choose', choiceId: 'fight-melee', expectedStep: reopened.state.step },
      diceRng([1]),
    );
    expect(other.state.activeCombat).toMatchObject({ encounterId: 'arena-melee' });
    const gameView = view(scenario, other.state);
    if (gameView.kind !== 'combat') throw new Error('expected combat view');
    expect(gameView.enemy.health).toBe(4);
    expect(other.state.encounterDamage['arena-near']).toBe(3);
  });
});

describe('whispering-woods: the wolf fight', () => {
  function loadWoods(): Scenario {
    const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
    if (!result.ok) {
      throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
    }
    return result.scenario;
  }

  /** Stand in the hollow with the wolf-den Scene active. */
  function atWolfDen(): { scenario: Scenario; state: PlaythroughState } {
    const scenario = loadWoods();
    const started = startPlaythrough(scenario, 'hunter', 'Robin', diceRng([1]));
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const state: PlaythroughState = {
      ...started.state,
      currentLocationId: 'wolf-hollow',
      activeSceneId: 'wolf-den',
      visited: [...started.state.visited, 'wolf-hollow'],
      firedScenes: ['arrival', 'elder-plea', 'wolf-den'],
      flags: ['quest-accepted'],
    };
    return { scenario, state };
  }

  it('fights the hollow-wolf to victory and applies its victory Outcome once', () => {
    const { scenario, state } = atWolfDen();
    // The hunter's bow (ranged, 3 Damage) works from Far. Fixed dice 6: every
    // attack hits (6+6+1 = 13 ≥ 7 + Agility 2 = 9); the wolf (melee) closes
    // first, then hits on 6+6+2 = 14 ≥ 7 + Agility 4 = 11.
    const rng = diceRng([6]);
    const started = succeed(
      scenario,
      state,
      { kind: 'choose', choiceId: 'fight', expectedStep: state.step },
      rng,
    );
    expect(started.state.activeCombat).toMatchObject({ encounterId: 'hollow-wolf', range: 'far', round: 1 });

    const first = combat(scenario, started.state, 'attack', rng);
    expect(first.state.activeCombat).toMatchObject({ range: 'near', round: 2 });
    expect(first.state.encounterDamage['hollow-wolf']).toBe(3);

    const second = combat(scenario, first.state, 'attack', rng);
    expect(second.state.activeCombat).toMatchObject({ round: 3 });
    expect(second.state.encounterDamage['hollow-wolf']).toBe(6);
    expect(second.state.character.health).toBe(10);

    const third = combat(scenario, second.state, 'attack', rng);
    expect(third.state.activeCombat).toBeNull();
    expect(third.state.encounterDamage['hollow-wolf']).toBe(9);
    const outcomes = third.journal.filter((entry) => entry.type === 'outcome');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ text: expect.stringContaining('The wolf collapses') });
    expect(third.journal.some((entry) => entry.type === 'combat-end')).toBe(true);
  });

  it('a later start-combat on the defeated wolf is a no-op', () => {
    const { scenario, state } = atWolfDen();
    const rng = diceRng([6]);
    const started = succeed(
      scenario,
      state,
      { kind: 'choose', choiceId: 'fight', expectedStep: state.step },
      rng,
    );
    let current = started.state;
    for (let turn = 0; turn < 3; turn += 1) {
      const result = combat(scenario, current, 'attack', rng);
      current = result.state;
      if (current.activeCombat == null) break;
    }
    expect(current.activeCombat).toBeNull();
    // Offer the fight again through the repeatable wolf-again Scene and take it.
    const again: PlaythroughState = { ...current, activeSceneId: 'wolf-again' };
    const result = succeed(
      scenario,
      again,
      { kind: 'choose', choiceId: 'fight', expectedStep: again.step },
      rng,
    );
    expect(result.state.activeCombat).toBeNull();
    expect(result.state.activeSceneId).toBeNull();
    expect(result.state.encounterDamage['hollow-wolf']).toBe(9);
    expect(result.journal.some((entry) => entry.type === 'combat-start')).toBe(false);
    expect(result.journal.some((entry) => entry.type === 'combat-end')).toBe(false);
    expect(result.journal.some((entry) => entry.type === 'outcome')).toBe(false);
  });

  it('escaping and returning through wolf-again restarts at startRange with wounds kept', () => {
    const { scenario, state } = atWolfDen();
    // Hunter Agility 3 + cloak = 4; the bow hits on 6+6+1 = 13 ≥ 9.
    const rng = diceRng([6]);
    const started = succeed(
      scenario,
      state,
      { kind: 'choose', choiceId: 'fight', expectedStep: state.step },
      rng,
    );
    expect(started.state.activeCombat).toMatchObject({ range: 'far', round: 1 });

    const first = combat(scenario, started.state, 'attack', rng);
    expect(first.state.encounterDamage['hollow-wolf']).toBe(3);
    expect(first.state.activeCombat).toMatchObject({ range: 'near', round: 2 });

    // Escape at Near: 6+6+4 = 16 ≥ 7 + Agility 2 = 9. No Enemy response.
    const escaped = combat(scenario, first.state, 'escape', rng);
    expect(escaped.state.activeCombat).toBeNull();
    expect(escaped.state.encounterDamage['hollow-wolf']).toBe(3);
    const types = escaped.journal.map((entry) => entry.type);
    // The escape Outcome moves to the forest edge, whose on-enter Scene fires.
    expect(types).toEqual(['combat-round', 'combat-end', 'outcome', 'scene']);
    expect(escaped.journal.find((entry) => entry.type === 'outcome')).toMatchObject({
      text: expect.stringContaining('scramble up the bank'),
    });
    // The escape Outcome moves back to the forest edge.
    expect(escaped.state.currentLocationId).toBe('forest-edge');

    // Return through play: leave the forest-edge Scene, travel to the hollow,
    // open the re-offering Scene, and take the fight again.
    const onward = succeed(
      scenario,
      escaped.state,
      { kind: 'choose', choiceId: 'press-on', expectedStep: escaped.state.step },
      rng,
    );
    const back = succeed(
      scenario,
      onward.state,
      { kind: 'travel', targetLocationId: 'wolf-hollow', expectedStep: onward.state.step },
      rng,
    );
    expect(back.state.activeSceneId).toBeNull();
    const offered = succeed(
      scenario,
      back.state,
      { kind: 'open-scene', sceneId: 'wolf-again', expectedStep: back.state.step },
      rng,
    );
    const reentered = succeed(
      scenario,
      offered.state,
      { kind: 'choose', choiceId: 'fight', expectedStep: offered.state.step },
      rng,
    );
    expect(reentered.state.activeCombat).toEqual({
      encounterId: 'hollow-wolf',
      range: 'far',
      round: 1,
    });
    expect(reentered.state.encounterDamage['hollow-wolf']).toBe(3);
    const start = reentered.journal.find((entry) => entry.type === 'combat-start');
    expect(start).toMatchObject({ encounterId: 'hollow-wolf', enemyName: 'Grey Wolf' });
    expect((start as Extract<NewJournalEntry, { type: 'combat-start' }>).text).toContain(
      'lowers its head',
    );
    const gameView = view(scenario, reentered.state);
    if (gameView.kind !== 'combat') throw new Error('expected combat view');
    expect(gameView.enemy.health).toBe(5);
  });
});
