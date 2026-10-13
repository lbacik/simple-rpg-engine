// Tactical Combat tracer bullet: one Round resolving (issues #120-#122).
//
// Covers acceptance rows R1, R2, R3, R4, R5, R6 (except Fall-back cancellation),
// R10 and R11. Attack, Defend and Distract resolve; Advance, Fall back, Escape
// and Consumable use resolve since #121. The Fall-back-vs-heavy cancellation
// case is excluded by the ticket and is not tested.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  applyAction,
  CHARACTER_ACTION_SPEED,
  combatActions,
  INTENT_SPEED,
  orderActions,
  selectIntents,
  startPlaythrough,
  view,
  type Action,
  type ApplyActionResult,
  type NewJournalEntry,
  type PlaythroughState,
  type QueuedAction,
  type Rng,
  type TacticalActionEvent,
} from '../src/engine/index';
import { loadTacticalFixture } from './fixtures/tactical';

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

function attack(
  scenario: Scenario,
  state: PlaythroughState,
  rng: Rng,
  targetParticipantId?: string,
): Success {
  return succeed(
    scenario,
    state,
    {
      kind: 'combat',
      combatAction: 'attack',
      ...(targetParticipantId === undefined ? {} : { targetParticipantId }),
      expectedStep: state.step,
    },
    rng,
  );
}

/** The Character's fast Defend: untargeted, never cancelled. */
function defend(scenario: Scenario, state: PlaythroughState, rng: Rng): Success {
  return succeed(
    scenario,
    state,
    { kind: 'combat', combatAction: 'defend', expectedStep: state.step },
    rng,
  );
}

/** The Character's fast Distract against one participant. */
function distract(
  scenario: Scenario,
  state: PlaythroughState,
  rng: Rng,
  targetParticipantId?: string,
): Success {
  return succeed(
    scenario,
    state,
    {
      kind: 'combat',
      combatAction: 'distract',
      ...(targetParticipantId === undefined ? {} : { targetParticipantId }),
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
  reason: 'stale-step' | 'illegal-action',
): void {
  const before = snapshot(state);
  const step = state.step;
  const guard = noDice();
  const result = applyAction(scenario, state, action, guard.rng);
  expect(result).toEqual({ ok: false, reason });
  expect(state).toEqual(before);
  expect(state.step).toBe(step);
  guard.assertSilent();
}

// ---------------------------------------------------------------------------
// Local Scenario builder (fixture pattern, extended): sword + bow items,
// hunter (sword) + ranger (bow, same attributes) templates, one Encounter.
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
};

function loadCustomCombat(opts: {
  enemiesYaml: string;
  encounterId: string;
  encounterBody: string;
  startRange: 'near' | 'far';
}): { scenario: Scenario } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-tactical-round-'));
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
      'title: Tactical Round Fixture',
      'description: Round resolution package.',
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
    '- id: sword\n  kind: equipment\n  name: Sword\n  slot: weapon\n  damage: 3\n- id: bow\n  kind: equipment\n  name: Bow\n  slot: weapon\n  reach: ranged\n  damage: 3\n',
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
    '- id: hunter\n  name: Hunter\n  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }\n  items:\n    - { item: sword }\n- id: ranger\n  name: Ranger\n  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }\n  items:\n    - { item: bow }\n',
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

// ---------------------------------------------------------------------------
// R1: Speed and order.
// ---------------------------------------------------------------------------

describe('R1 orderActions unit', () => {
  it('orders fast before normal before slow', () => {
    const queued: QueuedAction[] = [
      { key: 'slow', actor: 'participant', participantId: 's', speed: 'slow', agility: 3 },
      { key: 'normal', actor: 'participant', participantId: 'n', speed: 'normal', agility: 0 },
      { key: 'fast', actor: 'participant', participantId: 'f', speed: 'fast', agility: 0 },
    ];
    expect(orderActions(queued, []).map((action) => action.key)).toEqual([
      'fast',
      'normal',
      'slow',
    ]);
  });

  it('orders higher agility first within one speed', () => {
    const queued: QueuedAction[] = [
      { key: 'agi1', actor: 'participant', participantId: 'a', speed: 'normal', agility: 1 },
      { key: 'agi3', actor: 'participant', participantId: 'b', speed: 'normal', agility: 3 },
      { key: 'agi2', actor: 'participant', participantId: 'c', speed: 'normal', agility: 2 },
    ];
    expect(orderActions(queued, []).map((action) => action.key)).toEqual([
      'agi3',
      'agi2',
      'agi1',
    ]);
  });

  it('lets the character win equal-agility ties', () => {
    const queued: QueuedAction[] = [
      { key: 'enemy', actor: 'participant', participantId: 'e', speed: 'normal', agility: 2 },
      { key: 'character', actor: 'character', speed: 'normal', agility: 2 },
    ];
    expect(orderActions(queued, []).map((action) => action.key)).toEqual([
      'character',
      'enemy',
    ]);
  });

  it('orders equal-agility enemies by the saved participant order', () => {
    const queued: QueuedAction[] = [
      { key: 'b', actor: 'participant', participantId: 'b', speed: 'normal', agility: 2 },
      { key: 'a', actor: 'participant', participantId: 'a', speed: 'normal', agility: 2 },
    ];
    expect(orderActions(queued, ['a', 'b']).map((action) => action.key)).toEqual(['a', 'b']);
    expect(orderActions(queued, ['b', 'a']).map((action) => action.key)).toEqual(['b', 'a']);
  });

  it('is stable for residual ties', () => {
    const queued: QueuedAction[] = [
      { key: 'first', actor: 'participant', participantId: 'x', speed: 'normal', agility: 2 },
      { key: 'second', actor: 'participant', participantId: 'y', speed: 'normal', agility: 2 },
    ];
    // Neither id is in the saved order: commitment order breaks the tie.
    expect(orderActions(queued, []).map((action) => action.key)).toEqual(['first', 'second']);
  });

  it('uses the documented speed tables', () => {
    expect(CHARACTER_ACTION_SPEED).toMatchObject({
      defend: 'fast',
      distract: 'fast',
      attack: 'normal',
      advance: 'normal',
      'use-item': 'normal',
      escape: 'normal',
      'fall-back': 'slow',
    });
    expect(INTENT_SPEED).toEqual({
      strike: 'normal',
      'close-in': 'normal',
      prepare: 'normal',
      'heavy-attack': 'slow',
    });
  });
});

describe('R1 solo order', () => {
  function loadWolfNear(): { scenario: Scenario } {
    return loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf,
      encounterId: 'wolf-near',
      encounterBody: '  participants:\n    - id: wolf\n      enemy: grey-wolf',
      startRange: 'near',
    });
  }

  it('acts the agility-3 hunter before the agility-2 wolf among normals', () => {
    const { scenario } = loadWolfNear();
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    expect(state.activeCombat?.participants['wolf']?.intent).toBe('strike');
    // Hunter Might 1 vs Agility 2: 6+6+1 = 13 hits; wolf 1+1+2 = 4 misses.
    const dice = finiteDice([6, 6, 1, 1]);
    const result = attack(scenario, state, dice.rng, 'wolf');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'wolf']);
    expect(round.actions.map((action) => action.kind)).toEqual(['attack', 'strike']);
    expect(round.actions.map((action) => action.speed)).toEqual(['normal', 'normal']);
  });

  it('lets the character win an equal-agility tie', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.quickCat,
      encounterId: 'cat-near',
      encounterBody: '  participants:\n    - id: cat\n      enemy: quick-cat',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    // Both sides miss: 1+1+1 = 3 against 10 either way.
    const dice = finiteDice([1, 1, 1, 1]);
    const result = attack(scenario, state, dice.rng, 'cat');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'cat']);
  });

  it('acts a normal attack before a slow heavy attack', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.heavyBoar,
      encounterId: 'boar-far',
      encounterBody: '  participants:\n    - enemy: heavy-boar',
      startRange: 'far',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'ranger', none.rng);
    none.assertSilent();
    // A prepared melee heavy at near: the character's normal attack is faster.
    const combat = state.activeCombat;
    if (combat == null) throw new Error('expected an active combat');
    const prepared: PlaythroughState = {
      ...state,
      activeCombat: {
        encounterId: combat.encounterId,
        round: combat.round,
        startedParticipants: [...combat.startedParticipants],
        roundParticipantOrder: [...combat.roundParticipantOrder],
        participants: {
          'heavy-boar': { range: 'near', intent: 'heavy-attack', prepared: true },
        },
      },
    };
    // Bow 1+1+1 = 3 misses; boar 1+1+2 = 4 misses; cleanup draws strike.
    const dice = finiteDice([1, 1, 1, 1, 6]);
    const result = attack(scenario, prepared, dice.rng, 'heavy-boar');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'heavy-boar']);
    expect(round.actions.map((action) => action.speed)).toEqual(['normal', 'slow']);
    expect(result.state.activeCombat?.participants['heavy-boar']?.intent).toBe('strike');
  });
});

