// Tactical Combat movement, Escape and Consumables under action order
// (issue #121).
//
// Covers acceptance rows R7, R8, R9 and the Fall-back cancellation case of
// R6. Builds on the tracer bullet (issue #120, tests/tactical-round.test.ts):
// only Attack resolved there; Advance, Fall back, Escape and Combat `use-item`
// resolve here. Defend and Distract stay rejected until issue #122.
//
// Every test uses injected finite dice sequences and asserts the resulting
// state, the ordered events and the consumed dice.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  applyAction,
  startPlaythrough,
  type Action,
  type ApplyActionResult,
  type NewJournalEntry,
  type PlaythroughState,
  type Rng,
  type TacticalActionEvent,
} from '../src/engine/index';

type Success = Extract<ApplyActionResult, { ok: true }>;
type CombatRound = Extract<NewJournalEntry, { type: 'combat-round' }>;

// ---------------------------------------------------------------------------
// Dice helpers: strict and finite. Every roll must come from the array; the
// array must be fully consumed where the count is load-bearing.
// ---------------------------------------------------------------------------

function finiteDice(dice: number[]): {
  rng: Rng;
  assertDone: () => void;
} {
  let index = 0;
  return {
    rng: (min: number, max: number) => {
      if (index >= dice.length) {
        throw new Error(`dice exhausted after ${index} draws`);
      }
      const die = dice[index];
      if (die === undefined || die < min || die >= max) {
        throw new Error(`die ${String(die)} outside [${min}, ${max})`);
      }
      index += 1;
      return die;
    },
    assertDone: () => expect(index, 'all dice consumed').toBe(dice.length),
  };
}

/** An rng that must never be called: proves a step draws no dice. */
function noDice(): { rng: Rng; assertSilent: () => void } {
  let calls = 0;
  return {
    rng: () => {
      calls += 1;
      throw new Error('no dice expected');
    },
    assertSilent: () => expect(calls, 'rng calls').toBe(0),
  };
}

// ---------------------------------------------------------------------------
// Flow helpers.
// ---------------------------------------------------------------------------

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

/** Start a playthrough and open the on-demand ambush Scene into Combat. */
function startHunt(
  scenario: Scenario,
  templateId: string,
  rng: Rng,
): { state: PlaythroughState; journal: NewJournalEntry[] } {
  const started = startPlaythrough(scenario, templateId, 'Robin', rng);
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);
  const opened = succeed(
    scenario,
    started.state,
    { kind: 'open-scene', sceneId: 'ambush', expectedStep: started.state.step },
    rng,
  );
  const chosen = succeed(
    scenario,
    opened.state,
    { kind: 'choose', choiceId: 'confront', expectedStep: opened.state.step },
    rng,
  );
  return { state: chosen.state, journal: chosen.journal };
}

function combat(
  scenario: Scenario,
  state: PlaythroughState,
  rng: Rng,
  combatAction: 'advance' | 'attack' | 'fall-back' | 'escape' | 'use-item',
  opts: { targetParticipantId?: string; itemId?: string } = {},
): Success {
  return succeed(
    scenario,
    state,
    {
      kind: 'combat',
      combatAction,
      ...(opts.targetParticipantId === undefined
        ? {}
        : { targetParticipantId: opts.targetParticipantId }),
      ...(opts.itemId === undefined ? {} : { itemId: opts.itemId }),
      expectedStep: state.step,
    },
    rng,
  );
}

function onlyRound(journal: NewJournalEntry[]): CombatRound {
  const rounds = journal.filter(
    (entry): entry is CombatRound => entry.type === 'combat-round',
  );
  expect(rounds).toHaveLength(1);
  const round = rounds[0];
  if (round === undefined) throw new Error('expected one combat-round');
  return round;
}

function journalTypes(journal: NewJournalEntry[]): string[] {
  return journal.map((entry) => entry.type);
}

function actorId(action: TacticalActionEvent): string {
  return action.actor.kind === 'character' ? 'character' : action.actor.participantId;
}

function snapshot(state: PlaythroughState): PlaythroughState {
  return JSON.parse(JSON.stringify(state)) as PlaythroughState;
}

/** A rejection changes nothing: same result shape, same state, no dice. */
function expectRejected(
  scenario: Scenario,
  state: PlaythroughState,
  action: Action,
): void {
  const before = snapshot(state);
  const step = state.step;
  const guard = noDice();
  const result = applyAction(scenario, state, action, guard.rng);
  expect(result).toEqual({ ok: false, reason: 'illegal-action' });
  expect(state).toEqual(before);
  expect(state.step).toBe(step);
  guard.assertSilent();
}

