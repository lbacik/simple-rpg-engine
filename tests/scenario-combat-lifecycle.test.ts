// G1 (P6): the #183 lifecycle examples — attrition, surrender and return,
// draw and death — as integration tests through the real stores
// (PlaythroughStore on SQLite plus executeTurn, the same path the Combat
// routes use). Stale and illegal commands change neither state nor `step`,
// and a tampered Combat reads as incompatible (S2).

import { describe, expect, it } from 'vitest';
import type { Scenario } from '../src/content/index';
import type { Rng } from '../src/engine/index';
import { planRound } from '../src/engine/combat/index';
import type { PlaythroughV3 } from '../src/engine/state-v3';
import { startPlaythroughV3 } from '../src/engine/scenario-play';
import { executeTurn } from '../src/app/lib/turn';
import {
  migrateDatabase,
  openDatabase,
  PlaythroughStore,
  type NewPlaythrough,
} from '../src/persistence/index';
import { loadCrossroadsCombatScenario } from './fixtures/crossroads-combat';

const rng: Rng = () => 1;
const SESSION = 'session-hash-1';

function loadFixture(): Scenario {
  return loadCrossroadsCombatScenario();
}

type SetupOptions = {
  health?: number;
  encounters?: PlaythroughV3['encounters'];
  id?: string;
};

async function setupPlaythrough(
  scenario: Scenario,
  options: SetupOptions = {},
): Promise<{ db: ReturnType<typeof openDatabase>; playthroughId: string }> {
  const db = openDatabase(':memory:');
  await migrateDatabase(db);
  const started = startPlaythroughV3(scenario, 'hunter', 'Robin', rng);
  if (!started.ok) throw new Error('fixture start failed');
  let state = started.state;
  if (options.health !== undefined || options.encounters !== undefined) {
    state = {
      ...state,
      character: { ...state.character, health: options.health ?? state.character.health },
      encounters: options.encounters ?? state.encounters,
    };
  }
  const id = options.id ?? `pt-${Math.random().toString(36).slice(2)}`;
  const input: NewPlaythrough = {
    id,
    sessionId: SESSION,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    contentHash: scenario.contentHash,
    status: state.status,
    step: state.step,
    state,
  };
  await new PlaythroughStore(db).create(
    input,
    started.journal.map((entry) => {
      const { type, lang, ...payload } = entry;
      return { step: 0, type, lang, payload };
    }),
  );
  return { db, playthroughId: id };
}

async function storedState(
  db: ReturnType<typeof openDatabase>,
  playthroughId: string,
): Promise<PlaythroughV3> {
  const store = new PlaythroughStore(db);
  const row = await store.findById(playthroughId);
  if (row === null) throw new Error('playthrough missing');
  return row.state as PlaythroughV3;
}

async function journalTypes(
  db: ReturnType<typeof openDatabase>,
  playthroughId: string,
): Promise<string[]> {
  const journal = await new PlaythroughStore(db).listJournal(playthroughId);
  return journal.map((entry) => entry.type);
}

/** Walk into the grove den and start the given fight: steps 0→3. */
async function startFight(
  db: ReturnType<typeof openDatabase>,
  load: (id: string) => Scenario | undefined,
  playthroughId: string,
  choiceId: 'fight-solo' | 'fight-pack',
): Promise<void> {
  expect(
    await executeTurn(db, load, playthroughId, SESSION, {
      kind: 'travel',
      targetLocationId: 'grove',
      expectedStep: 0,
    }, rng),
  ).toEqual({ ok: true, step: 1 });
  expect(
    await executeTurn(db, load, playthroughId, SESSION, {
      kind: 'open-scene',
      sceneId: 'den',
      expectedStep: 1,
    }, rng),
  ).toEqual({ ok: true, step: 2 });
  expect(
    await executeTurn(db, load, playthroughId, SESSION, {
      kind: 'choose',
      choiceId,
      expectedStep: 2,
    }, rng),
  ).toEqual({ ok: true, step: 3 });
}