describe('R1 pair order', () => {
  it('orders hunter first among normals in a mixed-reach round', () => {
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
    expect(state.activeCombat?.participants['grey-wolf']?.intent).toBe('close-in');
    expect(state.activeCombat?.participants['bandit-archer']?.intent).toBe('strike');
    // Bow hits the archer (6+6+1 = 13); the archer replies 1+1+1 = 3, a miss;
    // cleanup draws the archer's next strike.
    const dice = finiteDice([6, 6, 1, 1, 6]);
    const result = attack(scenario, state, dice.rng, 'bandit-archer');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'grey-wolf', 'bandit-archer']);
    expect(round.actions.map((action) => action.kind)).toEqual([
      'attack',
      'close-in',
      'strike',
    ]);
    expect(round.actions.map((action) => action.speed)).toEqual([
      'normal',
      'normal',
      'normal',
    ]);
  });

  it('follows the saved order for an equal-agility same-kind pair, and flips when it flips', () => {
    const { scenario } = loadTacticalFixture('pair-wolves');
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    const combat = state.activeCombat;
    if (combat == null) throw new Error('expected an active combat');
    const nearStrikes = {
      'wolf-a': { range: 'near' as const, intent: 'strike' as const, prepared: false },
      'wolf-b': { range: 'near' as const, intent: 'strike' as const, prepared: false },
    };
    const asCrafted = (savedOrder: readonly string[]): PlaythroughState => ({
      ...state,
      activeCombat: {
        encounterId: combat.encounterId,
        round: combat.round,
        startedParticipants: [...combat.startedParticipants],
        roundParticipantOrder: [...savedOrder],
        participants: { ...nearStrikes },
      },
    });
    // All sides miss, so the round continues and the order is observable.
    for (const [savedOrder, expected] of [
      [
        ['wolf-a', 'wolf-b'],
        ['character', 'wolf-a', 'wolf-b'],
      ],
      [
        ['wolf-b', 'wolf-a'],
        ['character', 'wolf-b', 'wolf-a'],
      ],
    ] as const) {
      const dice = finiteDice([1, 1, 1, 1, 1, 1]);
      const result = attack(scenario, asCrafted(savedOrder), dice.rng, 'wolf-a');
      dice.assertDone();
      expect(onlyRound(result.journal).actions.map(actorId)).toEqual([...expected]);
    }
  });
});

// ---------------------------------------------------------------------------
// R2: Intent selection timing and dice order.
// ---------------------------------------------------------------------------

function loadArchersFar(): { scenario: Scenario } {
  return loadCustomCombat({
    enemiesYaml: ENEMY_DEFS.banditArcher,
    encounterId: 'archers-far',
    encounterBody:
      '  participants:\n    - id: archer-a\n      enemy: bandit-archer\n    - id: archer-b\n      enemy: bandit-archer',
    startRange: 'far',
  });
}

