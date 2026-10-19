// P1a K4 probe: a client component importing the shared Combat core.
// It parses a minimal valid state and counts the hero's legal options
// with listOptions, proving the core is importable by the browser.

'use client';

import { findOption, listOptions, parseCombatState } from '@/engine/combat/index';

const MINIMAL_STATE = {
  rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
  round: 1,
  phase: 'PLAN',
  result: null,
  nextGroupSerial: 1,
  actors: [
    {
      id: 'h01',
      ref: null,
      team: 'heroes',
      role: 'hero',
      profileId: 'hero',
      hp: 40,
      stamina: 10,
      stance: 'balanced',
      groupId: 'g0',
      readyRound: null,
      availableRound: { heavy: 1, counter: 1, feint: 1, cover: 1, charge: 1, prepare: 1 },
    },
    {
      id: 'e01',
      ref: null,
      team: 'enemies',
      role: 'enemy',
      profileId: 'raider',
      hp: 14,
      stamina: null,
      stance: 'balanced',
      groupId: 'g0',
      readyRound: null,
      availableRound: {},
      phaseOffset: 0,
      waitAge: 0,
    },
  ],
  engagements: [['e01', 'h01']],
  frozenEnemyPlans: [],
  frozenCompanionPlan: null,
  log: [],
};

export default function CombatCoreProbe() {
  const parsed = parseCombatState(MINIMAL_STATE);
  if (!parsed.ok) return <p>Combat core probe: invalid state.</p>;
  const options = listOptions(parsed.state, 'balanced');
  const brace = findOption(options, 'brace', 'h01');
  return (
    <p>
      Combat core probe: {options.length} options, {options.filter((option) => option.legal).length} legal; Brace
      legal: {brace?.legal === true ? 'yes' : 'no'}.
    </p>
  );
}
