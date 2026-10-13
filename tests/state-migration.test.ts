// Deterministic version 1 to version 2 migration (issue #124).
//
// Covers acceptance rows M1-M4 and M10 of the tactical-combat handoff against
// the normative spec (docs/spec/playthrough-state.md, state versions and
// migration; ADR 0005), using the genuine v1 fixtures captured in
// tests/fixtures/state-v1. Migration reuses the engine's Intent selection
// with the Prepare draw disabled, never resolves an action and never appends
// a Journal entry.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import type { CompiledEncounter } from '../src/content/model';
import {
  applyAction,
  combatRounds,
  startPlaythrough,
  view,
  type Action,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';
import {
  migratePlaythroughState,
  parseVersionedState,
} from '../src/engine/migrate';
import { parsePlaythroughState } from '../src/engine/state';
import type { PlaythroughStateV1 } from '../src/engine/state-v1';
import { resolvePlaythrough } from '../src/app/lib/playthrough';
import { executeTurn } from '../src/app/lib/turn';
import {
  migrateDatabase,
  openDatabase,
  PlaythroughStore,
} from '../src/persistence/index';
import { loadTacticalFixture } from './fixtures/tactical';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'state-v1');

function loadWoods(): Scenario {
  const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
  if (!result.ok) {
    throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function loadV1(name: string): PlaythroughStateV1 {
  const file = JSON.parse(fs.readFileSync(path.join(fixtureDir, `${name}.json`), 'utf8')) as {
    state: PlaythroughStateV1;
  };
  // Round-trip through JSON so the test drives plain data, as read from the
  // state column, never a live reference.
  return JSON.parse(JSON.stringify(file.state)) as PlaythroughStateV1;
}

function snapshot(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/** The same Scenario with one Encounter doubled to two participants. */
function withDoubledEncounter(
  scenario: Scenario,
  encounterId: string,
  secondParticipantId: string,
): Scenario {
  const encounter = scenario.encountersById[encounterId];
  if (encounter === undefined) throw new Error(`no encounter "${encounterId}"`);
  const first = encounter.participants[0];
  if (first === undefined) throw new Error(`encounter "${encounterId}" has no participants`);
  const doubled: CompiledEncounter = {
    ...encounter,
    participants: [first, { ...first, id: secondParticipantId }],
  };
  return {
    ...scenario,
    contentHash: `${scenario.contentHash}-doubled`,
    encounters: scenario.encounters.map((entry) => (entry.id === encounterId ? doubled : entry)),
    encountersById: { ...scenario.encountersById, [encounterId]: doubled },
  };
}

/** The same Scenario with only its content pin moved (no mechanical change). */
function withMovedPin(scenario: Scenario): Scenario {
  return { ...scenario, version: '9.9.9-test', contentHash: `${scenario.contentHash}-moved` };
}

describe('parseVersionedState', () => {
  it('returns a valid v2 document unchanged', () => {
    const scenario = loadWoods();
    const started = startPlaythrough(scenario, 'hunter', 'Robin', (() => 1) as Rng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const versioned = parseVersionedState(snapshot(started.state));
    expect(versioned).toEqual({ kind: 'v2', state: started.state });
  });

  it('returns a valid v1 document as v1', () => {
    const dormant = loadV1('dormant');
    const versioned = parseVersionedState(dormant);
    expect(versioned).toEqual({ kind: 'v1', state: dormant });
  });

  it('rejects unknown, newer and invalid documents without interpreting them as v1', () => {
    const scenario = loadWoods();
    const started = startPlaythrough(scenario, 'hunter', 'Robin', (() => 1) as Rng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const v2 = JSON.parse(JSON.stringify(started.state)) as Record<string, unknown>;
    const dormant = loadV1('dormant') as unknown as Record<string, unknown>;
    const invalid: unknown[] = [
      null,
      undefined,
      [],
      'state',
      2,
      { ...dormant, stateVersion: 0 },
      { ...dormant, stateVersion: 3 },
      { ...dormant, stateVersion: '1' },
      { ...dormant },
      { ...v2, stateVersion: 3 },
      // A v2-shaped document that fails strict validation is invalid, never v1.
      { ...v2, step: -1 },
      { ...v2, encounterDamage: {} },
      // A v1-shaped document that fails strict validation is invalid.
      { ...dormant, step: -1 },
      { ...dormant, encounters: {} },
    ];
    delete (invalid[8] as Record<string, unknown>).stateVersion;
    for (const value of invalid) {
      expect(parseVersionedState(value), JSON.stringify(value)?.slice(0, 80)).toEqual({
        kind: 'invalid',
      });
    }
  });
});

describe('M1 encounter-record mapping', () => {
  it('maps each v1 record to the current Encounter only participant, keeping zero-Damage entries', () => {
    const scenario = loadWoods();
    const escaped = migratePlaythroughState(loadV1('escaped-with-damage'), scenario);
    expect(escaped.ok).toBe(true);
    if (!escaped.ok) throw new Error('expected migration to succeed');
    expect(escaped.state.encounters).toEqual({ 'hollow-wolf': { 'grey-wolf': 3 } });

    const near = migratePlaythroughState(loadV1('active-combat-near'), scenario);
    expect(near.ok).toBe(true);
    if (!near.ok) throw new Error('expected migration to succeed');
    // A zero-Damage entry is kept, not dropped: the participant is at full Health.
    expect(near.state.encounters).toEqual({ 'hollow-wolf': { 'grey-wolf': 0 } });

    const guarded = migratePlaythroughState(loadV1('active-combat-far-guarded'), scenario);
    expect(guarded.ok).toBe(true);
    if (!guarded.ok) throw new Error('expected migration to succeed');
    expect(guarded.state.encounters).toEqual({ 'camp-bandit': { 'bandit-archer': 1 } });

    const dormant = migratePlaythroughState(loadV1('dormant'), scenario);
    expect(dormant.ok).toBe(true);
    if (!dormant.ok) throw new Error('expected migration to succeed');
    expect(dormant.state.encounters).toEqual({});
  });

  it('is incompatible when a recorded Encounter no longer exists', () => {
    const scenario = loadWoods();
    const dormant = loadV1('dormant');
    const vanished: PlaythroughStateV1 = {
      ...dormant,
      encounterDamage: { 'vanished-encounter': 2 },
    };
    const result = migratePlaythroughState(vanished, scenario);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected migration to fail');
    expect(result.reasons.join('\n')).toContain('vanished-encounter');
  });

  it('is incompatible when a recorded Encounter now has two participants', () => {
    const scenario = withDoubledEncounter(loadWoods(), 'hollow-wolf', 'grey-wolf-b');
    const result = migratePlaythroughState(loadV1('escaped-with-damage'), scenario);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected migration to fail');
    expect(result.reasons.join('\n')).toContain('hollow-wolf');
  });

  it('lets an Encounter with no saved record change freely within the content rules', () => {
    const scenario = withDoubledEncounter(loadWoods(), 'camp-bandit', 'bandit-archer-b');
    // dormant records nothing; active-combat-near records only hollow-wolf.
    for (const fixture of ['dormant', 'active-combat-near'] as const) {
      const result = migratePlaythroughState(loadV1(fixture), scenario);
      expect(result.ok, fixture).toBe(true);
    }
  });

  it('is incompatible when the active Combat points at a missing Encounter', () => {
    const scenario = loadWoods();
    const near = loadV1('active-combat-near');
    const missing: PlaythroughStateV1 = {
      ...near,
      activeCombat: { encounterId: 'vanished-encounter', range: 'near', round: 2 },
    };
    const result = migratePlaythroughState(missing, scenario);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected migration to fail');
    expect(result.reasons.join('\n')).toContain('vanished-encounter');
  });

  it('is incompatible when the active Combat now has two participants', () => {
    const scenario = withDoubledEncounter(loadWoods(), 'hollow-wolf', 'grey-wolf-b');
    const result = migratePlaythroughState(loadV1('active-combat-near'), scenario);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected migration to fail');
    expect(result.reasons.join('\n')).toContain('hollow-wolf');
  });
});

describe('M2 legacy active Combat', () => {
  it('keeps round, Range, Health, inventory, Equipment, wounds and step at Near', () => {
    const scenario = loadWoods();
    const before = loadV1('active-combat-near');
    const result = migratePlaythroughState(before, scenario);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected migration to succeed');
    const migrated = result.state;
    expect(migrated.stateVersion).toBe(2);
    expect(migrated.step).toBe(before.step);
    expect(migrated.character).toEqual(before.character);
    expect(migrated.inventory).toEqual(before.inventory);
    expect(migrated.equipment).toEqual(before.equipment);
    expect(migrated.activeCombat).toEqual({
      encounterId: 'hollow-wolf',
      round: 2,
      startedParticipants: ['grey-wolf'],
      roundParticipantOrder: ['grey-wolf'],
      participants: {
        'grey-wolf': { range: 'near', intent: 'strike', prepared: false },
      },
    });
    expect(migrated.encounters).toEqual({ 'hollow-wolf': { 'grey-wolf': 0 } });
    // No Wary is invented: the key is absent, not false.
    expect('waryUntilRound' in (migrated.activeCombat?.participants['grey-wolf'] ?? {})).toBe(
      false,
    );
  });

  it('selects Close in at Far without a Prepare draw, unprepared and not Wary', () => {
    const scenario = loadWoods();
    const far = migratePlaythroughState(loadV1('active-combat-far'), scenario);
    expect(far.ok).toBe(true);
    if (!far.ok) throw new Error('expected migration to succeed');
    expect(far.state.step).toBe(6);
    expect(far.state.activeCombat).toEqual({
      encounterId: 'hollow-wolf',
      round: 1,
      startedParticipants: ['grey-wolf'],
      roundParticipantOrder: ['grey-wolf'],
      participants: {
        // A melee Enemy at Far closes in; the draw-free selection proves no
        // Prepare randomness (migration throws if selection ever draws).
        'grey-wolf': { range: 'far', intent: 'close-in', prepared: false },
      },
    });

    // A heavy Enemy also skips its Prepare draw: Strike, unprepared, not Wary.
    const guarded = migratePlaythroughState(loadV1('active-combat-far-guarded'), scenario);
    expect(guarded.ok).toBe(true);
    if (!guarded.ok) throw new Error('expected migration to succeed');
    expect(guarded.state.step).toBe(7);
    expect(guarded.state.activeCombat).toEqual({
      encounterId: 'camp-bandit',
      round: 2,
      startedParticipants: ['bandit-archer'],
      roundParticipantOrder: ['bandit-archer'],
      participants: {
        'bandit-archer': { range: 'far', intent: 'strike', prepared: false },
      },
    });
    // The old Defend bonus expired within its own turn: nothing carries over.
    expect(guarded.state.character.health).toBe(12);
  });

  it('is deterministic and leaves the v1 input untouched', () => {
    const scenario = loadWoods();
    const before = loadV1('active-combat-near');
    const frozen = snapshot(before);
    const first = migratePlaythroughState(before, scenario);
    const second = migratePlaythroughState(before, scenario);
    expect(first).toEqual(second);
    expect(snapshot(before)).toEqual(frozen);
    // The migrated document parses as v2 and is returned unchanged by the
    // version dispatcher: repeating migration yields the same document.
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected migration to succeed');
    expect(parseVersionedState(snapshot(first.state))).toEqual({
      kind: 'v2',
      state: first.state,
    });
  });
});

describe('M10 structural migration', () => {
  it('migrates a compatible ended save without changing its ending', () => {
    const scenario = loadWoods();
    const before = loadV1('ended');
    const result = migratePlaythroughState(before, scenario);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected migration to succeed');
    expect(result.state.status).toBe('ended');
    expect(result.state.endingId).toBe('walked-away');
    expect(result.state.step).toBe(before.step);
    expect(result.state.character).toEqual(before.character);
    expect(result.state.encounters).toEqual({});
    expect(result.state.activeCombat).toBeNull();
  });

  it('migrates a defeated Encounter record without Combat state', () => {
    const scenario = loadWoods();
    const result = migratePlaythroughState(loadV1('defeated'), scenario);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected migration to succeed');
    expect(result.state.encounters).toEqual({ 'hollow-wolf': { 'grey-wolf': 9 } });
    expect(result.state.activeCombat).toBeNull();
    expect(result.state.character.health).toBe(10);
  });
});

const SESSION = 'session-migration';

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

async function insertStateRow(
  db: ReturnType<typeof openDatabase>,
  id: string,
  rawState: unknown,
  row: { contentHash: string; scenarioVersion: string; step: number; status?: string },
  journal: { step: number; type: string; lang: string; payload: unknown }[] = [],
): Promise<void> {
  const scenario = loadWoods();
  await new PlaythroughStore(db).create(
    {
      id,
      sessionId: SESSION,
      scenarioId: scenario.id,
      scenarioVersion: row.scenarioVersion,
      contentHash: row.contentHash,
      status: row.status ?? 'active',
      step: row.step,
      // Bypass the typed writer: the column holds whatever bytes were written.
      state: rawState as PlaythroughState,
    },
    journal,
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

describe('M10 read layer: migration before the fast path and the reference check', () => {
  it('migrates a v1 row on the same-hash fast path and writes it back without advancing step', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const before = loadV1('active-combat-near');
      await insertStateRow(
        db,
        'pt-fast',
        before,
        { contentHash: scenario.contentHash, scenarioVersion: scenario.version, step: before.step },
        [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'hi' } }],
      );
      const journalBefore = await new PlaythroughStore(db).listJournal('pt-fast');

      const resolved = await resolvePlaythrough(db, () => scenario, 'pt-fast', SESSION);
      expect(resolved?.compatible).toBe(true);
      if (resolved === null || !resolved.compatible) throw new Error('expected compatible');
      expect(resolved.playthrough.state.stateVersion).toBe(2);
      expect(resolved.playthrough.state.activeCombat?.participants['grey-wolf']?.intent).toBe(
        'strike',
      );
      expect(resolved.playthrough.state.step).toBe(before.step);

      // Written back with the pin, in the same step-guarded update: the row is
      // now v2, the step is unchanged, and no Journal entry was appended.
      const raw = await readRawState(db, 'pt-fast');
      expect(raw.step).toBe(before.step);
      expect(raw.contentHash).toBe(scenario.contentHash);
      expect(parseVersionedState(raw.state)).toEqual({
        kind: 'v2',
        state: resolved.playthrough.state,
      });
      expect('encounterDamage' in (raw.state as Record<string, unknown>)).toBe(false);
      const journalAfter = await new PlaythroughStore(db).listJournal('pt-fast');
      expect(journalAfter).toEqual(journalBefore);
    } finally {
      await db.destroy();
    }
  });

  it('migrates before the changed-hash reference check and moves the pin on a pass', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const moved = withMovedPin(scenario);
      const before = loadV1('escaped-with-damage');
      await insertStateRow(
        db,
        'pt-moved',
        before,
        {
          contentHash: scenario.contentHash,
          scenarioVersion: scenario.version,
          step: before.step,
        },
      );

      const resolved = await resolvePlaythrough(db, () => moved, 'pt-moved', SESSION);
      expect(resolved?.compatible).toBe(true);
      if (resolved === null || !resolved.compatible) throw new Error('expected compatible');
      expect(resolved.playthrough.state.encounters).toEqual({
        'hollow-wolf': { 'grey-wolf': 3 },
      });

      const raw = await readRawState(db, 'pt-moved');
      expect(raw.contentHash).toBe(moved.contentHash);
      const versioned = parseVersionedState(raw.state);
      expect(versioned.kind).toBe('v2');
      if (versioned.kind !== 'v2') throw new Error('expected v2 row');
      expect(versioned.state.contentHash).toBe(moved.contentHash);
      expect(versioned.state.scenarioVersion).toBe(moved.version);
    } finally {
      await db.destroy();
    }
  });

  it('preserves the original bytes on failed migration and recovers after content restoration', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const doubled = withDoubledEncounter(scenario, 'hollow-wolf', 'grey-wolf-b');
      const before = loadV1('active-combat-near');
      await insertStateRow(
        db,
        'pt-broken',
        before,
        { contentHash: scenario.contentHash, scenarioVersion: scenario.version, step: before.step },
        [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'hi' } }],
      );

      const broken = await resolvePlaythrough(db, () => doubled, 'pt-broken', SESSION);
      expect(broken?.compatible).toBe(false);
      if (broken === null || broken.compatible) throw new Error('expected incompatible');
      expect(broken.parsed).toBeUndefined();
      // No migration or state write: the original bytes are untouched.
      const raw = await readRawState(db, 'pt-broken');
      expect(raw.state).toEqual(before);
      expect(raw.contentHash).toBe(scenario.contentHash);
      // The Journal stays available through the row id.
      expect(await new PlaythroughStore(db).listJournal('pt-broken')).toHaveLength(1);

      // Restoring the content restores compatibility: the same bytes migrate.
      const restored = await resolvePlaythrough(db, () => scenario, 'pt-broken', SESSION);
      expect(restored?.compatible).toBe(true);
      if (restored === null || !restored.compatible) throw new Error('expected compatible');
      expect(restored.playthrough.state.stateVersion).toBe(2);
    } finally {
      await db.destroy();
    }
  });

  it('means no migration or write with a missing Scenario, keeping the Journal available', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const before = loadV1('dormant');
      await insertStateRow(
        db,
        'pt-noscenario',
        before,
        { contentHash: scenario.contentHash, scenarioVersion: scenario.version, step: before.step },
        [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'hi' } }],
      );

      const resolved = await resolvePlaythrough(db, () => undefined, 'pt-noscenario', SESSION);
      expect(resolved?.compatible).toBe(false);
      if (resolved === null || resolved.compatible) throw new Error('expected incompatible');
      expect(resolved.scenario).toBeUndefined();
      expect(resolved.parsed).toBeUndefined();
      const raw = await readRawState(db, 'pt-noscenario');
      expect(raw.state).toEqual(before);
      expect(await new PlaythroughStore(db).listJournal('pt-noscenario')).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });

  it('fails unknown, newer and invalid documents without rewriting them', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const dormant = loadV1('dormant') as unknown as Record<string, unknown>;
      const documents: unknown[] = [
        { ...dormant, stateVersion: 3 },
        { ...dormant, step: -1 },
        { bogus: true },
      ];
      for (const [index, document] of documents.entries()) {
        const id = `pt-invalid-${index}`;
        await insertStateRow(
          db,
          id,
          document,
          {
            contentHash: scenario.contentHash,
            scenarioVersion: scenario.version,
            step: 0,
          },
          [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'hi' } }],
        );
        const resolved = await resolvePlaythrough(db, () => scenario, id, SESSION);
        expect(resolved?.compatible, id).toBe(false);
        if (resolved === null || resolved.compatible) throw new Error('expected incompatible');
        expect(resolved.parsed, id).toBeUndefined();
        const raw = await readRawState(db, id);
        expect(raw.state, id).toEqual(JSON.parse(JSON.stringify(document)) as unknown);
        expect(await new PlaythroughStore(db).listJournal(id), id).toHaveLength(1);
      }
    } finally {
      await db.destroy();
    }
  });

  it('returns a valid v2 document unchanged, with no write', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const started = startPlaythrough(scenario, 'hunter', 'Robin', (() => 1) as Rng);
      if (!started.ok) throw new Error(`start failed: ${started.reason}`);
      await insertStateRow(
        db,
        'pt-v2',
        snapshot(started.state),
        {
          contentHash: scenario.contentHash,
          scenarioVersion: scenario.version,
          step: started.state.step,
        },
      );
      const bytesBefore = await readRawState(db, 'pt-v2');

      const resolved = await resolvePlaythrough(db, () => scenario, 'pt-v2', SESSION);
      expect(resolved?.compatible).toBe(true);
      if (resolved === null || !resolved.compatible) throw new Error('expected compatible');
      expect(resolved.playthrough.state).toEqual(started.state);
      expect(await readRawState(db, 'pt-v2')).toEqual(bytesBefore);
    } finally {
      await db.destroy();
    }
  });

  it('migrates a compatible ended save structurally without changing its ending', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const before = loadV1('ended');
      await insertStateRow(
        db,
        'pt-ended',
        before,
        {
          contentHash: scenario.contentHash,
          scenarioVersion: scenario.version,
          step: before.step,
        },
      );

      const resolved = await resolvePlaythrough(db, () => scenario, 'pt-ended', SESSION);
      expect(resolved?.compatible).toBe(true);
      if (resolved === null || !resolved.compatible) throw new Error('expected compatible');
      expect(resolved.playthrough.state.status).toBe('ended');
      expect(resolved.playthrough.state.endingId).toBe('walked-away');
      expect(resolved.playthrough.state.step).toBe(before.step);
      const raw = await readRawState(db, 'pt-ended');
      expect(parseVersionedState(raw.state).kind).toBe('v2');
    } finally {
      await db.destroy();
    }
  });

  it('migrates the fresh row when a racing turn wins over the read', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const dormant = loadV1('dormant');
      const store = new PlaythroughStore(db);
      await store.create(
        {
          id: 'pt-race',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          contentHash: scenario.contentHash,
          status: 'active',
          step: dormant.step,
          state: dormant as unknown as PlaythroughState,
        },
        [],
      );
      // A racing turn commits a different v1 row between the read and the
      // guarded write-back, so the pin update loses.
      const updatePin = vi
        .spyOn(PlaythroughStore.prototype, 'updatePin')
        .mockImplementationOnce(async () => {
          await db
            .updateTable('playthroughs')
            .set({
              state: JSON.stringify(loadV1('active-combat-near')),
              step: loadV1('active-combat-near').step,
            })
            .where('id', '=', 'pt-race')
            .execute();
          return false;
        });
      try {
        const resolved = await resolvePlaythrough(db, () => scenario, 'pt-race', SESSION);
        expect(resolved?.compatible).toBe(true);
        if (resolved === null || !resolved.compatible) throw new Error('expected compatible');
        // The fresh v1 row is revalidated and migrated before it is returned:
        // never an unvalidated fresh v1 row reported as current v2.
        expect(resolved.playthrough.state.stateVersion).toBe(2);
        expect(resolved.playthrough.state.activeCombat?.encounterId).toBe('hollow-wolf');
        expect(
          resolved.playthrough.state.activeCombat?.participants['grey-wolf']?.intent,
        ).toBe('strike');
        expect('encounterDamage' in (resolved.playthrough.state as Record<string, unknown>)).toBe(
          false,
        );
        // The lost race writes nothing: the fresh row keeps its v1 bytes.
        expect(parseVersionedState((await readRawState(db, 'pt-race')).state).kind).toBe('v1');
      } finally {
        updatePin.mockRestore();
      }
    } finally {
      await db.destroy();
    }
  });
});