describe('Combat lifecycle through the real stores (G1)', () => {
  it('attrition: a wounded wolf dies to one strike, Health untouched, victory granted', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    // The lone wolf already carries 13 wounds from an earlier fight (raider
    // maximum is 14): one strike finishes it.
    const { db, playthroughId } = await setupPlaythrough(scenario, {
      encounters: { 'den-fight': { 'grey-wolf': 13 } },
    });
    try {
      await startFight(db, load, playthroughId, 'fight-solo');
      let state = await storedState(db, playthroughId);
      // G2: the hero enters at the Character's current Health (fresh v3: 40).
      expect(state.activeCombat?.encounterId).toBe('den-fight');
      expect(state.activeCombat?.combat.actors.find((a) => a.id === 'h01')?.hp).toBe(40);
      expect(state.activeCombat?.combat.round).toBe(1);

      const result = await executeTurn(db, load, playthroughId, SESSION, {
        kind: 'combat-confirm',
        command: { round: 1, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
        expectedStep: 3,
      }, rng);
      expect(result).toEqual({ ok: true, step: 4 });

      state = await storedState(db, playthroughId);
      // G2: Health leaves at the final value, written once, at the end.
      expect(state.character.health).toBe(40);
      expect(state.encounters['den-fight']).toEqual({ 'grey-wolf': 14 });
      expect(state.activeCombat).toBeNull();
      // G3: WIN routes to the victory Outcome, whose Effect applies.
      expect(state.inventory).toMatchObject({ fang: 1 });
      const types = await journalTypes(db, playthroughId);
      expect(types).toContain('combat-start');
      // The routed victory Outcome appends its narration plus the fang grant.
      expect(types.slice(-4)).toEqual(['combat-round', 'combat-end', 'outcome', 'state-change']);
      const journal = await new PlaythroughStore(db).listJournal(playthroughId);
      const end = journal.find((entry) => entry.type === 'combat-end');
      expect((end?.payload as { howEnded?: string }).howEnded).toBe('win');

      // G5: no Combat restart — repeating the Choice rejects without change.
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'open-scene',
          sceneId: 'den',
          expectedStep: 4,
        }, rng),
      ).toEqual({ ok: true, step: 5 });
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'choose',
          choiceId: 'fight-solo',
          expectedStep: 5,
        }, rng),
      ).toEqual({ ok: false, reason: 'illegal', detail: 'illegal-action' });
      state = await storedState(db, playthroughId);
      expect(state.step).toBe(5);
      expect(state.activeCombat).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('surrender and return: the fight ends undefeated and the repeat fields survivors only', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    // Alpha already carries 13 wounds: one strike removes it, beta remains.
    const { db, playthroughId } = await setupPlaythrough(scenario, {
      encounters: { 'pack-fight': { alpha: 13 } },
    });
    try {
      await startFight(db, load, playthroughId, 'fight-pack');
      const struck = await executeTurn(db, load, playthroughId, SESSION, {
        kind: 'combat-confirm',
        command: { round: 1, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
        expectedStep: 3,
      }, rng);
      expect(struck).toEqual({ ok: true, step: 4 });
      let state = await storedState(db, playthroughId);
      // The strike eliminates alpha but the fight continues against beta
      // (eliminated fighters stay listed at 0 HP until the fight ends).
      expect(state.activeCombat?.combat.actors.find((a) => a.id === 'e01')?.hp).toBe(0);
      expect(state.activeCombat?.combat.actors.find((a) => a.id === 'e02')?.hp).toBeGreaterThan(0);

      const surrendered = await executeTurn(db, load, playthroughId, SESSION, {
        kind: 'combat-surrender',
        round: 2,
        expectedStep: 4,
      }, rng);
      expect(surrendered).toEqual({ ok: true, step: 5 });
      state = await storedState(db, playthroughId);
      // G2/G3: Health at the final value; alpha fully wounded, beta not;
      // the surrender Outcome moves back to the glade.
      expect(state.character.health).toBeLessThan(40);
      expect(state.character.health).toBeGreaterThan(0);
      expect(state.encounters['pack-fight']?.alpha).toBe(14);
      expect(state.encounters['pack-fight']?.beta ?? 0).toBeLessThan(14);
      expect(state.currentLocationId).toBe('glade');
      expect(state.activeCombat).toBeNull();
      const journal = await new PlaythroughStore(db).listJournal(playthroughId);
      const end = journal.find((entry) => entry.type === 'combat-end');
      expect((end?.payload as { howEnded?: string }).howEnded).toBe('surrender');

      // Return: walk back, reopen the den and fight again — survivors only,
      // in the authored arrangement, entering at the current Health.
      const heroHealth = state.character.health;
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'travel',
          targetLocationId: 'grove',
          expectedStep: 5,
        }, rng),
      ).toEqual({ ok: true, step: 6 });
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'open-scene',
          sceneId: 'den',
          expectedStep: 6,
        }, rng),
      ).toEqual({ ok: true, step: 7 });
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'choose',
          choiceId: 'fight-pack',
          expectedStep: 7,
        }, rng),
      ).toEqual({ ok: true, step: 8 });
      state = await storedState(db, playthroughId);
      const combat = state.activeCombat?.combat;
      expect(combat?.actors.map((a) => `${a.id}:${a.ref}`).sort()).toEqual(['e02:beta', 'h01:null']);
      expect(combat?.actors.find((a) => a.id === 'h01')?.hp).toBe(heroHealth);
    } finally {
      await db.destroy();
    }
  });

  it('draw: the round limit routes to the draw Outcome with wounds written back', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario);
    try {
      await startFight(db, load, playthroughId, 'fight-solo');
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'combat-confirm',
          command: { round: 1, stance: 'balanced', actionId: 'brace', targetId: 'h01' },
          expectedStep: 3,
        }, rng),
      ).toEqual({ ok: true, step: 4 });

      // A played-out draw takes thirty Rounds; fast-forward the stored fight
      // to a planned round-30 state the same way the core's own suites do
      // (PLAN shape through planRound, so the frozen plans verify), then play
      // the terminal Round through the turn pipeline.
      const store = new PlaythroughStore(db);
      const row = await store.findById(playthroughId);
      if (row === null) throw new Error('playthrough missing');
      const mid = row.state as PlaythroughV3;
      const fighting = mid.activeCombat?.combat;
      if (fighting === undefined) throw new Error('no running fight');
      const round30 = planRound({
        ...fighting,
        phase: 'PLAN',
        round: 30,
        frozenEnemyPlans: [],
        frozenCompanionPlan: null,
      });
      const forwarded: PlaythroughV3 = {
        ...mid,
        activeCombat: { encounterId: 'den-fight', combat: round30 },
      };
      expect(
        await store.commitTurn(
          playthroughId,
          mid.step,
          { state: forwarded, step: forwarded.step, status: forwarded.status, endingId: null },
          [],
        ),
      ).toBe(true);

      const result = await executeTurn(db, load, playthroughId, SESSION, {
        kind: 'combat-confirm',
        command: { round: 30, stance: 'balanced', actionId: 'brace', targetId: 'h01' },
        expectedStep: 4,
      }, rng);
      expect(result).toEqual({ ok: true, step: 5 });
      const state = await storedState(db, playthroughId);
      // G3: DRAW_LIMIT routes to draw; the Encounter stays undefeated and the
      // draw Outcome moves back to the glade.
      expect(state.activeCombat).toBeNull();
      expect(state.currentLocationId).toBe('glade');
      expect(state.encounters['den-fight']?.['grey-wolf'] ?? 0).toBeLessThan(14);
      const journal = await store.listJournal(playthroughId);
      const end = journal.find((entry) => entry.type === 'combat-end');
      expect((end?.payload as { howEnded?: string }).howEnded).toBe('draw');
    } finally {
      await db.destroy();
    }
  });

  it('death: LOSS ends the Playthrough on the death Ending with no combat-end', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario, { health: 5 });
    try {
      // Two wolves overwhelm a bracing 5-Health hero in one Round.
      await startFight(db, load, playthroughId, 'fight-pack');
      const result = await executeTurn(db, load, playthroughId, SESSION, {
        kind: 'combat-confirm',
        command: { round: 1, stance: 'balanced', actionId: 'brace', targetId: 'h01' },
        expectedStep: 3,
      }, rng);
      expect(result).toEqual({ ok: true, step: 4 });
      const state = await storedState(db, playthroughId);
      // G3: LOSS routes to the Scenario's deathEnding.
      expect(state.character.health).toBe(0);
      expect(state.status).toBe('ended');
      expect(state.endingId).toBe('death');
      expect(state.activeCombat).toBeNull();
      const types = await journalTypes(db, playthroughId);
      expect(types).not.toContain('combat-end');
      expect(types[types.length - 1]).toBe('ending');

      // A finished Playthrough answers `ended` and changes nothing.
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'combat-confirm',
          command: { round: 2, stance: 'balanced', actionId: 'brace', targetId: 'h01' },
          expectedStep: 4,
        }, rng),
      ).toEqual({ ok: false, reason: 'ended' });
    } finally {
      await db.destroy();
    }
  });

  it('stale and illegal commands change neither state nor step', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario);
    try {
      await startFight(db, load, playthroughId, 'fight-solo');
      const before = await storedState(db, playthroughId);
      const journalBefore = await journalTypes(db, playthroughId);

      // A wrong round reads stale.
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'combat-confirm',
          command: { round: 2, stance: 'balanced', actionId: 'brace', targetId: null },
          expectedStep: 3,
        }, rng),
      ).toEqual({ ok: false, reason: 'stale' });
      // The hero has no shot in the base set: illegal, with its reason code.
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'combat-confirm',
          command: { round: 1, stance: 'balanced', actionId: 'shot', targetId: 'e01' },
          expectedStep: 3,
        }, rng),
      ).toEqual({ ok: false, reason: 'illegal', detail: 'illegal-action' });
      // Journey actions are illegal while a Combat runs (G5).
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'travel',
          targetLocationId: 'glade',
          expectedStep: 3,
        }, rng),
      ).toEqual({ ok: false, reason: 'illegal', detail: 'illegal-action' });
      // Surrender for the wrong round reads stale.
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'combat-surrender',
          round: 2,
          expectedStep: 3,
        }, rng),
      ).toEqual({ ok: false, reason: 'stale' });

      const after = await storedState(db, playthroughId);
      expect(after.step).toBe(before.step);
      expect(after.activeCombat?.combat.round).toBe(1);
      expect(after.character.health).toBe(before.character.health);
      expect(await journalTypes(db, playthroughId)).toEqual(journalBefore);
    } finally {
      await db.destroy();
    }
  });

  it('a stored Combat that fails the frozen-plan check is read-only with its Journal (S2)', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario);
    try {
      await startFight(db, load, playthroughId, 'fight-solo');
      const store = new PlaythroughStore(db);
      const row = await store.findById(playthroughId);
      if (row === null) throw new Error('playthrough missing');
      const genuine = row.state as PlaythroughV3;
      const fighting = genuine.activeCombat?.combat;
      if (fighting === undefined || fighting.frozenEnemyPlans.length === 0) {
        throw new Error('expected frozen enemy plans');
      }
      // Structurally valid but not the recomputation: a swapped stance.
      const tampered: PlaythroughV3 = {
        ...genuine,
        activeCombat: {
          encounterId: 'den-fight',
          combat: {
            ...fighting,
            frozenEnemyPlans: [
              { ...fighting.frozenEnemyPlans[0], stance: 'defensive' },
              ...fighting.frozenEnemyPlans.slice(1),
            ],
          },
        },
      };
      expect(
        await store.commitTurn(
          playthroughId,
          genuine.step,
          { state: tampered, step: tampered.step, status: tampered.status, endingId: null },
          [],
        ),
      ).toBe(true);

      const journalBefore = await journalTypes(db, playthroughId);
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'combat-confirm',
          command: { round: 1, stance: 'balanced', actionId: 'brace', targetId: 'h01' },
          expectedStep: 3,
        }, rng),
      ).toEqual({ ok: false, reason: 'incompatible' });
      // Nothing changed; the Journal still reads through the store.
      expect((await store.findById(playthroughId))?.step).toBe(3);
      expect(await journalTypes(db, playthroughId)).toEqual(journalBefore);
      expect(journalBefore).toContain('combat-start');
    } finally {
      await db.destroy();
    }
  });
});