describe('R2 selection only on start and cleanup', () => {
  it('stores the start selection with the content order', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf + ENEMY_DEFS.banditArcher,
      encounterId: 'mixed-far',
      encounterBody: '  participants:\n    - enemy: grey-wolf\n    - enemy: bandit-archer',
      startRange: 'far',
    });
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    expect(state.activeCombat).toMatchObject({
      encounterId: 'mixed-far',
      round: 1,
      startedParticipants: ['grey-wolf', 'bandit-archer'],
      roundParticipantOrder: ['grey-wolf', 'bandit-archer'],
      participants: {
        'grey-wolf': { range: 'far', intent: 'close-in', prepared: false },
        'bandit-archer': { range: 'far', intent: 'strike', prepared: false },
      },
    });
  });

  it('view() changes nothing and draws nothing', () => {
    const { scenario } = loadArchersFar();
    const start = finiteDice([1]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    const before = snapshot(state);
    view(scenario, state);
    expect(state).toEqual(before);
    expect(state.activeCombat?.participants).toEqual(before.activeCombat?.participants);
  });

  it('a rejected action draws nothing and keeps the stored intents', () => {
    const { scenario } = loadArchersFar();
    const start = finiteDice([1]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    const before = snapshot(state);
    const guard = noDice();
    // Fall back with nobody Near is unavailable (Defend and Distract resolve
    // since #122, so they no longer serve as the rejected action here).
    const result = applyAction(
      scenario,
      state,
      { kind: 'combat', combatAction: 'fall-back', expectedStep: state.step },
      guard.rng,
    );
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
    expect(state).toEqual(before);
    expect(state.activeCombat?.participants).toEqual(before.activeCombat?.participants);
    guard.assertSilent();
  });

  it('bars the second prepare without consuming a die', () => {
    const { scenario } = loadArchersFar();
    // Exactly one die exists: archer-a prepares on a 1, so archer-b must fall
    // through to strike without drawing.
    const start = finiteDice([1]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    expect(state.activeCombat?.participants['archer-a']?.intent).toBe('prepare');
    expect(state.activeCombat?.participants['archer-b']?.intent).toBe('strike');
    expect(state.activeCombat?.participants['archer-b']?.prepared).toBe(false);
  });

  it('draws selection dice after the resolution rolls, in participant order', () => {
    const { scenario } = loadArchersFar();
    const start = finiteDice([6, 6]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    // Character misses archer-a, both archers miss, then cleanup: archer-a
    // draws 6 (strike) and archer-b draws 1 (prepare), in that order.
    const dice = finiteDice([1, 1, 1, 1, 1, 1, 6, 1]);
    const result = attack(scenario, state, dice.rng, 'archer-a');
    dice.assertDone();
    expect(result.state.activeCombat?.round).toBe(2);
    expect(result.state.activeCombat?.participants['archer-a']?.intent).toBe('strike');
    expect(result.state.activeCombat?.participants['archer-b']?.intent).toBe('prepare');
  });
});

// ---------------------------------------------------------------------------
// R3: partial defeat drops only the defeated action; no retargeting.
// ---------------------------------------------------------------------------

function loadRatsNear(): { scenario: Scenario } {
  return loadCustomCombat({
    enemiesYaml: ENEMY_DEFS.rat,
    encounterId: 'rats-near',
    encounterBody:
      '  participants:\n    - id: rat-a\n      enemy: rat\n    - id: rat-b\n      enemy: rat',
    startRange: 'near',
  });
}

describe('R3 partial defeat', () => {
  it('drops only the defeated action while the other still acts, with no victory entries', () => {
    const { scenario } = loadRatsNear();
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    const step = state.step;
    // Sword hits rat-a (6+6+1 = 13) for 3: exactly its health. Rat-b replies
    // 1+1+1 = 3, a miss.
    const dice = finiteDice([6, 6, 1, 1]);
    const result = attack(scenario, state, dice.rng, 'rat-a');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.stop).toBeUndefined();
    expect(round.actions).toHaveLength(3);
    expect(round.actions[0]).toMatchObject({
      kind: 'attack',
      status: 'executed',
      damage: 3,
      defeatedParticipants: ['rat-a'],
    });
    // Rat-a comes after the character, so its queued strike is dropped.
    expect(round.actions[1]).toMatchObject({
      kind: 'strike',
      status: 'dropped',
    });
    expect(actorId(round.actions[1] as TacticalActionEvent)).toBe('rat-a');
    // Rat-b still targets the character normally: nothing is retargeted.
    expect(round.actions[2]).toMatchObject({ kind: 'strike', status: 'executed' });
    expect(actorId(round.actions[2] as TacticalActionEvent)).toBe('rat-b');
    expect(round.actions[2]?.target).toEqual({ kind: 'character' });
    // No victory: only the combat-round entry, and the round continues.
    expect(journalTypes(result.journal)).toEqual(['combat-round']);
    expect(result.state.step).toBe(step + 1);
    expect(result.state.activeCombat?.round).toBe(2);
    expect(result.state.activeCombat?.roundParticipantOrder).toEqual(['rat-b']);
    expect(result.state.encounters['rats-near']).toEqual({ 'rat-a': 3, 'rat-b': 0 });
  });

  it('stops immediately when the last participant falls, with not-reached later actions', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.rat,
      encounterId: 'rat-near',
      encounterBody: '  participants:\n    - enemy: rat',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    // One sword hit kills the rat outright; its strike never resolves.
    const dice = finiteDice([6, 6]);
    const result = attack(scenario, state, dice.rng, 'rat');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.stop).toBe('victory');
    expect(round.actions).toHaveLength(2);
    expect(round.actions[0]).toMatchObject({
      kind: 'attack',
      status: 'executed',
      defeatedParticipants: ['rat'],
    });
    expect(round.actions[1]).toMatchObject({ kind: 'strike', status: 'not-reached' });
    // No cleanup selection: the combat is over with only the victory entries
    // (the authored victory ends the fight at home).
    expect(result.state.activeCombat).toBeNull();
    expect(journalTypes(result.journal)).toEqual([
      'combat-round',
      'combat-end',
      'outcome',
      'ending',
    ]);
    expect(result.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'rat-near',
      howEnded: 'victory',
    });
    expect(result.journal.find((entry) => entry.type === 'outcome')).toMatchObject({
      text: expect.stringContaining('Quiet returns'),
    });
    expect(result.journal.find((entry) => entry.type === 'ending')).toMatchObject({
      endingId: 'home',
      kind: 'victory',
    });
    expect(result.journal.some((entry) => entry.type === 'enemy-defeated')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R6: preparing and the heavy attack.
// ---------------------------------------------------------------------------

describe('R6 prepare and heavy attack', () => {
  /** Round-1 flow that leaves archer-a prepared with a stored heavy attack. */
  function setupPreparedHeavy(): { scenario: Scenario; state: PlaythroughState } {
    const { scenario } = loadArchersFar();
    const start = finiteDice([1]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    expect(state.activeCombat?.participants['archer-a']?.intent).toBe('prepare');
    // Bow hits archer-a (wounds 3 of 6); prepare executes; archer-b misses.
    const dice = finiteDice([6, 6, 1, 1]);
    const result = attack(scenario, state, dice.rng, 'archer-a');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions[1]).toMatchObject({
      kind: 'prepare',
      status: 'executed',
      prepared: true,
    });
    // Prepare leaves prepared:true, stored with next round's heavy attack.
    expect(result.state.activeCombat?.round).toBe(2);
    expect(result.state.activeCombat?.participants['archer-a']).toMatchObject({
      intent: 'heavy-attack',
      prepared: true,
    });
    expect(result.state.activeCombat?.participants['archer-b']).toMatchObject({
      intent: 'strike',
      prepared: false,
    });
    return { scenario, state: result.state };
  }

  it('resolves the heavy attack slow for base damage +3, then clears prepared', () => {
    const { scenario, state } = setupPreparedHeavy();
    // Character hits archer-b; archer-b misses; the slow heavy hits for 2+3.
    const dice = finiteDice([6, 6, 1, 1, 6, 6, 6, 1]);
    const result = attack(scenario, state, dice.rng, 'archer-b');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'archer-b', 'archer-a']);
    const heavy = round.actions[2];
    expect(heavy).toMatchObject({
      kind: 'heavy-attack',
      speed: 'slow',
      status: 'executed',
      damage: 5,
      prepared: false,
    });
    expect(heavy?.roll).toMatchObject({ hit: true });
    expect(result.state.character.health).toBe(7);
    expect(result.state.activeCombat?.participants['archer-a']?.prepared).toBe(false);
    // Cleanup after the cleared preparation draws fresh intents in order.
    expect(result.state.activeCombat?.participants['archer-a']?.intent).toBe('strike');
    expect(result.state.activeCombat?.participants['archer-b']?.intent).toBe('prepare');
  });

  it('clears prepared on a heavy miss', () => {
    const { scenario, state } = setupPreparedHeavy();
    // Same round, but the heavy rolls 1+1+1 = 3: a miss for no damage.
    const dice = finiteDice([6, 6, 1, 1, 1, 1, 6, 6]);
    const result = attack(scenario, state, dice.rng, 'archer-b');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions[2]).toMatchObject({
      kind: 'heavy-attack',
      status: 'executed',
      damage: 0,
      prepared: false,
    });
    expect(round.actions[2]?.roll).toMatchObject({ hit: false });
    expect(result.state.character.health).toBe(12);
    expect(result.state.activeCombat?.participants['archer-a']?.prepared).toBe(false);
  });

  it('cancels an out-of-reach heavy attack and clears prepared', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.heavyBoar,
      encounterId: 'boar-far',
      encounterBody: '  participants:\n    - enemy: heavy-boar',
      startRange: 'far',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'ranger', none.rng);
    none.assertSilent();
    // A prepared melee heavy at far: its heavy attack cannot reach.
    // (Fall-back-vs-heavy cancellation is excluded by the ticket.)
    const combat = state.activeCombat;
    if (combat == null) throw new Error('expected an active combat');
    const crafted: PlaythroughState = {
      ...state,
      activeCombat: {
        encounterId: combat.encounterId,
        round: combat.round,
        startedParticipants: [...combat.startedParticipants],
        roundParticipantOrder: [...combat.roundParticipantOrder],
        participants: {
          'heavy-boar': { range: 'far', intent: 'heavy-attack', prepared: true },
        },
      },
    };
    // The bow misses; the heavy cancels without rolling.
    const dice = finiteDice([1, 1]);
    const result = attack(scenario, crafted, dice.rng, 'heavy-boar');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions[1]).toMatchObject({
      kind: 'heavy-attack',
      status: 'cancelled',
      cancelReason: 'out-of-reach',
      prepared: false,
    });
    expect(round.actions[1]?.roll).toBeUndefined();
    expect(result.state.activeCombat?.participants['heavy-boar']?.prepared).toBe(false);
    expect(result.state.activeCombat?.participants['heavy-boar']?.intent).toBe('close-in');
  });
});

