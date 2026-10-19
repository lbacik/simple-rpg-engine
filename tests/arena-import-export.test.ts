// Combat MVP 1.0 P5 A3: Arena import and export. The import accepts a bare
// CombatState file or pasted JSON through one strict parse (1 MB cap);
// PLAN goes through startCombat, CHOOSE is verified by recomputation of the
// frozen plans, FINISHED is view-only. Export writes the bare CombatState
// as combat-rNN-<phase>.json.

import { describe, expect, it } from 'vitest';
import {
  ARENA_IMPORT_MAX_BYTES,
  ARENA_PRESETS,
  arenaExportFilename,
  buildArenaInitial,
  parseArenaImport,
  prepareArenaImport,
  startCombat,
  verifyFrozenPlans,
} from '../src/engine/combat/index';
import type { CombatState } from '../src/engine/combat/index';
import { ArenaFightStore, migrateDatabase, openDatabase } from '../src/persistence/index';

function t1Initial(): CombatState {
  return buildArenaInitial(ARENA_PRESETS['T1']!) as CombatState;
}

function t1Choose(): CombatState {
  const started = startCombat(t1Initial());
  if (!started.ok) throw new Error('preset T1 must start');
  return started.state;
}

describe('parseArenaImport (A3: one strict parse, 1 MB cap)', () => {
  it('round-trips a bare PLAN CombatState', () => {
    const parsed = parseArenaImport(JSON.stringify(t1Initial()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.phase).toBe('PLAN');
    expect(parsed.state.round).toBe(1);
  });

  it('round-trips a bare CHOOSE CombatState with verifiable frozen plans', () => {
    const choose = t1Choose();
    const parsed = parseArenaImport(JSON.stringify(choose));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.phase).toBe('CHOOSE');
    expect(verifyFrozenPlans(parsed.state)).toEqual([]);
  });

  it('round-trips a bare FINISHED CombatState', () => {
    const choose = t1Choose();
    const finished: CombatState = {
      ...JSON.parse(JSON.stringify(choose)) as CombatState,
      phase: 'FINISHED',
      result: 'WIN',
    };
    const parsed = parseArenaImport(JSON.stringify(finished));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.phase).toBe('FINISHED');
    expect(parsed.state.result).toBe('WIN');
  });

  it('rejects non-JSON text with a ParseIssue', () => {
    const parsed = parseArenaImport('this is not json');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues).toEqual([{ code: 'bad_state' }]);
  });

  it('rejects an empty submission with a ParseIssue', () => {
    const parsed = parseArenaImport('   ');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues).toEqual([{ code: 'bad_state' }]);
  });

  it('rejects a CombatState the strict parser rejects, with its ParseIssue', () => {
    const bad = { ...t1Initial(), rulesVersion: 'tactical-v2' };
    const parsed = parseArenaImport(JSON.stringify(bad));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues[0]?.code).toBe('bad_rules_version');
  });

  it('accepts a payload at exactly the cap and rejects one byte over', () => {
    const base = JSON.stringify(t1Initial());
    const atCap = base + ' '.repeat(ARENA_IMPORT_MAX_BYTES - base.length);
    expect(Buffer.byteLength(atCap, 'utf8')).toBe(ARENA_IMPORT_MAX_BYTES);
    expect(parseArenaImport(atCap).ok).toBe(true);
    const overCap = `${atCap} `;
    const rejected = parseArenaImport(overCap);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.issues).toEqual([{ code: 'bad_state' }]);
  });
});

describe('prepareArenaImport (A3: PLAN starts, CHOOSE verifies, FINISHED views)', () => {
  it('runs a PLAN import through startCombat and keeps the opening state', () => {
    const initial = t1Initial();
    const prepared = prepareArenaImport(JSON.stringify(initial));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.combat.phase).toBe('CHOOSE');
    expect(prepared.combat.round).toBe(1);
    expect(prepared.initial).toEqual(initial);
    expect(verifyFrozenPlans(prepared.combat)).toEqual([]);
  });

  it('accepts a CHOOSE import whose frozen plans recompute exactly', () => {
    const prepared = prepareArenaImport(JSON.stringify(t1Choose()));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.combat.phase).toBe('CHOOSE');
    expect(prepared.initial).toBe(null);
  });

  it('rejects a CHOOSE import whose frozen plans do not recompute', () => {
    // A structurally valid plan with a wrong number: the strict parse
    // accepts it, but recomputation disagrees and the import is rejected
    // without replacing the stored plans.
    const tampered = JSON.parse(JSON.stringify(t1Choose())) as CombatState;
    tampered.frozenEnemyPlans[0] = {
      ...tampered.frozenEnemyPlans[0]!,
      priority: tampered.frozenEnemyPlans[0]!.priority + 1000,
    };
    const prepared = prepareArenaImport(JSON.stringify(tampered));
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.issues).toEqual([{ code: 'bad_frozen_plans' }]);
  });

  it('stores a FINISHED import view-only with no opening state', () => {
    const choose = t1Choose();
    const finished: CombatState = {
      ...(JSON.parse(JSON.stringify(choose)) as CombatState),
      phase: 'FINISHED',
      result: 'WIN',
    };
    const prepared = prepareArenaImport(JSON.stringify(finished));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.combat.phase).toBe('FINISHED');
    expect(prepared.combat.result).toBe('WIN');
    expect(prepared.initial).toBe(null);
  });

  it('reports strict-parse failures as ParseIssues', () => {
    const prepared = prepareArenaImport('not json');
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.issues).toEqual([{ code: 'bad_state' }]);
  });
});

describe('arenaExportFilename (A3: combat-rNN-<phase>.json)', () => {
  it('names CHOOSE states with a zero-padded round', () => {
    expect(arenaExportFilename(t1Choose())).toBe('combat-r01-CHOOSE.json');
  });

  it('names FINISHED states with their round and phase', () => {
    const choose = t1Choose();
    const finished: CombatState = {
      ...JSON.parse(JSON.stringify(choose)) as CombatState,
      phase: 'FINISHED',
      result: 'WIN',
      round: 7,
    };
    expect(arenaExportFilename(finished)).toBe('combat-r07-FINISHED.json');
  });
});

describe('Arena import persistence (A3: import advances the monotonic step)', () => {
  it('replacing a CHOOSE fight by import allocates a step above every used step', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      const first = await fights.start('session-1', {
        origin: 'setup',
        setup: JSON.parse(JSON.stringify(ARENA_PRESETS['T1'])) as unknown,
        initial: t1Initial(),
        combat: t1Choose(),
      });
      const imported = await fights.start('session-1', {
        origin: 'import',
        setup: null,
        initial: null,
        combat: t1Choose(),
      });
      expect(imported.step).toBeGreaterThan(first.step);
      const read = await fights.read('session-1');
      expect(read.status).toBe('ready');
      if (read.status !== 'ready') return;
      expect(read.fight.origin).toBe('import');
      expect(read.fight.step).toBe(imported.step);
    } finally {
      await db.destroy();
    }
  });
});
