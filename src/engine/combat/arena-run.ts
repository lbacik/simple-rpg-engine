// Arena run document version 1: the first versioned Arena document
// (docs/spec/combat-contract.md, Arena run schemaVersion 1; #182 as amended
// by the handoff scope change). The run persists `origin` (`'setup'` or
// `'import'`), the remembered `setup` and `initial`, and the §12 Combat state;
// the Arena log is projected from `CombatState.log`, so there is no separate
// journal. The key `stateVersion` is never written: the enclosing row's `step`
// is the concurrency revision and increments once per accepted command.
//
// Pure and isomorphic like the rest of the core: no IO, no Date, no
// randomness, no text. Timestamps and the monotonic per-Session `step` live in
// the persistence store; frozen-plan recomputation (P1b) plugs in through the
// `verifyFrozenPlans` hook and defaults to the structural plan checks.

import { parseCombatState } from './parse';
import type { CombatState, ParseIssue } from './types';

/** The Arena run schema version for Combat MVP 1.0 documents. */
export const ARENA_RUN_SCHEMA_VERSION = 1 as const;

export type ArenaRunOrigin = 'setup' | 'import';

export interface ArenaRunV1 {
  schemaVersion: typeof ARENA_RUN_SCHEMA_VERSION;
  origin: ArenaRunOrigin;
  /** The Setup this run started from; null for imports without one. */
  setup: Record<string, unknown> | null;
  /** The initial Combat state for Restart; null for CHOOSE/FINISHED imports. */
  initial: Record<string, unknown> | null;
  combat: CombatState;
}

export type ArenaRunIssueCode =
  | 'malformed'
  | 'unknown_schema_version'
  | 'unexpected_state_version'
  | 'bad_origin'
  | 'bad_setup'
  | 'bad_initial';

/** An envelope failure, or a core strict-parser issue for the Combat. */
export type ArenaRunIssue = { code: ArenaRunIssueCode } | ParseIssue;

export type VerifyFrozenPlans = (state: CombatState) => boolean;

export type ArenaRunRead =
  | { ok: true; run: ArenaRunV1 }
  | { ok: false; issues: ArenaRunIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a stored Arena run document through one strict parse. A malformed
 * document, an unknown `schemaVersion`, a lingering `stateVersion` key, a bad
 * envelope field or a Combat the strict parser rejects (including a wrong
 * `rulesVersion`) reads as a failure the caller renders as "cannot be read"
 * with the Setup form: the row is replaced only by a user-initiated start or
 * import, never automatically. Frozen plans are never repaired or replaced;
 * when `verifyFrozenPlans` is given, a `CHOOSE` Combat whose plans do not
 * equal their recomputation is rejected with `bad_frozen_plans` (P1b).
 */
export function parseArenaRunDocument(
  value: unknown,
  options?: { verifyFrozenPlans?: VerifyFrozenPlans },
): ArenaRunRead {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: 'malformed' }] };
  }
  if ('stateVersion' in value || 'expectedStateVersion' in value) {
    return { ok: false, issues: [{ code: 'unexpected_state_version' }] };
  }
  if (value['schemaVersion'] !== ARENA_RUN_SCHEMA_VERSION) {
    return { ok: false, issues: [{ code: 'unknown_schema_version' }] };
  }
  const origin = value['origin'];
  if (origin !== 'setup' && origin !== 'import') {
    return { ok: false, issues: [{ code: 'bad_origin' }] };
  }
  const setup = value['setup'];
  if (setup !== null && !isRecord(setup)) {
    return { ok: false, issues: [{ code: 'bad_setup' }] };
  }
  const initial = value['initial'];
  if (initial !== null && initial !== undefined && !isRecord(initial)) {
    return { ok: false, issues: [{ code: 'bad_initial' }] };
  }
  const combat = parseCombatState(value['combat']);
  if (!combat.ok) {
    return { ok: false, issues: combat.issues };
  }
  if (
    combat.state.phase === 'CHOOSE' &&
    options?.verifyFrozenPlans !== undefined &&
    !options.verifyFrozenPlans(combat.state)
  ) {
    return { ok: false, issues: [{ code: 'bad_frozen_plans' }] };
  }
  return {
    ok: true,
    run: {
      schemaVersion: ARENA_RUN_SCHEMA_VERSION,
      origin,
      setup,
      initial: initial === undefined ? null : initial,
      combat: combat.state,
    },
  };
}
