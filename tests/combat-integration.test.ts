// Application integration for tactical Combat (issue #126): the read path
// migrates before the compatibility check with a guarded write-back (I1),
// the action path migrates before engine legality and commits atomically
// (I2), and the Combat transport carries a target independently of an item
// while accepting Distract (I4).
//
// Drives the Scenario-aware read layer (resolvePlaythrough) and the turn
// pipeline (executeTurn) against in-memory SQLite: genuine v1 rows from
// tests/fixtures/state-v1 over scenarios/whispering-woods, and live v2
// Combats from the shared arena examples in tests/fixtures/tactical.ts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCombatAction } from '../src/app/lib/combat-request';
import { resolvePlaythrough } from '../src/app/lib/playthrough';
import { executeTurn } from '../src/app/lib/turn';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  parseVersionedState,
  type PlaythroughState,
  type Rng,
  type TacticalActionEvent,
} from '../src/engine/index';
import type { PlaythroughStateV1 } from '../src/engine/state-v1';
import {
  migrateDatabase,
  openDatabase,
  PlaythroughStore,
} from '../src/persistence/index';
import { loadArenaExample, type ArenaExample } from './fixtures/tactical';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadWoods(): Scenario {
  const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
  if (!result.ok) {
    throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function loadV1(name: string): PlaythroughStateV1 {
  const raw = fs.readFileSync(
    path.join(repoRoot, 'tests', 'fixtures', 'state-v1', `${name}.json`),
    'utf8',
  );
  const file = JSON.parse(raw) as { state: PlaythroughStateV1 };
  return JSON.parse(JSON.stringify(file.state)) as PlaythroughStateV1;
}

const SESSION = 'session-combat-integration';
const OTHER_SESSION = 'session-combat-integration-other';

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

async function insertV1Row(
  db: ReturnType<typeof openDatabase>,
  id: string,
  rawState: unknown,
  step: number,
): Promise<void> {
  const scenario = loadWoods();
  await new PlaythroughStore(db).create(
    {
      id,
      sessionId: SESSION,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      contentHash: scenario.contentHash,
      status: 'active',
      step,
      // Bypass the typed writer: the column holds whatever bytes were written.
      state: rawState as PlaythroughState,
    },
    [],
  );
}

async function persistExample(
  db: ReturnType<typeof openDatabase>,
  id: string,
  example: ArenaExample,
): Promise<void> {
  await new PlaythroughStore(db).create(
    {
      id,
      sessionId: SESSION,
      scenarioId: example.scenario.id,
      scenarioVersion: example.scenario.version,
      contentHash: example.scenario.contentHash,
      status: 'active',
      step: example.state.step,
      state: JSON.parse(JSON.stringify(example.state)) as PlaythroughState,
    },
    example.journal.map((entry) => {
      const { type, lang, ...payload } = entry;
      return { step: 0, type, lang, payload };
    }),
  );
}

async function readRawState(
  db: ReturnType<typeof openDatabase>,
  id: string,
): Promise<{ state: unknown; contentHash: string; step: number }> {
  const found = await new PlaythroughStore(db).findById(id);
  if (found === null) throw new Error(`row "${id}" missing`);
  return {
    state: JSON.parse(JSON.stringify(found.state)) as unknown,
    contentHash: found.contentHash,
    step: found.step,
  };
}

async function journalRounds(
  db: ReturnType<typeof openDatabase>,
  id: string,
): Promise<{ type: string; payload: unknown }[]> {
  const entries = await new PlaythroughStore(db).listJournal(id);
  return entries.filter((entry) => entry.type === 'combat-round');
}

function roundActions(payload: unknown): TacticalActionEvent[] {
  const record = (payload ?? {}) as { actions?: unknown };
  return (record.actions ?? []) as TacticalActionEvent[];
}

describe('I1: compatible reads migrate with a guarded write-back', () => {
  it('reload sees the same initial Intent with step and Journal untouched', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const before = loadV1('active-combat-far');
      await insertV1Row(db, 'pt-reload', before, before.step);

      const first = await resolvePlaythrough(db, () => scenario, 'pt-reload', SESSION);
      expect(first?.compatible).toBe(true);
      if (first === null || !first.compatible) throw new Error('expected compatible');
      const firstIntent = first.playthrough.state.activeCombat?.participants['grey-wolf']?.intent;
      expect(firstIntent).toBeDefined();

      const second = await resolvePlaythrough(db, () => scenario, 'pt-reload', SESSION);
      expect(second?.compatible).toBe(true);
      if (second === null || !second.compatible) throw new Error('expected compatible');
      // The reload reads the written-back row and selects nothing new.
      expect(second.playthrough.state.activeCombat?.participants['grey-wolf']?.intent).toBe(
        firstIntent,
      );
      expect(second.playthrough.state.step).toBe(before.step);
      expect(await new PlaythroughStore(db).listJournal('pt-reload')).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });
});

describe('I2: submitted actions migrate before engine legality', () => {
  it('a targeted attack commits v2 and the pin with its one-step transition', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const example = loadArenaExample('solo');
      await persistExample(db, 'pt-targeted', example);
      const load = (id: string): Scenario | undefined =>
        id === example.scenario.id ? example.scenario : undefined;

      // Round 1: Close in on the lone wolf without naming it (single survivor).
      const advance = noDice();
      const closed = await executeTurn(db, load, 'pt-targeted', SESSION, {
        kind: 'combat',
        combatAction: 'advance',
        expectedStep: example.state.step,
      }, advance.rng);
      advance.assertSilent();
      expect(closed).toEqual({ ok: true, step: example.state.step + 1 });

      // Round 2: Strike the named wolf. Sword hits 4+4+Might 1 on 9; the wolf
      // misses 1+1+Might 2 on 10.
      const strike = finiteDice([4, 4, 1, 1]);
      const attacked = await executeTurn(db, load, 'pt-targeted', SESSION, {
        kind: 'combat',
        combatAction: 'attack',
        targetParticipantId: 'wolf-solo',
        expectedStep: example.state.step + 1,
      }, strike.rng);
      strike.assertDone();
      expect(attacked).toEqual({ ok: true, step: example.state.step + 2 });

      const raw = await readRawState(db, 'pt-targeted');
      expect(raw.step).toBe(example.state.step + 2);
      const versioned = parseVersionedState(raw.state);
      expect(versioned.kind).toBe('v2');
      if (versioned.kind !== 'v2') throw new Error('expected v2 row');
      expect(versioned.state.contentHash).toBe(example.scenario.contentHash);
      expect(versioned.state.activeCombat?.round).toBe(3);
      expect(versioned.state.encounters).toEqual({ 'solo-ambush': { 'wolf-solo': 3 } });
      expect(await journalRounds(db, 'pt-targeted')).toHaveLength(2);
    } finally {
      await db.destroy();
    }
  });

  it('a stale submission resolves no round but still writes back a compatible migration', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const before = loadV1('active-combat-near');
      await insertV1Row(db, 'pt-stale', before, before.step);

      const guard = noDice();
      const turned = await executeTurn(
        db,
        () => scenario,
        'pt-stale',
        SESSION,
        { kind: 'combat', combatAction: 'attack', expectedStep: before.step + 100 },
        guard.rng,
      );
      guard.assertSilent();
      expect(turned).toEqual({ ok: false, reason: 'stale' });

      // No Round resolved: the step is unchanged and no Journal entry exists.
      const raw = await readRawState(db, 'pt-stale');
      expect(raw.step).toBe(before.step);
      expect(await new PlaythroughStore(db).listJournal('pt-stale')).toHaveLength(0);
      // The compatible migration was still written back with the pin.
      expect(parseVersionedState(raw.state).kind).toBe('v2');
      expect(raw.contentHash).toBe(scenario.contentHash);
    } finally {
      await db.destroy();
    }
  });

  it('an illegal submission resolves no round but still writes back a compatible migration', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const before = loadV1('active-combat-far');
      await insertV1Row(db, 'pt-illegal', before, before.step);

      const guard = noDice();
      const turned = await executeTurn(
        db,
        () => scenario,
        'pt-illegal',
        SESSION,
        {
          kind: 'combat',
          combatAction: 'attack',
          targetParticipantId: 'no-such-wolf',
          expectedStep: before.step,
        },
        guard.rng,
      );
      guard.assertSilent();
      expect(turned).toEqual({ ok: false, reason: 'illegal' });

      const raw = await readRawState(db, 'pt-illegal');
      expect(raw.step).toBe(before.step);
      expect(await new PlaythroughStore(db).listJournal('pt-illegal')).toHaveLength(0);
      expect(parseVersionedState(raw.state).kind).toBe('v2');
      expect(raw.contentHash).toBe(scenario.contentHash);
    } finally {
      await db.destroy();
    }
  });

  it('another Session or a missing Playthrough gives 404 with no migration write', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const before = loadV1('active-combat-near');
      await insertV1Row(db, 'pt-foreign', before, before.step);
      const bytesBefore = await readRawState(db, 'pt-foreign');

      const guard = noDice();
      const foreign = await executeTurn(
        db,
        () => scenario,
        'pt-foreign',
        OTHER_SESSION,
        { kind: 'combat', combatAction: 'attack', expectedStep: before.step },
        guard.rng,
      );
      guard.assertSilent();
      expect(foreign).toEqual({ ok: false, reason: 'not-found' });
      // The v1 bytes are untouched: no migration write for a foreign Session.
      expect(await readRawState(db, 'pt-foreign')).toEqual(bytesBefore);

      const missing = await executeTurn(
        db,
        () => scenario,
        'pt-does-not-exist',
        SESSION,
        { kind: 'combat', combatAction: 'attack', expectedStep: before.step },
        guard.rng,
      );
      guard.assertSilent();
      expect(missing).toEqual({ ok: false, reason: 'not-found' });
    } finally {
      await db.destroy();
    }
  });

  it('the atomic turn commit holds for v2 state: one of two same-step attacks wins', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const example = loadArenaExample('solo');
      await persistExample(db, 'pt-race', example);
      const load = (id: string): Scenario | undefined =>
        id === example.scenario.id ? example.scenario : undefined;

      const advance = noDice();
      const closed = await executeTurn(db, load, 'pt-race', SESSION, {
        kind: 'combat',
        combatAction: 'advance',
        expectedStep: example.state.step,
      }, advance.rng);
      advance.assertSilent();
      expect(closed.ok).toBe(true);
      if (!closed.ok) throw new Error('setup advance failed');
      const racedStep = closed.step;

      // Two submissions at the same step: exactly one Round commits.
      const first = finiteDice([4, 4, 1, 1]);
      const winner = await executeTurn(db, load, 'pt-race', SESSION, {
        kind: 'combat',
        combatAction: 'attack',
        targetParticipantId: 'wolf-solo',
        expectedStep: racedStep,
      }, first.rng);
      first.assertDone();
      expect(winner).toEqual({ ok: true, step: racedStep + 1 });

      const loserGuard = noDice();
      const loser = await executeTurn(db, load, 'pt-race', SESSION, {
        kind: 'combat',
        combatAction: 'attack',
        targetParticipantId: 'wolf-solo',
        expectedStep: racedStep,
      }, loserGuard.rng);
      loserGuard.assertSilent();
      expect(loser).toEqual({ ok: false, reason: 'stale' });

      const raw = await readRawState(db, 'pt-race');
      expect(raw.step).toBe(racedStep + 1);
      const versioned = parseVersionedState(raw.state);
      expect(versioned.kind).toBe('v2');
      if (versioned.kind !== 'v2') throw new Error('expected v2 row');
      // The Damage landed exactly once: no duplicate Round committed.
      expect(versioned.state.encounters).toEqual({ 'solo-ambush': { 'wolf-solo': 3 } });
      expect(await journalRounds(db, 'pt-race')).toHaveLength(2);
    } finally {
      await db.destroy();
    }
  });
});

