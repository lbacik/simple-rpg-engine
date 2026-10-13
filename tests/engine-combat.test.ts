// Interim v2 tactical-Combat suite for issue #120 (tracer bullet).
//
// This file supersedes the old v1-rule expectations (Advance/Attack/Defend
// turns, guard markers, Enemy responses, Escape, Consumables) with the v2
// tactical rules in src/engine/index.ts, src/engine/state.ts and
// src/engine/tactical.ts. Named decisions:
// - D2: only the `attack` Combat action resolves in this ticket. Submitting
//   defend is rejected as `illegal-action` (Defend and Distract land in #122).
//   Advance, Fall back, Escape and Combat `use-item` resolve since #121:
//   their rejection tests below were rewritten then to assert the new rules.
//   Non-attack availability shown by combatActions() is standing availability
//   only. Distract is not tested: it is not in the CombatAction union.
// - D3: the Combat view projection is interim and shows the first surviving
//   participant (full arena projection arrives with #123/R12).
//
// Dice: every test uses a STRICT finite rng that throws when exhausted, never
// cycling. Dice arrays are sized exactly: 2 dice per attack roll, plus 1 per
// heavy preparing draw in selection order after the resolution rolls (no heavy
// Enemies are used here except through selection-free paths, so arrays are
// resolution rolls only). Rejection tests use a rng that throws on any draw.

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
  type TacticalActionEvent,
} from '../src/engine/index';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Success = Extract<ApplyActionResult, { ok: true }>;
type CombatRoundEntry = Extract<NewJournalEntry, { type: 'combat-round' }>;
type StrictRng = Rng & { assertExhausted(): void };

/** A strict finite rng: deals the given dice in order, throws when exhausted. */
function strictDice(dice: number[]): StrictRng {
  let index = 0;
  const rng = ((min: number, max: number) => {
    if (index >= dice.length) {
      throw new Error(`dice exhausted after ${index} draws`);
    }
    const die = dice[index];
    if (die === undefined || die < min || die >= max) {
      throw new Error(`die ${String(die)} out of range [${min}, ${max})`);
    }
    index += 1;
    return die;
  }) as StrictRng;
  rng.assertExhausted = () => {
    expect(index).toBe(dice.length);
  };
  return rng;
}

/** A rng that fails the test if the engine draws any die (rejection paths). */
const noDice: Rng = () => {
  throw new Error('no dice should be drawn on a rejected action');
};

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
  opts?: { targetParticipantId?: string; itemId?: string },
): Success {
  return succeed(
    scenario,
    state,
    {
      kind: 'combat',
      combatAction,
      ...(opts?.targetParticipantId !== undefined
        ? { targetParticipantId: opts.targetParticipantId }
        : {}),
      ...(opts?.itemId !== undefined ? { itemId: opts.itemId } : {}),
      expectedStep: state.step,
    },
    rng,
  );
}

function onlyRound(journal: NewJournalEntry[]): CombatRoundEntry {
  const rounds = journal.filter(
    (entry): entry is CombatRoundEntry => entry.type === 'combat-round',
  );
  expect(rounds).toHaveLength(1);
  const round = rounds[0];
  if (round === undefined) throw new Error('expected one combat round');
  return round;
}

function characterEvent(round: CombatRoundEntry): TacticalActionEvent {
  const event = round.actions.find((action) => action.actor.kind === 'character');
  if (event === undefined) throw new Error('expected a character action');
  return event;
}

function participantEvents(round: CombatRoundEntry): TacticalActionEvent[] {
  return round.actions.filter((action) => action.actor.kind === 'participant');
}