// ---------------------------------------------------------------------------
// R10: rejections change nothing.
// ---------------------------------------------------------------------------

describe('R10 rejected combat actions', () => {
  function startRats(): { scenario: Scenario; state: PlaythroughState } {
    const { scenario } = loadRatsNear();
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    return { scenario, state };
  }

  it('rejects a stale step', () => {
    const { scenario, state } = startRats();
    expectRejected(
      scenario,
      state,
      { kind: 'combat', combatAction: 'attack', targetParticipantId: 'rat-a', expectedStep: state.step + 99 },
      'stale-step',
    );
  });

  it('rejects an unavailable action (advance at Near)', () => {
    const { scenario, state } = startRats();
    expectRejected(
      scenario,
      state,
      {
        kind: 'combat',
        combatAction: 'advance',
        targetParticipantId: 'rat-a',
        expectedStep: state.step,
      },
      'illegal-action',
    );
  });

  it('rejects an unknown target', () => {
    const { scenario, state } = startRats();
    expectRejected(
      scenario,
      state,
      {
        kind: 'combat',
        combatAction: 'attack',
        targetParticipantId: 'ghost',
        expectedStep: state.step,
      },
      'illegal-action',
    );
  });

  it('rejects a defeated target', () => {
    const { scenario, state } = startRats();
    // Kill rat-a; the round continues with rat-b alone.
    const dice = finiteDice([6, 6, 1, 1]);
    const next = attack(scenario, state, dice.rng, 'rat-a');
    dice.assertDone();
    expectRejected(
      scenario,
      next.state,
      {
        kind: 'combat',
        combatAction: 'attack',
        targetParticipantId: 'rat-a',
        expectedStep: next.state.step,
      },
      'illegal-action',
    );
  });

  it('rejects a missing target with two survivors', () => {
    const { scenario, state } = startRats();
    expectRejected(
      scenario,
      state,
      { kind: 'combat', combatAction: 'attack', expectedStep: state.step },
      'illegal-action',
    );
  });

  it('rejects a target on an untargeted action', () => {
    const { scenario, state } = startRats();
    expectRejected(
      scenario,
      state,
      {
        kind: 'combat',
        combatAction: 'defend',
        targetParticipantId: 'rat-a',
        expectedStep: state.step,
      },
      'illegal-action',
    );
  });

  it('permits an omitted target with one survivor', () => {
    const { scenario, state } = startRats();
    const dice = finiteDice([6, 6, 1, 1]);
    const next = attack(scenario, state, dice.rng, 'rat-a');
    dice.assertDone();
    // Rat-b alone: no target needed. Both sides miss.
    const roundDice = finiteDice([1, 1, 1, 1]);
    const result = attack(scenario, next.state, roundDice.rng);
    roundDice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'rat-b']);
    expect(result.state.activeCombat?.round).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// R11: continuing, victory and death endings of a round.
// ---------------------------------------------------------------------------

function loadWolfNear(): { scenario: Scenario } {
  return loadCustomCombat({
    enemiesYaml: ENEMY_DEFS.greyWolf,
    encounterId: 'wolf-near',
    encounterBody: '  participants:\n    - id: wolf\n      enemy: grey-wolf',
    startRange: 'near',
  });
}

describe('R11 continuing rounds', () => {
  it('increments round and step exactly once and stores the next intents', () => {
    const { scenario } = loadWolfNear();
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    const step = state.step;
    // Both sides miss; the steady wolf strikes again with no selection die.
    const dice = finiteDice([1, 1, 1, 1]);
    const result = attack(scenario, state, dice.rng, 'wolf');
    dice.assertDone();
    expect(result.state.step).toBe(step + 1);
    expect(result.state.activeCombat?.round).toBe(2);
    expect(result.state.activeCombat?.roundParticipantOrder).toEqual(['wolf']);
    expect(result.state.activeCombat?.participants['wolf']).toMatchObject({
      range: 'near',
      intent: 'strike',
      prepared: false,
    });
    expect(result.state.encounters['wolf-near']).toEqual({ wolf: 0 });
    expect(result.state.character.health).toBe(12);
  });

  it('expires wary at its round and retains it while it still applies', () => {
    const { scenario } = loadWolfNear();
    for (const [stored, expected] of [
      [1, undefined],
      [2, 2],
    ] as const) {
      const none = noDice();
      const { state } = startHunt(scenario, 'hunter', none.rng);
      none.assertSilent();
      const combat = state.activeCombat;
      if (combat == null) throw new Error('expected an active combat');
      const wary: PlaythroughState = {
        ...state,
        activeCombat: {
          encounterId: combat.encounterId,
          round: combat.round,
          startedParticipants: [...combat.startedParticipants],
          roundParticipantOrder: [...combat.roundParticipantOrder],
          participants: {
            wolf: { range: 'near', intent: 'strike', prepared: false, waryUntilRound: stored },
          },
        },
      };
      const dice = finiteDice([1, 1, 1, 1]);
      const result = attack(scenario, wary, dice.rng, 'wolf');
      dice.assertDone();
      expect(result.state.activeCombat?.round).toBe(2);
      expect(
        result.state.activeCombat?.participants['wolf']?.waryUntilRound,
        `waryUntilRound ${stored}`,
      ).toBe(expected);
    }
  });

  it('captures the current content order for the next round', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.greyWolf + ENEMY_DEFS.banditArcher,
      encounterId: 'mixed-far',
      encounterBody: '  participants:\n    - enemy: grey-wolf\n    - enemy: bandit-archer',
      startRange: 'far',
    });
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    const dice = finiteDice([6, 6, 1, 1, 6]);
    const result = attack(scenario, state, dice.rng, 'bandit-archer');
    dice.assertDone();
    expect(result.state.activeCombat?.startedParticipants).toEqual([
      'grey-wolf',
      'bandit-archer',
    ]);
    expect(result.state.activeCombat?.roundParticipantOrder).toEqual([
      'grey-wolf',
      'bandit-archer',
    ]);
    expect(result.state.activeCombat?.participants['grey-wolf']).toMatchObject({
      range: 'near',
      intent: 'strike',
    });
    expect(result.state.activeCombat?.participants['bandit-archer']).toMatchObject({
      intent: 'strike',
    });
  });

  it('resolves victory with no cleanup selection and no remaining actions', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.rat,
      encounterId: 'rat-near',
      encounterBody: '  participants:\n    - enemy: rat',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    const dice = finiteDice([6, 6]);
    const result = attack(scenario, state, dice.rng, 'rat');
    dice.assertDone();
    expect(result.state.activeCombat).toBeNull();
    expect(journalTypes(result.journal)).toEqual([
      'combat-round',
      'combat-end',
      'outcome',
      'ending',
    ]);
  });

  it('resolves death with no cleanup selection and no remaining actions', () => {
    const { scenario } = loadWolfNear();
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    const wounded: PlaythroughState = {
      ...state,
      character: { ...state.character, health: 2 },
    };
    // The hunter misses; the wolf hits for 2: lethal from 2 health.
    const dice = finiteDice([1, 1, 6, 6]);
    const result = attack(scenario, wounded, dice.rng, 'wolf');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.stop).toBe('death');
    expect(round.actions[1]).toMatchObject({
      kind: 'strike',
      status: 'executed',
      characterDefeated: true,
    });
    expect(result.state.status).toBe('ended');
    expect(result.state.endingId).toBe('death');
    expect(result.state.character.health).toBe(0);
    expect(result.state.activeCombat).toBeNull();
    expect(journalTypes(result.journal)).toEqual(['combat-round', 'ending']);
    expect(result.journal.find((entry) => entry.type === 'ending')).toMatchObject({
      endingId: 'death',
      kind: 'defeat',
    });
  });
});