describe('I4: the Combat transport carries target and Distract', () => {
  it('parses Distract with a target independently of an item', () => {
    expect(
      parseCombatAction({
        actionId: 'distract',
        targetParticipantId: 'wolf-a',
        expectedStep: 7,
      }),
    ).toEqual({
      kind: 'combat',
      combatAction: 'distract',
      targetParticipantId: 'wolf-a',
      expectedStep: 7,
    });
    // A use-item still carries its Consumable alongside an (invalid) target:
    // transport never drops either field; the engine validates the pair.
    expect(
      parseCombatAction({
        actionId: 'use-item',
        itemId: 'healing-herbs',
        targetParticipantId: 'wolf-a',
        expectedStep: 7,
      }),
    ).toEqual({
      kind: 'combat',
      combatAction: 'use-item',
      itemId: 'healing-herbs',
      targetParticipantId: 'wolf-a',
      expectedStep: 7,
    });
  });

  it('keeps pre-release single-participant forms working: no target parses to none', () => {
    expect(parseCombatAction({ actionId: 'attack', expectedStep: 7 })).toEqual({
      kind: 'combat',
      combatAction: 'attack',
      expectedStep: 7,
    });
    expect(
      parseCombatAction({ actionId: 'attack', targetParticipantId: '', expectedStep: 7 }),
    ).toEqual({ kind: 'combat', combatAction: 'attack', expectedStep: 7 });
  });

  it('rejects a forged action value before the engine', () => {
    expect(parseCombatAction({ actionId: 'fireball', expectedStep: 7 })).toBeUndefined();
    expect(parseCombatAction({ actionId: '', expectedStep: 7 })).toBeUndefined();
  });

  it('rejects a forged target with no state change', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const example = loadArenaExample('solo');
      await persistExample(db, 'pt-forged', example);
      const load = (id: string): Scenario | undefined =>
        id === example.scenario.id ? example.scenario : undefined;
      const bytesBefore = await readRawState(db, 'pt-forged');
      const journalBefore = await journalRounds(db, 'pt-forged');

      const guard = noDice();
      const turned = await executeTurn(db, load, 'pt-forged', SESSION, {
        kind: 'combat',
        combatAction: 'attack',
        targetParticipantId: 'forged-id',
        expectedStep: example.state.step,
      }, guard.rng);
      guard.assertSilent();
      expect(turned).toEqual({ ok: false, reason: 'illegal' });
      expect(await readRawState(db, 'pt-forged')).toEqual(bytesBefore);
      expect(await journalRounds(db, 'pt-forged')).toEqual(journalBefore);
    } finally {
      await db.destroy();
    }
  });

  it('rejects a target on an untargeted action with no state change', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const example = loadArenaExample('solo');
      await persistExample(db, 'pt-untargeted', example);
      const load = (id: string): Scenario | undefined =>
        id === example.scenario.id ? example.scenario : undefined;
      const bytesBefore = await readRawState(db, 'pt-untargeted');

      const guard = noDice();
      const turned = await executeTurn(db, load, 'pt-untargeted', SESSION, {
        kind: 'combat',
        combatAction: 'defend',
        targetParticipantId: 'wolf-solo',
        expectedStep: example.state.step,
      }, guard.rng);
      guard.assertSilent();
      expect(turned).toEqual({ ok: false, reason: 'illegal' });
      expect(await readRawState(db, 'pt-untargeted')).toEqual(bytesBefore);
    } finally {
      await db.destroy();
    }
  });

  it('accepts an omitted target with one survivor at the matching step', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const example = loadArenaExample('solo');
      await persistExample(db, 'pt-solo', example);
      const load = (id: string): Scenario | undefined =>
        id === example.scenario.id ? example.scenario : undefined;

      const guard = noDice();
      const turned = await executeTurn(db, load, 'pt-solo', SESSION, {
        kind: 'combat',
        combatAction: 'advance',
        expectedStep: example.state.step,
      }, guard.rng);
      guard.assertSilent();
      expect(turned).toEqual({ ok: true, step: example.state.step + 1 });
    } finally {
      await db.destroy();
    }
  });

  it('requires a target with two survivors', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const example = loadArenaExample('wolves');
      await persistExample(db, 'pt-pair', example);
      const load = (id: string): Scenario | undefined =>
        id === example.scenario.id ? example.scenario : undefined;
      const bytesBefore = await readRawState(db, 'pt-pair');

      const guard = noDice();
      const turned = await executeTurn(db, load, 'pt-pair', SESSION, {
        kind: 'combat',
        combatAction: 'attack',
        expectedStep: example.state.step,
      }, guard.rng);
      guard.assertSilent();
      expect(turned).toEqual({ ok: false, reason: 'illegal' });
      expect(await readRawState(db, 'pt-pair')).toEqual(bytesBefore);
    } finally {
      await db.destroy();
    }
  });

  it('resolves Distract through the action path against a preparing archer', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      // The mixed pair opens with the archer preparing (selection die 1).
      const example = loadArenaExample('mixed');
      await persistExample(db, 'pt-distract', example);
      const load = (id: string): Scenario | undefined =>
        id === example.scenario.id ? example.scenario : undefined;
      expect(
        example.state.activeCombat?.participants['bandit-archer']?.intent,
      ).toBe('prepare');

      // Distract hits 3+3+Wits 2 on 8; the wolf's Close in draws nothing;
      // cleanup draws the archer's next Intent on a 1.
      const dice = finiteDice([3, 3, 1]);
      const turned = await executeTurn(db, load, 'pt-distract', SESSION, {
        kind: 'combat',
        combatAction: 'distract',
        targetParticipantId: 'bandit-archer',
        expectedStep: example.state.step,
      }, dice.rng);
      dice.assertDone();
      expect(turned).toEqual({ ok: true, step: example.state.step + 1 });

      const rounds = await journalRounds(db, 'pt-distract');
      expect(rounds).toHaveLength(1);
      const actions = roundActions(rounds[0]?.payload);
      expect(actions.find((action) => action.kind === 'distract')?.status).toBe('executed');
      expect(actions.find((action) => action.kind === 'prepare')?.status).toBe('cancelled');

      const raw = await readRawState(db, 'pt-distract');
      const versioned = parseVersionedState(raw.state);
      expect(versioned.kind).toBe('v2');
      if (versioned.kind !== 'v2') throw new Error('expected v2 row');
      // The archer stays Wary through the next Round.
      const waryUntil =
        versioned.state.activeCombat?.participants['bandit-archer']?.waryUntilRound ?? 0;
      expect(waryUntil).toBeGreaterThanOrEqual(versioned.state.activeCombat?.round ?? 0);
    } finally {
      await db.destroy();
    }
  });
});