/** Stored-shape rows, as the play page builds them from the Journal table. */
function storedRows(journal: NewJournalEntry[]): {
  type: string;
  payload: { encounterId?: unknown; guard?: unknown };
}[] {
  return journal.map((entry) => {
    const { type, ...rest } = entry;
    return {
      type,
      payload: rest as unknown as { encounterId?: unknown; guard?: unknown },
    };
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
 * (Might 1, Agility 1, sword: melee 3, bow available in the catalogue for
 * Far-range intent tests) faces:
 * - dummy-melee (Might 1, Agility 1, Health 4, Damage 1, melee, steady);
 * - dummy-ranged (same stats, ranged, steady);
 * - brute (Might 3, Agility 0, Health 30, Damage 6, melee, steady);
 * - weakling (Might 0, Agility 0, Health 1, Damage 1, melee, steady);
 * - arena-pair: two weaklings (pup-a, pup-b) at Near for the target rules.
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
    ['pair', 'arena-pair'],
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
      [
        '- id: arena-pair',
        '  participants:',
        '    - id: pup-a',
        '      enemy: weakling',
        '    - id: pup-b',
        '      enemy: weakling',
        '  startRange: near',
        '  text: |',
        '    The arena-pair begins.',
        '  victory:',
        '    text: The pups fall.',
        '  escape:',
        '    text: You step out of the yard.',
        '',
      ].join('\n'),
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
  const started = startPlaythrough(scenario, 'fighter', 'Robin', strictDice([]));
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);
  return { scenario, state: started.state };
}

/** Open the sparring Scene and start the given fight. */
function startFight(
  scenario: Scenario,
  state: PlaythroughState,
  choiceId: string,
  rng: StrictRng,
): Success {
  const opened = succeed(
    scenario,
    state,
    { kind: 'open-scene', sceneId: 'arena-call', expectedStep: state.step },
    rng,
  );
  const result = succeed(
    scenario,
    opened.state,
    { kind: 'choose', choiceId, expectedStep: opened.state.step },
    rng,
  );
  rng.assertExhausted();
  return result;
}

/**
 * Test-only state edit equipping the arena bow (defined in items.yaml) so
 * attacks from Far are legal. The template loadout is unchanged.
 */
function withBow(state: PlaythroughState): PlaythroughState {
  return { ...state, equipment: { ...state.equipment, weapon: 'bow' } };
}

describe('start-combat', () => {
  it('creates the v2 activeCombat shape, the encounters record and the combat-start refs', () => {
    const { scenario, state } = startArena();
    const result = startFight(scenario, state, 'fight-melee', strictDice([]));
    // Melee at Far: the first Intent is Close in (steady, no preparing draw).
    expect(result.state.activeCombat).toEqual({
      encounterId: 'arena-melee',
      round: 1,
      startedParticipants: ['dummy-melee'],
      roundParticipantOrder: ['dummy-melee'],
      participants: {
        'dummy-melee': { range: 'far', intent: 'close-in', prepared: false },
      },
    });
    expect(result.state.activeSceneId).toBeNull();
    expect(result.state.encounters['arena-melee']).toEqual({ 'dummy-melee': 0 });
    const start = result.journal.find((entry) => entry.type === 'combat-start');
    expect(start).toMatchObject({
      type: 'combat-start',
      encounterId: 'arena-melee',
      participants: [
        { participantId: 'dummy-melee', enemyId: 'dummy-melee', name: 'Training Dummy' },
      ],
    });
    expect((start as Extract<NewJournalEntry, { type: 'combat-start' }>).text).toContain(
      'The arena-melee begins.',
    );
  });

  it('is a no-op on a defeated Encounter: back to Location view, nothing appended', () => {
    const { scenario, state } = startArena();
    const fought = startFight(scenario, state, 'fight-counter', strictDice([]));
    // The weakling has Health 1: one sword hit (3+3+1 = 7 >= 7) kills it
    // outright. The Character acts first (Agility 1 vs 0), so only its 2 dice
    // are drawn; the defeated Intent never rolls.
    const killDice = strictDice([3, 3]);
    const kill = combat(scenario, fought.state, 'attack', killDice);
    killDice.assertExhausted();
    expect(kill.state.activeCombat).toBeNull();
    // Start the same Encounter again: back to the Location view, nothing appended.
    const reopened = succeed(
      scenario,
      kill.state,
      { kind: 'open-scene', sceneId: 'arena-call', expectedStep: kill.state.step },
      strictDice([]),
    );
    const rerunDice = strictDice([]);
    const again = succeed(
      scenario,
      reopened.state,
      { kind: 'choose', choiceId: 'fight-counter', expectedStep: reopened.state.step },
      rerunDice,
    );
    rerunDice.assertExhausted();
    expect(again.state.activeCombat).toBeNull();
    expect(again.state.activeSceneId).toBeNull();
    expect(again.journal.some((entry) => entry.type === 'combat-start')).toBe(false);
    expect(again.journal.some((entry) => entry.type === 'combat-end')).toBe(false);
    expect(again.journal.some((entry) => entry.type === 'outcome')).toBe(false);
  });
});

describe('the hit formula', () => {
  it('hits on 2d6 + Might equal to 7 + Agility (boundary)', () => {
    // Fighter Might 1 against Agility 1: target 8. Dice 3+4: 3+4+1 = 8, a hit
    // for 3 sword Damage. The dummy replies 1+1+1 = 3 against 8: a miss.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
    const step = started.state.step;
    const rng = strictDice([3, 4, 1, 1]);
    const result = combat(scenario, started.state, 'attack', rng);
    rng.assertExhausted();
    const round = onlyRound(result.journal);
    expect(round).toMatchObject({
      type: 'combat-round',
      encounterId: 'arena-near',
      round: 1,
      version: 2,
    });
    expect(round.stop).toBeUndefined();
    expect(characterEvent(round)).toMatchObject({
      kind: 'attack',
      speed: 'normal',
      order: 1,
      status: 'executed',
      roll: {
        side: 'character',
        die1: 3,
        die2: 4,
        modifier: 1,
        total: 8,
        target: 8,
        hit: true,
        damage: 3,
      },
      damage: 3,
      weaponName: 'Sword',
    });
    expect(result.state.encounters['arena-near']).toEqual({ 'dummy-melee': 3 });
    expect(result.state.character.health).toBe(12);
    expect(result.state.activeCombat).toMatchObject({ round: 2 });
    expect(result.state.step).toBe(step + 1);
  });

  it('misses one below the target and deals no damage', () => {
    // Dice 2+4: 2+4+1 = 7 against 8, a miss; the dummy replies 1+1: a miss.
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
    const rng = strictDice([2, 4, 1, 1]);
    const result = combat(scenario, started.state, 'attack', rng);
    rng.assertExhausted();
    const round = onlyRound(result.journal);
    expect(characterEvent(round)).toMatchObject({
      status: 'executed',
      roll: { total: 7, target: 8, hit: false, damage: 0 },
      damage: 0,
    });
    expect(result.state.encounters['arena-near']).toEqual({ 'dummy-melee': 0 });
    expect(result.state.character.health).toBe(12);
  });
});

describe('enemy intents', () => {
  it('a melee Enemy at Far closes to Near without attacking', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-melee', strictDice([]));
    // The bow (ranged) makes the Far attack legal; the steady melee dummy
    // still closes in instead of attacking.
    const bowState = withBow(started.state);
    const rng = strictDice([6, 6]);
    const result = combat(scenario, bowState, 'attack', rng);
    rng.assertExhausted();
    const round = onlyRound(result.journal);
    expect(characterEvent(round)).toMatchObject({ status: 'executed', damage: 3 });
    const [closing] = participantEvents(round);
    expect(closing).toMatchObject({
      kind: 'close-in',
      speed: 'normal',
      status: 'executed',
      rangeBefore: 'far',
      rangeAfter: 'near',
    });
    expect(closing?.roll).toBeUndefined();
    expect(result.state.character.health).toBe(12);
    expect(result.state.encounters['arena-melee']).toEqual({ 'dummy-melee': 3 });
    expect(result.state.activeCombat).toMatchObject({
      round: 2,
      roundParticipantOrder: ['dummy-melee'],
      participants: { 'dummy-melee': { range: 'near', intent: 'strike', prepared: false } },
    });
  });

  it('a ranged Enemy attacks from Far and never moves', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-ranged', strictDice([]));
    const bowState = withBow(started.state);
    // Character hits (6+6+1 = 13 >= 8); the Sling Dummy replies 1+2+1 = 4: a miss.
    const rng = strictDice([6, 6, 1, 2]);
    const result = combat(scenario, bowState, 'attack', rng);
    rng.assertExhausted();
    const round = onlyRound(result.journal);
    const [striker] = participantEvents(round);
    expect(striker).toMatchObject({
      kind: 'strike',
      status: 'executed',
      roll: { side: 'enemy', hit: false },
    });
    expect(striker?.rangeBefore).toBeUndefined();
    expect(striker?.rangeAfter).toBeUndefined();
    expect(result.state.activeCombat).toMatchObject({
      round: 2,
      participants: { 'dummy-ranged': { range: 'far', intent: 'strike', prepared: false } },
    });
    expect(result.state.encounters['arena-ranged']).toEqual({ 'dummy-ranged': 3 });
  });
});

