// Combat MVP 1.0 P7 V3: automated T1–T7 replays from the Arena presets.
//
// Each test builds its initial state from ARENA_PRESETS via buildArenaInitial
// (phase PLAN) and opens with startCombat, then replays a recorded command
// line through submitRound:
//
// - T1 replays the §11.1 winning sequence (Counter → Feint → Heavy) to the
//   stated result: WIN in Round 3, hero 30 HP and 5 stamina.
// - T5 replays the §11.4 winning sequence (Approach → Charge → Strike) to
//   the stated result: WIN in Round 3, hero 40 HP and 9 stamina.
// - T2–T4, T6 and T7 are diagnostic scenarios with no stated winning line
//   (rules §15.2: "do not assume each must be easy or winnable with any
//   strategy"). Each replays a recorded diagnostic line and asserts only
//   determinism (same initial + same commands → identical state and log)
//   and legality (every command accepted, every command legal in
//   listOptions, inputs never mutated) — never a balance outcome: no HP,
//   result or fight-length expectations below.

import { describe, expect, it } from 'vitest';
import {
  ARENA_PRESETS,
  buildArenaInitial,
  findOption,
  listOptions,
  startCombat,
  submitRound,
} from '../src/engine/combat/index';
import type { ArenaPresetId, CombatState, RoundCommand } from '../src/engine/combat/index';
import { T1_WINNING_SEQUENCE, T5_WINNING_SEQUENCE } from './combat-core-fixtures';

type DiagnosticId = 'T2' | 'T3' | 'T4' | 'T6' | 'T7';

const DIAGNOSTIC_IDS: readonly DiagnosticId[] = ['T2', 'T3', 'T4', 'T6', 'T7'];

/**
 * Recorded diagnostic lines: one opener exercising the scenario's theme,
 * then a Brace hold in Balanced (always legal: cost 0, no cooldown, self
 * target). Round numbers are explicit; the replay stamps nothing and stops
 * early if the fight finishes, so a future balance shift can only shorten
 * the walk, never silently change what the test pins.
 */
function braceHold(firstRound: number, lastRound: number): RoundCommand[] {
  const holds: RoundCommand[] = [];
  for (let round = firstRound; round <= lastRound; round += 1) {
    holds.push({ round, stance: 'balanced', actionId: 'brace', targetId: 'h01' });
  }
  return holds;
}

const DIAGNOSTIC_LINES: Record<DiagnosticId, readonly RoundCommand[]> = {
  // Solo Sentinel: Feint at the defensive cycle, then hold.
  T2: [{ round: 1, stance: 'balanced', actionId: 'feint', targetId: 'e01' }, ...braceHold(2, 4)],
  // Three Raiders: Counter the opening pair, then hold.
  T3: [{ round: 1, stance: 'defensive', actionId: 'counter', targetId: 'h01' }, ...braceHold(2, 4)],
  // Raider plus far Archer: pressure the engaged Raider, then hold.
  T4: [{ round: 1, stance: 'aggressive', actionId: 'strike', targetId: 'e01' }, ...braceHold(2, 4)],
  // Two Raiders plus Archer with a Party Sentinel: Cover the companion, then hold.
  T6: [{ round: 1, stance: 'balanced', actionId: 'cover', targetId: 'c01' }, ...braceHold(2, 4)],
  // Five enemies with a Party Archer: pressure the first Raider, then hold.
  T7: [{ round: 1, stance: 'aggressive', actionId: 'strike', targetId: 'e01' }, ...braceHold(2, 4)],
};

/** Open a preset fight: preset → initial PLAN state → round-1 CHOOSE state. */
function openFromPreset(id: ArenaPresetId): CombatState {
  const started = startCombat(buildArenaInitial(ARENA_PRESETS[id]));
  expect(started.ok, `preset ${id}: startCombat rejected its own initial state`).toBe(true);
  if (!started.ok) throw new Error(`startCombat rejected preset ${id}`);
  expect(started.state.phase).toBe('CHOOSE');
  return started.state;
}

interface ReplayOutcome {
  state: CombatState;
  /** Commands consumed before the line ran out or the fight finished. */
  played: number;
}

/**
 * Replay a recorded line through submitRound. Every consumed command must
 * be legal in listOptions and accepted; submitRound must never mutate its
 * input. Stops early if the fight finishes before the line runs out.
 */
function replay(open: CombatState, id: ArenaPresetId, line: readonly RoundCommand[]): ReplayOutcome {
  let current = open;
  let played = 0;
  for (const command of line) {
    if (current.phase !== 'CHOOSE' || current.result !== null) break;
    expect(command.round, `${id}: recorded round drifts from the fight round`).toBe(current.round);
    const option = findOption(listOptions(current, command.stance), command.actionId, command.targetId);
    expect(option?.legal, `${id} round ${current.round}: recorded command illegal`).toBe(true);
    const before = JSON.stringify(current);
    const result = submitRound(current, command);
    expect(result.ok, `${id} round ${current.round}: recorded command rejected`).toBe(true);
    expect(JSON.stringify(current), `${id} round ${command.round}: submit mutated its input`).toBe(before);
    if (!result.ok) throw new Error(`${id} round ${command.round}: recorded command rejected`);
    current = result.state;
    played += 1;
  }
  return { state: current, played };
}

/** Replay the same line twice from fresh preset opens; both runs must agree. */
function replayTwice(id: ArenaPresetId, line: readonly RoundCommand[]): { first: ReplayOutcome; second: ReplayOutcome } {
  const first = replay(openFromPreset(id), id, line);
  const second = replay(openFromPreset(id), id, line);
  return { first, second };
}

/** Replay a §11 winning sequence from its preset to its stated result. */
function expectWinningReplay(id: 'T1' | 'T5', line: readonly RoundCommand[], hp: number, stamina: number): void {
  const { first, second } = replayTwice(id, line);
  expect(first.played).toBe(3);
  expect(first.state.result).toBe('WIN');
  expect(first.state.phase).toBe('FINISHED');
  expect(first.state.round).toBe(3);
  expect(first.state.actors[0]).toMatchObject({ hp, stamina });
  expect(first.state.actors.find((actor) => actor.id === 'e01')).toMatchObject({ hp: 0 });
  // Determinism: the same initial plus the same commands replays identically.
  expect(second.played).toBe(first.played);
  expect(second.state).toEqual(first.state);
  expect(second.state.log).toEqual(first.state.log);
}

describe('preset replays (V3)', () => {
  it('T1 replays the §11.1 winning sequence to WIN in round 3, hero 30 HP and 5 stamina', () => {
    expectWinningReplay('T1', T1_WINNING_SEQUENCE, 30, 5);
  });

  it('T5 replays the §11.4 winning sequence to WIN in round 3, hero 40 HP and 9 stamina', () => {
    expectWinningReplay('T5', T5_WINNING_SEQUENCE, 40, 9);
  });

  it.each(DIAGNOSTIC_IDS)(
    '%s replays its recorded diagnostic line: every command legal, replay deterministic',
    (id) => {
      const line = DIAGNOSTIC_LINES[id];
      const { first, second } = replayTwice(id, line);
      // The walk played at least the opening round: the test is never vacuous.
      // Anything beyond that (survival, HP, result) is a balance outcome and
      // is deliberately asserted nowhere in this test.
      expect(first.played).toBeGreaterThanOrEqual(1);
      expect(second.played).toBe(first.played);
      expect(second.state).toEqual(first.state);
      expect(second.state.log).toEqual(first.state.log);
    },
  );
});
