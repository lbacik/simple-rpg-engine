// S2 (Playthrough): new documents carry `schemaVersion: 3` and never the
// key `stateVersion`. A malformed document, an unknown `schemaVersion` or a
// wrong `rulesVersion` makes a Playthrough read-only with its Journal.

import { describe, expect, it } from 'vitest';

import type { Scenario } from '../src/content/index';
import { executeTurn } from '../src/app/lib/turn';
import { resolvePlaythrough } from '../src/app/lib/playthrough';
import { PLAYTHROUGH_SCHEMA_VERSION, readPlaythroughV3Document } from '../src/engine/state-v3';
import type { PlaythroughV3 } from '../src/engine/state-v3';
import { verifyFrozenPlans } from '../src/engine/combat/plan';
import type { CombatState } from '../src/engine/combat/index';
import { migrateDatabase, openDatabase, PlaythroughStore } from '../src/persistence/index';
import { duelChooseState } from './combat-core-fixtures';
import { loadCrossroadsScenario } from './fixtures/crossroads';

const SESSION = 'session-v3';

function makeV3(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schemaVersion: PLAYTHROUGH_SCHEMA_VERSION,
    scenarioId: 'crossroads',
    scenarioVersion: '1.0.0',
    contentHash: 'hash-v3',
    status: 'active',
    step: 0,
    character: {
      templateId: 'hunter',
      name: 'Robin',
      baseAttributes: { might: 1, agility: 3, wits: 2, presence: 0 },
      health: 40,
    },
    inventory: { sword: 1 },
    equipment: { weapon: 'sword' },
    companion: null,
    lostCompanions: [],
    currentLocationId: 'glade',
    activeSceneId: null,
    activeCombat: null,
    visited: ['glade'],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounters: {},
    ...overrides,
  };
}

function loadFixture(): Scenario {
  return loadCrossroadsScenario();
}

/** Store exact raw bytes, bypassing the typed writer when needed. */
async function insertRaw(
  db: ReturnType<typeof openDatabase>,
  scenario: Scenario,
  id: string,
  rawState: unknown,
): Promise<void> {
  const store = new PlaythroughStore(db);
  const parsed = readPlaythroughV3Document(rawState);
  await store.create(
    {
      id,
      sessionId: SESSION,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      contentHash: scenario.contentHash,
      status: 'active',
      step: 0,
      state: (parsed.ok ? parsed.state : rawState) as PlaythroughV3,
    },
    [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'You wake.' } }],
  );
  await db
    .updateTable('playthroughs')
    .set({ state: typeof rawState === 'string' ? rawState : JSON.stringify(rawState) })
    .where('id', '=', id)
    .execute();
}

async function rawStateText(db: ReturnType<typeof openDatabase>, id: string) {
  const row = await db
    .selectFrom('playthroughs')
    .select(['state'])
    .where('id', '=', id)
    .executeTakeFirst();
  return row?.state;
}

