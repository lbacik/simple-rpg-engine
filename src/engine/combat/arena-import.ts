// Arena import and export (Combat MVP 1.0, P5 A3): the one strict parse the
// file input and the pasted `<textarea>` share, and the export filename.
//
// The import carries a bare CombatState (combat-contract.md): PLAN imports
// go through startCombat, CHOOSE imports are verified by recomputation of
// the frozen plans, FINISHED imports are view-only, and imported history is
// marked not verified by the caller. The export writes the bare CombatState
// as `combat-rNN-<phase>.json`.
//
// Pure and isomorphic like the rest of the core: no IO, no Date, no
// randomness, no text. Size is measured in UTF-8 bytes, so pasted text and
// uploaded files share the same 1 MB cap.

import { parseCombatState } from './parse';
import { verifyFrozenPlans } from './plan';
import { startCombat } from './resolve';
import type { CombatState, ParseIssue, ParseResult } from './types';

/** The import cap both the file input and the paste share, in bytes. */
export const ARENA_IMPORT_MAX_BYTES = 1024 * 1024;

/**
 * Parse an import candidate through one strict parse: reject text over the
 * byte cap and text that is not JSON with `bad_state`, otherwise run the §12
 * strict parser and return its verdict unchanged. Every failure is a
 * ParseIssue the caller renders as Interface Text.
 */
export function parseArenaImport(text: string): ParseResult {
  if (new TextEncoder().encode(text).length > ARENA_IMPORT_MAX_BYTES) {
    return { ok: false, issues: [{ code: 'bad_state' }] };
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, issues: [{ code: 'bad_state' }] };
  }
  return parseCombatState(json);
}

/** The export filename for a CombatState: `combat-rNN-<phase>.json`. */
export function arenaExportFilename(state: CombatState): string {
  return `combat-r${String(state.round).padStart(2, '0')}-${state.phase}.json`;
}

/**
 * The import verdict the route stores: the running Combat state plus the
 * opening `initial` Restart returns to, or the ParseIssues the page renders.
 * PLAN goes through `startCombat` and keeps its opening state; CHOOSE is
 * verified by recomputation of the frozen plans and a mismatch is rejected
 * (plans are never replaced); FINISHED is stored view-only with no
 * `initial`. Imported history is marked not verified by the caller.
 */
export type ArenaImportResult =
  | { ok: true; initial: CombatState | null; combat: CombatState }
  | { ok: false; issues: ParseIssue[] };

export function prepareArenaImport(text: string): ArenaImportResult {
  const parsed = parseArenaImport(text);
  if (!parsed.ok) return parsed;
  const state = parsed.state;
  if (state.phase === 'PLAN') {
    const started = startCombat(state);
    if (!started.ok) return { ok: false, issues: started.issues ?? [{ code: 'bad_state' }] };
    return { ok: true, initial: state, combat: started.state };
  }
  // A recomputation mismatch is rejected with the recomputation's own
  // issues; stored plans are never replaced.
  if (state.phase === 'CHOOSE') {
    const mismatches = verifyFrozenPlans(state);
    if (mismatches.length > 0) return { ok: false, issues: mismatches };
  }
  return { ok: true, initial: null, combat: state };
}
