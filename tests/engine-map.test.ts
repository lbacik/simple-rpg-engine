// Engine unit tests for the Location map derivation: fallback placement and
// node/line derivation (docs/spec/ui.md, location-map;
// docs/spec/content-semantics.md, discovery).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  deriveMap,
  resolveMapPositions,
  startPlaythrough,
  view,
  type MapView,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';

const rng: Rng = () => 1;

function write(scenarioDir: string, relative: string, content: string): void {
  const full = path.join(scenarioDir, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/**
 * Five Locations: home <-> lane is a two-way pair, lane -> field is one-way
 * to a Location without `map` coordinates, home -> tower is hidden behind a
 * flag, and the isle is isolated without coordinates (unreachable warning).
 */
function loadFixture(): Scenario {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-map-'));
  const scenarioDir = path.join(dir, 'mapworld');
  write(
    scenarioDir,
    'scenario.yaml',
    [
      'schemaVersion: 1',
      'id: mapworld',
      'title: Mapworld',
      'description: A world for map tests.',
      'version: "1.0.0"',
      'language: en',
      'startLocation: home',
      'deathEnding: death',
      'flags: [gate-open]',
      'locations:',
      '  - locations/home.yaml',
      '  - locations/lane.yaml',
      '  - locations/field.yaml',
      '  - locations/tower.yaml',
      '  - locations/gap.yaml',
      '  - locations/isle.yaml',
      'scenes:',
      '  - scenes/path.yaml',
      'templates:',
      '  - templates.yaml',
      'endings:',
      '  - endings.yaml',
      'items:',
      '  - items.yaml',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/home.yaml',
    [
      'id: home',
      'name: Home',
      'description: Where the hearth is.',
      'map: { x: 10, y: 20 }',
      'connections:',
      '  - to: lane',
      '    label: Down the lane',
      '  - to: tower',
      '    label: Climb the tower',
      '    when: { flag: gate-open }',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/lane.yaml',
    [
      'id: lane',
      'name: Lane',
      'description: A dusty lane.',
      'map: { x: 30, y: 40 }',
      'scenes: [path]',
      'connections:',
      '  - to: home',
      '  - to: field',
      '    label: Across the field',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/field.yaml',
    [
      'id: field',
      'name: Field',
      'description: Waving grass.',
      'connections:',
      '  - to: lane',
      '    label: Back to the lane',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/tower.yaml',
    [
      'id: tower',
      'name: Tower',
      'description: A tall tower.',
      'map: { x: 70, y: 80 }',
      'connections:',
      '  - to: home',
      '    label: Back down',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/gap.yaml',
    [
      'id: gap',
      'name: Gap',
      'description: Between here and there.',
      'connections:',
      '  - to: home',
      '  - to: lane',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/isle.yaml',
    [
      'id: isle',
      'name: Isle',
      'description: Far away across the water.',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'scenes/path.yaml',
    [
      'id: path',
      'title: Path',
      'trigger: on-demand',
      'text: A path leads home.',
      'choices:',
      '  - id: go',
      '    text: Go home.',
      '    outcome:',
      '      end: home',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'items.yaml',
    '- id: sword\n  kind: equipment\n  name: Sword\n  slot: weapon\n  damage: 3\n',
  );
  write(
    scenarioDir,
    'templates.yaml',
    '- id: hunter\n  name: Hunter\n  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }\n  items:\n    - { item: sword }\n',
  );
  write(
    scenarioDir,
    'endings.yaml',
    '- id: death\n  kind: defeat\n  title: Gone\n  text: The end.\n- id: home\n  kind: victory\n  title: Home\n  text: You made it.\n',
  );
  const result = loadScenario(scenarioDir);
  if (!result.ok) {
    throw new Error(`fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function startAt(
  scenario: Scenario,
  overrides: Partial<PlaythroughState> = {},
): PlaythroughState {
  const result = startPlaythrough(scenario, 'hunter', 'Robin', rng);
  if (!result.ok) throw new Error('fixture start failed');
  return { ...result.state, ...overrides };
}

function nodeById(map: MapView, id: string) {
  const node = map.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(`expected node "${id}" on the map`);
  return node;
}

describe('fallback placement', () => {
  it('keeps author coordinates when present', () => {
    const positions = resolveMapPositions(loadFixture());
    expect(positions['home']).toEqual({ x: 10, y: 20, hasAuthorCoordinates: true });
    expect(positions['lane']).toEqual({ x: 30, y: 40, hasAuthorCoordinates: true });
  });

  it('places a Location without coordinates near the average of its neighbours', () => {
    // The gap connects to home (10, 20) and lane (30, 40) with nothing back.
    const positions = resolveMapPositions(loadFixture());
    expect(positions['gap']).toEqual({ x: 20, y: 30, hasAuthorCoordinates: false });
    // The field's only neighbour with coordinates is lane.
    expect(positions['field']).toEqual({ x: 30, y: 40, hasAuthorCoordinates: false });
  });

  it('places an isolated Location without coordinates in the centre', () => {
    const positions = resolveMapPositions(loadFixture());
    expect(positions['isle']).toEqual({ x: 50, y: 50, hasAuthorCoordinates: false });
  });
});

describe('map nodes', () => {
  it('shows exactly the visited Locations at their author coordinates', () => {
    const scenario = loadFixture();
    const map = deriveMap(scenario, startAt(scenario, { visited: ['home', 'lane'] }));
    expect(map.nodes.map((node) => node.id)).toEqual(['home', 'lane']);
    expect(nodeById(map, 'home')).toMatchObject({
      name: 'Home',
      x: 10,
      y: 20,
      status: 'visited',
      isCurrent: true,
      hasAuthorCoordinates: true,
    });
    expect(nodeById(map, 'lane')).toMatchObject({
      status: 'visited',
      isCurrent: false,
    });
  });

  it('marks the current Location', () => {
    const scenario = loadFixture();
    const map = deriveMap(
      scenario,
      startAt(scenario, { visited: ['home', 'lane'], currentLocationId: 'lane' }),
    );
    expect(nodeById(map, 'lane').isCurrent).toBe(true);
    expect(nodeById(map, 'home').isCurrent).toBe(false);
    expect(map.currentLocationId).toBe('lane');
  });

  it('draws a revealed but unvisited Location as heard of, with no line to it', () => {
    const scenario = loadFixture();
    const map = deriveMap(
      scenario,
      startAt(scenario, { visited: ['home', 'lane'], revealed: ['tower'] }),
    );
    // home -> tower is hidden without the flag, so no known Connection leads
    // there and no line is drawn.
    expect(nodeById(map, 'tower')).toMatchObject({ status: 'revealed', x: 70, y: 80 });
    expect(map.edges.some((edge) => edge.from === 'tower' || edge.to === 'tower')).toBe(
      false,
    );
  });
});

describe('map lines', () => {
  it('draws a two-way pair as one plain line', () => {
    const scenario = loadFixture();
    const map = deriveMap(scenario, startAt(scenario, { visited: ['home', 'lane'] }));
    expect(map.edges).toEqual([{ from: 'home', to: 'lane', twoWay: true }]);
  });

  it('draws a lone one-way Connection as an arrow', () => {
    const scenario = loadFixture();
    const map = deriveMap(
      scenario,
      startAt(scenario, {
        visited: ['home', 'lane'],
        flags: ['gate-open'],
        revealed: ['field'],
      }),
      { includeUnknownExits: true },
    );
    // lane -> field has no return, so it stays a lone arrow to the "?" node.
    expect(map.edges).toContainEqual({ from: 'lane', to: 'field', twoWay: false });
    // home <-> lane is still a single merged line.
    expect(
      map.edges.filter(
        (edge) =>
          (edge.from === 'home' && edge.to === 'lane') ||
          (edge.from === 'lane' && edge.to === 'home'),
      ),
    ).toEqual([{ from: 'home', to: 'lane', twoWay: true }]);
  });

  it('does not draw hidden Connections', () => {
    const scenario = loadFixture();
    const map = deriveMap(
      scenario,
      startAt(scenario, { visited: ['home', 'lane'] }),
      { includeUnknownExits: true },
    );
    expect(map.edges.some((edge) => edge.to === 'tower')).toBe(false);
    expect(map.nodes.some((node) => node.id === 'tower')).toBe(false);
  });
});

describe('unvisited exit targets ("?" setting)', () => {
  it('are not drawn by default', () => {
    const scenario = loadFixture();
    const map = deriveMap(
      scenario,
      startAt(scenario, { visited: ['home'], flags: ['gate-open'] }),
    );
    expect(map.nodes.map((node) => node.id)).toEqual(['home']);
  });

  it('appear as "?" nodes when enabled', () => {
    const scenario = loadFixture();
    const map = deriveMap(
      scenario,
      startAt(scenario, { visited: ['home'], flags: ['gate-open'] }),
      { includeUnknownExits: true },
    );
    // lane and tower are visible exits whose targets are unvisited: "?" nodes.
    // The field is two steps away, so it stays off the map.
    expect(map.nodes.map((node) => node.id)).toEqual(['home', 'lane', 'tower']);
    expect(nodeById(map, 'lane')).toMatchObject({ status: 'unknown' });
    expect(nodeById(map, 'tower')).toMatchObject({ status: 'unknown' });
    expect(map.edges).toContainEqual({ from: 'home', to: 'tower', twoWay: false });
  });
});

describe('travel targets', () => {
  it('highlights the visible exits of the current Location', () => {
    const scenario = loadFixture();
    const state = startAt(scenario, { visited: ['home'] });
    const map = deriveMap(scenario, state);
    expect(map.travelTargetIds).toEqual(['lane']);
    expect(nodeById(map, 'home').isTravelTarget).toBe(false);
  });

  it('matches the exit buttons one for one', () => {
    const scenario = loadFixture();
    const state = startAt(scenario, {
      visited: ['home'],
      flags: ['gate-open'],
      currentLocationId: 'home',
    });
    const gameView = view(scenario, state, { includeUnknownExits: true });
    expect(gameView.kind).toBe('location');
    if (gameView.kind !== 'location') return;
    expect(gameView.map.travelTargetIds).toEqual(
      gameView.exits.map((exit) => exit.targetLocationId),
    );
    expect(gameView.exits.map((exit) => exit.targetLocationId)).toEqual([
      'lane',
      'tower',
    ]);
  });

  it('is empty while a Scene is active, or after the end', () => {
    const scenario = loadFixture();
    const base = startAt(scenario, { visited: ['home'] });
    expect(deriveMap(scenario, base).travelTargetIds).toEqual(['lane']);
    expect(
      deriveMap(scenario, { ...base, activeSceneId: 'path' }).travelTargetIds,
    ).toEqual([]);
    expect(
      deriveMap(scenario, { ...base, status: 'ended', endingId: 'death' })
        .travelTargetIds,
    ).toEqual([]);
  });
});

describe('view carries the map', () => {
  it('includes nodes, lines and travel targets in the Location view', () => {
    const scenario = loadFixture();
    const gameView = view(scenario, startAt(scenario, { visited: ['home', 'lane'] }));
    expect(gameView.kind).toBe('location');
    if (gameView.kind !== 'location') return;
    expect(gameView.map.nodes.map((node) => node.id)).toEqual(['home', 'lane']);
    expect(gameView.map.edges).toEqual([{ from: 'home', to: 'lane', twoWay: true }]);
    expect(gameView.map.travelTargetIds).toEqual(['lane']);
  });
});

describe('whispering-woods', () => {
  function loadWoods(): Scenario {
    const result = loadScenario(path.join(process.cwd(), 'scenarios', 'whispering-woods'));
    if (!result.ok) {
      throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
    }
    return result.scenario;
  }

  it('shows exactly the visited Locations at their author coordinates', () => {
    const scenario = loadWoods();
    const template = scenario.templates[0];
    if (template === undefined) throw new Error('whispering-woods has no template');
    const started = startPlaythrough(scenario, template.id, 'Robin', rng);
    if (!started.ok) throw new Error('whispering-woods start failed');
    const state: PlaythroughState = {
      ...started.state,
      currentLocationId: 'forest-edge',
      activeSceneId: null,
      visited: ['ashford', 'forest-edge', 'hunters-camp'],
      revealed: ['ruined-chapel'],
    };
    const gameView = view(scenario, state);
    expect(gameView.kind).toBe('location');
    if (gameView.kind !== 'location') return;
    expect(gameView.map.nodes.map((node) => node.id)).toEqual([
      'ashford',
      'forest-edge',
      'hunters-camp',
      'ruined-chapel',
    ]);
    expect(nodeById(gameView.map, 'ashford')).toMatchObject({ x: 15, y: 60 });
    expect(nodeById(gameView.map, 'forest-edge')).toMatchObject({ x: 38, y: 50 });
    expect(nodeById(gameView.map, 'hunters-camp')).toMatchObject({ x: 42, y: 20 });
    // Revealed but unvisited: heard of, at author coordinates, with no line.
    expect(nodeById(gameView.map, 'ruined-chapel')).toMatchObject({
      status: 'revealed',
      x: 75,
      y: 38,
    });
    expect(
      gameView.map.edges.some(
        (edge) => edge.from === 'ruined-chapel' || edge.to === 'ruined-chapel',
      ),
    ).toBe(false);
  });
});
