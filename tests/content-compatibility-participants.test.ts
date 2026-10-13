// Participant-aware content reference check (issue #125).
//
// Covers acceptance rows M5-M9 of the tactical-combat handoff against the
// normative spec (docs/spec/architecture.md, content compatibility;
// docs/spec/playthrough-state.md, stored-and-derived-state and combat
// compatibility acceptance examples): reordering keeps the saved tie order,
// revival during active Combat fails read-only, revival outside Combat fights
// survivors and repeats victory, adding/removing participants is accepted only
// where no Combat state is orphaned or invented, and mechanical edits pass
// only while the content-dependent invariants hold.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario, checkPlaythroughCompatibility } from '../src/content/index';
import type { CompiledEnemy, CompiledEncounter, CompiledParticipant } from '../src/content/model';
import {
  applyAction,
  startPlaythrough,
  view,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';
import { parsePlaythroughState } from '../src/engine/state';
import { resolvePlaythrough } from '../src/app/lib/playthrough';
import { executeTurn } from '../src/app/lib/turn';
import {
  migrateDatabase,
  openDatabase,
  PlaythroughStore,
} from '../src/persistence/index';
import { loadTacticalFixture } from './fixtures/tactical';

const SESSION = 'session-participant-compat';

function finiteDice(dice: number[]): { rng: Rng; assertDone: () => void } {
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

function snapshot(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function succeed(
  state: PlaythroughState,
  action: Parameters<typeof applyAction>[2],
  rng: Rng,
  scenario: Scenario,
): Extract<ReturnType<typeof applyAction>, { ok: true }> {
  const result = applyAction(scenario, state, action, rng);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`action failed: ${result.reason}`);
  return result;
}

function startHunt(scenario: Scenario, templateId: string, rng: Rng): PlaythroughState {
  const started = startPlaythrough(scenario, templateId, 'Robin', rng);
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);
  return openHunt(scenario, started.state, rng);
}

/** Open the on-demand ambush Scene into Combat from a Location-view state. */
function openHunt(scenario: Scenario, state: PlaythroughState, rng: Rng): PlaythroughState {
  const opened = succeed(
    state,
    { kind: 'open-scene', sceneId: 'ambush', expectedStep: state.step },
    rng,
    scenario,
  );
  const chosen = succeed(
    opened.state,
    { kind: 'choose', choiceId: 'confront', expectedStep: opened.state.step },
    rng,
    scenario,
  );
  return chosen.state;
}

function combat(
  state: PlaythroughState,
  rng: Rng,
  scenario: Scenario,
  move: { combatAction: 'attack' | 'advance' | 'escape'; targetParticipantId?: string },
): Extract<ReturnType<typeof applyAction>, { ok: true }> {
  return succeed(state, { kind: 'combat', expectedStep: state.step, ...move }, rng, scenario);
}

function attack(
  state: PlaythroughState,
  rng: Rng,
  scenario: Scenario,
  targetParticipantId?: string,
): Extract<ReturnType<typeof applyAction>, { ok: true }> {
  return combat(state, rng, scenario, {
    combatAction: 'attack',
    ...(targetParticipantId === undefined ? {} : { targetParticipantId }),
  });
}

/** A mutable clone with a moved pin, so the read layer runs the check. */
function edited(scenario: Scenario): Scenario {
  const clone = structuredClone(scenario);
  clone.contentHash = `${scenario.contentHash}-edit`;
  return clone;
}

function encounterOf(scenario: Scenario, encounterId: string): CompiledEncounter {
  const encounter = scenario.encountersById[encounterId];
  if (encounter === undefined) throw new Error(`no encounter "${encounterId}"`);
  return encounter;
}

function participantOf(
  scenario: Scenario,
  encounterId: string,
  participantId: string,
): CompiledParticipant {
  const participant = encounterOf(scenario, encounterId).participants.find(
    (entry) => entry.id === participantId,
  );
  if (participant === undefined) {
    throw new Error(`no participant "${participantId}" in "${encounterId}"`);
  }
  return participant;
}

/** Reverse the content order of an Encounter's participants. */
function reverseParticipantOrder(scenario: Scenario, encounterId: string): void {
  encounterOf(scenario, encounterId).participants.reverse();
}

/** The pair-wolves Combat after wolf-a falls: only wolf-b has action state. */
function wolvesWithFallenA(): { scenario: Scenario; state: PlaythroughState } {
  const { scenario } = loadTacticalFixture('pair-wolves');
  const startDice = noDice();
  let state = startHunt(scenario, 'hunter', startDice.rng);
  startDice.assertSilent();
  const advanceDice = noDice();
  state = combat(state, advanceDice.rng, scenario, {
    combatAction: 'advance',
    targetParticipantId: 'wolf-a',
  }).state;
  advanceDice.assertSilent();
  for (const dice of [
    [6, 6, 1, 1, 1, 1],
    [6, 6, 1, 1, 1, 1],
    [6, 6, 1, 1],
  ]) {
    const round = finiteDice(dice);
    state = attack(state, round.rng, scenario, 'wolf-a').state;
    round.assertDone();
  }
  expect(state.activeCombat?.startedParticipants).toEqual(['wolf-a', 'wolf-b']);
  expect(state.activeCombat?.roundParticipantOrder).toEqual(['wolf-b']);
  expect(Object.keys(state.activeCombat?.participants ?? {}).sort()).toEqual(['wolf-b']);
  expect(state.encounters['wolves-ambush']).toEqual({ 'wolf-a': 9, 'wolf-b': 0 });
  return { scenario, state };
}

describe('M5 reordering equal-priority participants', () => {
  it('keeps the saved tie order for the current Round across reload and rejection', () => {
    const { scenario } = loadTacticalFixture('pair-heavy');
    // Both heavy archers draw 6: Strike twice, saved tie order [a, b].
    const start = finiteDice([6, 6]);
    const state = startHunt(scenario, 'hunter', start.rng);
    start.assertDone();
    expect(state.activeCombat?.roundParticipantOrder).toEqual(['archer-a', 'archer-b']);

    const reordered = edited(scenario);
    reverseParticipantOrder(reordered, 'archers-ambush');
    expect(checkPlaythroughCompatibility(reordered, state)).toEqual({ ok: true });

    // Reload validates unchanged: the announced Round keeps its saved order.
    expect(parsePlaythroughState(snapshot(state))).toEqual(state);

    // Rejection changes nothing: no re-selection, no new order, no dice.
    const rejected = noDice();
    const before = snapshot(state);
    const refused = applyAction(
      reordered,
      state,
      {
        kind: 'combat',
        combatAction: 'attack',
        targetParticipantId: 'ghost',
        expectedStep: state.step,
      },
      rejected.rng,
    );
    expect(refused).toEqual({ ok: false, reason: 'illegal-action' });
    expect(snapshot(state)).toEqual(before);
    rejected.assertSilent();
    expect(state.activeCombat?.roundParticipantOrder).toEqual(['archer-a', 'archer-b']);
    expect(state.activeCombat?.participants['archer-a']?.intent).toBe('strike');
    expect(state.activeCombat?.participants['archer-b']?.intent).toBe('strike');
  });

  it('captures the current content order at cleanup for selection and next-Round ties', () => {
    const { scenario } = loadTacticalFixture('pair-heavy');
    const start = finiteDice([6, 6]);
    const state = startHunt(scenario, 'hunter', start.rng);
    start.assertDone();

    const reordered = edited(scenario);
    reverseParticipantOrder(reordered, 'archers-ambush');

    // Advance on archer-a (no roll); both archers Strike and miss (1, 1 each);
    // cleanup draws in the new content order [b, a]: b draws 1 and Prepares,
    // while a is blocked and Strikes without drawing.
    const round = finiteDice([1, 1, 1, 1, 1]);
    const next = combat(state, round.rng, reordered, {
      combatAction: 'advance',
      targetParticipantId: 'archer-a',
    });
    round.assertDone();
    expect(next.state.activeCombat?.round).toBe(2);
    expect(next.state.activeCombat?.roundParticipantOrder).toEqual(['archer-b', 'archer-a']);
    expect(next.state.activeCombat?.participants['archer-b']?.intent).toBe('prepare');
    expect(next.state.activeCombat?.participants['archer-a']?.intent).toBe('strike');

    // The resolved Round itself used the saved tie order: with equal Speed and
    // Agility, archer-a's Strike precedes archer-b's in the Journal.
    const roundEntry = next.journal.find((entry) => entry.type === 'combat-round');
    expect(roundEntry?.type).toBe('combat-round');
    if (roundEntry?.type !== 'combat-round') throw new Error('expected a combat round entry');
    const participantOrder = roundEntry.actions
      .filter((action) => action.actor.kind === 'participant')
      .map((action) =>
        action.actor.kind === 'participant' ? action.actor.participantId : 'character',
      );
    expect(participantOrder).toEqual(['archer-a', 'archer-b']);
  });

  it('derives statistics from the current content', () => {
    const { scenario } = loadTacticalFixture('pair-wolves');
    const startDice = noDice();
    let state = startHunt(scenario, 'hunter', startDice.rng);
    startDice.assertSilent();
    const advanceDice = noDice();
    state = combat(state, advanceDice.rng, scenario, {
      combatAction: 'advance',
      targetParticipantId: 'wolf-a',
    }).state;
    advanceDice.assertSilent();

    // Retune the lead wolf's Damage: accepted while the invariants hold, and
    // the committed Intents stay as selected. The wolves share one Enemy, so
    // the retune gives wolf-a its own copy to tell them apart.
    const retuned = edited(scenario);
    const lead = participantOf(retuned, 'wolves-ambush', 'wolf-a');
    lead.enemy = { ...lead.enemy, damage: 5 };
    expect(checkPlaythroughCompatibility(retuned, state)).toEqual({ ok: true });
    expect(state.activeCombat?.participants['wolf-a']?.intent).toBe('strike');
    const projected = view(retuned, state);
    expect(projected.kind).toBe('combat');
    if (projected.kind !== 'combat') throw new Error('expected combat view');
    expect(projected.enemy.damage).toBe(5);

    // Both wolves Strike for a hit (6, 6 each): wolf-a deals its new Damage 5
    // from the current content, wolf-b its unchanged 2.
    const round = finiteDice([6, 6, 6, 6, 6, 6]);
    const hit = attack(state, round.rng, retuned, 'wolf-b').state;
    round.assertDone();
    expect(hit.character.health).toBe(5);
    expect(hit.encounters['wolves-ambush']).toEqual({ 'wolf-a': 0, 'wolf-b': 3 });
  });

  it('updates the pin on a passing reordered read', async () => {
    const { scenario } = loadTacticalFixture('pair-wolves');
    const startDice = noDice();
    const state = startHunt(scenario, 'hunter', startDice.rng);
    startDice.assertSilent();
    const reordered = edited(scenario);
    reverseParticipantOrder(reordered, 'wolves-ambush');

    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      await new PlaythroughStore(db).create(
        {
          id: 'pt-reorder',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          contentHash: 'stale-hash',
          status: state.status,
          step: state.step,
          state: { ...state, contentHash: 'stale-hash', scenarioVersion: '0.9.0' },
        },
        [],
      );
      const resolved = await resolvePlaythrough(
        db,
        (id) => (id === scenario.id ? reordered : undefined),
        'pt-reorder',
        SESSION,
      );
      expect(resolved?.compatible).toBe(true);
      if (resolved === null || !resolved.compatible) throw new Error('expected compatible');
      expect(resolved.playthrough.state.activeCombat?.roundParticipantOrder).toEqual([
        'wolf-a',
        'wolf-b',
      ]);
      const stored = await new PlaythroughStore(db).findById('pt-reorder');
      expect(stored?.contentHash).toBe(reordered.contentHash);
    } finally {
      await db.destroy();
    }
  });
});