// ---------------------------------------------------------------------------
// Local Scenario builder: sword + bow + poultice, hunter/ranger/footman
// templates, one Encounter. Agilities: hunter 3, ranger 3, footman 1.
// ---------------------------------------------------------------------------

const ENEMY_DEFS = {
  greyWolf:
    '- id: grey-wolf\n  name: Grey Wolf\n  attributes: { might: 2, agility: 2, wits: 1, presence: 0 }\n  health: 8\n  damage: 2\n  reach: melee\n  behaviour: steady\n',
  banditArcher:
    '- id: bandit-archer\n  name: Bandit Archer\n  attributes: { might: 1, agility: 2, wits: 1, presence: 1 }\n  health: 6\n  damage: 2\n  reach: ranged\n  behaviour: heavy\n',
  rat: '- id: rat\n  name: Rat\n  attributes: { might: 1, agility: 2, wits: 0, presence: 0 }\n  health: 3\n  damage: 1\n  reach: melee\n  behaviour: steady\n',
  heavyBoar:
    '- id: heavy-boar\n  name: Heavy Boar\n  attributes: { might: 2, agility: 1, wits: 0, presence: 0 }\n  health: 10\n  damage: 2\n  reach: melee\n  behaviour: heavy\n',
  quickCat:
    '- id: quick-cat\n  name: Quick Cat\n  attributes: { might: 1, agility: 3, wits: 1, presence: 0 }\n  health: 4\n  damage: 1\n  reach: melee\n  behaviour: steady\n',
  heavyWolf:
    '- id: heavy-wolf\n  name: Heavy Wolf\n  attributes: { might: 2, agility: 2, wits: 1, presence: 0 }\n  health: 8\n  damage: 2\n  reach: melee\n  behaviour: heavy\n',
};

