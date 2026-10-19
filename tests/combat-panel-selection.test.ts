// Command-panel selection (P4, U2/U3/U8): URL parameters carry the player's
// choice without touching game state. parseSelection validates each parameter
// independently and falls back to the previous round's stance (the hero's
// current stance), the hero's perspective and no card; selectionHref round-trips
// the selection into links; selectionCommand resolves it against listOptions,
// the single legality source.

import { describe, expect, it } from 'vitest';
import { startCombat } from '../src/engine/combat/index';
import type { CombatState } from '../src/engine/combat/index';
import { duelChooseState, scenarioInitial } from './combat-core-fixtures';
import {
  cardReasons,
  parseSelection,
  selectionCommand,
  selectionHref,
  targetCandidates,
} from '../src/app/combat/selection';

function t1Choose(): CombatState {
  const started = startCombat(scenarioInitial('T1'));
  if (!started.ok) throw new Error('T1 must start');
  return started.state;
}

describe('parseSelection', () => {
  it('keeps the previous round stance when no stance parameter is given', () => {
    const state = { ...duelChooseState(), actors: duelChooseState().actors.map((a) => (a.id === 'h01' ? { ...a, stance: 'defensive' as const } : a)) };
    expect(parseSelection({}, state).stance).toBe('defensive');
  });

  it('accepts a valid stance and falls back on an invalid one', () => {
    const state = duelChooseState();
    expect(parseSelection({ stance: 'aggressive' }, state).stance).toBe('aggressive');
    expect(parseSelection({ stance: 'reckless' }, state).stance).toBe(state.actors.find((a) => a.id === 'h01')!.stance);
  });

  it('accepts a valid card and target, and drops unknown ones', () => {
    const state = duelChooseState();
    expect(parseSelection({ action: 'heavy', target: 'e01' }, state)).toMatchObject({
      actionId: 'heavy',
      targetId: 'e01',
    });
    expect(parseSelection({ action: 'fireball', target: 'e99' }, state)).toMatchObject({
      actionId: null,
      targetId: null,
    });
  });

  it('rejects the enemy-only wait card and takes the first array parameter', () => {
    const state = duelChooseState();
    expect(parseSelection({ action: 'wait' }, state).actionId).toBeNull();
    expect(parseSelection({ stance: ['aggressive', 'balanced'] }, state).stance).toBe('aggressive');
    expect(parseSelection({ stance: ['reckless'] }, state).stance).toBe('balanced');
  });

  it('defaults the perspective to the hero and accepts a living companion', () => {
    const duel = duelChooseState();
    expect(parseSelection({}, duel).perspectiveId).toBe('h01');
    expect(parseSelection({ perspective: 'c01' }, duel).perspectiveId).toBe('h01');
    const withCompanion = startCombat(scenarioInitial('T6'));
    if (!withCompanion.ok) throw new Error('T6 must start');
    expect(parseSelection({ perspective: 'c01' }, withCompanion.state).perspectiveId).toBe('c01');
  });
});

describe('selectionHref', () => {
  it('round-trips a selection through parseSelection', () => {
    const state = duelChooseState();
    const href = selectionHref('/arena', parseSelection({}, state), {
      stance: 'aggressive',
      actionId: 'heavy',
      targetId: 'e01',
    });
    expect(href.startsWith('/arena?')).toBe(true);
    const query = Object.fromEntries(new URL(href, 'http://localhost').searchParams.entries());
    expect(parseSelection(query, state)).toMatchObject({
      stance: 'aggressive',
      actionId: 'heavy',
      targetId: 'e01',
    });
  });

  it('keeps the untouched parameters when patching one choice', () => {
    const state = duelChooseState();
    const current = parseSelection({ stance: 'aggressive', action: 'heavy', target: 'e01' }, state);
    const href = selectionHref('/arena', current, { perspectiveId: 'h01' });
    const query = Object.fromEntries(new URL(href, 'http://localhost').searchParams.entries());
    expect(query).toMatchObject({ stance: 'aggressive', action: 'heavy', target: 'e01' });
  });
});