describe('selectIntents migration reuse', () => {
  it('selects without the prepare draw when allowPrepareDraw is false', () => {
    const boar = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.heavyBoar,
      encounterId: 'boar-far',
      encounterBody: '  participants:\n    - enemy: heavy-boar',
      startRange: 'far',
    }).scenario;
    const archers = loadArchersFar().scenario;
    const boarParticipant = boar.encountersById['boar-far']?.participants[0];
    const archerParticipant = archers.encountersById['archers-far']?.participants[0];
    if (boarParticipant === undefined || archerParticipant === undefined) {
      throw new Error('expected compiled participants');
    }
    const none = noDice();
    // A melee heavy at far closes in; a ranged heavy strikes: neither draws.
    const melee = selectIntents(
      [{ participant: boarParticipant, range: 'far', prepared: false }],
      none.rng,
      { allowPrepareDraw: false },
    );
    expect(melee.intents[boarParticipant.id]).toBe('close-in');
    const ranged = selectIntents(
      [{ participant: archerParticipant, range: 'far', prepared: false }],
      none.rng,
      { allowPrepareDraw: false },
    );
    expect(ranged.intents[archerParticipant.id]).toBe('strike');
    none.assertSilent();
  });
});

// ---------------------------------------------------------------------------
// R4: Distract interruption and Wary.
// ---------------------------------------------------------------------------

