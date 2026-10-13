// The tactical pair fixture for browser E2E (tactical-combat handoff, U4/U5):
// `tests/fixtures/scenarios/tactical-pairs` loads with no diagnostics, holds
// the two-Grey-Wolf Encounter with distinct explicit ids at Far, and reaches
// active Combat through real engine transitions (start, open-scene, choose),
// the same path the test-only browser entry drives.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/content/index';
import {
  applyAction,
  combatArena,
  startPlaythrough,
  type Action,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(testsDir, 'fixtures', 'scenarios', 'tactical-pairs');

function silentRng(): Rng {
  return () => {
    throw new Error('no dice expected');
  };
}

describe('tactical-pairs E2E fixture', () => {
  it('loads with no diagnostics', () => {
    const result = loadScenario(fixtureDir);
    if (!result.ok) {
      throw new Error(`tactical-pairs failed to load: ${JSON.stringify(result.diagnostics)}`);
    }
    expect(result.warnings).toEqual([]);
  });

  it('reaches a two-participant Combat through real transitions', () => {
    const loaded = loadScenario(fixtureDir);
    if (!loaded.ok) throw new Error('tactical-pairs failed to load');
    const scenario = loaded.scenario;
    const encounter = scenario.encountersById['wolves-ambush'];
    expect(encounter?.participants.map((participant) => participant.id)).toEqual([
      'wolf-a',
      'wolf-b',
    ]);

    const started = startPlaythrough(scenario, 'hunter', 'Robin', silentRng());
    if (!started.ok) throw new Error('failed to start');
    let state: PlaythroughState = started.state;
    const submit = (action: Action): void => {
      const result = applyAction(scenario, state, action, silentRng());
      if (!result.ok) throw new Error(`action failed: ${JSON.stringify(action)}`);
      state = result.state;
    };
    submit({ kind: 'open-scene', sceneId: 'ambush', expectedStep: state.step });
    // Both wolves are steady, so opening Intent selection draws no dice.
    submit({ kind: 'choose', choiceId: 'confront', expectedStep: state.step });

    const arena = combatArena(scenario, state);
    expect(arena?.legalTargets).toEqual(['wolf-a', 'wolf-b']);
    expect(state.activeCombat?.round).toBe(1);
    // The Hunter starts below no thresholds here: a ranged bow, two
    // Consumables at full Health, and Distract available in the opening Round.
    const ids = arena?.actions.map((action) => action.id) ?? [];
    expect(ids).toContain('attack');
    expect(ids).toContain('distract');
    expect(ids).toContain('advance');
    expect(ids).toContain('escape');
    expect(arena?.actions.find((action) => action.id === 'use-item')?.enabled).toBe(false);
  });
});