describe('M6 revival during active Combat', () => {
  it('fails read-only on revival without action state, and recovers on restore', async () => {
    const { scenario, state } = wolvesWithFallenA();

    // Raising the shared maximum Health to 10 revives wolf-a (taken 9) while
    // it has no action state: incompatible.
    const revived = edited(scenario);
    revived.enemiesById['grey-wolf'].health = 10;
    const check = checkPlaythroughCompatibility(revived, state);
    expect(check.ok).toBe(false);

    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const journal = [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'hi' } }];
      await new PlaythroughStore(db).create(
        {
          id: 'pt-revive',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          contentHash: 'stale-hash',
          status: state.status,
          step: state.step,
          state: { ...state, contentHash: 'stale-hash', scenarioVersion: '0.9.0' },
        },
        journal,
      );
      const before = await new PlaythroughStore(db).findById('pt-revive');
      const journalBefore = await new PlaythroughStore(db).listJournal('pt-revive');

      // The read is incompatible and writes nothing back: state, pin and
      // Journal stay exactly as stored, with no new Intent invented.
      const resolved = await resolvePlaythrough(
        db,
        (id) => (id === scenario.id ? revived : undefined),
        'pt-revive',
        SESSION,
      );
      expect(resolved?.compatible).toBe(false);
      const raw = await new PlaythroughStore(db).findById('pt-revive');
      expect(raw?.state).toEqual(before?.state);
      expect(raw?.contentHash).toBe('stale-hash');
      expect(raw?.step).toBe(state.step);
      expect(await new PlaythroughStore(db).listJournal('pt-revive')).toEqual(journalBefore);

      // A submitted action is rejected as incompatible and also writes nothing.
      const acted = await executeTurn(
        db,
        (id) => (id === scenario.id ? revived : undefined),
        'pt-revive',
        SESSION,
        { kind: 'combat', combatAction: 'attack', targetParticipantId: 'wolf-b', expectedStep: state.step },
        () => 1,
      );
      expect(acted).toEqual({ ok: false, reason: 'incompatible' });
      const kept = await new PlaythroughStore(db).findById('pt-revive');
      expect(kept?.state).toEqual(before?.state);
      expect(kept?.contentHash).toBe('stale-hash');
      expect(await new PlaythroughStore(db).listJournal('pt-revive')).toEqual(journalBefore);

      // Restoring the content restores compatibility with the same bytes.
      const restored = await resolvePlaythrough(
        db,
        (id) => (id === scenario.id ? scenario : undefined),
        'pt-revive',
        SESSION,
      );
      expect(restored?.compatible).toBe(true);
      if (restored === null || !restored.compatible) throw new Error('expected compatible');
      expect(Object.keys(restored.playthrough.state.activeCombat?.participants ?? {}).sort()).toEqual([
        'wolf-b',
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('fails when an active participant no longer outlasts its Damage taken', () => {
    const { scenario, state } = wolvesWithFallenA();
    // Wound the survivor once (3 Damage taken), then lower the maximum Health
    // to exactly the Damage taken: wolf-b stops surviving while it still has
    // action state.
    const wound = finiteDice([6, 6, 1, 1]);
    const wounded = attack(state, wound.rng, scenario, 'wolf-b').state;
    wound.assertDone();
    expect(wounded.encounters['wolves-ambush']).toEqual({ 'wolf-a': 9, 'wolf-b': 3 });

    const lowered = edited(scenario);
    lowered.enemiesById['grey-wolf'].health = 3;
    expect(checkPlaythroughCompatibility(lowered, wounded).ok).toBe(false);
  });
});

describe('M7 revival outside Combat', () => {
  function loadDenFixture(): { dir: string; scenario: Scenario } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-revival-den-'));
    const name = path.basename(dir);
    const scenarioDir = path.join(dir, name);
    const write = (relative: string, content: string): void => {
      const full = path.join(scenarioDir, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    };
    write(
      'scenario.yaml',
      [
        'schemaVersion: 1',
        `id: ${name}`,
        'title: Revival Den Fixture',
        'description: Victory without an Ending, for revival tests.',
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
      'scenes/ambush.yaml',
      [
        'id: ambush',
        'title: Ambush',
        'trigger: on-demand',
        'repeatable: true',
        'text: Something moves beyond the trees.',
        'choices:',
        '  - id: confront',
        '    text: Stand and confront it.',
        '    outcome:',
        '      start-combat: den-ambush',
        // A direct way out, so the package loads: the tests never take it.
        '  - id: sneak-past',
        '    text: Slip past quietly.',
        '    outcome:',
        '      end: home',
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
        '- id: wolf-pelt',
        '  kind: key',
        '  name: Wolf pelt',
        '',
      ].join('\n'),
    );
    write(
      'enemies.yaml',
      [
        '- id: stray-pup',
        '  name: Stray Pup',
        '  attributes: { might: 1, agility: 1, wits: 0, presence: 0 }',
        '  health: 3',
        '  damage: 2',
        '  reach: melee',
        '  behaviour: steady',
        '',
      ].join('\n'),
    );
    write(
      'encounters.yaml',
      [
        '- id: den-ambush',
        '  participants:',
        '    - id: pup-a',
        '      enemy: stray-pup',
        '    - id: pup-b',
        '      enemy: stray-pup',
        '  startRange: far',
        '  text: |',
        '    Teeth in the dark.',
        '  victory:',
        '    text: |',
        '      Quiet returns to the glade.',
        '    effects:',
        '      - give-item: { item: wolf-pelt }',
        '  escape:',
        '    text: |',
        '      You slip away between the trees.',
        '    move: glade',
        '',
      ].join('\n'),
    );
    write(
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
      throw new Error(`revival den failed to load: ${JSON.stringify(result.diagnostics)}`);
    }
    return { dir: scenarioDir, scenario: result.scenario };
  }

  it('fights current survivors with kept wounds and applies the victory Outcome again', () => {
    const { scenario } = loadDenFixture();
    const startDice = noDice();
    let state = startHunt(scenario, 'hunter', startDice.rng);
    startDice.assertSilent();
    const advanceDice = noDice();
    state = combat(state, advanceDice.rng, scenario, {
      combatAction: 'advance',
      targetParticipantId: 'pup-a',
    }).state;
    advanceDice.assertSilent();

    // One sword hit (3 Damage) defeats each health-3 pup. Pup agility 1: its
    // Strike misses on (1, 1).
    const first = finiteDice([6, 6, 1, 1]);
    state = attack(state, first.rng, scenario, 'pup-a').state;
    first.assertDone();
    const second = finiteDice([6, 6]);
    const victory = attack(state, second.rng, scenario, 'pup-b');
    second.assertDone();
    expect(victory.state.activeCombat).toBeNull();
    expect(victory.state.encounters['den-ambush']).toEqual({ 'pup-a': 3, 'pup-b': 3 });
    expect(victory.state.inventory['wolf-pelt']).toBe(1);
    expect(victory.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'den-ambush',
      howEnded: 'victory',
    });

    // Revival outside Combat: both maxima rise above the recorded wounds.
    const revived = edited(scenario);
    revived.enemiesById['stray-pup'].health = 5;
    expect(checkPlaythroughCompatibility(revived, victory.state)).toEqual({ ok: true });

    // A later start fights the current survivors with their kept wounds: no
    // victory marker was stored, and none is needed.
    const reopenDice = noDice();
    const refight = openHunt(revived, victory.state, reopenDice.rng);
    reopenDice.assertSilent();
    expect(refight.activeCombat?.startedParticipants).toEqual(['pup-a', 'pup-b']);
    expect(refight.encounters['den-ambush']).toEqual({ 'pup-a': 3, 'pup-b': 3 });
    const readvanceDice = noDice();
    const refightAdvanced = combat(refight, readvanceDice.rng, revived, {
      combatAction: 'advance',
      targetParticipantId: 'pup-a',
    }).state;
    readvanceDice.assertSilent();

    // Defeat both again (taken 3 + 3 hits their new maxima of 5): the next
    // victory applies the Outcome and its Effects again.
    const third = finiteDice([6, 6, 1, 1]);
    const refightWounded = attack(refightAdvanced, third.rng, revived, 'pup-a').state;
    third.assertDone();
    const fourth = finiteDice([6, 6]);
    const secondVictory = attack(refightWounded, fourth.rng, revived, 'pup-b');
    fourth.assertDone();
    expect(secondVictory.state.activeCombat).toBeNull();
    expect(secondVictory.state.inventory['wolf-pelt']).toBe(2);
    expect(secondVictory.journal.find((entry) => entry.type === 'combat-end')).toMatchObject({
      encounterId: 'den-ambush',
      howEnded: 'victory',
    });
  });

  it('keeps an ended Playthrough ended across revival', () => {
    const { scenario } = loadTacticalFixture('pair-wolves');
    const startDice = noDice();
    let state = startHunt(scenario, 'hunter', startDice.rng);
    startDice.assertSilent();
    const advanceDice = noDice();
    state = combat(state, advanceDice.rng, scenario, {
      combatAction: 'advance',
      targetParticipantId: 'wolf-a',
    }).state;
    advanceDice.assertSilent();
    // Defeat wolf-a (three hits), then wolf-b (three more): the pair victory
    // ends the Playthrough at home.
    for (const dice of [
      [6, 6, 1, 1, 1, 1],
      [6, 6, 1, 1, 1, 1],
      [6, 6, 1, 1],
      [6, 6, 1, 1],
      [6, 6, 1, 1],
      [6, 6],
    ]) {
      const round = finiteDice(dice);
      const target = state.encounters['wolves-ambush']?.['wolf-a'] === 9 ? 'wolf-b' : 'wolf-a';
      state = attack(state, round.rng, scenario, target).state;
      round.assertDone();
    }
    expect(state.status).toBe('ended');
    expect(state.endingId).toBe('home');
    expect(view(scenario, state).kind).toBe('ended');

    // Revival cannot reopen it: the Ending view stays and every action is
    // rejected, even though the wounds no longer defeat anyone.
    const revived = edited(scenario);
    revived.enemiesById['grey-wolf'].health = 30;
    expect(view(revived, state).kind).toBe('ended');
    const refused = applyAction(
      revived,
      state,
      {
        kind: 'combat',
        combatAction: 'attack',
        targetParticipantId: 'wolf-a',
        expectedStep: state.step,
      },
      (() => 1) as Rng,
    );
    expect(refused).toEqual({ ok: false, reason: 'ended' });
  });
});

describe('M8 adding, removing and renaming participants', () => {
  function loadSoloFixture(): { dir: string; scenario: Scenario } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-solo-den-'));
    const name = path.basename(dir);
    const scenarioDir = path.join(dir, name);
    const write = (relative: string, content: string): void => {
      const full = path.join(scenarioDir, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    };
    write(
      'scenario.yaml',
      [
        'schemaVersion: 1',
        `id: ${name}`,
        'title: Solo Den Fixture',
        'description: Single participant, repeatable fight.',
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
      'scenes/ambush.yaml',
      [
        'id: ambush',
        'title: Ambush',
        'trigger: on-demand',
        'repeatable: true',
        'text: Something moves beyond the trees.',
        'choices:',
        '  - id: confront',
        '    text: Stand and confront it.',
        '    outcome:',
        '      start-combat: solo-den',
        // A direct way out, so the package loads: the tests never take it.
        '  - id: sneak-past',
        '    text: Slip past quietly.',
        '    outcome:',
        '      end: home',
        '',
      ].join('\n'),
    );
    write(
      'items.yaml',
      ['- id: sword', '  kind: equipment', '  name: Sword', '  slot: weapon', '  damage: 3', ''].join(
        '\n',
      ),
    );
    write(
      'enemies.yaml',
      [
        '- id: grey-wolf',
        '  name: Grey Wolf',
        '  attributes: { might: 2, agility: 2, wits: 1, presence: 0 }',
        '  health: 8',
        '  damage: 2',
        '  reach: melee',
        '  behaviour: steady',
        '',
      ].join('\n'),
    );
    write(
      'encounters.yaml',
      [
        '- id: solo-den',
        '  participants:',
        '    - id: lone',
        '      enemy: grey-wolf',
        '  startRange: far',
        '  text: |',
        '    A lone wolf circles the glade.',
        '  victory:',
        '    text: |',
        '      The wolf falls.',
        '    move: glade',
        '  escape:',
        '    text: |',
        '      You slip away between the trees.',
        '    move: glade',
        '',
      ].join('\n'),
    );
    write(
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
      throw new Error(`solo den failed to load: ${JSON.stringify(result.diagnostics)}`);
    }
    return { dir: scenarioDir, scenario: result.scenario };
  }

  /** The same content with a second participant added to the Encounter. */
  function withCub(scenario: Scenario): Scenario {
    const grown = edited(scenario);
    const lone = participantOf(grown, 'solo-den', 'lone');
    encounterOf(grown, 'solo-den').participants.push({ id: 'cub', enemy: lone.enemy });
    return grown;
  }

  function freshSolo(scenario: Scenario): PlaythroughState {
    const started = startPlaythrough(scenario, 'hunter', 'Robin', (() => 1) as Rng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    expect(started.state.encounters).toEqual({});
    return started.state;
  }

  it('accepts an addition before any record, joining at full Health on next start', () => {
    const { scenario } = loadSoloFixture();
    const fresh = freshSolo(scenario);
    const grown = withCub(scenario);
    expect(checkPlaythroughCompatibility(grown, fresh)).toEqual({ ok: true });

    const startDice = noDice();
    const fighting = openHunt(grown, fresh, startDice.rng);
    startDice.assertSilent();
    expect(fighting.activeCombat?.startedParticipants).toEqual(['lone', 'cub']);
    expect(fighting.encounters['solo-den']).toEqual({ lone: 0, cub: 0 });
  });

  it('accepts an addition after an undefeated non-active record', () => {
    const { scenario } = loadSoloFixture();
    const fresh = freshSolo(scenario);
    const startDice = noDice();
    const fighting = openHunt(scenario, fresh, startDice.rng);
    startDice.assertSilent();
    // Escape at Far: 6 + 6 + agility 3 + bonus 2 against 7 + agility 2, so the
    // lone wolf's Strike is never reached and draws nothing.
    const escapeDice = finiteDice([6, 6]);
    const escaped = combat(fighting, escapeDice.rng, scenario, { combatAction: 'escape' }).state;
    escapeDice.assertDone();
    expect(escaped.activeCombat).toBeNull();
    expect(escaped.encounters['solo-den']).toEqual({ lone: 0 });

    const grown = withCub(scenario);
    expect(checkPlaythroughCompatibility(grown, escaped)).toEqual({ ok: true });

    const reopenDice = noDice();
    const refight = openHunt(grown, escaped, reopenDice.rng);
    reopenDice.assertSilent();
    expect(refight.activeCombat?.startedParticipants).toEqual(['lone', 'cub']);
    expect(refight.encounters['solo-den']).toEqual({ lone: 0, cub: 0 });
  });

  it('rejects an addition to a defeated Encounter or an active Combat', () => {
    const { scenario } = loadSoloFixture();
    const fresh = freshSolo(scenario);

    // Defeat the lone wolf (three sword hits of 3 against health 8): victory
    // moves back to the glade with the record defeated and no Combat.
    const startDice = noDice();
    let state = openHunt(scenario, fresh, startDice.rng);
    startDice.assertSilent();
    const advanceDice = noDice();
    state = combat(state, advanceDice.rng, scenario, {
      combatAction: 'advance',
      targetParticipantId: 'lone',
    }).state;
    advanceDice.assertSilent();
    for (const dice of [
      [6, 6, 1, 1],
      [6, 6, 1, 1],
      [6, 6],
    ]) {
      const round = finiteDice(dice);
      state = attack(state, round.rng, scenario, 'lone').state;
      round.assertDone();
    }
    expect(state.activeCombat).toBeNull();
    expect(state.encounters['solo-den']).toEqual({ lone: 9 });
    expect(checkPlaythroughCompatibility(withCub(scenario), state).ok).toBe(false);

    // Adding to the active Combat fails too, while the unedited content stays
    // compatible.
    const restartDice = noDice();
    const fighting = openHunt(scenario, freshSolo(scenario), restartDice.rng);
    restartDice.assertSilent();
    expect(checkPlaythroughCompatibility(scenario, fighting)).toEqual({ ok: true });
    expect(checkPlaythroughCompatibility(withCub(scenario), fighting).ok).toBe(false);
  });

  it('rejects removing or renaming a recorded participant', () => {
    const { scenario } = loadSoloFixture();
    const fresh = freshSolo(scenario);
    const startDice = noDice();
    const fighting = openHunt(scenario, fresh, startDice.rng);
    startDice.assertSilent();
    const escapeDice = finiteDice([6, 6]);
    const escaped = combat(fighting, escapeDice.rng, scenario, { combatAction: 'escape' }).state;
    escapeDice.assertDone();

    const renamed = edited(scenario);
    participantOf(renamed, 'solo-den', 'lone').id = 'renamed';
    expect(checkPlaythroughCompatibility(renamed, escaped).ok).toBe(false);
    expect(checkPlaythroughCompatibility(renamed, fighting).ok).toBe(false);
  });

  it('preserves identity across shorthand conversion', () => {
    const { scenario } = loadTacticalFixture('legacy');
    const startDice = noDice();
    const state = startHunt(scenario, 'hunter', startDice.rng);
    startDice.assertSilent();
    expect(state.activeCombat?.startedParticipants).toEqual(['grey-wolf']);

    // The same participant spelled explicitly keeps every id: compatible.
    const spelled = edited(scenario);
    const encounter = encounterOf(spelled, 'legacy-ambush');
    const lone = encounter.participants[0];
    if (lone === undefined) throw new Error('legacy encounter lost its participant');
    encounter.participants = [{ id: lone.id, enemy: lone.enemy }];
    expect(checkPlaythroughCompatibility(spelled, state)).toEqual({ ok: true });

    // Renaming the spelled-out id breaks the record instead.
    const renamed = edited(scenario);
    const encounterRenamed = encounterOf(renamed, 'legacy-ambush');
    const first = encounterRenamed.participants[0];
    if (first === undefined) throw new Error('legacy encounter lost its participant');
    encounterRenamed.participants = [{ id: 'grey-wolf-x', enemy: first.enemy }];
    expect(checkPlaythroughCompatibility(renamed, state).ok).toBe(false);
  });
});

describe('M9 mechanical edits and Combat state shape', () => {
  function roundOneWolves(): { scenario: Scenario; state: PlaythroughState } {
    const { scenario } = loadTacticalFixture('pair-wolves');
    const startDice = noDice();
    const state = startHunt(scenario, 'hunter', startDice.rng);
    startDice.assertSilent();
    return { scenario, state };
  }

  function archerEnemy(): CompiledEnemy {
    return {
      id: 'bandit-archer',
      name: 'Bandit Archer',
      attributes: { might: 1, agility: 2, wits: 1, presence: 1 },
      health: 6,
      damage: 2,
      reach: 'ranged',
      behaviour: 'heavy',
    };
  }

  it.each([
    ['kind', (scenario: Scenario) => {
      participantOf(scenario, 'wolves-ambush', 'wolf-a').enemy = archerEnemy();
    }],
    ['attributes', (scenario: Scenario) => {
      participantOf(scenario, 'wolves-ambush', 'wolf-a').enemy.attributes.agility = 0;
    }],
    ['damage', (scenario: Scenario) => {
      participantOf(scenario, 'wolves-ambush', 'wolf-a').enemy.damage = 6;
    }],
    ['reach', (scenario: Scenario) => {
      participantOf(scenario, 'wolves-ambush', 'wolf-a').enemy.reach = 'ranged';
    }],
    ['behaviour', (scenario: Scenario) => {
      participantOf(scenario, 'wolves-ambush', 'wolf-a').enemy.behaviour = 'heavy';
    }],
    ['order', (scenario: Scenario) => {
      reverseParticipantOrder(scenario, 'wolves-ambush');
    }],
    ['startRange', (scenario: Scenario) => {
      encounterOf(scenario, 'wolves-ambush').startRange = 'near';
    }],
  ])('accepts a %s edit while invariants hold, keeping the committed Intent', (_label, edit) => {
    const { scenario, state } = roundOneWolves();
    const changed = edited(scenario);
    edit(changed);
    expect(checkPlaythroughCompatibility(changed, state)).toEqual({ ok: true });
    // No replacement is selected: the committed kinds and the saved order stay
    // exactly as stored, and both wolves still have action state.
    expect(state.activeCombat?.participants['wolf-a']?.intent).toBe('close-in');
    expect(state.activeCombat?.participants['wolf-b']?.intent).toBe('close-in');
    expect(state.activeCombat?.roundParticipantOrder).toEqual(['wolf-a', 'wolf-b']);
  });

  it('rejects a kind edit that breaks the surviving set', () => {
    const { scenario } = loadTacticalFixture('pair-wolves');
    const startDice = noDice();
    let state = startHunt(scenario, 'hunter', startDice.rng);
    startDice.assertSilent();
    const advanceDice = noDice();
    state = combat(state, advanceDice.rng, scenario, {
      combatAction: 'advance',
      targetParticipantId: 'wolf-a',
    }).state;
    advanceDice.assertSilent();
    // One sword hit: wolf-a carries 3 Damage taken.
    const wound = finiteDice([6, 6, 1, 1, 1, 1]);
    state = attack(state, wound.rng, scenario, 'wolf-a').state;
    wound.assertDone();

    // Giving wolf-a a frailer kind (health 2 below its taken 3) defeats it
    // without action-state cleanup: incompatible.
    const frail = edited(scenario);
    participantOf(frail, 'wolves-ambush', 'wolf-a').enemy = {
      id: 'mite',
      name: 'Mite',
      attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
      health: 2,
      damage: 1,
      reach: 'melee',
      behaviour: 'steady',
    };
    expect(checkPlaythroughCompatibility(frail, state).ok).toBe(false);
  });

  it.each([
    ['empty starting membership', (state: PlaythroughState) => {
      if (state.activeCombat) state.activeCombat.startedParticipants = [];
    }],
    ['empty tie-break order', (state: PlaythroughState) => {
      if (state.activeCombat) state.activeCombat.roundParticipantOrder = [];
    }],
    ['duplicate starting ids', (state: PlaythroughState) => {
      if (state.activeCombat) state.activeCombat.startedParticipants = ['wolf-a', 'wolf-a'];
    }],
    ['duplicate order ids', (state: PlaythroughState) => {
      if (state.activeCombat) state.activeCombat.roundParticipantOrder = ['wolf-a', 'wolf-a'];
    }],
    ['starting membership missing an active id', (state: PlaythroughState) => {
      if (state.activeCombat) state.activeCombat.startedParticipants = ['wolf-a'];
    }],
    ['tie-break order missing an active id', (state: PlaythroughState) => {
      if (state.activeCombat) state.activeCombat.roundParticipantOrder = ['wolf-a'];
    }],
    ['tie-break order with an unknown id', (state: PlaythroughState) => {
      if (state.activeCombat) state.activeCombat.roundParticipantOrder = ['wolf-a', 'ghost'];
    }],
    ['survivor without action state', (state: PlaythroughState) => {
      if (state.activeCombat) delete state.activeCombat.participants['wolf-b'];
    }],
  ])('cannot pass with %s', (_label, corrupt) => {
    const { scenario, state } = roundOneWolves();
    const broken = structuredClone(state);
    corrupt(broken);
    expect(checkPlaythroughCompatibility(scenario, broken).ok).toBe(false);
  });

  it('cannot pass with action state for a defeated participant', () => {
    const { scenario, state } = wolvesWithFallenA();
    expect(checkPlaythroughCompatibility(scenario, state)).toEqual({ ok: true });
    const broken = structuredClone(state);
    if (broken.activeCombat == null) throw new Error('expected an active Combat');
    broken.activeCombat.participants['wolf-a'] = {
      range: 'near',
      intent: 'strike',
      prepared: false,
    };
    expect(checkPlaythroughCompatibility(scenario, broken).ok).toBe(false);
  });

  it('fails closed with reasons on a partially written Combat shape', () => {
    const { scenario, state } = roundOneWolves();
    const broken = structuredClone(state);
    if (broken.activeCombat == null) throw new Error('expected an active Combat');
    broken.activeCombat.startedParticipants = undefined as unknown as string[];
    const result = checkPlaythroughCompatibility(scenario, broken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected incompatible');
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