describe('attack availability', () => {
  it('a melee Attack at Far to the only participant is rejected (no step change)', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-melee', strictDice([]));
    // Standing availability (interim: the full per-target projection with
    // Speed/order/thresholds arrives with #123): Attack needs Near.
    const actions = combatActions(scenario, started.state);
    expect(actions.find((action) => action.id === 'attack')).toMatchObject({
      group: 'fight',
      enabled: false,
      reason: 'needs-near',
      weaponId: 'sword',
      weaponName: 'Sword',
    });
    const step = started.state.step;
    const before = started.state;
    const result = applyAction(
      scenario,
      started.state,
      { kind: 'combat', combatAction: 'attack', expectedStep: step },
      noDice,
    );
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
    expect(started.state).toEqual(before);
    expect(started.state.step).toBe(step);
  });
});

describe('target rules (R10)', () => {
  function startPair(): { scenario: Scenario; state: PlaythroughState } {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-pair', strictDice([]));
    expect(started.state.activeCombat).toEqual({
      encounterId: 'arena-pair',
      round: 1,
      startedParticipants: ['pup-a', 'pup-b'],
      roundParticipantOrder: ['pup-a', 'pup-b'],
      participants: {
        'pup-a': { range: 'near', intent: 'strike', prepared: false },
        'pup-b': { range: 'near', intent: 'strike', prepared: false },
      },
    });
    expect(started.state.encounters['arena-pair']).toEqual({ 'pup-a': 0, 'pup-b': 0 });
    const start = started.journal.find((entry) => entry.type === 'combat-start');
    // Same-kind participants carry ordinals in the refs.
    expect(start).toMatchObject({
      encounterId: 'arena-pair',
      participants: [
        { participantId: 'pup-a', enemyId: 'weakling', name: 'Weakling', ordinal: 1 },
        { participantId: 'pup-b', enemyId: 'weakling', name: 'Weakling', ordinal: 2 },
      ],
    });
    return { scenario, state: started.state };
  }

  it('an omitted target defaults to the only survivor; with two it is rejected', () => {
    const { scenario, state } = startPair();
    const step = state.step;
    const before = state;
    const result = applyAction(
      scenario,
      state,
      { kind: 'combat', combatAction: 'attack', expectedStep: step },
      noDice,
    );
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
    expect(state).toEqual(before);
    expect(state.step).toBe(step);
  });

  it('an explicit target resolves; the defeated Intent is dropped and the round continues', () => {
    const { scenario, state } = startPair();
    // Sword hits pup-a (3+3+1 = 7 >= 7+0) for 3 Damage: Health 1 defeated.
    // The Character (Agility 1) acts before both pups (Agility 0); pup-a is
    // dropped, pup-b replies 1+1+0 = 2 against 8: a miss.
    const rng = strictDice([3, 3, 1, 1]);
    const result = combat(scenario, state, 'attack', rng, { targetParticipantId: 'pup-a' });
    rng.assertExhausted();
    const round = onlyRound(result.journal);
    expect(round.actions.map((action) => action.status)).toEqual([
      'executed',
      'dropped',
      'executed',
    ]);
    const strike = characterEvent(round);
    expect(strike.target).toMatchObject({ kind: 'participant', participantId: 'pup-a' });
    expect(strike).toMatchObject({ defeatedParticipants: ['pup-a'] });
    const [dropped, reply] = participantEvents(round);
    expect(dropped).toMatchObject({ kind: 'strike', status: 'dropped' });
    expect(reply).toMatchObject({
      kind: 'strike',
      status: 'executed',
      roll: { side: 'enemy', hit: false },
    });
    expect(result.state.encounters['arena-pair']).toEqual({ 'pup-a': 3, 'pup-b': 0 });
    expect(result.state.activeCombat).toMatchObject({
      round: 2,
      startedParticipants: ['pup-a', 'pup-b'],
      roundParticipantOrder: ['pup-b'],
    });
  });

  it('unknown and defeated targets reject with no step/dice/state change', () => {
    const { scenario, state } = startPair();
    const rng = strictDice([3, 3, 1, 1]);
    const wounded = combat(scenario, state, 'attack', rng, { targetParticipantId: 'pup-a' });
    rng.assertExhausted();
    for (const targetParticipantId of ['no-such-pup', 'pup-a']) {
      const step = wounded.state.step;
      const before = wounded.state;
      const result = applyAction(
        scenario,
        wounded.state,
        { kind: 'combat', combatAction: 'attack', targetParticipantId, expectedStep: step },
        noDice,
      );
      expect(result).toEqual({ ok: false, reason: 'illegal-action' });
      expect(wounded.state).toEqual(before);
      expect(wounded.state.step).toBe(step);
    }
  });

  it('a target on an untargeted action rejects', () => {
    // INTERIM (D2 -> #122): defend does not resolve in this ticket; the
    // transport-level target check rejects first.
    const { scenario, state } = startPair();
    const step = state.step;
    const before = state;
    const result = applyAction(
      scenario,
      state,
      {
        kind: 'combat',
        combatAction: 'defend',
        targetParticipantId: 'pup-a',
        expectedStep: step,
      },
      noDice,
    );
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
    expect(state).toEqual(before);
    expect(state.step).toBe(step);
  });

  it('a stale step rejects before anything resolves', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
    const before = started.state;
    const result = applyAction(
      scenario,
      started.state,
      { kind: 'combat', combatAction: 'attack', expectedStep: started.state.step + 1 },
      noDice,
    );
    expect(result).toEqual({ ok: false, reason: 'stale-step' });
    expect(started.state).toEqual(before);
  });
});

