// G1 (P6b): the #183 "Companion lost" lifecycle example as an integration
// test through the real stores (PlaythroughStore on SQLite plus executeTurn,
// the same path the play routes use). Astrid joins through a Scenario Effect,
// fights automatically at full HP in every Combat, and when she falls she is
// lost for the rest of the Playthrough — visible in the Journal — while the
// fight's victory still routes. A farewell is a departure, never a loss, so a
// departed Companion may rejoin.

import { describe, expect, it } from 'vitest';
import type { Scenario } from '../src/content/index';
import type { Rng } from '../src/engine/index';
import type { RoundCommand } from '../src/engine/combat/index';
import type { PlaythroughV3 } from '../src/engine/state-v3';
import { startPlaythroughV3 } from '../src/engine/scenario-play';
import { executeTurn } from '../src/app/lib/turn';
import {
  migrateDatabase,
  openDatabase,
  PlaythroughStore,
  type NewPlaythrough,
} from '../src/persistence/index';
import { loadCompanionCombatScenario } from './fixtures/companion-combat';

const rng: Rng = () => 1;
const SESSION = 'session-hash-companion';

async function setupPlaythrough(
  scenario: Scenario,
): Promise<{ db: ReturnType<typeof openDatabase>; playthroughId: string }> {
  const db = openDatabase(':memory:');
  await migrateDatabase(db);
  const started = startPlaythroughV3(scenario, 'hunter', 'Robin', rng);
  if (!started.ok) throw new Error('fixture start failed');
  const id = `pt-${Math.random().toString(36).slice(2)}`;
  const input: NewPlaythrough = {
    id,
    sessionId: SESSION,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    contentHash: scenario.contentHash,
    status: started.state.status,
    step: started.state.step,
    state: started.state,
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
  const row = await new PlaythroughStore(db).findById(playthroughId);
  if (row === null) throw new Error('playthrough missing');
  return row.state as PlaythroughV3;
}

type JournalRow = { type: string; payload: Record<string, unknown> };

async function journalRows(
  db: ReturnType<typeof openDatabase>,
  playthroughId: string,
): Promise<JournalRow[]> {
  const rows = await new PlaythroughStore(db).listJournal(playthroughId);
  return rows.map((row) => ({ type: row.type, payload: row.payload as Record<string, unknown> }));
}

/** Walk into the grove den and befriend Astrid. */
async function befriendAstrid(
  db: ReturnType<typeof openDatabase>,
  load: (id: string) => Scenario | undefined,
  playthroughId: string,
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
      choiceId: 'befriend',
      expectedStep: 2,
    }, rng),
  ).toEqual({ ok: true, step: 3 });
}