describe('Playthrough v3 documents', () => {
  it('carries schemaVersion 3 and never the key stateVersion', () => {
    expect(PLAYTHROUGH_SCHEMA_VERSION).toBe(3);
    const doc = makeV3();
    expect(readPlaythroughV3Document(doc).ok).toBe(true);
    const text = JSON.stringify(doc);
    expect(text).toContain('"schemaVersion":3');
    expect(text).not.toContain('stateVersion');
  });

  it('round-trips through the store with schemaVersion intact', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const store = new PlaythroughStore(db);
      const doc = makeV3();
      await store.create(
        {
          id: 'pt-v3',
          sessionId: SESSION,
          scenarioId: 'crossroads',
          scenarioVersion: '1.0.0',
          contentHash: 'hash-v3',
          status: 'active',
          step: 0,
          state: doc as unknown as PlaythroughV3,
        },
        [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'You wake.' } }],
      );
      const found = await store.findById('pt-v3');
      expect(found?.state).toEqual(doc);
      const text = await rawStateText(db, 'pt-v3');
      expect(text).toContain('"schemaVersion":3');
      expect(text).not.toContain('stateVersion');
    } finally {
      await db.destroy();
    }
  });

  it('reads a valid v3 Combat through the strict parser', () => {
    const doc = makeV3({
      activeCombat: { encounterId: 'enc-1', combat: duelChooseState() },
    });
    const read = readPlaythroughV3Document(doc);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.state.activeCombat?.encounterId).toBe('enc-1');
      expect(read.state.activeCombat?.combat.phase).toBe('CHOOSE');
    }
  });

  it.each([
    ['malformed JSON', '[broken', 'malformed' as const],
    ['unknown schemaVersion', makeV3({ schemaVersion: 99 }), 'unknown_schema_version' as const],
    ['lingering stateVersion', { ...makeV3(), stateVersion: 2 }, 'unexpected_state_version' as const],
  ])('document-level %s is read-only with its Journal: %s', async (_label, raw, code) => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      await insertRaw(db, scenario, 'pt-bad', raw);
      const before = await rawStateText(db, 'pt-bad');
      const resolved = await resolvePlaythrough(db, load, 'pt-bad', SESSION);
      expect(resolved?.compatible).toBe(false);
      if (resolved && !resolved.compatible) {
        expect(resolved.parsed).toBeUndefined();
      }
      // The row is never rewritten and the Journal stays readable.
      expect(await rawStateText(db, 'pt-bad')).toBe(before);
      expect((await new PlaythroughStore(db).listJournal('pt-bad')).map((e) => e.type)).toEqual([
        'intro',
      ]);
      // Direct document read reports the reason.
      if (typeof raw !== 'string') {
        const read = readPlaythroughV3Document(raw);
        expect(read.ok).toBe(false);
        if (!read.ok) expect(read.issues[0]?.code).toBe(code);
      }
    } finally {
      await db.destroy();
    }
  });

  it('a wrong rulesVersion in the embedded Combat is read-only with its Journal', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const combat = { ...duelChooseState(), rulesVersion: 'bogus-rules' };
      const read = readPlaythroughV3Document(
        makeV3({ activeCombat: { encounterId: 'enc-1', combat } }),
      );
      expect(read.ok).toBe(false);
      if (!read.ok) {
        expect(read.issues[0]?.code).toBe('bad_combat');
        expect(read.issues[0]?.combatIssues?.[0]?.code).toBe('bad_rules_version');
      }
      await insertRaw(
        db,
        scenario,
        'pt-rules',
        makeV3({ activeCombat: { encounterId: 'enc-1', combat } }),
      );
      const resolved = await resolvePlaythrough(db, load, 'pt-rules', SESSION);
      expect(resolved?.compatible).toBe(false);
      expect((await new PlaythroughStore(db).listJournal('pt-rules')).map((e) => e.type)).toEqual([
        'intro',
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('structurally bad frozen plans are read-only with the Journal', async () => {
    // A CHOOSE Combat whose living enemies hold no plans fails the structural
    // plan check; recomputation equality (P1b) is asserted end to end by the
    // adapter tickets once planRound lands.
    const combat = { ...duelChooseState(), frozenEnemyPlans: [] };
    const read = readPlaythroughV3Document(
      makeV3({ activeCombat: { encounterId: 'enc-1', combat } }),
    );
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.issues[0]?.code).toBe('bad_combat');
  });

  it('a valid v3 document stays read-only until P6 wires the Scenario adapter', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      await insertRaw(db, scenario, 'pt-valid', makeV3());
      const resolved = await resolvePlaythrough(db, load, 'pt-valid', SESSION);
      expect(resolved?.compatible).toBe(false);
      expect((await new PlaythroughStore(db).listJournal('pt-valid')).map((e) => e.type)).toEqual([
        'intro',
      ]);
      const turn = await executeTurn(
        db,
        load,
        'pt-valid',
        SESSION,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        () => 1,
      );
      expect(turn).toEqual({ ok: false, reason: 'incompatible' });
    } finally {
      await db.destroy();
    }
  });

  it('rejects a frozen-plan mismatch only when the verifier is given (S2)', () => {
    const verify = (state: CombatState): boolean => verifyFrozenPlans(state).length === 0;
    const genuine = makeV3({ activeCombat: { encounterId: 'enc-1', combat: duelChooseState() } });
    expect(readPlaythroughV3Document(genuine, { verifyFrozenPlans: verify }).ok).toBe(true);
    // Structurally valid but not the recomputation: a swapped stance.
    const tamperedCombat = {
      ...duelChooseState(),
      frozenEnemyPlans: [{ ...duelChooseState().frozenEnemyPlans[0], stance: 'defensive' }],
    };
    const tampered = makeV3({ activeCombat: { encounterId: 'enc-1', combat: tamperedCombat } });
    // Without the verifier only the structural checks apply.
    expect(readPlaythroughV3Document(tampered).ok).toBe(true);
    const read = readPlaythroughV3Document(tampered, { verifyFrozenPlans: verify });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.issues[0]?.code).toBe('bad_frozen_plans');
  });
});