describe('M10 turn path: actions migrate before engine legality', () => {
  it('migrates a legacy active Combat and resolves the round as an ordinary tactical round', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const before = loadV1('active-combat-near');
      await insertStateRow(
        db,
        'pt-turn',
        before,
        { contentHash: scenario.contentHash, scenarioVersion: scenario.version, step: before.step },
      );

      // Hunter bow (ranged) at Near: 6+6+1 = 13 hits the wolf; the wolf misses.
      const dice = finiteDice([6, 6, 1, 1]);
      const turned = await executeTurn(
        db,
        () => scenario,
        'pt-turn',
        SESSION,
        { kind: 'combat', combatAction: 'attack', expectedStep: before.step },
        dice.rng,
      );
      dice.assertDone();
      expect(turned).toEqual({ ok: true, step: before.step + 1 });

      const raw = await readRawState(db, 'pt-turn');
      expect(raw.step).toBe(before.step + 1);
      const versioned = parseVersionedState(raw.state);
      expect(versioned.kind).toBe('v2');
      if (versioned.kind !== 'v2') throw new Error('expected v2 row');
      expect(versioned.state.encounters).toEqual({ 'hollow-wolf': { 'grey-wolf': 3 } });
      expect(versioned.state.activeCombat?.round).toBe(3);
      expect(await new PlaythroughStore(db).listJournal('pt-turn')).toHaveLength(1);
    } finally {
      await db.destroy();
    }
  });

  it('rejects the turn without writing when migration fails', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const scenario = loadWoods();
      const doubled = withDoubledEncounter(scenario, 'hollow-wolf', 'grey-wolf-b');
      const before = loadV1('active-combat-near');
      await insertStateRow(
        db,
        'pt-turn-broken',
        before,
        { contentHash: scenario.contentHash, scenarioVersion: scenario.version, step: before.step },
      );

      const guard = noDice();
      const turned = await executeTurn(
        db,
        () => doubled,
        'pt-turn-broken',
        SESSION,
        { kind: 'combat', combatAction: 'attack', expectedStep: before.step },
        guard.rng,
      );
      guard.assertSilent();
      expect(turned).toEqual({ ok: false, reason: 'incompatible' });
      const raw = await readRawState(db, 'pt-turn-broken');
      expect(raw.state).toEqual(before);
      expect(await new PlaythroughStore(db).listJournal('pt-turn-broken')).toHaveLength(0);
    } finally {
      await db.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// M3/M4: partial victory and escape on two-participant Combats.
// ---------------------------------------------------------------------------

type CombatSuccess = Extract<
  import('../src/engine/index').ApplyActionResult,
  { ok: true }
>;

function succeed(state: PlaythroughState, action: Action, rng: Rng, scenario: Scenario): CombatSuccess {
  const result = applyAction(scenario, state, action, rng);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`action failed: ${result.reason}`);
  return result;
}