describe('Companion lifecycle through the real stores (G1)', () => {
  it('companion lost: befriend, fight, Astrid falls, victory routes, rejoin is a no-op, grief opens', async () => {
    const scenario = loadCompanionCombatScenario();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario);
    try {
      await befriendAstrid(db, load, playthroughId);
      let state = await storedState(db, playthroughId);
      // G4: the Effect sets the presence with a Journal entry, as presented.
      expect(state.companion).toEqual({ id: 'astrid' });
      expect(state.lostCompanions).toEqual([]);
      expect(await journalRows(db, playthroughId)).toContainEqual({
        type: 'companion-joined',
        payload: { companionId: 'astrid', name: 'Astrid the Skald' },
      });

      // Into the lone-wolf fight: Astrid enters at full HP in the hero group.
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'open-scene',
          sceneId: 'den',
          expectedStep: 3,
        }, rng),
      ).toEqual({ ok: true, step: 4 });
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'choose',
          choiceId: 'fight-lone',
          expectedStep: 4,
        }, rng),
      ).toEqual({ ok: true, step: 5 });
      state = await storedState(db, playthroughId);
      const fellow = state.activeCombat?.combat.actors.find((actor) => actor.id === 'c01');
      expect(fellow?.ref).toBe('astrid');
      expect(fellow?.hp).toBe(24);

      // The wolf's hits land every fourth round, redirected by Astrid's
      // Cover: the hero strikes first, braces until she falls in round 29,
      // and finishes the wolf in round 30.
      let step = 5;
      const commands: RoundCommand[] = [
        { round: 1, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
        ...Array.from({ length: 28 }, (_, index): RoundCommand => ({
          round: 2 + index,
          stance: 'defensive',
          actionId: 'brace',
          targetId: 'h01',
        })),
        { round: 30, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
      ];
      for (const command of commands) {
        const result = await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'combat-confirm',
          command,
          expectedStep: step,
        }, rng);
        expect(result).toEqual({ ok: true, step: step + 1 });
        step += 1;
      }

      state = await storedState(db, playthroughId);
      // G4: the fight is won with the hero untouched, and Astrid is lost
      // permanently — removed, recorded, and announced.
      expect(state.activeCombat).toBeNull();
      expect(state.character.health).toBe(40);
      expect(state.companion).toBeNull();
      expect(state.lostCompanions).toEqual(['astrid']);
      // Victory still routes to the victory Outcome.
      expect(state.encounters['lone-fight']).toEqual({ grey: 14 });
      expect(state.inventory).toMatchObject({ fang: 1 });
      const rows = await journalRows(db, playthroughId);
      const types = rows.map((row) => row.type);
      expect(types).toContain('combat-start');
      expect(types).toContain('companion-lost');
      expect(rows).toContainEqual({
        type: 'combat-start',
        payload: expect.objectContaining({
          companion: { ref: 'astrid', name: 'Astrid the Skald' },
        }),
      });
      expect(rows).toContainEqual({
        type: 'companion-lost',
        payload: { companionId: 'astrid', name: 'Astrid the Skald' },
      });
      // The loss lands before the routed Outcome.
      expect(types.indexOf('companion-lost')).toBeLessThan(types.indexOf('combat-end'));
      expect(types.slice(types.indexOf('combat-end'))).toEqual([
        'combat-end',
        'outcome',
        'state-change',
      ]);

      // Rejoining a lost Companion is a silent no-op: the turn is accepted
      // (the Choice resolves) but nothing joins and nothing is recorded.
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'open-scene',
          sceneId: 'den',
          expectedStep: step,
        }, rng),
      ).toEqual({ ok: true, step: step + 1 });
      step += 1;
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'choose',
          choiceId: 'rejoin',
          expectedStep: step,
        }, rng),
      ).toEqual({ ok: true, step: step + 1 });
      step += 1;
      state = await storedState(db, playthroughId);
      expect(state.companion).toBeNull();
      expect(state.lostCompanions).toEqual(['astrid']);
      const afterRejoin = await journalRows(db, playthroughId);
      expect(afterRejoin.filter((row) => row.type === 'companion-joined')).toHaveLength(1);
      expect(afterRejoin.filter((row) => row.type === 'companion-left')).toHaveLength(0);

      // The grief Scene opens now that Astrid is lost.
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'open-scene',
          sceneId: 'grief',
          expectedStep: step,
        }, rng),
      ).toEqual({ ok: true, step: step + 1 });
      state = await storedState(db, playthroughId);
      expect(state.activeSceneId).toBe('grief');
    } finally {
      await db.destroy();
    }
  });

  it('leave is a departure, never a loss: farewell frees Astrid and she may rejoin', async () => {
    const scenario = loadCompanionCombatScenario();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario);
    try {
      await befriendAstrid(db, load, playthroughId);
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'open-scene',
          sceneId: 'den',
          expectedStep: 3,
        }, rng),
      ).toEqual({ ok: true, step: 4 });
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'choose',
          choiceId: 'farewell',
          expectedStep: 4,
        }, rng),
      ).toEqual({ ok: true, step: 5 });
      let state = await storedState(db, playthroughId);
      // G4: leaving clears the presence with a departure entry and records
      // no loss.
      expect(state.companion).toBeNull();
      expect(state.lostCompanions).toEqual([]);
      expect(await journalRows(db, playthroughId)).toContainEqual({
        type: 'companion-left',
        payload: { companionId: 'astrid', name: 'Astrid the Skald' },
      });

      // A departed Companion may join again.
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'open-scene',
          sceneId: 'den',
          expectedStep: 5,
        }, rng),
      ).toEqual({ ok: true, step: 6 });
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'choose',
          choiceId: 'rejoin',
          expectedStep: 6,
        }, rng),
      ).toEqual({ ok: true, step: 7 });
      state = await storedState(db, playthroughId);
      expect(state.companion).toEqual({ id: 'astrid' });
      expect(state.lostCompanions).toEqual([]);

      // Nothing was lost, so the grief Scene stays shut.
      expect(
        await executeTurn(db, load, playthroughId, SESSION, {
          kind: 'open-scene',
          sceneId: 'grief',
          expectedStep: 7,
        }, rng),
      ).toEqual({ ok: false, reason: 'illegal', detail: 'illegal-action' });
      state = await storedState(db, playthroughId);
      expect(state.step).toBe(7);
    } finally {
      await db.destroy();
    }
  });
});
