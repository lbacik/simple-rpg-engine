// Scene illustration in `view` (docs/spec/ui.md, scene illustration;
// docs/spec/architecture.md, scenario assets): the active Scene's Illustration
// is exposed as the asset URL with the registry width, height and alt. Scenes
// without one carry no illustration, and no other view does.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import { startPlaythrough, view, type PlaythroughState, type Rng } from '../src/engine/index';

const rng: Rng = () => 1;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadWoods(): Scenario {
  const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
  if (!result.ok) {
    throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function startWoods(name = 'Robin', templateId = 'hunter'): { scenario: Scenario; state: PlaythroughState } {
  const scenario = loadWoods();
  const result = startPlaythrough(scenario, templateId, name, rng);
  if (!result.ok) throw new Error(`start failed: ${result.reason}`);
  return { scenario, state: result.state };
}

describe('scene illustration in view', () => {
  it('exposes the chapel altar Illustration with the registry dimensions and catalog alt', () => {
    const { scenario, state: started } = startWoods();
    const registered = scenario.imagesById['chapel-altar'];
    expect(registered).toBeDefined();
    const viewing: PlaythroughState = {
      ...started,
      currentLocationId: 'ruined-chapel',
      activeSceneId: 'chapel-altar',
      visited: [...started.visited, 'ruined-chapel'],
      firedScenes: [...started.firedScenes, 'chapel-threshold', 'chapel-altar'],
    };
    const gameView = view(scenario, viewing);
    expect(gameView.kind).toBe('scene');
    if (gameView.kind !== 'scene') throw new Error('expected a Scene view');
    expect(gameView.illustration).toEqual({
      src: `/scenarios/whispering-woods/assets/${registered?.hash}/images/chapel-altar.png`,
      width: 640,
      height: 360,
      alt: 'A roofless stone chapel overgrown with ivy; on a cracked altar, a small silver disc catches a shaft of light.',
    });
  });

  it('carries no illustration on a Scene without one', () => {
    const { scenario, state } = startWoods();
    const gameView = view(scenario, state);
    expect(gameView.kind).toBe('scene');
    if (gameView.kind !== 'scene') throw new Error('expected a Scene view');
    expect(gameView.sceneId).toBe('arrival');
    expect(gameView.illustration).toBeUndefined();
  });

  it('carries no illustration on Location, Combat and Ending views', () => {
    const { scenario, state: started } = startWoods();
    const location = view(scenario, { ...started, activeSceneId: null });
    expect(location.kind).toBe('location');
    expect('illustration' in location).toBe(false);
    const combat = view(scenario, {
      ...started,
      activeSceneId: null,
      activeCombat: { encounterId: 'camp-bandit', range: 'far', round: 1 },
    });
    expect(combat.kind).toBe('combat');
    expect('illustration' in combat).toBe(false);
    const ended = view(scenario, { ...started, status: 'ended', endingId: 'death' });
    expect(ended.kind).toBe('ended');
    expect('illustration' in ended).toBe(false);
  });
});