function startHunt(scenario: Scenario, templateId: string, rng: Rng): PlaythroughState {
  const started = startPlaythrough(scenario, templateId, 'Robin', rng);
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);
  return openHunt(scenario, started.state, rng);
}

/** Open the on-demand ambush Scene into Combat from a Location-view state. */
function openHunt(scenario: Scenario, state: PlaythroughState, rng: Rng): PlaythroughState {
  const opened = succeed(
    state,
    { kind: 'open-scene', sceneId: 'ambush', expectedStep: state.step },
    rng,
    scenario,
  );
  const chosen = succeed(
    opened.state,
    { kind: 'choose', choiceId: 'confront', expectedStep: opened.state.step },
    rng,
    scenario,
  );
  return chosen.state;
}

type CombatMove = { combatAction: 'attack' | 'advance' | 'escape'; targetParticipantId?: string };

function combatAction(
  state: PlaythroughState,
  rng: Rng,
  scenario: Scenario,
  move: CombatMove,
): CombatSuccess {
  return succeed(
    state,
    { kind: 'combat', expectedStep: state.step, ...move },
    rng,
    scenario,
  );
}

function attack(
  state: PlaythroughState,
  rng: Rng,
  scenario: Scenario,
  targetParticipantId?: string,
): CombatSuccess {
  return combatAction(state, rng, scenario, {
    combatAction: 'attack',
    ...(targetParticipantId === undefined ? {} : { targetParticipantId }),
  });
}

