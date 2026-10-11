// Content compatibility by reference check (ADR 0001,
// docs/spec/architecture.md, content compatibility): every content id in the
// stored state still exists with the right type, equipped items are still
// Equipment of their slot, and an active Combat's Enemy still has more
// maximum Health than the Damage taken. A changed trigger or Location
// membership never fails. Passing reads update the pin; failing reads (or a
// missing Scenario) are incompatible and reject every action.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { checkPlaythroughCompatibility } from '../src/content/index';
import type { Scenario } from '../src/content/index';
import { startPlaythrough, type Rng } from '../src/engine/index';
import type { PlaythroughState } from '../src/engine/state';
import { executeTurn } from '../src/app/lib/turn';
import { resolvePlaythrough } from '../src/app/lib/playthrough';
import { latestEndingEntry } from '../src/app/lib/journal';
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
      enc1: { id: 'enc1', enemy: { id: 'wolf', name: 'Wolf', health: 6 } },
    },
    templatesById: { hunter: { id: 'hunter' } },
    endingsById: { death: { id: 'death' }, home: { id: 'home' } },
  } as unknown as Scenario;
}

function baseState(): PlaythroughState {
  return {
    stateVersion: 1,
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
    activeCombat: null,
    visited: ['glade'],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounterDamage: {},
  };
}

describe('checkPlaythroughCompatibility', () => {
  it('passes when every stored id still exists with the right type', () => {
    const scenario = stubScenario();
    const state: PlaythroughState = {
      ...baseState(),
      activeSceneId: 'path',
      activeCombat: { encounterId: 'enc1', range: 'near', round: 2 },
      visited: ['glade', 'grove'],
      revealed: ['grove'],
      firedScenes: ['path'],
      takenOnceChoices: [{ sceneId: 'path', choiceId: 'go' }],
      flags: ['gate-open'],
      encounterDamage: { enc1: 2 },
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
    ['active encounter', { activeCombat: { encounterId: 'renamed', range: 'near', round: 1 } }],
    ['encounter record', { encounterDamage: { renamed: 1 } }],
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

  it('fails an active Combat whose Enemy no longer outlasts the Damage taken', () => {
    const scenario = stubScenario();
    const combat = { encounterId: 'enc1', range: 'near' as const, round: 1 };
    expect(
      checkPlaythroughCompatibility(scenario, {
        ...baseState(),
        activeCombat: combat,
        encounterDamage: { enc1: 6 },
      }).ok,
    ).toBe(false);
    expect(
      checkPlaythroughCompatibility(scenario, {
        ...baseState(),
        activeCombat: combat,
        encounterDamage: { enc1: 5 },
      }),
    ).toEqual({ ok: true });
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
      expect(stored?.state.contentHash).toBe(scenario.contentHash);
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
        [{ step: 0, type: 'intro', payload: { text: 'You wake at the crossroads.' } }],
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
});

describe('latestEndingEntry', () => {
  it('reads the last Ending from the Journal and handles none', () => {
    expect(latestEndingEntry([{ type: 'intro', payload: {} }])).toBeUndefined();
    expect(
      latestEndingEntry([
        { type: 'ending', payload: { endingId: 'a', kind: 'defeat', title: 'A', text: 'a.' } },
        { type: 'travel', payload: {} },
        { type: 'ending', payload: { endingId: 'b', kind: 'victory', title: 'B', text: 'b.' } },
      ]),
    ).toEqual({ endingId: 'b', kind: 'victory', title: 'B', text: 'b.' });
  });
});

describe('dev registry reload', () => {
  const previousEnv = process.env.SCENARIO_DIR;

  function writeScenario(root: string, sceneText: string): void {
    const files: Record<string, string> = {
      'solo/scenario.yaml': [
        'schemaVersion: 1',
        'id: solo',
        'title: Solo',
        'description: One room.',
        'version: "1.0.0"',
        'language: en',
        'startLocation: a',
        'deathEnding: e',
        'locations:',
        '  - locations/a.yaml',
        'scenes:',
        '  - scenes/s.yaml',
        'templates:',
        '  - templates.yaml',
        'endings:',
        '  - endings.yaml',
        '',
      ].join('\n'),
      'solo/locations/a.yaml': 'id: a\nname: A\ndescription: A place.\nmap: { x: 10, y: 20 }\nscenes: [s]\n',
      'solo/scenes/s.yaml': [
        'id: s',
        'title: S',
        'trigger: on-enter',
        `text: ${sceneText}`,
        'choices:',
        '  - id: go',
        '    text: Go on.',
        '    outcome:',
        '      end: w',
        '',
      ].join('\n'),
      'solo/templates.yaml':
        '- id: t\n  name: T\n  attributes: { might: 2, agility: 1, wits: 2, presence: 1 }\n',
      'solo/endings.yaml':
        '- id: e\n  kind: defeat\n  title: E\n  text: The end.\n- id: w\n  kind: victory\n  title: W\n  text: You win.\n',
    };
    for (const [relative, content] of Object.entries(files)) {
      const full = path.join(root, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }

  function touchFuture(full: string): void {
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(full, future, future);
  }

  afterEach(() => {
    if (previousEnv === undefined) delete process.env.SCENARIO_DIR;
    else process.env.SCENARIO_DIR = previousEnv;
  });

  it('picks up an edited listed Scene file on the next request without a restart', async () => {
    const { loadAllScenarios, getScenario } = await import('../src/content/index');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reload-'));
    process.env.SCENARIO_DIR = root;
    writeScenario(root, 'A room.');
    loadAllScenarios(root);
    expect(getScenario('solo')?.scenesById['s']?.text).toBe('A room.');
    const before = getScenario('solo')?.contentHash;

    const sceneFile = path.join(root, 'solo', 'scenes', 's.yaml');
    fs.writeFileSync(
      sceneFile,
      'id: s\ntitle: S\ntrigger: on-enter\ntext: A changed room.\nchoices:\n  - id: go\n    text: Go on.\n    outcome:\n      end: w\n',
    );
    touchFuture(sceneFile);
    touchFuture(path.join(root, 'solo', 'scenes'));
    expect(getScenario('solo')?.scenesById['s']?.text).toBe('A changed room.');
    expect(getScenario('solo')?.contentHash).not.toBe(before);
  });

  it('ignores edits to files the manifest does not list', async () => {
    const { loadAllScenarios, getScenario } = await import('../src/content/index');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reload-'));
    process.env.SCENARIO_DIR = root;
    writeScenario(root, 'A room.');
    const extra = path.join(root, 'solo', 'notes.yaml');
    fs.writeFileSync(extra, 'note: hello\n');
    loadAllScenarios(root);
    const before = getScenario('solo');
    fs.writeFileSync(extra, 'note: changed\n');
    touchFuture(extra);
    const after = getScenario('solo');
    expect(after).toBe(before);
  });

  it('leaves out a Scenario whose edit made it invalid', async () => {
    const { loadAllScenarios, getScenario } = await import('../src/content/index');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reload-'));
    process.env.SCENARIO_DIR = root;
    writeScenario(root, 'A room.');
    loadAllScenarios(root);
    expect(getScenario('solo')).toBeDefined();
    fs.rmSync(path.join(root, 'solo', 'scenes', 's.yaml'));
    expect(getScenario('solo')).toBeUndefined();
  });
});
