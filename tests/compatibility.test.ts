// Content compatibility by reference check (ADR 0001,
// docs/spec/architecture.md, content compatibility): every content id in the
// stored state still exists with the right type, equipped items are still
// Equipment of their slot, and an active Combat's Enemy still has more
// maximum Health than the Damage taken. A changed trigger or Location
// membership never fails. Passing reads update the pin; failing reads (or a
// missing Scenario) are incompatible and reject every action.

import { describe, expect, it } from 'vitest';
import { checkPlaythroughCompatibility } from '../src/content/index';
import type { Scenario } from '../src/content/index';
import { startPlaythrough, type Rng } from '../src/engine/index';
import type { PlaythroughState } from '../src/engine/state';
import { executeTurn } from '../src/app/lib/turn';
import { resolvePlaythrough } from '../src/app/lib/playthrough';
import {
  migrateDatabase,
  openDatabase,
  PlaythroughStore,
} from '../src/persistence/index';
import { loadCrossroadsScenario } from './fixtures/crossroads';

const rng: Rng = () => 1;
const SESSION = 'session-hash-compat';

function stubScenario(): Scenario {
  return {
    id: 'test',
    dir: '/tmp/test',
    title: 'Test',
    description: 'A stub.',
    version: '1.0.0',
    language: 'en',
    startLocation: { id: 'glade' },
    deathEnding: { id: 'death' },
    flags: ['gate-open'],
    locationsById: { glade: { id: 'glade' }, grove: { id: 'grove' } },
    scenesById: {
      path: {
        id: 'path',
        choices: [{ id: 'go' }, { id: 'open' }],
      },
    },
    itemsById: {
      sword: { id: 'sword', kind: 'equipment', slot: 'weapon' },
      cloak: { id: 'cloak', kind: 'equipment', slot: 'outfit' },
      herbs: { id: 'herbs', kind: 'consumable' },
      charm: { id: 'charm', kind: 'key' },
    },
    enemiesById: { wolf: { id: 'wolf' } },
    encountersById: {
      enc1: { id: 'enc1', participants: [{ id: 'wolf', enemy: { id: 'wolf', name: 'Wolf', health: 6 } }] },
    },
    templatesById: { hunter: { id: 'hunter' } },
    endingsById: { death: { id: 'death' }, home: { id: 'home' } },
  } as unknown as Scenario;
}

function baseState(): PlaythroughState {
  return {
    stateVersion: 2,
    scenarioId: 'test',
    scenarioVersion: '0.9.0',
    contentHash: 'stale-hash',
    status: 'active',
    step: 0,
    character: {
      templateId: 'hunter',
      name: 'Robin',
      baseAttributes: { might: 1, agility: 3, wits: 2, presence: 0 },
      health: 12,
    },
    inventory: { sword: 1, herbs: 2 },
    equipment: { weapon: 'sword' },
    currentLocationId: 'glade',
    activeSceneId: null,
    visited: ['glade'],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounters: {},
  };
}