describe('M3 defeat one wolf and reload', () => {
  it('keeps both ids in starting membership with only the survivor active, targetable and projected', () => {
    const { scenario } = loadTacticalFixture('pair-wolves');
    // Both wolves are steady melee at Far: combat start draws no dice.
    const startDice = noDice();
    let state = startHunt(scenario, 'hunter', startDice.rng);
    startDice.assertSilent();
    expect(state.activeCombat?.startedParticipants).toEqual(['wolf-a', 'wolf-b']);

    // The sword is melee: first close in on wolf-a's lane only.
    const advanceDice = noDice();
    state = combatAction(state, advanceDice.rng, scenario, {
      combatAction: 'advance',
      targetParticipantId: 'wolf-a',
    }).state;
    advanceDice.assertSilent();
    expect(state.activeCombat?.participants['wolf-a']?.range).toBe('near');
    expect(state.activeCombat?.participants['wolf-b']?.range).toBe('near');

    // Three sword hits (6+6+1 = 13 each) defeat wolf-a; both wolves miss back.
    for (const dice of [
      [6, 6, 1, 1, 1, 1],
      [6, 6, 1, 1, 1, 1],
      [6, 6, 1, 1],
    ]) {
      const round = finiteDice(dice);
      state = attack(state, round.rng, scenario, 'wolf-a').state;
      round.assertDone();
    }

    // Starting membership still contains both ids; only the survivor has
    // active action state.
    expect(state.activeCombat?.startedParticipants).toEqual(['wolf-a', 'wolf-b']);
    expect(state.activeCombat?.roundParticipantOrder).toEqual(['wolf-a', 'wolf-b']);
    expect(Object.keys(state.activeCombat?.participants ?? {}).sort()).toEqual(['wolf-b']);
    expect(state.encounters['wolves-ambush']).toEqual({ 'wolf-a': 9, 'wolf-b': 0 });
    expect(state.character.health).toBe(12);

    // Reload: the document validates as v2 unchanged, and projection works
    // with an empty Journal.
    const reloaded = parsePlaythroughState(snapshot(state));
    expect(reloaded).toEqual(state);
    const projected = view(scenario, reloaded);
    expect(projected.kind).toBe('combat');
    if (projected.kind !== 'combat') throw new Error('expected combat view');
    expect(projected.enemy.name).toBe('Grey Wolf');
    expect(combatRounds([], 'wolves-ambush')).toEqual([]);

    // Only the survivor is targetable: the defeated wolf is rejected without
    // drawing dice or changing state, while an omitted target resolves
    // against the single survivor.
    const rejected = noDice();
    const before = snapshot(state);
    const refused = applyAction(
      scenario,
      state,
      {
        kind: 'combat',
        combatAction: 'attack',
        targetParticipantId: 'wolf-a',
        expectedStep: state.step,
      },
      rejected.rng,
    );
    expect(refused).toEqual({ ok: false, reason: 'illegal-action' });
    expect(snapshot(state)).toEqual(before);
    rejected.assertSilent();

    const last = finiteDice([6, 6, 1, 1]);
    const hit = attack(state, last.rng, scenario);
    last.assertDone();
    expect(hit.state.encounters['wolves-ambush']).toEqual({ 'wolf-a': 9, 'wolf-b': 3 });
  });
});