describe('R4 distract interruption', () => {
  /** One archer at Far: the heavy draws Prepare on a 1 at selection. */
  function loadLoneArcher(): { scenario: Scenario } {
    return loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.banditArcher,
      encounterId: 'archer-far',
      encounterBody: '  participants:\n    - id: archer\n      enemy: bandit-archer',
      startRange: 'far',
    });
  }

  it('cancels an announced Prepare and makes the target Wary through the next Round', () => {
    const { scenario } = loadLoneArcher();
    const start = finiteDice([1]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    expect(state.activeCombat?.participants['archer']?.intent).toBe('prepare');
    const step = state.step;
    // One survivor, so the target may be omitted. Distract hits 3+3+2 = 8
    // against 7+1 = 8; cleanup draws the archer's next strike on a 6.
    const dice = finiteDice([3, 3, 6]);
    const result = distract(scenario, state, dice.rng);
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'archer']);
    expect(round.actions.map((action) => action.kind)).toEqual(['distract', 'prepare']);
    const interruption = round.actions[0];
    expect(interruption).toMatchObject({
      speed: 'fast',
      order: 1,
      status: 'executed',
      damage: 0,
      waryUntilRound: 2,
    });
    expect(interruption?.roll).toMatchObject({
      die1: 3,
      die2: 3,
      modifier: 2,
      total: 8,
      target: 8,
      hit: true,
    });
    // The victim carried no preparation, so none is reported cleared.
    expect(interruption).not.toHaveProperty('prepared');
    expect(round.actions[1]).toMatchObject({
      status: 'cancelled',
      cancelReason: 'interrupted',
    });
    expect(round.actions[1]).not.toHaveProperty('prepared');
    expect(round.actions[1]?.roll).toBeUndefined();
    expect(round.stop).toBeUndefined();
    expect(result.state.step).toBe(step + 1);
    // Wary outlasts the step: stored with the Combat into the next Round.
    expect(result.state.activeCombat?.round).toBe(2);
    expect(result.state.activeCombat?.participants['archer']).toMatchObject({
      intent: 'strike',
      prepared: false,
      waryUntilRound: 2,
    });
    expect(
      combatActions(scenario, result.state).find((action) => action.id === 'distract'),
    ).toMatchObject({ enabled: false, reason: 'wary' });
  });

  it('bars Distract while the target is Wary and frees it after expiry', () => {
    const { scenario } = loadLoneArcher();
    const start = finiteDice([1]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    const first = finiteDice([3, 3, 6]);
    const distracted = distract(scenario, state, first.rng);
    first.assertDone();
    const wary = distracted.state;
    expect(wary.activeCombat?.round).toBe(2);
    // Round 2: Distract against the Wary archer is rejected without dice.
    expectRejected(
      scenario,
      wary,
      {
        kind: 'combat',
        combatAction: 'distract',
        targetParticipantId: 'archer',
        expectedStep: wary.step,
      },
      'illegal-action',
    );
    // Round 2 resolves as an attack instead. Both sides miss (bow 1+1+1 = 3
    // against 7+2 = 9; archer 1+1+1 = 3 against 7+3 = 10); cleanup strikes.
    const second = finiteDice([1, 1, 1, 1, 6]);
    const after = attack(scenario, wary, second.rng, 'archer');
    second.assertDone();
    expect(after.state.activeCombat?.round).toBe(3);
    expect(after.state.activeCombat?.participants['archer']?.waryUntilRound).toBeUndefined();
    expect(
      combatActions(scenario, after.state).find((action) => action.id === 'distract'),
    ).toMatchObject({ enabled: true });
    // Round 3: Distract executes again and makes the archer Wary anew.
    const third = finiteDice([3, 3, 6]);
    const freed = distract(scenario, after.state, third.rng, 'archer');
    third.assertDone();
    expect(onlyRound(freed.journal).actions[0]).toMatchObject({
      kind: 'distract',
      status: 'executed',
      waryUntilRound: 4,
    });
  });

  it('cancels a Heavy attack and clears its stored preparation', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.heavyBoar,
      encounterId: 'boar-near',
      encounterBody: '  participants:\n    - enemy: heavy-boar',
      startRange: 'near',
    });
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'hunter', start.rng);
    start.assertDone();
    const combat = state.activeCombat;
    if (combat == null) throw new Error('expected an active combat');
    const crafted: PlaythroughState = {
      ...state,
      activeCombat: {
        encounterId: combat.encounterId,
        round: combat.round,
        startedParticipants: [...combat.startedParticipants],
        roundParticipantOrder: [...combat.roundParticipantOrder],
        participants: {
          'heavy-boar': { range: 'near', intent: 'heavy-attack', prepared: true },
        },
      },
    };
    // Distract hits 3+3+2 = 8 against 7+0 = 7; cleanup draws the strike.
    const dice = finiteDice([3, 3, 6]);
    const result = distract(scenario, crafted, dice.rng, 'heavy-boar');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'heavy-boar']);
    expect(round.actions.map((action) => action.kind)).toEqual(['distract', 'heavy-attack']);
    expect(round.actions[0]).toMatchObject({
      speed: 'fast',
      status: 'executed',
      damage: 0,
      prepared: false,
      waryUntilRound: 2,
    });
    expect(round.actions[0]?.roll).toMatchObject({ total: 8, target: 7, hit: true });
    expect(round.actions[1]).toMatchObject({
      speed: 'slow',
      status: 'cancelled',
      cancelReason: 'interrupted',
      prepared: false,
    });
    expect(result.state.activeCombat?.participants['heavy-boar']).toMatchObject({
      intent: 'strike',
      prepared: false,
      waryUntilRound: 2,
    });
  });

  it('a failed Distract has no effect', () => {
    const { scenario } = loadLoneArcher();
    const start = finiteDice([1]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    // Distract misses 1+1+2 = 4 against 7+1 = 8, so the Prepare executes and
    // the prepared heavy that follows needs no selection die.
    const dice = finiteDice([1, 1]);
    const result = distract(scenario, state, dice.rng, 'archer');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map((action) => action.kind)).toEqual(['distract', 'prepare']);
    expect(round.actions[0]).toMatchObject({ status: 'executed', damage: 0 });
    expect(round.actions[0]?.roll).toMatchObject({ hit: false });
    expect(round.actions[0]).not.toHaveProperty('waryUntilRound');
    expect(round.actions[1]).toMatchObject({ status: 'executed', prepared: true });
    expect(result.state.activeCombat?.participants['archer']).toMatchObject({
      intent: 'heavy-attack',
      prepared: true,
    });
    expect(result.state.activeCombat?.participants['archer']?.waryUntilRound).toBeUndefined();
    // Still distractable next Round.
    expect(
      combatActions(scenario, result.state).find((action) => action.id === 'distract'),
    ).toMatchObject({ enabled: true });
  });

  it('requires a target with two survivors', () => {
    const { scenario } = loadArchersFar();
    const start = finiteDice([1]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    expectRejected(
      scenario,
      state,
      { kind: 'combat', combatAction: 'distract', expectedStep: state.step },
      'illegal-action',
    );
  });

  it('resolves against an explicit target while the other participant still acts', () => {
    const { scenario } = loadArchersFar();
    const start = finiteDice([1]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    expect(state.activeCombat?.participants['archer-a']?.intent).toBe('prepare');
    // Distract hits archer-a 3+3+2 = 8; archer-b misses 1+1+1 = 3 against
    // 7+3 = 10; cleanup draws both next strikes.
    const dice = finiteDice([3, 3, 1, 1, 6, 5]);
    const result = distract(scenario, state, dice.rng, 'archer-a');
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'archer-a', 'archer-b']);
    expect(round.actions.map((action) => action.kind)).toEqual([
      'distract',
      'prepare',
      'strike',
    ]);
    expect(round.actions[0]).toMatchObject({ status: 'executed', waryUntilRound: 2 });
    expect(round.actions[1]).toMatchObject({
      status: 'cancelled',
      cancelReason: 'interrupted',
    });
    expect(round.actions[2]).toMatchObject({ status: 'executed', damage: 0 });
    expect(result.state.activeCombat?.participants['archer-a']?.waryUntilRound).toBe(2);
    expect(result.state.activeCombat?.participants['archer-b']?.waryUntilRound).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// R5: Defend, Guarded and the counterattack.
// ---------------------------------------------------------------------------

describe('R5 defend and guard', () => {
  it('executes first with no roll and raises the threshold to 9 + Agility', () => {
    const { scenario } = loadWolfNear();
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    const step = state.step;
    // The wolf misses 4+4+2 = 10 against the guarded 9+3 = 12; the counter
    // misses 1+1+1 = 3 against 7+2 = 9. The steady wolf draws no selection die.
    const dice = finiteDice([4, 4, 1, 1]);
    const result = defend(scenario, state, dice.rng);
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'wolf']);
    expect(round.actions.map((action) => action.kind)).toEqual(['defend', 'strike']);
    expect(round.actions[0]).toMatchObject({
      speed: 'fast',
      order: 1,
      status: 'executed',
      guarded: true,
    });
    expect(round.actions[0]?.roll).toBeUndefined();
    expect(round.actions[1]).toMatchObject({ status: 'executed', damage: 0 });
    expect(round.actions[1]?.roll).toMatchObject({
      die1: 4,
      die2: 4,
      modifier: 2,
      total: 10,
      target: 12,
      hit: false,
    });
    expect(round.actions[1]?.counter).toMatchObject({ damage: 0 });
    expect(round.actions[1]?.counter?.roll).toMatchObject({
      die1: 1,
      die2: 1,
      modifier: 1,
      total: 3,
      target: 9,
      hit: false,
    });
    expect(round.actions[1]?.counter).not.toHaveProperty('defeatedParticipants');
    expect(round.stop).toBeUndefined();
    expect(result.state.step).toBe(step + 1);
    expect(result.state.character.health).toBe(12);
    expect(result.state.encounters['wolf-near']).toEqual({ wolf: 0 });
    expect(result.state.activeCombat?.round).toBe(2);
  });

  it('guards only until cleanup: the same dice hit the next Round', () => {
    const { scenario } = loadWolfNear();
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    const guarded = finiteDice([4, 4, 1, 1]);
    const defended = defend(scenario, state, guarded.rng);
    guarded.assertDone();
    // Round 2 as an attack: the sword misses, and the wolf's 4+4+2 = 10 now
    // hits the unguarded 7+3 = 10 for 2 Damage, with no counter to a hit.
    const exposed = finiteDice([1, 1, 4, 4]);
    const result = attack(scenario, defended.state, exposed.rng, 'wolf');
    exposed.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map((action) => action.kind)).toEqual(['attack', 'strike']);
    expect(round.actions[0]).toMatchObject({ status: 'executed', damage: 0 });
    expect(round.actions[1]).toMatchObject({ status: 'executed', damage: 2 });
    expect(round.actions[1]?.roll).toMatchObject({ total: 10, target: 10, hit: true });
    expect(round.actions[1]).not.toHaveProperty('counter');
    expect(result.state.character.health).toBe(10);
  });

  it('triggers the counter only on the first missed melee attack', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.rat,
      encounterId: 'rats-near',
      encounterBody:
        '  participants:\n    - id: rat-a\n      enemy: rat\n    - id: rat-b\n      enemy: rat',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    // Both rats miss the guarded 9+3 = 12 with 1+1+1 = 3. The counter answers
    // the first only, hitting 6+6+1 = 13 against 7+2 = 9 for 1 Damage.
    const dice = finiteDice([1, 1, 6, 6, 1, 1]);
    const result = defend(scenario, state, dice.rng);
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map(actorId)).toEqual(['character', 'rat-a', 'rat-b']);
    expect(round.actions[1]).toMatchObject({ status: 'executed', damage: 0 });
    expect(round.actions[1]?.counter).toMatchObject({ damage: 1 });
    expect(round.actions[1]?.counter?.roll).toMatchObject({
      total: 13,
      target: 9,
      hit: true,
    });
    expect(round.actions[2]).toMatchObject({ status: 'executed', damage: 0 });
    expect(round.actions[2]).not.toHaveProperty('counter');
    expect(result.state.encounters['rats-near']).toEqual({ 'rat-a': 1, 'rat-b': 0 });
    expect(result.state.character.health).toBe(12);
  });

  it('a ranged miss triggers no counter', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.banditArcher,
      encounterId: 'archer-far',
      encounterBody: '  participants:\n    - id: archer\n      enemy: bandit-archer',
      startRange: 'far',
    });
    const start = finiteDice([6]);
    const { state } = startHunt(scenario, 'ranger', start.rng);
    start.assertDone();
    expect(state.activeCombat?.participants['archer']?.intent).toBe('strike');
    // The archer misses 1+1+1 = 3 against the guarded 9+3 = 12; a ranged miss
    // answers nothing. Cleanup draws the next strike.
    const dice = finiteDice([1, 1, 6]);
    const result = defend(scenario, state, dice.rng);
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.actions.map((action) => action.kind)).toEqual(['defend', 'strike']);
    expect(round.actions[1]).toMatchObject({ status: 'executed', damage: 0 });
    expect(round.actions[1]).not.toHaveProperty('counter');
    expect(result.state.character.health).toBe(12);
  });

  it('a counter that defeats the last participant stops the sequence as victory', () => {
    const { scenario } = loadCustomCombat({
      enemiesYaml: ENEMY_DEFS.rat,
      encounterId: 'rat-near',
      encounterBody: '  participants:\n    - enemy: rat',
      startRange: 'near',
    });
    const none = noDice();
    const { state } = startHunt(scenario, 'hunter', none.rng);
    none.assertSilent();
    // The rat is one Damage from defeat: the counter's hit ends the Combat.
    const combat = state.activeCombat;
    if (combat == null) throw new Error('expected an active combat');
    const wounded: PlaythroughState = {
      ...state,
      encounters: { ...state.encounters, [combat.encounterId]: { rat: 2 } },
    };
    // The rat misses 1+1+1 = 3 against the guarded 9+3 = 12; the counter hits
    // 6+6+1 = 13 against 7+2 = 9 for the last point of Damage. No cleanup.
    const dice = finiteDice([1, 1, 6, 6]);
    const result = defend(scenario, wounded, dice.rng);
    dice.assertDone();
    const round = onlyRound(result.journal);
    expect(round.stop).toBe('victory');
    expect(round.actions.map((action) => action.kind)).toEqual(['defend', 'strike']);
    expect(round.actions[1]).toMatchObject({ status: 'executed', damage: 0 });
    expect(round.actions[1]?.counter).toMatchObject({
      damage: 1,
      defeatedParticipants: ['rat'],
    });
    // The reaction triggers no further reaction.
    expect(round.actions[1]?.counter).not.toHaveProperty('counter');
    expect(result.state.activeCombat).toBeNull();
    expect(journalTypes(result.journal)).toEqual([
      'combat-round',
      'combat-end',
      'outcome',
      'ending',
    ]);
    expect(result.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'rat-near',
      howEnded: 'victory',
    });
  });
});