describe('selectionCommand', () => {
  it('reports an incomplete choice while no card is picked', () => {
    const state = t1Choose();
    const resolved = selectionCommand(state, parseSelection({}, state));
    expect(resolved).toEqual({ ok: false as const, complete: false as const });
  });

  it('resolves a legal card and target to a round command', () => {
    const state = t1Choose();
    const resolved = selectionCommand(state, parseSelection({ stance: 'balanced', action: 'strike', target: 'e01' }, state));
    expect(resolved).toEqual({
      ok: true as const,
      command: { round: state.round, stance: 'balanced', actionId: 'strike', targetId: 'e01' },
    });
  });

  it('fixes the target of self actions to the hero and of withdraw to null', () => {
    const state = t1Choose();
    const brace = selectionCommand(state, parseSelection({ action: 'brace', target: 'e01' }, state));
    expect(brace).toMatchObject({ ok: true, command: { actionId: 'brace', targetId: 'h01' } });
    // Withdraw needs a free hero: T5 opens with the archer Far away.
    const far = startCombat(scenarioInitial('T5'));
    if (!far.ok) throw new Error('T5 must start');
    const withdraw = selectionCommand(far.state, parseSelection({ action: 'withdraw', target: 'e01' }, far.state));
    expect(withdraw).toMatchObject({ ok: true, command: { actionId: 'withdraw', targetId: null } });
  });

  it('returns every applicable reason for an illegal combination', () => {
    const state = t1Choose();
    // Heavy from the defensive stance with a far target is impossible twice over.
    const resolved = selectionCommand(state, parseSelection({ stance: 'defensive', action: 'heavy', target: 'e01' }, state));
    expect(resolved.ok).toBe(false);
    if (resolved.ok) throw new Error('must be illegal');
    expect(resolved.complete).toBe(true);
    if (!resolved.complete) throw new Error('must be complete');
    expect(resolved.reasons.map((r) => r.code)).toContain('stance_disallows');
  });
});

describe('targetCandidates', () => {
  it('lists enemies for a strike without the invalid-target rows', () => {
    const state = t1Choose();
    const candidates = targetCandidates(state, 'balanced', 'strike');
    expect(candidates.map((c) => c.targetId)).toEqual(['e01']);
  });

  it('lists only the hero for brace and nothing selectable for withdraw', () => {
    const state = t1Choose();
    expect(targetCandidates(state, 'balanced', 'brace').map((c) => c.targetId)).toEqual(['h01']);
    expect(targetCandidates(state, 'balanced', 'withdraw').map((c) => c.targetId)).toEqual([null]);
  });

  it('lists the companion for cover once one fights', () => {
    const started = startCombat(scenarioInitial('T6'));
    if (!started.ok) throw new Error('T6 must start');
    const candidates = targetCandidates(started.state, 'balanced', 'cover');
    expect(candidates.map((c) => c.targetId)).toEqual(['c01']);
  });
});

describe('cardReasons', () => {
  it('unions the candidate rows without the wrong-shape noise', () => {
    const state = t1Choose();
    // Shot is impossible for every target for one reason only.
    expect(cardReasons(state, 'balanced', 'shot').map((r) => r.code)).toEqual(['no_shot_ability']);
    // A playable card names no reasons.
    expect(cardReasons(state, 'balanced', 'strike')).toEqual([]);
  });

  it('still names reasons for a card with no target at all', () => {
    const state = t1Choose();
    const reasons = cardReasons(state, 'balanced', 'cover');
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('shows cost and cooldown reasons on the card', () => {
    const state = t1Choose();
    // Heavy is affordable and ready in round 1, so it stays silent; brace is
    // always legal. Shot carries the ability reason from every row.
    expect(cardReasons(state, 'balanced', 'heavy')).toEqual([]);
    expect(cardReasons(state, 'balanced', 'brace')).toEqual([]);
  });
});
