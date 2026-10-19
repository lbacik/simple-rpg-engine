// Illustration in `view` (docs/spec/ui.md, scene and location illustration;
// docs/spec/architecture.md, scenario assets): the active Scene or Location's
// Illustration is exposed as the asset URL with the registry width, height
// and alt. Entities without one carry no illustration.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  illustrationView,
  startPlaythrough,
  view,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';

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

describe('illustration in view', () => {
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
    const withoutIllustration: Scenario = {
      ...scenario,
      scenesById: {
        ...scenario.scenesById,
        arrival: { ...scenario.scenesById['arrival']!, illustration: undefined },
      },
    };
    const gameView = view(withoutIllustration, state);
    expect(gameView.kind).toBe('scene');
    if (gameView.kind !== 'scene') throw new Error('expected a Scene view');
    expect(gameView.sceneId).toBe('arrival');
    expect(gameView.illustration).toBeUndefined();
  });

  it('exposes the Ashford Location Illustration with the registry dimensions and catalog alt', () => {
    const { scenario, state: started } = startWoods();
    const registered = scenario.imagesById['loc-ashford'];
    expect(registered).toBeDefined();
    const location = view(scenario, { ...started, activeSceneId: null });
    expect(location.kind).toBe('location');
    if (location.kind !== 'location') throw new Error('expected a Location view');
    expect(location.illustration).toEqual({
      src: `/scenarios/whispering-woods/assets/${registered?.hash}/images/loc-ashford.png`,
      width: 640,
      height: 360,
      alt: registered?.alt,
    });
  });

  it('carries no illustration on a Location without one', () => {
    const { scenario, state: started } = startWoods();
    const withoutIllustration: Scenario = {
      ...scenario,
      locationsById: {
        ...scenario.locationsById,
        ashford: { ...scenario.locationsById['ashford']!, illustration: undefined },
      },
    };
    const location = view(withoutIllustration, { ...started, activeSceneId: null });
    expect(location.kind).toBe('location');
    if (location.kind !== 'location') throw new Error('expected a Location view');
    expect(location.illustration).toBeUndefined();
  });

  it('carries no illustration on Combat and Ending views', () => {
    const { scenario, state: started } = startWoods();
    const combat = view(scenario, {
      ...started,
      activeSceneId: null,
      activeCombat: {
        encounterId: 'camp-bandit',
        round: 1,
        startedParticipants: ['bandit-archer'],
        roundParticipantOrder: ['bandit-archer'],
        participants: { 'bandit-archer': { range: 'far', intent: 'strike', prepared: false } },
      },
    });
    expect(combat.kind).toBe('combat');
    expect('illustration' in combat).toBe(false);
    const ended = view(scenario, { ...started, status: 'ended', endingId: 'death' });
    expect(ended.kind).toBe('ended');
    expect('illustration' in ended).toBe(false);
  });
});

describe('illustrationView', () => {
  it('builds the Illustration view from a compiled image entry', () => {
    const { scenario } = startWoods();
    const registered = scenario.imagesById['chapel-altar'];
    expect(registered).toBeDefined();
    expect(illustrationView(scenario.id, registered)).toEqual({
      src: `/scenarios/whispering-woods/assets/${registered?.hash}/images/chapel-altar.png`,
      width: 640,
      height: 360,
      alt: 'A roofless stone chapel overgrown with ivy; on a cracked altar, a small silver disc catches a shaft of light.',
    });
  });

  it('matches the Illustration the Location and Scene views expose', () => {
    const { scenario, state: started } = startWoods();
    const viewing: PlaythroughState = {
      ...started,
      currentLocationId: 'ruined-chapel',
      activeSceneId: 'chapel-altar',
      visited: [...started.visited, 'ruined-chapel'],
      firedScenes: [...started.firedScenes, 'chapel-threshold', 'chapel-altar'],
    };
    const sceneView = view(scenario, viewing);
    if (sceneView.kind !== 'scene') throw new Error('expected a Scene view');
    const scene = scenario.scenesById['chapel-altar'];
    expect(sceneView.illustration).toEqual(
      illustrationView(scenario.id, scene?.illustration),
    );
    const locationView = view(scenario, { ...started, activeSceneId: null });
    if (locationView.kind !== 'location') throw new Error('expected a Location view');
    const location = scenario.locationsById['ashford'];
    expect(locationView.illustration).toEqual(
      illustrationView(scenario.id, location?.illustration),
    );
  });

  it('returns undefined without an image entry', () => {
    const { scenario } = startWoods();
    expect(illustrationView(scenario.id, undefined)).toBeUndefined();
  });
});