describe('checkPlaythroughCompatibility', () => {
  it('passes when every stored id still exists with the right type', () => {
    const scenario = stubScenario();
    const state: PlaythroughState = {
      ...baseState(),
      activeSceneId: 'path',
      visited: ['glade', 'grove'],
      revealed: ['grove'],
      firedScenes: ['path'],
      takenOnceChoices: [{ sceneId: 'path', choiceId: 'go' }],
      flags: ['gate-open'],
      encounters: { enc1: { wolf: 2 } },
    };
    expect(checkPlaythroughCompatibility(scenario, state)).toEqual({ ok: true });
  });

  it.each([
    ['current location', { currentLocationId: 'renamed' }],
    ['visited location', { visited: ['glade', 'renamed'] }],
    ['revealed location', { revealed: ['renamed'] }],
    ['active scene', { activeSceneId: 'renamed' }],
    ['fired scene', { firedScenes: ['renamed'] }],
    ['taken choice scene', { takenOnceChoices: [{ sceneId: 'renamed', choiceId: 'go' }] }],
    ['taken choice id', { takenOnceChoices: [{ sceneId: 'path', choiceId: 'renamed' }] }],
    ['encounter record', { encounters: { renamed: { wolf: 1 } } }],
    ['held item', { inventory: { renamed: 1 } }],
    ['equipped item', { equipment: { weapon: 'renamed' } }],
    ['flag', { flags: ['renamed'] }],
    ['template', { characterTemplate: 'renamed' }],
    ['ending', { endingId: 'renamed' }],
  ])('fails on a renamed %s', (_label, patch) => {
    const scenario = stubScenario();
    const state = baseState();
    if ('characterTemplate' in patch) {
      state.character = { ...state.character, templateId: 'renamed' };
    } else {
      Object.assign(state, patch);
    }
    const result = checkPlaythroughCompatibility(scenario, state);
    expect(result.ok).toBe(false);
  });

  it('fails on an unknown equipment slot', () => {
    const scenario = stubScenario();
    const state = { ...baseState(), equipment: { helm: 'sword' } } as unknown as PlaythroughState;
    expect(checkPlaythroughCompatibility(scenario, state).ok).toBe(false);
  });

  it('fails when an equipped item is no longer Equipment of its slot', () => {
    const scenario = stubScenario();
    // A consumable in the weapon slot.
    expect(
      checkPlaythroughCompatibility(scenario, { ...baseState(), equipment: { weapon: 'herbs' } }).ok,
    ).toBe(false);
    // Equipment of a different slot.
    expect(
      checkPlaythroughCompatibility(scenario, { ...baseState(), equipment: { outfit: 'sword' } }).ok,
    ).toBe(false);
  });

  it('ignores a changed trigger or Location membership of the active Scene', () => {
    const scenario = loadCrossroadsScenario();
    const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
    if (!started.ok) throw new Error('fixture start failed');
    const state: PlaythroughState = {
      ...started.state,
      activeSceneId: 'path',
      firedScenes: ['path'],
    };
    // Rewrite the active Scene's trigger and drop it from its Location.
    const edited = structuredClone(scenario) as unknown as {
      scenesById: Record<string, { trigger?: string }>;
      locationsById: Record<string, { scenes: { id: string }[] }>;
    };
    edited.scenesById['path'] = { ...edited.scenesById['path'], trigger: 'on-enter' };
    for (const location of Object.values(edited.locationsById)) {
      location.scenes = (location.scenes ?? []).filter((scene) => scene.id !== 'path');
    }
    expect(checkPlaythroughCompatibility(edited as unknown as Scenario, state)).toEqual({
      ok: true,
    });
    // Control: renaming the Scene id does fail.
    const renamed = structuredClone(scenario);
    const scene = (renamed.scenesById as Record<string, { id: string }>)['path'];
    if (scene) scene.id = 'renamed';
    (renamed.scenesById as Record<string, unknown>)['renamed'] = scene;
    delete (renamed.scenesById as Record<string, unknown>)['path'];
    expect(checkPlaythroughCompatibility(renamed, state).ok).toBe(false);
  });
});

describe('executeTurn with changed content', () => {
  it('a narration-only change keeps the Playthrough playable and updates the pin', async () => {
    const scenario = loadCrossroadsScenario();
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
      if (!started.ok) throw new Error('fixture start failed');
      const stale = {
        ...started.state,
        scenarioVersion: '0.9.0',
        contentHash: 'stale-hash',
      };
      await new PlaythroughStore(db).create(
        {
          id: 'pt-typo',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: '0.9.0',
          contentHash: 'stale-hash',
          status: stale.status,
          step: stale.step,
          state: stale,
        },
        [],
      );
      const load = (id: string): Scenario | undefined =>
        id === scenario.id ? scenario : undefined;
      const result = await executeTurn(
        db,
        load,
        'pt-typo',
        SESSION,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        rng,
      );
      expect(result).toEqual({ ok: true, step: 1 });
      const stored = await new PlaythroughStore(db).findById('pt-typo');
      expect(stored?.contentHash).toBe(scenario.contentHash);
      expect(stored?.scenarioVersion).toBe(scenario.version);
      expect((stored?.state as PlaythroughState).contentHash).toBe(scenario.contentHash);
    } finally {
      await db.destroy();
    }
  });

  it('a renamed current Location makes the Playthrough incompatible and changes nothing', async () => {
    const scenario = loadCrossroadsScenario();
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
      if (!started.ok) throw new Error('fixture start failed');
      const state: PlaythroughState = {
        ...started.state,
        currentLocationId: 'renamed',
        contentHash: 'stale-hash',
      };
      await new PlaythroughStore(db).create(
        {
          id: 'pt-renamed',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: '0.9.0',
          contentHash: 'stale-hash',
          status: state.status,
          step: state.step,
          state,
        },
        [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'You wake at the crossroads.' } }],
      );
      const load = (id: string): Scenario | undefined =>
        id === scenario.id ? scenario : undefined;
      const result = await executeTurn(
        db,
        load,
        'pt-renamed',
        SESSION,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        rng,
      );
      expect(result).toEqual({ ok: false, reason: 'incompatible' });
      const store = new PlaythroughStore(db);
      expect((await store.findById('pt-renamed'))?.step).toBe(0);
      // The Journal stays complete.
      expect((await store.listJournal('pt-renamed')).map((entry) => entry.type)).toEqual(['intro']);
    } finally {
      await db.destroy();
    }
  });

  it('a removed Scenario makes the Playthrough incompatible', async () => {
    const scenario = loadCrossroadsScenario();
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
      if (!started.ok) throw new Error('fixture start failed');
      await new PlaythroughStore(db).create(
        {
          id: 'pt-gone',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          contentHash: scenario.contentHash,
          status: started.state.status,
          step: started.state.step,
          state: started.state,
        },
        [],
      );
      const result = await executeTurn(
        db,
        () => undefined,
        'pt-gone',
        SESSION,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        rng,
      );
      expect(result).toEqual({ ok: false, reason: 'incompatible' });
    } finally {
      await db.destroy();
    }
  });
});

