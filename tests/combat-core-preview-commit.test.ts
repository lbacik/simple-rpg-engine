// P1c K10: preview ≡ commit.
//
// For every legal command in every T1–T7 Round state reached by the ticket's
// sequences, previewRound's projection equals the resolution part of
// submitRound, and the input state is deep-equal before and after.
//
// Sequences: T1 plays its stated 11.1 winning line, T5 its 11.4 line (both
// end WIN in Round 3). T2–T4, T6 and T7 have no stated winning line (they
// are diagnostic; V3 records their lines in P7), so they walk a fixed legal
// fallback (Brace in Balanced) for up to six Rounds or until FINISHED. The
// walk asserts nothing about balance or results — only determinism,
// legality and preview/commit identity.

import { describe, expect, it } from 'vitest';
import { listOptions, previewRound, startCombat, submitRound } from '../src/engine/combat/index';
import type { CombatState, RoundCommand, Stance } from '../src/engine/combat/index';
import { SCENARIO_IDS, T1_WINNING_SEQUENCE, T5_WINNING_SEQUENCE, scenarioInitial } from './combat-core-fixtures';
import type { ScenarioId } from './combat-core-fixtures';

const STANCES: readonly Stance[] = ['aggressive', 'balanced', 'defensive'];

/** All legal commands in a CHOOSE state, across the three stances. */
function legalCommands(state: CombatState): RoundCommand[] {
  const commands: RoundCommand[] = [];
  for (const stance of STANCES) {
    for (const option of listOptions(state, stance)) {
      if (option.legal) commands.push({ round: state.round, stance, actionId: option.actionId, targetId: option.targetId });
    }
  }
  return commands;
}

/**
 * Preview ≡ commit for one CHOOSE state: every legal command previews and
 * commits, neither call mutates the input, the preview events equal the
 * resolution prefix of the commit events, and the projection equals the
 * commit's resolution outcome (before next-round planning).
 */
function checkPreviewEqualsCommit(state: CombatState): void {
  expect(state.phase).toBe('CHOOSE');
  const commands = legalCommands(state);
  // Brace on self is always legal: the walk never runs dry.
  expect(commands.length).toBeGreaterThan(0);

  for (const command of commands) {
    const label = `${command.stance}/${command.actionId}/${command.targetId ?? 'null'}`;
    const before = JSON.stringify(state);

    const preview = previewRound(state, command);
    expect(JSON.stringify(state), `${label}: preview mutated its input`).toBe(before);
    expect(preview.ok, `${label}: legal command rejected by preview`).toBe(true);
    if (!preview.ok) throw new Error(`preview rejected ${label}`);

    const committed = submitRound(state, command);
    expect(JSON.stringify(state), `${label}: submit mutated its input`).toBe(before);
    expect(committed.ok, `${label}: legal command rejected by submit`).toBe(true);
    if (!committed.ok) throw new Error(`submit rejected ${label}`);

    // The commit is the resolution plus, for a continuing fight, planning.
    expect(committed.events.slice(0, preview.events.length), `${label}: events diverge`).toEqual(preview.events);
    const tail = committed.events.slice(preview.events.length);
    if (committed.state.result !== null) {
      expect(tail, `${label}: terminal round planned further`).toEqual([]);
      expect(committed.state, `${label}: terminal projection diverges`).toEqual(preview.projected);
    } else {
      expect(tail.length, `${label}: continuing round planned nothing`).toBeGreaterThan(0);
      for (const event of tail) expect(event['type'], `${label}: non-plan event after resolution`).toBe('round-planned');
      // Same resolution outcome; only the frozen plans and the phase differ.
      expect(committed.state.actors, `${label}: actors diverge`).toEqual(preview.projected.actors);
      expect(committed.state.engagements, `${label}: engagements diverge`).toEqual(preview.projected.engagements);
      expect(committed.state.round, `${label}: round diverges`).toBe(preview.projected.round);
      expect(committed.state.result, `${label}: result diverges`).toBe(preview.projected.result);
      expect(committed.state.nextGroupSerial, `${label}: group serial diverges`).toBe(preview.projected.nextGroupSerial);
      expect(committed.state.log, `${label}: log diverges`).toEqual([...preview.projected.log, ...tail]);
      expect(preview.projected.phase, `${label}: preview planned`).toBe('PLAN');
      expect(preview.projected.frozenEnemyPlans, `${label}: preview planned`).toEqual([]);
      expect(preview.projected.frozenCompanionPlan, `${label}: preview planned`).toBeNull();
      expect(committed.state.phase, `${label}: submit did not plan`).toBe('CHOOSE');
    }
  }
}

const BRACE: RoundCommand = { round: 1, stance: 'balanced', actionId: 'brace', targetId: 'h01' };

/** Walk a scenario: check every reached CHOOSE state, advance one command. */
function walkScenario(id: ScenarioId, line: readonly RoundCommand[], maxRounds: number): CombatState[] {
  const started = startCombat(scenarioInitial(id));
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error(`startCombat rejected ${id}`);
  let state = started.state;
  const reached: CombatState[] = [];
  for (let step = 0; step < maxRounds && state.phase === 'CHOOSE' && state.result === null; step += 1) {
    reached.push(state);
    checkPreviewEqualsCommit(state);
    const next = line[step] ?? { ...BRACE, round: state.round };
    expect(next.round).toBe(state.round);
    const advanced = submitRound(state, next);
    expect(advanced.ok, `${id} round ${state.round}: walk command rejected`).toBe(true);
    if (!advanced.ok) throw new Error(`walk command rejected in ${id}`);
    state = advanced.state;
  }
  return reached;
}

describe('preview ≡ commit along the T1–T7 sequences (K10)', () => {
  it('T1 reaches three Round states on its winning line; every legal command previews as it commits', () => {
    const reached = walkScenario('T1', T1_WINNING_SEQUENCE, 6);
    expect(reached).toHaveLength(3);
  });

  it('T5 reaches three Round states on its winning line; every legal command previews as it commits', () => {
    const reached = walkScenario('T5', T5_WINNING_SEQUENCE, 6);
    expect(reached).toHaveLength(3);
  });

  it.each(SCENARIO_IDS.filter((id) => id !== 'T1' && id !== 'T5'))(
    '%s walks a legal fallback line; every legal command previews as it commits',
    (id) => {
      const reached = walkScenario(id, [], 6);
      expect(reached.length).toBeGreaterThanOrEqual(1);
    },
  );
});
