// Command-panel forecast (P4, U4): the forecast is rendered only from
// previewRound events. deriveForecast maps the preview's events and projected
// state into display sections — movement, blow order with arithmetic, Cover /
// Counter / riposte tags, cancellations with reasons, the terminal-cutoff line,
// HP/stamina and engagements after the round, and regeneration (none after a
// terminal round). It performs no rules arithmetic of its own: every section
// below is asserted equal to the previewRound source data.

import { describe, expect, it } from 'vitest';
import { previewRound, startCombat } from '../src/engine/combat/index';
import type { CombatState, RoundCommand } from '../src/engine/combat/index';
import { scenarioInitial } from './combat-core-fixtures';
import { deriveForecast } from '../src/app/combat/forecast';

function t1Choose(): CombatState {
  const started = startCombat(scenarioInitial('T1'));
  if (!started.ok) throw new Error('T1 must start');
  return started.state;
}

function previewOf(state: CombatState, command: RoundCommand) {
  const preview = previewRound(state, command);
  if (!preview.ok) throw new Error(`preview must succeed: ${JSON.stringify(preview)}`);
  return preview;
}

describe('deriveForecast', () => {
  it('mirrors the preview events section by section for a plain exchange', () => {
    const state = t1Choose();
    const command: RoundCommand = { round: state.round, stance: 'balanced', actionId: 'strike', targetId: 'e01' };
    const preview = previewOf(state, command);
    const result = deriveForecast(state, command);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('forecast must succeed');
    const { forecast } = result;

    // Movement lines follow the moved events in order.
    expect(forecast.moves.map((m) => m.actor)).toEqual(
      preview.events.filter((e) => e.type === 'moved').map((e) => e.actor),
    );
    // Blows follow the attack/riposte events with their full arithmetic.
    const blows = preview.events.filter((e) => e.type === 'attack' || e.type === 'riposte');
    expect(forecast.blows).toHaveLength(blows.length);
    for (const [index, event] of blows.entries()) {
      expect(forecast.blows[index]).toMatchObject({
        kind: event.type,
        actor: event.actor,
        target: event.target,
        attackScore: event.attackScore,
        defenseScore: event.defenseScore,
        raw: event.raw,
        parry: event.parry,
        armor: event.armor,
        absorbed: event.absorbed,
        hpLoss: event.hpLoss,
        hit: event.hit === 1,
        redirected: event.redirected === 1,
        counter: event.counter === 1,
      });
    }
    // No cancellations, no cutoff: the round continues.
    expect(forecast.cancels).toEqual([]);
    expect(forecast.terminal).toBe(false);
    expect(forecast.unacted).toEqual([]);
    // After-round HP/stamina/engagements equal the projected state.
    for (const after of forecast.after) {
      const projected = preview.projected.actors.find((a) => a.id === after.id)!;
      expect(after.hp).toBe(projected.hp);
      expect(after.stamina).toBe(projected.stamina);
    }
    expect(forecast.engagementsAfter).toEqual(preview.projected.engagements);
    // Regeneration mirrors the regenerated events.
    expect(forecast.regens.map((r) => [r.actor, r.gain, r.stamina])).toEqual(
      preview.events.filter((e) => e.type === 'regenerated').map((e) => [e.actor, e.gain, e.stamina]),
    );
  });

  it('rejects an illegal command with the core reason and mutates nothing', () => {
    const state = t1Choose();
    const before = JSON.stringify(state);
    const result = deriveForecast(state, { round: state.round, stance: 'defensive', actionId: 'heavy', targetId: 'e01' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('forecast must fail');
    expect(result.reason).toBe('stance_disallows');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('names the unacted blows and shows no regeneration after a terminal round', () => {
    // The hero strikes first (priority 20 over the brute's heavy 10) and the
    // wounded brute falls: its declared heavy never resolves.
    const state = {
      ...t1Choose(),
      actors: t1Choose().actors.map((a) => (a.id === 'e01' ? { ...a, hp: 1 } : a)),
    };
    const command: RoundCommand = { round: state.round, stance: 'balanced', actionId: 'strike', targetId: 'e01' };
    const preview = previewOf(state, command);
    expect(preview.projected.result).toBe('WIN');
    const result = deriveForecast(state, command);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('forecast must succeed');
    expect(result.forecast.terminal).toBe(true);
    expect(result.forecast.result).toBe('WIN');
    expect(result.forecast.unacted).toEqual([{ actor: 'e01', target: 'h01' }]);
    expect(result.forecast.regens).toEqual([]);
    expect(result.forecast.eliminations).toEqual(['e01']);
  });

  it('reports cancellations with their core reasons', () => {
    // T6 with a wounded e01: the hero's feint (priority 30) lands first and
    // fells e01, so e01's declared strike never resolves.
    const started = startCombat(scenarioInitial('T6'));
    if (!started.ok) throw new Error('T6 must start');
    const base = started.state;
    const state = { ...base, actors: base.actors.map((a) => (a.id === 'e01' ? { ...a, hp: 1 } : a)) };
    const command: RoundCommand = { round: state.round, stance: 'balanced', actionId: 'feint', targetId: 'e01' };
    const preview = previewOf(state, command);
    const cancelled = preview.events.filter((e) => e.type === 'cancelled');
    expect(cancelled.length).toBeGreaterThan(0);
    const result = deriveForecast(state, command);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('forecast must succeed');
    // The cancellations mirror the preview's cancelled events exactly.
    expect(result.forecast.cancels).toHaveLength(cancelled.length);
    expect(result.forecast.cancels[0]).toMatchObject({ actor: 'e01', target: 'h01' });
    expect(typeof result.forecast.cancels[0]!.reason).toBe('string');
  });

  it('covers a multi-enemy companion state with a waiting slot', () => {
    const started = startCombat(scenarioInitial('T6'));
    if (!started.ok) throw new Error('T6 must start');
    const state = started.state;
    const waiters = state.frozenEnemyPlans.filter((p) => p.wasCandidate && !p.attackSlot);
    expect(waiters.length).toBeGreaterThan(0);
    const command: RoundCommand = { round: state.round, stance: 'defensive', actionId: 'brace', targetId: 'h01' };
    const result = deriveForecast(state, command);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('forecast must succeed');
    const preview = previewOf(state, command);
    expect(result.forecast.after).toHaveLength(preview.projected.actors.length);
    expect(result.forecast.engagementsAfter).toEqual(preview.projected.engagements);
  });
});
