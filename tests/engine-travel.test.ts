// Engine unit tests for the Travel action: legality, the step guard and the
// returned Journal entries (docs/spec/playthrough-state.md, actions).

import { describe, expect, it } from 'vitest';
import type { Scenario } from '../src/content/index';
import {
  applyAction,
  startPlaythrough,
  view,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';
import { loadCrossroadsScenario } from './fixtures/crossroads';

const rng: Rng = () => 1;

/** Three Locations: glade connects to grove (visible) and to cave (hidden
 * behind a flag). Grove connects back to glade. */
function loadFixture(): Scenario {
  return loadCrossroadsScenario();
}

function startAt(scenario: Scenario, locationId = 'glade'): PlaythroughState {
  const result = startPlaythrough(scenario, 'hunter', 'Robin', rng);
  if (!result.ok) throw new Error('fixture start failed');
  return { ...result.state, currentLocationId: locationId };
}

describe('travel', () => {
  it('moves along a visible connection, marks visited, appends travel and advances step', () => {
    const scenario = loadFixture();
    const state = startAt(scenario);
    const result = applyAction(
      scenario,
      state,
      { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
      rng,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.currentLocationId).toBe('grove');
    expect(result.state.visited).toEqual(['glade', 'grove']);
    expect(result.state.step).toBe(1);
    expect(result.journal).toEqual([{ type: 'travel', lang: 'en', to: 'grove', name: 'Grove' }]);
    // Everything else is untouched.
    expect(result.state.character).toEqual(state.character);
    expect(result.state.inventory).toEqual(state.inventory);
  });

  it('does not duplicate an already visited location', () => {
    const scenario = loadFixture();
    const state = startAt(scenario);
    const first = applyAction(
      scenario,
      state,
      { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
      rng,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyAction(
      scenario,
      first.state,
      { kind: 'travel', targetLocationId: 'glade', expectedStep: 1 },
      rng,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.currentLocationId).toBe('glade');
    expect(second.state.visited).toEqual(['glade', 'grove']);
    expect(second.state.step).toBe(2);
  });

  it('rejects a stale expected step without changing anything', () => {
    const scenario = loadFixture();
    const state = startAt(scenario);
    const result = applyAction(
      scenario,
      state,
      { kind: 'travel', targetLocationId: 'grove', expectedStep: 7 },
      rng,
    );
    expect(result).toEqual({ ok: false, reason: 'stale-step' });
  });

  it('rejects a hidden connection target as illegal', () => {
    const scenario = loadFixture();
    const state = startAt(scenario);
    const result = applyAction(
      scenario,
      state,
      { kind: 'travel', targetLocationId: 'cave', expectedStep: 0 },
      rng,
    );
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
  });

  it('rejects an unknown target as illegal', () => {
    const scenario = loadFixture();
    const state = startAt(scenario);
    expect(
      applyAction(
        scenario,
        state,
        { kind: 'travel', targetLocationId: 'nowhere', expectedStep: 0 },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'illegal-action' });
  });

  it('rejects travel that does not start from the current location', () => {
    const scenario = loadFixture();
    // From the glade there is no direct path back from the cave side: the
    // cave is not adjacent, so it is illegal even though it exists.
    const travelled = applyAction(
      scenario,
      startAt(scenario, 'grove'),
      { kind: 'travel', targetLocationId: 'cave', expectedStep: 0 },
      rng,
    );
    expect(travelled).toEqual({ ok: false, reason: 'illegal-action' });
  });

  it('rejects travel while a scene is active or after the end', () => {
    const scenario = loadFixture();
    const sceneState: PlaythroughState = { ...startAt(scenario), activeSceneId: 'some-scene' };
    expect(
      applyAction(
        scenario,
        sceneState,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'illegal-action' });

    const endedState: PlaythroughState = { ...startAt(scenario), status: 'ended', endingId: 'death' };
    expect(
      applyAction(
        scenario,
        endedState,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'ended' });
  });
});

describe('travel view', () => {
  it('lists one exit per visible connection in authored order with labels', () => {
    const scenario = loadFixture();
    const gameView = view(scenario, startAt(scenario));
    expect(gameView).toEqual({
      kind: 'location',
      locationId: 'glade',
      name: 'Glade',
      description: 'Sunlight through leaves.',
      exits: [{ targetLocationId: 'grove', label: 'Walk to the grove' }],
      onDemandScenes: [],
      map: {
        nodes: [
          {
            id: 'glade',
            name: 'Glade',
            x: 10,
            y: 20,
            status: 'visited',
            isCurrent: true,
            isTravelTarget: false,
            hasAuthorCoordinates: true,
          },
        ],
        edges: [],
        currentLocationId: 'glade',
        travelTargetIds: ['grove'],
      },
    });
  });

  it('labels an exit with the target name when the connection has no label', () => {
    const scenario = loadFixture();
    const travelled = applyAction(
      scenario,
      startAt(scenario),
      { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
      rng,
    );
    expect(travelled.ok).toBe(true);
    if (!travelled.ok) return;
    expect(view(scenario, travelled.state)).toEqual({
      kind: 'location',
      locationId: 'grove',
      name: 'Grove',
      description: 'Old oaks crowd close.',
      exits: [{ targetLocationId: 'glade', label: 'Glade' }],
      onDemandScenes: [{ sceneId: 'path', title: 'Path' }],
      map: {
        nodes: [
          {
            id: 'glade',
            name: 'Glade',
            x: 10,
            y: 20,
            status: 'visited',
            isCurrent: false,
            isTravelTarget: true,
            hasAuthorCoordinates: true,
          },
          {
            id: 'grove',
            name: 'Grove',
            x: 30,
            y: 40,
            status: 'visited',
            isCurrent: true,
            isTravelTarget: false,
            hasAuthorCoordinates: true,
          },
        ],
        edges: [{ from: 'glade', to: 'grove', twoWay: true }],
        currentLocationId: 'grove',
        travelTargetIds: ['glade'],
      },
    });
  });

  it('shows the gated exit once its flag is set', () => {
    const scenario = loadFixture();
    const flagged: PlaythroughState = { ...startAt(scenario), flags: ['gate-open'] };
    const gameView = view(scenario, flagged);
    expect(gameView.kind).toBe('location');
    if (gameView.kind !== 'location') return;
    expect(gameView.exits).toEqual([
      { targetLocationId: 'grove', label: 'Walk to the grove' },
      { targetLocationId: 'cave', label: 'Enter the cave' },
    ]);
    const travelled = applyAction(
      scenario,
      flagged,
      { kind: 'travel', targetLocationId: 'cave', expectedStep: 0 },
      rng,
    );
    expect(travelled.ok).toBe(true);
  });
});