describe('resolvePlaythrough', () => {
  it('updates the pin on a passing read and reports incompatibility otherwise', async () => {
    const scenario = loadCrossroadsScenario();
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const store = new PlaythroughStore(db);
      const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
      if (!started.ok) throw new Error('fixture start failed');
      const stale = { ...started.state, contentHash: 'stale-hash' };
      await store.create(
        {
          id: 'pt-read',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: '0.9.0',
          contentHash: 'stale-hash',
          status: stale.status,
          step: stale.step,
          state: stale,
        },
        [],
      );
      const load = (id: string): Scenario | undefined =>
        id === scenario.id ? scenario : undefined;
      const passing = await resolvePlaythrough(db, load, 'pt-read', SESSION);
      expect(passing?.compatible).toBe(true);
      expect((await store.findById('pt-read'))?.contentHash).toBe(scenario.contentHash);

      const broken: PlaythroughState = {
        ...started.state,
        currentLocationId: 'renamed',
        contentHash: 'stale-hash',
      };
      await store.create(
        {
          id: 'pt-broken',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: '0.9.0',
          contentHash: 'stale-hash',
          status: broken.status,
          step: broken.step,
          state: broken,
        },
        [],
      );
      const failing = await resolvePlaythrough(db, load, 'pt-broken', SESSION);
      expect(failing?.compatible).toBe(false);
      if (failing && !failing.compatible) expect(failing.scenario?.id).toBe(scenario.id);

      const gone = await resolvePlaythrough(db, () => undefined, 'pt-read', SESSION);
      expect(gone?.compatible).toBe(false);
      if (gone && !gone.compatible) expect(gone.scenario).toBeUndefined();

      expect(await resolvePlaythrough(db, load, 'pt-read', 'other-session')).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('reports the fresh row when a turn commits between the read and the pin update', async () => {
    const scenario = loadCrossroadsScenario();
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const store = new PlaythroughStore(db);
      const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
      if (!started.ok) throw new Error('fixture start failed');
      const stale = { ...started.state, contentHash: 'stale-hash' };
      await store.create(
        {
          id: 'pt-race',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: '0.9.0',
          contentHash: 'stale-hash',
          status: stale.status,
          step: stale.step,
          state: stale,
        },
        [],
      );
      // A turn commits after the page read but before its pin update: the
      // guarded update finds no row at the old step and leaves the turn alone.
      const read = await store.findById('pt-race');
      if (!read) throw new Error('missing playthrough');
      const readState = read.state as PlaythroughState;
      const advanced = { ...readState, step: readState.step + 1 };
      expect(
        await store.updateIfStepMatches('pt-race', read.step, {
          state: advanced,
          step: advanced.step,
          status: advanced.status,
        }),
      ).toBe(true);
      const repinned = {
        ...readState,
        scenarioVersion: scenario.version,
        contentHash: scenario.contentHash,
      };
      expect(await store.updatePin('pt-race', repinned, read.step)).toBe(false);
      const stored = await store.findById('pt-race');
      expect(stored?.step).toBe(advanced.step);
      expect(stored?.contentHash).toBe('stale-hash');
      // A fresh read pins cleanly.
      const fresh = await store.findById('pt-race');
      if (!fresh) throw new Error('missing playthrough');
      const freshPin = {
        ...(fresh.state as PlaythroughState),
        scenarioVersion: scenario.version,
        contentHash: scenario.contentHash,
      };
      expect(await store.updatePin('pt-race', freshPin, fresh.step)).toBe(true);
      expect((await store.findById('pt-race'))?.contentHash).toBe(scenario.contentHash);
    } finally {
      await db.destroy();
    }
  });
});
