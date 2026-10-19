// Illustration in `view` (docs/spec/ui.md, scene and location illustration;
// docs/spec/architecture.md, scenario assets): the active Scene or Location's
// Illustration is exposed as the asset URL with the registry width, height
// and alt. Entities without one carry no illustration.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkPlaythroughCompatibility } from '../src/content/compatibility';
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

  it('carries no illustration on Ending views', () => {
    const { scenario, state: started } = startWoods();
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

describe('layered loc-hunters-camp Illustration', () => {
  it('exposes the spec Motion on the hunters-camp Location view', () => {
    const { scenario, state: started } = startWoods();
    const registered = scenario.imagesById['loc-hunters-camp'];
    expect(registered).toBeDefined();
    const location = view(scenario, {
      ...started,
      currentLocationId: 'hunters-camp',
      activeSceneId: null,
      visited: [...started.visited, 'hunters-camp'],
    });
    expect(location.kind).toBe('location');
    if (location.kind !== 'location') throw new Error('expected a Location view');
    const illustration = location.illustration;
    expect(illustration).toBeDefined();
    // The upscaled Still, so the one-shot Camera push-in passes
    // `play/camera-low-resolution` (1600 × 100 / 110 = 1455 px).
    expect(illustration).toMatchObject({
      width: 1600,
      height: 900,
      showingKey: 'location:hunters-camp',
    });
    const layers = illustration?.layers ?? [];
    expect(layers).toHaveLength(4);
    // Sun shafts over the whole Still: multiply blend with Flicker.
    expect(layers[0]).toMatchObject({
      at: { x: 50, y: 50 },
      anchor: { x: 50, y: 50 },
      width: 100,
      blend: 'multiply',
      flicker: { depth: 40 },
    });
    expect(layers[0]).not.toHaveProperty('frames');
    expect(layers[0]).not.toHaveProperty('drift');
    // The crow standing on the stump, placed by its feet.
    expect(layers[1]).toMatchObject({
      frames: 8,
      fps: 4,
      anchor: { x: 50, y: 100 },
      at: { x: 33.4, y: 66.1 },
      width: 4,
      blend: 'normal',
      pixelWidth: 768,
      pixelHeight: 96,
    });
    expect(layers[1]).not.toHaveProperty('drift');
    // One-shot bird starting mid-picture.
    expect(layers[2]).toMatchObject({
      frames: 4,
      fps: 5,
      width: 4,
      drift: { from: { x: 38, y: 16 }, to: { x: 108, y: 9 }, duration: 14, delay: 1.5, loop: false },
    });
    // Looping bird sharing the one file.
    expect(layers[3]).toMatchObject({
      frames: 4,
      fps: 6,
      width: 3.2,
      drift: { from: { x: -5, y: 23 }, to: { x: 105, y: 19 }, duration: 24, delay: 8, loop: true },
    });
    // One-shot push-in towards the lean-to.
    expect(illustration?.camera).toEqual({
      from: { zoom: 100, x: 50, y: 50 },
      to: { zoom: 110, x: 30, y: 55 },
      duration: 18,
      delay: 0,
      loop: false,
    });
  });

  it('serves the shared bird file once under one Layer hash', () => {
    const { scenario, state: started } = startWoods();
    const location = view(scenario, {
      ...started,
      currentLocationId: 'hunters-camp',
      activeSceneId: null,
      visited: [...started.visited, 'hunters-camp'],
    });
    expect(location.kind).toBe('location');
    if (location.kind !== 'location') throw new Error('expected a Location view');
    const layers = location.illustration?.layers ?? [];
    expect(layers).toHaveLength(4);
    // Both birds draw from the same file: the client fetches it once, and the
    // 4 MiB Illustration budget counts it once.
    expect(layers[2]?.src).toBe(layers[3]?.src);
    expect(new Set(layers.map((layer) => layer.src)).size).toBe(3);
  });

  it('a pre-change Playthrough passes the reference check against the layered content', () => {
    const { scenario, state: started } = startWoods();
    // The content hash changed with the upscaled Still and the Layer files, but
    // the reference check is id-based: no Scene, Location, item or other id a
    // stored state points at moved.
    const stored: PlaythroughState = { ...started, contentHash: 'pre-motion-hash' };
    expect(checkPlaythroughCompatibility(scenario, stored)).toEqual({ ok: true });
  });
});
