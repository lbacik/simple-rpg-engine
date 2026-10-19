import { describe, expect, it } from 'vitest';
import { startCombat, submitRound } from '../src/engine/combat/index';
import type { CombatState } from '../src/engine/combat/index';
import { buildInitialCombatState } from '../src/content/combatBuilder';
import type { CompiledEncounter } from '../src/content/model';

function encounter(
  ids: string[],
  profile: 'brute' | 'raider' = 'raider',
  power = 3,
): CompiledEncounter {
  return {
    id: 'scratch',
    participants: ids.map((id) => ({
      id,
      enemy: { id: `${id}-enemy`, name: id, profile },
      startRange: 'melee',
      phaseOffset: 0,
      power,
    })),
    text: 'scratch',
    victory: { text: 'v', effects: [] },
    surrender: { text: 's', effects: [] },
    draw: { text: 'd', effects: [] },
  };
}

const astrid = { id: 'astrid', name: 'Astrid the Skald', profile: 'party-sentinel' as const };

type Cmd = { stance: 'aggressive' | 'balanced' | 'defensive'; action: string; target: string };

function run(name: string, cmds: Cmd[]): void {
  const started = startCombat(
    buildInitialCombatState(encounter(['a', 'b', 'c']), { heroHp: 40, companion: astrid }),
  );
  if (!started.ok) throw new Error('start failed');
  let state = started.state;
  console.log(`=== ${name} ===`);
  for (const cmd of cmds) {
    if (state.result !== null || state.phase !== 'CHOOSE') break;
    const res = submitRound(state, {
      round: state.round,
      stance: cmd.stance,
      actionId: cmd.action,
      targetId: cmd.target,
    });
    if (!res.ok) {
      console.log(`round ${state.round}: rejected ${res.reason}`);
      break;
    }
    state = res.state;
    const summary = state.actors.map((a) => `${a.id}:${a.hp}`).join(' ');
    console.log(`after round ${state.round - (state.result ? 0 : 1)}: ${summary} result=${state.result}`);
  }
}

const S = (t: string): Cmd => ({ stance: 'aggressive', action: 'strike', target: t });
const B: Cmd = { stance: 'defensive', action: 'brace', target: 'h01' };

describe('scratch', () => {
  it('variants', () => {
    run('all strike e01 first', [S('e01'), S('e01'), S('e01'), S('e02'), S('e02'), S('e03'), S('e03'), S('e03'), S('e03')]);
    run('brace x4 then strike', [B, B, B, B, S('e01'), S('e01'), S('e02'), S('e02'), S('e03'), S('e03')]);
    run('brace,brace,brace,strike...', [B, B, B, S('e01'), S('e01'), S('e02'), S('e02'), S('e03'), S('e03')]);
    expect(true).toBe(true);
  });
});