describe('victory and death', () => {
  it('killing to victory appends combat-end + victory Outcome once; step increments once per round', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
    // Sword 3 Damage: two hits kill the Health 4 dummy. The dummy's reply
    // misses on dice 1+1 (1+1+1 = 3 against 8).
    const firstDice = strictDice([6, 6, 1, 1]);
    const first = combat(scenario, started.state, 'attack', firstDice);
    firstDice.assertExhausted();
    expect(first.state.activeCombat).toMatchObject({ round: 2 });
    expect(first.state.encounters['arena-near']).toEqual({ 'dummy-melee': 3 });
    // The killing blow acts first (Agility 1 vs 1, Character wins ties), so
    // the dummy's action is not reached and draws no dice: exactly 2 dice.
    const secondDice = strictDice([6, 6]);
    const second = combat(scenario, first.state, 'attack', secondDice);
    secondDice.assertExhausted();
    expect(second.state.step).toBe(first.state.step + 1);
    expect(second.state.activeCombat).toBeNull();
    expect(second.state.activeSceneId).toBeNull();
    expect(second.state.encounters['arena-near']).toEqual({ 'dummy-melee': 6 });
    const round = onlyRound(second.journal);
    expect(round).toMatchObject({ round: 2, version: 2, stop: 'victory' });
    expect(characterEvent(round)).toMatchObject({ defeatedParticipants: ['dummy-melee'] });
    expect(second.journal.map((entry) => entry.type)).toEqual([
      'combat-round',
      'combat-end',
      'outcome',
    ]);
    expect(second.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'arena-near',
      participants: [
        { participantId: 'dummy-melee', enemyId: 'dummy-melee', name: 'Training Dummy' },
      ],
      howEnded: 'victory',
    });
    expect(second.journal.filter((entry) => entry.type === 'outcome')).toHaveLength(1);
    expect(second.journal.find((entry) => entry.type === 'outcome')).toMatchObject({
      text: 'The near dummy falls.',
    });
  });

  it('without a victory Outcome the enemy-defeated notice returns to the Location view', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-no-victory', strictDice([]));
    const firstDice = strictDice([6, 6, 1, 1]);
    const first = combat(scenario, started.state, 'attack', firstDice);
    firstDice.assertExhausted();
    expect(first.state.activeCombat).toMatchObject({ round: 2 });
    const secondDice = strictDice([6, 6]);
    const second = combat(scenario, first.state, 'attack', secondDice);
    secondDice.assertExhausted();
    expect(second.state.activeCombat).toBeNull();
    expect(second.state.activeSceneId).toBeNull();
    expect(second.journal.map((entry) => entry.type)).toEqual([
      'combat-round',
      'combat-end',
      'enemy-defeated',
    ]);
    expect(second.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'arena-no-victory',
      howEnded: 'victory',
    });
    expect(second.journal.find((entry) => entry.type === 'enemy-defeated')).toMatchObject({
      encounterId: 'arena-no-victory',
      participants: [
        { participantId: 'dummy-melee', enemyId: 'dummy-melee', name: 'Training Dummy' },
      ],
    });
  });

  it('death ends the playthrough on the death Ending', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-death', strictDice([]));
    const wounded: PlaythroughState = {
      ...started.state,
      character: { ...started.state.character, health: 5 },
    };
    // The Character misses (1+1+1 = 3 against 7+0); the brute hits on
    // 6+6+3 = 15 against 7 + Agility 1 = 8 for 6 Damage: lethal from 5 Health.
    const rng = strictDice([1, 1, 6, 6]);
    const result = combat(scenario, wounded, 'attack', rng);
    rng.assertExhausted();
    expect(result.state.status).toBe('ended');
    expect(result.state.endingId).toBe('death');
    expect(result.state.character.health).toBe(0);
    expect(result.state.activeCombat).toBeNull();
    const round = onlyRound(result.journal);
    expect(round).toMatchObject({ stop: 'death', version: 2 });
    const enemyStrike = participantEvents(round)[0];
    expect(enemyStrike).toMatchObject({
      status: 'executed',
      roll: { side: 'enemy', total: 15, target: 8, hit: true, damage: 6 },
      characterDefeated: true,
    });
    expect(result.journal.map((entry) => entry.type)).toEqual(['combat-round', 'ending']);
    expect(result.journal.find((entry) => entry.type === 'ending')).toMatchObject({
      endingId: 'death',
      kind: 'defeat',
    });
  });
});