/** A two-wolf Encounter behind a repeatable Scene, so the test can re-enter after an Escape. */
function loadRepeatableWolves(): { scenario: Scenario } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-migration-wolves-'));
  const name = path.basename(dir);
  const scenarioDir = path.join(dir, name);
  const write = (relative: string, content: string): void => {
    const full = path.join(scenarioDir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  write(
    'scenario.yaml',
    [
      'schemaVersion: 1',
      `id: ${name}`,
      'title: Repeatable Wolves Fixture',
      'description: Escape and re-entry package.',
      'version: "1.0.0"',
      'language: en',
      'startLocation: glade',
      'deathEnding: death',
      'locations:',
      '  - locations/glade.yaml',
      'scenes:',
      '  - scenes/ambush.yaml',
      'items:',
      '  - items.yaml',
      'enemies:',
      '  - enemies.yaml',
      'encounters:',
      '  - encounters.yaml',
      'templates:',
      '  - templates.yaml',
      'endings:',
      '  - endings.yaml',
      '',
    ].join('\n'),
  );
  write(
    'locations/glade.yaml',
    [
      'id: glade',
      'name: Glade',
      'description: Sunlight through leaves.',
      'map: { x: 10, y: 20 }',
      'scenes: [ambush]',
      '',
    ].join('\n'),
  );
  write(
    'scenes/ambush.yaml',
    [
      'id: ambush',
      'title: Ambush',
      'trigger: on-demand',
      'repeatable: true',
      'text: Something moves beyond the trees.',
      'choices:',
      '  - id: confront',
      '    text: Stand and confront it.',
      '    outcome:',
      '      start-combat: wolves-ambush',
      '',
    ].join('\n'),
  );
  write(
    'items.yaml',
    '- id: bow\n  kind: equipment\n  name: Bow\n  slot: weapon\n  reach: ranged\n  damage: 3\n',
  );
  write(
    'enemies.yaml',
    [
      '- id: weak-wolf',
      '  name: Weak Wolf',
      '  attributes: { might: 2, agility: 2, wits: 1, presence: 0 }',
      '  health: 6',
      '  damage: 2',
      '  reach: melee',
      '  behaviour: steady',
      '- id: grey-wolf',
      '  name: Grey Wolf',
      '  attributes: { might: 2, agility: 2, wits: 1, presence: 0 }',
      '  health: 8',
      '  damage: 2',
      '  reach: melee',
      '  behaviour: heavy',
      '',
    ].join('\n'),
  );
  write(
    'encounters.yaml',
    [
      '- id: wolves-ambush',
      '  participants:',
      '    - id: wolf-a',
      '      enemy: weak-wolf',
      '    - id: wolf-b',
      '      enemy: grey-wolf',
      '  startRange: far',
      '  text: |',
      '    Teeth in the dark.',
      '  victory:',
      '    text: |',
      '      Quiet returns to the glade.',
      '    end: home',
      '  escape:',
      '    text: |',
      '      You slip away between the trees.',
      '    move: glade',
      '',
    ].join('\n'),
  );
  write(
    'templates.yaml',
    '- id: ranger\n  name: Ranger\n  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }\n  items:\n    - { item: bow }\n',
  );
  write(
    'endings.yaml',
    '- id: death\n  kind: defeat\n  title: Gone\n  text: The end.\n- id: home\n  kind: victory\n  title: Home\n  text: You made it.\n',
  );
  const result = loadScenario(scenarioDir);
  if (!result.ok) {
    throw new Error(`repeatable wolves failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return { scenario: result.scenario };
}

describe('M4 escape and re-entry', () => {
  it('keeps both wounds while the new Combat contains only survivors, reset and freshly selected', () => {
    const { scenario } = loadRepeatableWolves();
    // wolf-b is heavy and draws strike on a 6 at combat start.
    const startDice = finiteDice([6]);
    let state = startHunt(scenario, 'ranger', startDice.rng);
    startDice.assertDone();

    // Two bow hits at Far (6+6+1 = 13) defeat wolf-a (health 6); wolf-b draws
    // Prepare on a 1 at the first cleanup and executes it in round 2.
    const first = finiteDice([6, 6, 1, 1, 1, 1, 1]);
    state = attack(state, first.rng, scenario, 'wolf-a').state;
    first.assertDone();
    const second = finiteDice([6, 6]);
    state = attack(state, second.rng, scenario, 'wolf-a').state;
    second.assertDone();
    expect(state.encounters['wolves-ambush']).toEqual({ 'wolf-a': 6, 'wolf-b': 0 });
    // wolf-b is prepared with a Heavy attack committed: the preparation the
    // re-entry must reset.
    expect(state.activeCombat?.participants['wolf-b']).toEqual({
      range: 'near',
      intent: 'heavy-attack',
      prepared: true,
    });

    // Escape before the slow Heavy attack (6+6+3 = 15 against 9): later
    // actions are not reached and draw no dice.
    const escapeDice = finiteDice([6, 6]);
    const escaped = combatAction(state, escapeDice.rng, scenario, { combatAction: 'escape' });
    escapeDice.assertDone();
    state = escaped.state;
    expect(state.activeCombat).toBeNull();
    const end = escaped.journal.find((entry) => entry.type === 'combat-end');
    expect(end).toMatchObject({ encounterId: 'wolves-ambush', howEnded: 'escape' });
    // Both wounds are kept, including the defeated participant's.
    expect(state.encounters['wolves-ambush']).toEqual({ 'wolf-a': 6, 'wolf-b': 0 });

    // Re-enter through the repeatable Scene. wolf-b is melee at Far, so its
    // fresh Intent (Close in) selects with no draw.
    const reopenDice = noDice();
    state = openHunt(scenario, state, reopenDice.rng);
    reopenDice.assertSilent();
    expect(state.activeCombat?.round).toBe(1);
    expect(state.activeCombat?.startedParticipants).toEqual(['wolf-b']);
    expect(state.activeCombat?.roundParticipantOrder).toEqual(['wolf-b']);
    // Range resets from startRange; preparation and Wary reset; the Intent is
    // freshly selected. No old defeated lane remains.
    expect(state.activeCombat?.participants).toEqual({
      'wolf-b': { range: 'far', intent: 'close-in', prepared: false },
    });
    expect(state.encounters['wolves-ambush']).toEqual({ 'wolf-a': 6, 'wolf-b': 0 });

    // The re-entered Combat projects and reloads cleanly.
    const reloaded = parsePlaythroughState(snapshot(state));
    expect(reloaded).toEqual(state);
    const projected = view(scenario, reloaded);
    expect(projected.kind).toBe('combat');
  });
});
