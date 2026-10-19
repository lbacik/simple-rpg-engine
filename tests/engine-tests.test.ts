// Engine unit tests for narrative Tests (docs/spec/mechanics.md, Tests;
// docs/spec/playthrough-state.md, Journal: Test entry; docs/spec/ui.md,
// tests and results): difficulty targets, 2d6 + effective Attribute against
// the target, the Test Journal entry, and the Choice label shown before the
// Choice is taken. The whispering-woods barrow door is the fixture.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  applyAction,
  startPlaythrough,
  view,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A deterministic RNG dealing the given die faces in order. */
function dealing(dice: number[]): Rng {
  let dealt = 0;
  return (min: number, max: number) => {
    const die = dice[dealt];
    dealt += 1;
    if (die === undefined) throw new Error('rng exhausted');
    expect(min).toBe(1);
    expect(max).toBe(7);
    expect(die).toBeGreaterThanOrEqual(1);
    expect(die).toBeLessThanOrEqual(6);
    return die;
  };
}

function loadWoods(): Scenario {
  const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
  if (!result.ok) {
    throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

/** A state with the soldier at the sealed barrow door, able to force it. */
function atBarrowDoor(templateId = 'soldier'): {
  scenario: Scenario;
  state: PlaythroughState;
} {
  const scenario = loadWoods();
  const started = startPlaythrough(scenario, templateId, 'Ash', dealing([1, 1]));
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);
  const state: PlaythroughState = {
    ...started.state,
    currentLocationId: 'barrow-mound',
    activeSceneId: 'barrow-door',
    visited: [...started.state.visited, 'barrow-mound'],
    firedScenes: [...started.state.firedScenes, 'barrow-door'],
  };
  return { scenario, state };
}

function choose(scenario: Scenario, state: PlaythroughState, choiceId: string, rng: Rng) {
  const result = applyAction(
    scenario,
    state,
    { kind: 'choose', choiceId, expectedStep: state.step },
    rng,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`action failed: ${result.reason}`);
  return result;
}

describe('narrative tests', () => {
  it('succeeds at exactly the target: soldier forcing the door with 4 + 5 + 4 = 13', () => {
    // Soldier: Might 3 base + 1 chain shirt = 4 effective; very-hard targets 13.
    const { scenario, state } = atBarrowDoor();
    const resolved = choose(scenario, state, 'force-door', dealing([4, 5]));
    // The success Outcome sets a flag, which is never presented: no
    // state-change entry joins the Test, Outcome and Scene narration.
    expect(resolved.journal.map((entry) => entry.type)).toEqual([
      'choice',
      'test',
      'outcome',
      'scene',
    ]);
    const test = resolved.journal[1];
    expect(test).toMatchObject({
      type: 'test',
      attribute: 'might',
      difficulty: 'very-hard',
      target: 13,
      die1: 4,
      die2: 5,
      modifier: 4,
      total: 13,
      success: true,
    });
    expect(test).not.toHaveProperty('text');
    // The success Outcome opens the barrow and moves into the tomb.
    expect(resolved.state.flags).toContain('barrow-open');
    expect(resolved.state.currentLocationId).toBe('barrow-tomb');
  });

  it('fails one below the target: 4 + 4 + 4 = 12 against very-hard 13', () => {
    const { scenario, state } = atBarrowDoor();
    const resolved = choose(scenario, state, 'force-door', dealing([4, 4]));
    expect(resolved.journal.map((entry) => entry.type)).toEqual([
      'choice',
      'test',
      'outcome',
      'state-change',
    ]);
    expect(resolved.journal[1]).toMatchObject({
      type: 'test',
      die1: 4,
      die2: 4,
      modifier: 4,
      total: 12,
      success: false,
    });
    // The failure Outcome hurts (damage 3 in format v2) but leaves the door shut.
    expect(resolved.state.flags).not.toContain('barrow-open');
    expect(resolved.state.character.health).toBe(9);
    expect(resolved.state.activeSceneId).toBe(null);
  });

  it('reads the effective Attribute: without the chain shirt 4 + 5 + 3 = 12 fails', () => {
    const { scenario, state } = atBarrowDoor();
    const unequipped: PlaythroughState = {
      ...state,
      equipment: { weapon: 'sword' },
    };
    const resolved = choose(scenario, unequipped, 'force-door', dealing([4, 5]));
    // Same dice as the success case, but Might 3 base alone is one short.
    expect(resolved.journal[1]).toMatchObject({ type: 'test', modifier: 3, total: 12, success: false });
  });

  it('stores both dice, the modifier, the total and the result in the Journal', () => {
    const { scenario, state } = atBarrowDoor();
    const resolved = choose(scenario, state, 'force-door', dealing([2, 6]));
    const test = resolved.journal[1];
    expect(test?.type).toBe('test');
    if (test?.type !== 'test') throw new Error('expected a Test entry');
    expect(test.die1).toBe(2);
    expect(test.die2).toBe(6);
    expect(test.modifier).toBe(4);
    expect(test.total).toBe(12);
    expect(test.success).toBe(false);
    expect(test.attribute).toBe('might');
    expect(test.difficulty).toBe('very-hard');
    // Structured events carry no English text.
    expect(test).not.toHaveProperty('text');
  });

  it('shows the tested Attribute and Difficulty before the Choice is taken', () => {
    const { scenario, state } = atBarrowDoor();
    const gameView = view(scenario, state);
    expect(gameView.kind).toBe('scene');
    if (gameView.kind !== 'scene') throw new Error('expected a Scene view');
    const force = gameView.choices.find((choice) => choice.id === 'force-door');
    expect(force).toBeDefined();
    // The Test comes from the view as codes; the app renders it from the catalogue.
    expect(force?.test).toEqual({ attribute: 'might', difficulty: 'very-hard', target: 13 });
    // A Choice without a Test carries no label.
    const stepAway = gameView.choices.find((choice) => choice.id === 'step-away');
    expect(stepAway?.test).toBeUndefined();
  });
});