describe('v2 journal readers', () => {
  it('combatRounds skips v2 rounds', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
    const rng = strictDice([3, 4, 1, 1]);
    const struck = combat(scenario, started.state, 'attack', rng);
    rng.assertExhausted();
    const rows = storedRows([...started.journal, ...struck.journal]);
    expect(combatRounds(rows, 'arena-near')).toEqual([]);
  });

  it('combatGuardUp reads v2 rounds as guard-down, including across a reload', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
    const rng = strictDice([3, 4, 1, 1]);
    const struck = combat(scenario, started.state, 'attack', rng);
    rng.assertExhausted();
    // A reload re-reads the persisted Journal: emulate it with a JSON round
    // trip of the stored rows.
    const reloaded = JSON.parse(
      JSON.stringify(storedRows([...started.journal, ...struck.journal])),
    ) as { type: string; payload: { encounterId?: unknown; guard?: unknown } }[];
    expect(combatGuardUp(reloaded, 'arena-near')).toBe(false);
  });
});

describe('the combat view', () => {
  it('shows the first survivor (INTERIM D3 -> #123/R12)', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
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
      damage: 1,
      reach: 'melee',
    });
    expect(gameView.actions.find((action) => action.id === 'attack')?.enabled).toBe(true);
  });
});

describe('non-attack actions (INTERIM D2, #121 behaviour)', () => {
  it('advance resolves at Far: the lane moves Near with no roll (-> #121)', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-melee', strictDice([]));
    // Standing availability still reports Advance enabled at Far.
    expect(combatActions(scenario, started.state).find((action) => action.id === 'advance')).toMatchObject({
      group: 'position',
      enabled: true,
    });
    const step = started.state.step;
    // Both normal at agility 1: the Character wins the tie, advances with no
    // roll, and the dummy closes in behind. No dice at all.
    const rng = strictDice([]);
    const result = combat(scenario, started.state, 'advance', rng);
    rng.assertExhausted();
    const round = onlyRound(result.journal);
    expect(round.actions.map((action) => action.kind)).toEqual(['advance', 'close-in']);
    expect(round.actions[0]).toMatchObject({
      speed: 'normal',
      status: 'executed',
      rangeBefore: 'far',
      rangeAfter: 'near',
    });
    expect(round.stop).toBeUndefined();
    expect(result.state.step).toBe(step + 1);
    expect(result.state.activeCombat?.round).toBe(2);
    expect(result.state.activeCombat?.participants['dummy-melee']?.range).toBe('near');
  });

  it('defend is rejected with no state/step change (-> #122)', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
    const step = started.state.step;
    const before = started.state;
    const result = applyAction(
      scenario,
      started.state,
      { kind: 'combat', combatAction: 'defend', expectedStep: step },
      noDice,
    );
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
    expect(started.state).toEqual(before);
    expect(started.state.step).toBe(step);
  });

  it('fall-back resolves at Near: the normal strike lands first, then the lane moves Far (-> #121)', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
    // The normal strike (agility 1) resolves before the slow Fall back and
    // misses 1+1+1 = 3 against 7+1 = 8; Fall back 6+6+1 = 13 hits 7+1 = 8.
    // Cleanup: the melee dummy at Far closes in (no die).
    const rng = strictDice([1, 1, 6, 6]);
    const result = combat(scenario, started.state, 'fall-back', rng);
    rng.assertExhausted();
    const round = onlyRound(result.journal);
    expect(round.actions.map((action) => action.kind)).toEqual(['strike', 'fall-back']);
    expect(round.actions[0]).toMatchObject({ status: 'executed', damage: 0 });
    expect(round.actions[1]).toMatchObject({
      speed: 'slow',
      status: 'executed',
      rangeBefore: 'near',
      rangeAfter: 'far',
    });
    expect(round.stop).toBeUndefined();
    expect(result.state.activeCombat?.round).toBe(2);
    expect(result.state.activeCombat?.participants['dummy-melee']?.range).toBe('far');
    expect(result.state.character.health).toBe(12);
  });

  it('escape resolves: success stops the Round and applies the escape Outcome (-> #121)', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
    // Both normal at agility 1: the Character wins the tie. Near at
    // commitment, so no +2: 6+6+1 = 13 hits 7+1 = 8. No cleanup dice.
    const rng = strictDice([6, 6]);
    const result = combat(scenario, started.state, 'escape', rng);
    rng.assertExhausted();
    const round = onlyRound(result.journal);
    expect(round.actions.map((action) => action.kind)).toEqual(['escape', 'strike']);
    expect(round.actions[0]).toMatchObject({ speed: 'normal', status: 'executed' });
    expect(round.actions[0]?.roll).toMatchObject({ hit: true, total: 13, target: 8 });
    expect(round.actions[1]).toMatchObject({ status: 'not-reached' });
    expect(round.stop).toBe('escape');
    expect(result.state.activeCombat).toBeNull();
    expect(result.journal.map((entry) => entry.type)).toEqual([
      'combat-round',
      'combat-end',
      'outcome',
    ]);
    expect(result.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'arena-near',
      howEnded: 'escape',
    });
  });

  it('use-item is rejected with no state/step change (-> #121)', () => {
    const { scenario, state } = startArena();
    const started = startFight(scenario, state, 'fight-near', strictDice([]));
    const step = started.state.step;
    const before = started.state;
    const result = applyAction(
      scenario,
      started.state,
      { kind: 'combat', combatAction: 'use-item', itemId: 'herbs', expectedStep: step },
      noDice,
    );
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
    expect(started.state).toEqual(before);
    expect(started.state.step).toBe(step);
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
    const started = startPlaythrough(scenario, 'hunter', 'Robin', strictDice([]));
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

  it('fights the hollow-wolf to victory: closing round 1, then trades to the kill', () => {
    // The hunter (Might 1, Agility 3 + cloak = 4, bow ranged 3) faces the Grey
    // Wolf (Might 2, Agility 2, Health 8, Damage 2, melee, steady) from Far.
    // The hunter always acts first (Agility 4 vs 2). Bow hits on 6+6+1 = 13
    // >= 7 + 2 = 9; the wolf hits on 6+6+2 = 14 >= 7 + 4 = 11.
    const { scenario, state } = atWolfDen();
    const startDice = strictDice([]);
    const started = succeed(
      scenario,
      state,
      { kind: 'choose', choiceId: 'fight', expectedStep: state.step },
      startDice,
    );
    startDice.assertExhausted();
    expect(started.state.activeCombat).toEqual({
      encounterId: 'hollow-wolf',
      round: 1,
      startedParticipants: ['grey-wolf'],
      roundParticipantOrder: ['grey-wolf'],
      participants: {
        'grey-wolf': { range: 'far', intent: 'close-in', prepared: false },
      },
    });
    expect(started.state.encounters['hollow-wolf']).toEqual({ 'grey-wolf': 0 });
    const start = started.journal.find((entry) => entry.type === 'combat-start');
    expect(start).toMatchObject({
      encounterId: 'hollow-wolf',
      participants: [{ participantId: 'grey-wolf', enemyId: 'grey-wolf', name: 'Grey Wolf' }],
    });
    expect((start as Extract<NewJournalEntry, { type: 'combat-start' }>).text).toContain(
      'lowers its head',
    );

    // Round 1: the hunter hits from Far, the steady wolf closes to Near.
    const firstDice = strictDice([6, 6]);
    const first = combat(scenario, started.state, 'attack', firstDice);
    firstDice.assertExhausted();
    expect(first.state.step).toBe(started.state.step + 1);
    const firstRound = onlyRound(first.journal);
    expect(firstRound).toMatchObject({ round: 1, version: 2 });
    expect(firstRound.stop).toBeUndefined();
    expect(characterEvent(firstRound)).toMatchObject({
      status: 'executed',
      roll: { side: 'character', total: 13, target: 9, hit: true, damage: 3 },
      damage: 3,
      weaponName: 'Hunting Bow',
    });
    const [closing] = participantEvents(firstRound);
    expect(closing).toMatchObject({
      kind: 'close-in',
      status: 'executed',
      rangeBefore: 'far',
      rangeAfter: 'near',
    });
    expect(first.state.encounters['hollow-wolf']).toEqual({ 'grey-wolf': 3 });
    expect(first.state.character.health).toBe(12);
    expect(first.state.activeCombat).toMatchObject({
      round: 2,
      participants: { 'grey-wolf': { range: 'near', intent: 'strike', prepared: false } },
    });

    // Round 2: both strike; the wolf lands 2 Damage.
    const secondDice = strictDice([6, 6, 6, 6]);
    const second = combat(scenario, first.state, 'attack', secondDice);
    secondDice.assertExhausted();
    const secondRound = onlyRound(second.journal);
    expect(characterEvent(secondRound)).toMatchObject({
      status: 'executed',
      roll: { total: 13, target: 9, hit: true },
    });
    const [strike] = participantEvents(secondRound);
    expect(strike).toMatchObject({
      kind: 'strike',
      status: 'executed',
      roll: {
        side: 'enemy',
        die1: 6,
        die2: 6,
        modifier: 2,
        total: 14,
        target: 11,
        hit: true,
        damage: 2,
      },
      damage: 2,
    });
    expect(second.state.encounters['hollow-wolf']).toEqual({ 'grey-wolf': 6 });
    expect(second.state.character.health).toBe(10);
    expect(second.state.activeCombat).toMatchObject({ round: 3 });

    // Round 3: the killing blow lands first; the wolf is not reached and rolls
    // nothing, so exactly 2 dice are drawn.
    const thirdDice = strictDice([6, 6]);
    const third = combat(scenario, second.state, 'attack', thirdDice);
    thirdDice.assertExhausted();
    expect(third.state.step).toBe(second.state.step + 1);
    expect(third.state.activeCombat).toBeNull();
    expect(third.state.encounters['hollow-wolf']).toEqual({ 'grey-wolf': 9 });
    const thirdRound = onlyRound(third.journal);
    expect(thirdRound).toMatchObject({ round: 3, version: 2, stop: 'victory' });
    expect(thirdRound.actions.map((action) => action.status)).toEqual([
      'executed',
      'not-reached',
    ]);
    expect(third.journal.map((entry) => entry.type)).toEqual([
      'combat-round',
      'combat-end',
      'outcome',
    ]);
    expect(third.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'hollow-wolf',
      howEnded: 'victory',
    });
    expect(third.journal.filter((entry) => entry.type === 'outcome')).toHaveLength(1);
    expect(third.journal.find((entry) => entry.type === 'outcome')).toMatchObject({
      text: expect.stringContaining('collapses'),
    });
  });

  it('a later start on the defeated wolf is a no-op', () => {
    const { scenario, state } = atWolfDen();
    const startDice = strictDice([]);
    const started = succeed(
      scenario,
      state,
      { kind: 'choose', choiceId: 'fight', expectedStep: state.step },
      startDice,
    );
    startDice.assertExhausted();
    let current = started.state;
    for (const dice of [[6, 6], [6, 6, 6, 6], [6, 6]]) {
      const rng = strictDice(dice);
      const result = combat(scenario, current, 'attack', rng);
      rng.assertExhausted();
      current = result.state;
      if (current.activeCombat == null) break;
    }
    expect(current.activeCombat).toBeNull();
    // Offer the fight again through the repeatable wolf-again Scene and take it.
    const again: PlaythroughState = { ...current, activeSceneId: 'wolf-again' };
    const rerunDice = strictDice([]);
    const result = succeed(
      scenario,
      again,
      { kind: 'choose', choiceId: 'fight', expectedStep: again.step },
      rerunDice,
    );
    rerunDice.assertExhausted();
    expect(result.state.activeCombat).toBeNull();
    expect(result.state.activeSceneId).toBeNull();
    expect(result.state.encounters['hollow-wolf']).toEqual({ 'grey-wolf': 9 });
    expect(result.journal.some((entry) => entry.type === 'combat-start')).toBe(false);
    expect(result.journal.some((entry) => entry.type === 'combat-end')).toBe(false);
    expect(result.journal.some((entry) => entry.type === 'outcome')).toBe(false);
  });

  // NOTE: the old escape-and-re-enter (wolf-again) test cannot run here:
  // finishEscape was deleted and Escape resolves with #121. Re-add coverage
  // for leaving and re-entering this fight when #121 lands.
});