function loadCustomCombat(opts: {
  enemiesYaml: string;
  encounterId: string;
  encounterBody: string;
  startRange: 'near' | 'far';
}): { scenario: Scenario } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-tactical-move-'));
  const name = path.basename(dir);
  const scenarioDir = path.join(dir, name);
  const write = (base: string, relative: string, content: string): void => {
    const full = path.join(base, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  write(
    scenarioDir,
    'scenario.yaml',
    [
      'schemaVersion: 1',
      `id: ${name}`,
      'title: Tactical Movement Fixture',
      'description: Movement, Escape and Consumables package.',
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
      `      start-combat: ${opts.encounterId}`,
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'items.yaml',
    [
      '- id: sword\n  kind: equipment\n  name: Sword\n  slot: weapon\n  damage: 3\n',
      '- id: bow\n  kind: equipment\n  name: Bow\n  slot: weapon\n  reach: ranged\n  damage: 3\n',
      '- id: poultice\n  kind: consumable\n  name: Poultice\n  heal: 4\n',
      '',
    ].join(''),
  );
  write(scenarioDir, 'enemies.yaml', opts.enemiesYaml);
  write(
    scenarioDir,
    'encounters.yaml',
    [
      `- id: ${opts.encounterId}`,
      opts.encounterBody,
      `  startRange: ${opts.startRange}`,
      '  text: |',
      '    Teeth in the dark.',
      '  victory:',
      '    text: |',
      '      Quiet returns to the glade.',
      '    end: home',
      '  escape:',
      '    text: |',
      '      You slip away between the trees.',
      '    move: glade',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'templates.yaml',
    [
      '- id: hunter\n  name: Hunter\n  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }\n  items:\n    - { item: sword }\n    - { item: poultice }\n',
      '- id: ranger\n  name: Ranger\n  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }\n  items:\n    - { item: bow }\n',
      '- id: footman\n  name: Footman\n  attributes: { might: 1, agility: 1, wits: 2, presence: 2 }\n  items:\n    - { item: sword }\n    - { item: poultice, quantity: 2 }\n',
      '',
    ].join(''),
  );
  write(
    scenarioDir,
    'endings.yaml',
    '- id: death\n  kind: defeat\n  title: Gone\n  text: The end.\n- id: home\n  kind: victory\n  title: Home\n  text: You made it.\n',
  );
  const result = loadScenario(scenarioDir);
  if (!result.ok) {
    throw new Error(`custom combat failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return { scenario: result.scenario };
}

/** Active Combat state crafted directly: range/intent/prepared per id. */
function craftCombat(
  state: PlaythroughState,
  participants: Record<string, { range: 'near' | 'far'; intent: 'strike' | 'close-in' | 'prepare' | 'heavy-attack'; prepared: boolean }>,
  roundOrder: readonly string[],
  wounds?: Record<string, number>,
): PlaythroughState {
  const combat = state.activeCombat;
  if (combat == null) throw new Error('expected an active combat');
  const encounters =
    wounds === undefined
      ? state.encounters
      : { ...state.encounters, [combat.encounterId]: { ...wounds } };
  return {
    ...state,
    encounters,
    activeCombat: {
      encounterId: combat.encounterId,
      round: combat.round,
      startedParticipants: [...combat.startedParticipants],
      roundParticipantOrder: [...roundOrder],
      participants: { ...participants },
    },
  };
}

// ---------------------------------------------------------------------------
// R7: Advance against one or two participants.
// ---------------------------------------------------------------------------

describe('R7 advance', () => {
  it('moves only the targeted Far lane', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf + ENEMY_DEFS.banditArcher,
      encounterId: 'mixed-far',
      encounterBody: '  participants:\n    - enemy: grey-wolf\n    - enemy: bandit-archer',
      startRange: 'far',
    });
    // Wolf closes in (no die); the heavy archer draws strike on a 6.
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    // Ranger (agility 3) advances on the wolf before either Enemy acts.
    // Advance rolls nothing; the wolf closes in; the archer misses 1+1+1 = 3;
    // cleanup: the wolf strikes, the archer draws its next intent (6).
    const dice = finiteDice([1, 1, 6]);
    const result = combat(scenario, state, dice.rng, 'advance', {
      targetParticipantId: 'grey-wolf',
    });
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'grey-wolf', 'bandit-archer']);
    expect(round.actions[0]).toMatchObject({
      kind: 'advance',
      speed: 'normal',
      status: 'executed',
      rangeBefore: 'far',
      rangeAfter: 'near',
    });
    expect(round.stop).toBeUndefined();
    // Only the targeted lane moved: the archer stays Far.
    expect(result.state.activeCombat?.participants['grey-wolf']?.range).toBe('near');
    expect(result.state.activeCombat?.participants['bandit-archer']?.range).toBe('far');
    expect(result.state.activeCombat?.round).toBe(2);
  });

  it('is cancelled as already Near when a faster Close in lands first', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-far',
      encounterBody: '  participants:\n    - enemy: grey-wolf',
      startRange: 'far',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'footman', none.rng);
    none.assertSilent();
    // The agility-2 wolf closes in before the agility-1 footman's Advance.
    // Neither action rolls: the Round is spent with no dice drawn.
    const step = state.step;
    const guard = noDice();
    const result = combat(scenario, state, guard.rng, 'advance', {
      targetParticipantId: 'grey-wolf',
    });
    guard.assertSilent();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['grey-wolf', 'character']);
    expect(round.actions[0]).toMatchObject({ kind: 'close-in', status: 'executed' });
    expect(round.actions[1]).toMatchObject({
      kind: 'advance',
      status: 'cancelled',
      cancelReason: 'already-near',
    });
    // The Round resolved (not replaced): step and round advanced.
    expect(result.state.step).toBe(step + 1);
    expect(result.state.activeCombat?.round).toBe(2);
    expect(result.state.activeCombat?.participants['grey-wolf']?.range).toBe('near');
  });

  it('permits an omitted target with one survivor and requires one with two', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf + ENEMY_DEFS.banditArcher,
      encounterId: 'mixed-far',
      encounterBody: '  participants:\n    - enemy: grey-wolf\n    - enemy: bandit-archer',
      startRange: 'far',
    });
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    // Two survivors: an omitted Advance target is rejected, drawing nothing.
    expectRejected(scenario, state, {
      kind: 'combat',
      combatAction: 'advance',
      expectedStep: state.step,
    });
    // One survivor at Far: the omitted target is that participant. The wolf
    // fell in an earlier round (lethal wounds, no active state); the ranger
    // advances on the archer first (no roll), which then misses its reply
    // 1+1+1 = 3. Cleanup draws the archer's next intent (6).
    const crafted = craftCombat(
      state,
      {
        'bandit-archer': { range: 'far', intent: 'strike', prepared: false },
      },
      ['bandit-archer'],
      { 'grey-wolf': 8, 'bandit-archer': 0 },
    );
    const dice = finiteDice([1, 1, 6]);
    const result = combat(scenario, crafted, dice.rng, 'advance');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'bandit-archer']);
    expect(round.actions[0]).toMatchObject({
      kind: 'advance',
      status: 'executed',
      rangeBefore: 'far',
      rangeAfter: 'near',
    });
    expect(round.actions[0]?.target).toMatchObject({
      kind: 'participant',
      participantId: 'bandit-archer',
    });
  });

  it('rejects Advance at a Near target', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-near',
      encounterBody: '  participants:\n    - id: wolf\n      enemy: grey-wolf',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    expectRejected(scenario, state, {
      kind: 'combat',
      combatAction: 'advance',
      targetParticipantId: 'wolf',
      expectedStep: state.step,
    });
  });
});

// ---------------------------------------------------------------------------
// R7: Fall back moves every Near lane; R6: it cancels a later melee Heavy.
// ---------------------------------------------------------------------------

describe('R7 fall back', () => {
  it('moves all Near lanes on success', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolves-near',
      encounterBody:
        '  participants:\n    - id: wolf-a\n      enemy: grey-wolf\n    - id: wolf-b\n      enemy: grey-wolf',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    // Both normal strikes (agility 2) resolve before the slow Fall back
    // (agility 3): 1+1+1 = 3 misses either way. Fall back 6+6+3 = 15 hits
    // against 7+2 = 9. Steady wolves select Strike without dice.
    const dice = finiteDice([1, 1, 1, 1, 6, 6]);
    const result = combat(scenario, state, dice.rng, 'fall-back');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['wolf-a', 'wolf-b', 'character']);
    expect(round.actions[2]).toMatchObject({
      kind: 'fall-back',
      speed: 'slow',
      status: 'executed',
      rangeBefore: 'near',
      rangeAfter: 'far',
    });
    expect(round.actions[2]?.roll).toMatchObject({ hit: true, total: 15, target: 9 });
    expect(round.stop).toBeUndefined();
    expect(result.state.activeCombat?.participants['wolf-a']?.range).toBe('far');
    expect(result.state.activeCombat?.participants['wolf-b']?.range).toBe('far');
    expect(result.state.character.health).toBe(12);
  });

  it('tests only the currently Near survivors and leaves Far lanes alone', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf + ENEMY_DEFS.banditArcher,
      encounterId: 'mixed-split',
      encounterBody: '  participants:\n    - enemy: grey-wolf\n    - enemy: bandit-archer',
      startRange: 'far',
    });
    // Wolf closes in (no die); the heavy archer draws strike on a 6.
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'footman', start.rng);
    start.assertDone();
    // Wolf Near (agility 2), archer Far (agility 2, ranged and never moving):
    // Fall back tests 7+2 = 9 — the Far archer does not oppose. Both normal
    // Enemies act before the slow Fall back: each misses 1+1+1 = 3 against
    // 7+1 = 8. Fall back 6+6+1 = 13 succeeds; cleanup draws the archer (6).
    const crafted = craftCombat(
      state,
      {
        'grey-wolf': { range: 'near', intent: 'strike', prepared: false },
        'bandit-archer': { range: 'far', intent: 'strike', prepared: false },
      },
      ['grey-wolf', 'bandit-archer'],
    );
    const dice = finiteDice([1, 1, 1, 1, 6, 6, 6]);
    const result = combat(scenario, crafted, dice.rng, 'fall-back');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['grey-wolf', 'bandit-archer', 'character']);
    expect(round.actions[2]).toMatchObject({ kind: 'fall-back', status: 'executed' });
    expect(round.actions[2]?.roll).toMatchObject({ hit: true, total: 13, target: 9 });
    expect(result.state.activeCombat?.participants['grey-wolf']?.range).toBe('far');
    expect(result.state.activeCombat?.participants['bandit-archer']?.range).toBe('far');
  });

  it('fails without moving on a missed roll', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-near',
      encounterBody: '  participants:\n    - id: wolf\n      enemy: grey-wolf',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'footman', none.rng);
    none.assertSilent();
    // Wolf strikes first and misses 1+1+1 = 3; Fall back 1+1+1 = 3 misses
    // against 7+2 = 9: no change, and the Round continues.
    const dice = finiteDice([1, 1, 1, 1]);
    const result = combat(scenario, state, dice.rng, 'fall-back');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions[1]).toMatchObject({ kind: 'fall-back', status: 'executed' });
    expect(round.actions[1]?.roll).toMatchObject({ hit: false });
    expect(round.actions[1]?.rangeAfter).toBeUndefined();
    expect(result.state.activeCombat?.participants['wolf']?.range).toBe('near');
    expect(result.state.activeCombat?.round).toBe(2);
  });

  it('is rejected while every survivor is Far', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-far',
      encounterBody: '  participants:\n    - enemy: grey-wolf',
      startRange: 'far',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'footman', none.rng);
    none.assertSilent();
    expectRejected(scenario, state, {
      kind: 'combat',
      combatAction: 'fall-back',
      expectedStep: state.step,
    });
  });
});

describe('R6 fall back cancels a later melee heavy attack', () => {
  function startBoarNear(): { scenario: Scenario; state: PlaythroughState } {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.heavyBoar,
      encounterId: 'boar-near',
      encounterBody: '  participants:\n    - enemy: heavy-boar',
      startRange: 'near',
    });
    // The heavy boar at Near draws its opening intent (6: strike); the test
    // then crafts the prepared heavy attack it needs.
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'hunter', start.rng);
    start.assertDone();
    return { scenario, state };
  }

  it('acts first at higher agility and steps out of the heavy attack', () => {
    const { scenario, state } = startBoarNear();
    // A prepared melee heavy at Near; the agility-3 hunter falls back before
    // the agility-1 slow heavy. Fall back 6+6+3 = 15 hits 7+1 = 8; the heavy
    // then cancels as out of Reach and clears prepared. Cleanup: the boar
    // closes in from Far (melee, no die).
    const crafted = craftCombat(
      state,
      { 'heavy-boar': { range: 'near', intent: 'heavy-attack', prepared: true } },
      ['heavy-boar'],
    );
    const dice = finiteDice([6, 6]);
    const result = combat(scenario, crafted, dice.rng, 'fall-back');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'heavy-boar']);
    expect(round.actions[0]).toMatchObject({ kind: 'fall-back', status: 'executed' });
    expect(round.actions[1]).toMatchObject({
      kind: 'heavy-attack',
      speed: 'slow',
      status: 'cancelled',
      cancelReason: 'out-of-reach',
      prepared: false,
    });
    expect(round.actions[1]?.roll).toBeUndefined();
    expect(result.state.character.health).toBe(12);
    expect(result.state.activeCombat?.participants['heavy-boar']).toMatchObject({
      range: 'far',
      intent: 'close-in',
      prepared: false,
    });
  });

  it('acts first at equal agility and steps out of the heavy attack', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.heavyBoar,
      encounterId: 'boar-near',
      encounterBody: '  participants:\n    - enemy: heavy-boar',
      startRange: 'near',
    });
    // The heavy boar at Near draws its opening intent (6: strike); the test
    // then crafts the prepared heavy attack it needs.
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'footman', start.rng);
    start.assertDone();
    // Both slow at agility 1: the Character wins the tie. Fall back
    // 6+6+1 = 13 hits 7+1 = 8; the heavy cancels as out of Reach.
    const crafted = craftCombat(
      state,
      { 'heavy-boar': { range: 'near', intent: 'heavy-attack', prepared: true } },
      ['heavy-boar'],
    );
    const dice = finiteDice([6, 6]);
    const result = combat(scenario, crafted, dice.rng, 'fall-back');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'heavy-boar']);
    expect(round.actions[1]).toMatchObject({
      kind: 'heavy-attack',
      status: 'cancelled',
      cancelReason: 'out-of-reach',
      prepared: false,
    });
    expect(result.state.activeCombat?.participants['heavy-boar']?.range).toBe('far');
  });

  it('resolves after the heavy attack at lower agility', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.heavyWolf,
      encounterId: 'wolf-near',
      encounterBody: '  participants:\n    - enemy: heavy-wolf',
      startRange: 'near',
    });
    // The heavy wolf at Near draws its opening intent (6: strike); the test
    // then crafts the prepared heavy attack it needs.
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'footman', start.rng);
    start.assertDone();
    // The agility-2 slow heavy lands before the agility-1 slow Fall back:
    // 6+6+2 = 14 hits 7+1 = 8 for 2+3 = 5. Fall back still executes after,
    // 6+6+1 = 13 against 7+2 = 9, moving the lane Far. Cleanup: the wolf
    // closes in (melee at Far, no die).
    const crafted = craftCombat(
      state,
      { 'heavy-wolf': { range: 'near', intent: 'heavy-attack', prepared: true } },
      ['heavy-wolf'],
    );
    const dice = finiteDice([6, 6, 6, 6]);
    const result = combat(scenario, crafted, dice.rng, 'fall-back');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['heavy-wolf', 'character']);
    expect(round.actions[0]).toMatchObject({
      kind: 'heavy-attack',
      status: 'executed',
      damage: 5,
      prepared: false,
    });
    expect(round.actions[1]).toMatchObject({
      kind: 'fall-back',
      status: 'executed',
      rangeBefore: 'near',
      rangeAfter: 'far',
    });
    expect(result.state.character.health).toBe(7);
  });

  it('does not retroactively avoid an earlier normal strike', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-near',
      encounterBody: '  participants:\n    - id: wolf\n      enemy: grey-wolf',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    // The normal strike (agility 2) lands before the slow Fall back: 6+6+2
    // = 14 hits 7+3 = 10 for 2. Fall back 6+6+3 = 15 then moves the lane Far.
    const dice = finiteDice([6, 6, 6, 6]);
    const result = combat(scenario, state, dice.rng, 'fall-back');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['wolf', 'character']);
    expect(round.actions[0]).toMatchObject({
      kind: 'strike',
      status: 'executed',
      damage: 2,
    });
    expect(round.actions[1]).toMatchObject({ kind: 'fall-back', status: 'executed' });
    expect(result.state.character.health).toBe(10);
    expect(result.state.activeCombat?.participants['wolf']?.range).toBe('far');
  });
});

// ---------------------------------------------------------------------------
// R7: mixed-Reach attacks validate the current Range at execution.
// ---------------------------------------------------------------------------

describe('R7 mixed reach at execution', () => {
  it('cancels a melee strike at Far and lands a ranged strike at Far', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf + ENEMY_DEFS.banditArcher,
      encounterId: 'mixed-far',
      encounterBody: '  participants:\n    - enemy: grey-wolf\n    - enemy: bandit-archer',
      startRange: 'far',
    });
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    // A melee strike announced at Far cannot reach; a ranged one can.
    const crafted = craftCombat(
      state,
      {
        'grey-wolf': { range: 'far', intent: 'strike', prepared: false },
        'bandit-archer': { range: 'far', intent: 'strike', prepared: false },
      },
      ['grey-wolf', 'bandit-archer'],
    );
    // Bow hits the archer 6+6+1 = 13; the archer replies 1+1+1 = 3, a miss;
    // cleanup draws the archer's next intent (6).
    const dice = finiteDice([6, 6, 1, 1, 6]);
    const result = combat(scenario, crafted, dice.rng, 'attack', {
      targetParticipantId: 'bandit-archer',
    });
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'grey-wolf', 'bandit-archer']);
    expect(round.actions[1]).toMatchObject({
      kind: 'strike',
      status: 'cancelled',
      cancelReason: 'out-of-reach',
    });
    expect(round.actions[1]?.roll).toBeUndefined();
    expect(round.actions[2]).toMatchObject({ kind: 'strike', status: 'executed' });
  });
});

// ---------------------------------------------------------------------------
// R8: Escape keeps its commitment bonus; success stops, failure continues.
// ---------------------------------------------------------------------------

describe('R8 escape', () => {
  function startPairFar(): { scenario: Scenario; state: PlaythroughState } {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolves-far',
      encounterBody:
        '  participants:\n    - id: wolf-a\n      enemy: grey-wolf\n    - id: wolf-b\n      enemy: grey-wolf',
      startRange: 'far',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'footman', none.rng);
    none.assertSilent();
    expect(state.activeCombat?.participants['wolf-a']?.intent).toBe('close-in');
    expect(state.activeCombat?.participants['wolf-b']?.intent).toBe('close-in');
    return { scenario, state };
  }

  it('keeps the all-Far +2 when a faster Enemy closes in first, and stops on success', () => {
    const { scenario, state } = startPairFar();
    const step = state.step;
    // Both agility-2 wolves close in before the agility-1 Escape, but the
    // bonus was captured at commitment when nothing was Near: 6+1+1+2 = 10
    // hits 7+2 = 9. No cleanup dice: success stops the sequence.
    const dice = finiteDice([6, 1]);
    const result = combat(scenario, state, dice.rng, 'escape');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['wolf-a', 'wolf-b', 'character']);
    expect(round.actions[0]).toMatchObject({ kind: 'close-in', status: 'executed' });
    expect(round.actions[1]).toMatchObject({ kind: 'close-in', status: 'executed' });
    expect(round.actions[2]).toMatchObject({ kind: 'escape', status: 'executed' });
    expect(round.actions[2]?.roll).toMatchObject({
      hit: true,
      total: 10,
      target: 9,
      modifier: 3,
    });
    expect(round.stop).toBe('escape');
    // The Combat ends with its wounds kept; the escape Outcome applies.
    expect(result.state.step).toBe(step + 1);
    expect(result.state.activeCombat).toBeNull();
    expect(result.state.encounters['wolves-far']).toEqual({ 'wolf-a': 0, 'wolf-b': 0 });
    expect(journalTypes(result.journal)).toEqual(['combat-round', 'combat-end', 'outcome']);
    expect(result.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'wolves-far',
      howEnded: 'escape',
    });
    expect(result.journal.find((entry) => entry.type === 'outcome')).toMatchObject({
      text: expect.stringContaining('slip away'),
    });
  });

  it('reads opposing Agility from the current survivors and permits later actions on failure', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf + ENEMY_DEFS.banditArcher,
      encounterId: 'mixed-far',
      encounterBody: '  participants:\n    - enemy: grey-wolf\n    - enemy: bandit-archer',
      startRange: 'far',
    });
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'footman', start.rng);
    start.assertDone();
    // A prepared ranged heavy waits behind the closing wolf: it acts after
    // the failed Escape and still resolves.
    const mixed = craftCombat(
      state,
      {
        'grey-wolf': { range: 'far', intent: 'close-in', prepared: false },
        'bandit-archer': { range: 'far', intent: 'heavy-attack', prepared: true },
      },
      ['grey-wolf', 'bandit-archer'],
    );
    // Wolf closes in; Escape 1+1+1+2 = 5 misses 7+2 = 9; the slow ranged
    // heavy then hits 6+6+1 = 13 against 7+1 = 8 for 2+3 = 5. Cleanup draws
    // the archer's next intent: the wolf strikes, the archer draws (6).
    const dice = finiteDice([1, 1, 6, 6, 6]);
    const result = combat(scenario, mixed, dice.rng, 'escape');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['grey-wolf', 'character', 'bandit-archer']);
    expect(round.actions[1]).toMatchObject({ kind: 'escape', status: 'executed' });
    expect(round.actions[1]?.roll).toMatchObject({ hit: false });
    expect(round.actions[2]).toMatchObject({
      kind: 'heavy-attack',
      status: 'executed',
      damage: 5,
      prepared: false,
    });
    expect(round.stop).toBeUndefined();
    expect(result.state.activeCombat?.round).toBe(2);
    expect(result.state.character.health).toBe(7);
  });

  it('tests against the highest Agility among the survivors', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf + ENEMY_DEFS.quickCat,
      encounterId: 'mixed-near',
      encounterBody: '  participants:\n    - enemy: grey-wolf\n    - enemy: quick-cat',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    // Both Near at commitment, so no bonus; opposing is the cat's 3.
    // Hunter acts first among normals (agility 3 ties the cat, and the
    // Character wins ties): 6+6+3 = 15 hits 7+3 = 10.
    const dice = finiteDice([6, 6]);
    const result = combat(scenario, state, dice.rng, 'escape');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'quick-cat', 'grey-wolf']);
    expect(round.actions[0]?.roll).toMatchObject({
      hit: true,
      total: 15,
      target: 10,
      modifier: 3,
    });
    expect(round.stop).toBe('escape');
    // Later actions never resolve.
    expect(round.actions[1]).toMatchObject({ kind: 'strike', status: 'not-reached' });
    expect(round.actions[2]).toMatchObject({ kind: 'strike', status: 'not-reached' });
  });
});

// ---------------------------------------------------------------------------
// R9: death before a normal Consumable/Escape; use-item rules.
// ---------------------------------------------------------------------------

describe('R9 death before consumable or escape', () => {
  it('kills before a Consumable: death Ending, nothing consumed, later not reached', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-near',
      encounterBody: '  participants:\n    - id: wolf\n      enemy: grey-wolf',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'footman', none.rng);
    none.assertSilent();
    const wounded: PlaythroughState = {
      ...state,
      character: { ...state.character, health: 2 },
    };
    // The agility-2 wolf strikes before the agility-1 use: 6+6+2 = 14 hits
    // 7+1 = 8 for 2, lethal from 2 Health. Only those two dice are drawn:
    // no heal roll, no cleanup selection.
    const dice = finiteDice([6, 6]);
    const result = combat(scenario, wounded, dice.rng, 'use-item', { itemId: 'poultice' });
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.stop).toBe('death');
    expect(round.actions.map(actorId)).toEqual(['wolf', 'character']);
    expect(round.actions[0]).toMatchObject({
      kind: 'strike',
      status: 'executed',
      characterDefeated: true,
    });
    expect(round.actions[1]).toMatchObject({ kind: 'use-item', status: 'not-reached' });
    expect(result.state.status).toBe('ended');
    expect(result.state.endingId).toBe('death');
    expect(result.state.character.health).toBe(0);
    expect(result.state.activeCombat).toBeNull();
    // No copy consumed, and only the death Ending follows the round.
    expect(result.state.inventory['poultice']).toBe(2);
    expect(journalTypes(result.journal)).toEqual(['combat-round', 'ending']);
    expect(result.journal.find((entry) => entry.type === 'ending')).toMatchObject({
      endingId: 'death',
      kind: 'defeat',
    });
  });

  it('kills before an Escape: death Ending and later not reached', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-near',
      encounterBody: '  participants:\n    - id: wolf\n      enemy: grey-wolf',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'footman', none.rng);
    none.assertSilent();
    const wounded: PlaythroughState = {
      ...state,
      character: { ...state.character, health: 2 },
    };
    const dice = finiteDice([6, 6]);
    const result = combat(scenario, wounded, dice.rng, 'escape');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.stop).toBe('death');
    expect(round.actions[1]).toMatchObject({ kind: 'escape', status: 'not-reached' });
    expect(result.state.status).toBe('ended');
    expect(journalTypes(result.journal)).toEqual(['combat-round', 'ending']);
  });
});

describe('R9 consumable use', () => {
  it('rejects use-item at full Health', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-near',
      encounterBody: '  participants:\n    - id: wolf\n      enemy: grey-wolf',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    expect(state.character.health).toBe(12);
    expectRejected(scenario, state, {
      kind: 'combat',
      combatAction: 'use-item',
      itemId: 'poultice',
      expectedStep: state.step,
    });
    expect(state.inventory['poultice']).toBe(1);
  });

  it('rejects an unknown, unheld or non-consumable item', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-near',
      encounterBody: '  participants:\n    - id: wolf\n      enemy: grey-wolf',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'footman', none.rng);
    none.assertSilent();
    const wounded: PlaythroughState = {
      ...state,
      character: { ...state.character, health: 10 },
    };
    for (const itemId of ['ghost', 'sword']) {
      expectRejected(scenario, wounded, {
        kind: 'combat',
        combatAction: 'use-item',
        itemId,
        expectedStep: state.step,
      });
    }
  });

  it('heals and consumes only at execution, after earlier damage', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-near',
      encounterBody: '  participants:\n    - id: wolf\n      enemy: grey-wolf',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'footman', none.rng);
    none.assertSilent();
    const wounded: PlaythroughState = {
      ...state,
      character: { ...state.character, health: 10 },
    };
    // The wolf strikes first: 6+6+2 = 14 hits 7+1 = 8 for 2, down to 8.
    // The poultice then heals 4 back to 12 (capped) and consumes one copy.
    // The steady wolf selects Strike without a die.
    const dice = finiteDice([6, 6]);
    const result = combat(scenario, wounded, dice.rng, 'use-item', { itemId: 'poultice' });
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['wolf', 'character']);
    expect(round.actions[1]).toMatchObject({
      kind: 'use-item',
      speed: 'normal',
      status: 'executed',
      itemId: 'poultice',
      itemName: 'Poultice',
      healed: 4,
    });
    expect(round.stop).toBeUndefined();
    expect(result.state.character.health).toBe(12);
    expect(result.state.inventory['poultice']).toBe(1);
    expect(result.state.activeCombat?.round).toBe(2);
  });

  it('heals a partial wound without waste when nothing struck first', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.rat,
      encounterId: 'rat-near',
      encounterBody: '  participants:\n    - enemy: rat',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    const wounded: PlaythroughState = {
      ...state,
      character: { ...state.character, health: 11 },
    };
    // Hunter (agility 3) uses before the agility-2 rat acts: heals 1 to 12,
    // consuming the whole item even though most of it is wasted. The rat
    // then misses 1+1+1 = 3.
    const dice = finiteDice([1, 1]);
    const result = combat(scenario, wounded, dice.rng, 'use-item', { itemId: 'poultice' });
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'rat']);
    expect(round.actions[0]).toMatchObject({
      kind: 'use-item',
      status: 'executed',
      healed: 1,
    });
    expect(result.state.character.health).toBe(12);
    expect(result.state.inventory['poultice']).toBeUndefined();
  });
});
