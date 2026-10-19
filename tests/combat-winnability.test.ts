// P3 C6 (winnability, #236): one test per converted Encounter.
//
// Each test plays a recorded command sequence to WIN against the full
// roster, hero at 40 HP, no Companion (Q10 gate). Sequences were found by
// deterministic search over the shared core (planRound/submitRound) and are
// replayed verbatim here; the core is deterministic so initial state plus
// this command list always gives the same WIN.
//
// No tuning was needed: every Encounter passes as converted (#184 Q12/Q13
// values), so no phaseOffset/power/startRange change and no stop condition.
// See docs/spec/content-migration-1.0.md (Winnability gate C6).

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildInitialCombatState, loadScenario } from '../src/content/index';
import { startCombat, submitRound } from '../src/engine/combat/index';
import type { CombatState, RoundCommand } from '../src/engine/combat/index';

type Step = { round: number; stance: RoundCommand['stance']; actionId: RoundCommand['actionId']; targetId: RoundCommand['targetId'] };

// The shipped v2 collection. The coverage test loads these directories from
// disk (not from WINNING_LINES keys) so a missing scenario cannot pass
// silently.
const SCENARIO_DIRS = [
  'scenarios/whispering-woods',
  'scenarios/perun-stone',
  'scenarios/the-drowned-ledger',
  'scenarios/the-ember-pass',
  'scenarios/the-frost-cairn',
];

const WINNING_LINES: Record<string, Record<string, Step[]>> = {
  'scenarios/whispering-woods': {
    'camp-bandit': [
      { round: 1, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 2, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 3, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 4, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'hollow-wolf': [
      { round: 1, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'wight-fight': [
      { round: 1, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
  },
  'scenarios/perun-stone': {
    'wolf-fight': [
      { round: 1, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'utopiec-fight': [
      { round: 1, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
  },
  'scenarios/the-drowned-ledger': {
    'porter-fight': [
      { round: 1, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
    ],
    'foundry-fight': [
      { round: 1, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'tower-fight': [
      { round: 1, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 2, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 3, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 4, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'auditor-fight': [
      { round: 1, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
  },
  'scenarios/the-ember-pass': {
    'road-wolves': [
      { round: 1, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
      { round: 4, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
    ],
    'tower-assault': [
      { round: 1, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
      { round: 4, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 5, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 6, stance: 'aggressive', actionId: 'approach', targetId: 'e02' },
      { round: 7, stance: 'aggressive', actionId: 'charge', targetId: 'e02' },
      { round: 8, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
    ],
    'tower-roof': [
      { round: 1, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'tower-stairs': [
      { round: 1, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
    ],
    'ford-troll': [
      { round: 1, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 4, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
    ],
    'mine-crawler': [
      { round: 1, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
    ],
    'depths-pair': [
      { round: 1, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
      { round: 4, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
    ],
    'gate-guards': [
      { round: 1, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
      { round: 4, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
    ],
    'gate-lone-guard': [
      { round: 1, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
    ],
    'shrine-brute': [
      { round: 1, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 4, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
    ],
    'pen-brute': [
      { round: 1, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'shaman-rite': [
      { round: 1, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e02' },
      { round: 3, stance: 'aggressive', actionId: 'strike', targetId: 'e02' },
      { round: 4, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 5, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 6, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 7, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 8, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'warlord-duel': [
      { round: 1, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 4, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
    ],
    'warlord-and-guard': [
      { round: 1, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 4, stance: 'balanced', actionId: 'counter', targetId: 'h01' },
      { round: 5, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 6, stance: 'aggressive', actionId: 'approach', targetId: 'e02' },
      { round: 7, stance: 'aggressive', actionId: 'charge', targetId: 'e02' },
      { round: 8, stance: 'aggressive', actionId: 'feint', targetId: 'e02' },
    ],
  },
  'scenarios/the-frost-cairn': {
    'shore-wolves': [
      { round: 1, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
      { round: 4, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
    ],
    'ridge-sentry': [
      { round: 1, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'gate-guards': [
      { round: 1, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 2, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 3, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 4, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
      { round: 6, stance: 'aggressive', actionId: 'approach', targetId: 'e02' },
      { round: 7, stance: 'aggressive', actionId: 'charge', targetId: 'e02' },
      { round: 8, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
    ],
    'gate-sentry-lone': [
      { round: 1, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'gallery-patrol': [
      { round: 1, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'strike', targetId: 'e02' },
      { round: 4, stance: 'aggressive', actionId: 'feint', targetId: 'e02' },
      { round: 5, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
    ],
    'crevice-skulker': [
      { round: 1, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 2, stance: 'aggressive', actionId: 'brace', targetId: 'h01' },
      { round: 3, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 4, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 5, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'shrine-berserker': [
      { round: 1, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
    ],
    'harek-and-guard': [
      { round: 1, stance: 'aggressive', actionId: 'approach', targetId: 'e01' },
      { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
      { round: 4, stance: 'aggressive', actionId: 'feint', targetId: 'e02' },
      { round: 5, stance: 'balanced', actionId: 'counter', targetId: 'h01' },
      { round: 6, stance: 'aggressive', actionId: 'disengage', targetId: 'h01' },
      { round: 7, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
      { round: 8, stance: 'aggressive', actionId: 'feint', targetId: 'e01' },
      { round: 9, stance: 'aggressive', actionId: 'heavy', targetId: 'e02' },
    ],
  },
};

function loadScenarioOrFail(scenarioDir: string) {
  const repoRoot = path.resolve(__dirname, '..');
  const loaded = loadScenario(path.join(repoRoot, scenarioDir));
  expect(loaded.ok, `${scenarioDir} loads`).toBe(true);
  if (!loaded.ok) throw new Error(`${scenarioDir} failed to load`);
  return loaded.scenario;
}

function playToWin(scenarioDir: string, encounterId: string, sequence: Step[]): void {
  const scenario = loadScenarioOrFail(scenarioDir);
  const encounter = scenario.encounters.find((found) => found.id === encounterId);
  expect(encounter, `${scenarioDir}/${encounterId} exists`).toBeDefined();
  if (!encounter) return;
  // C6 gate conditions: full roster, hero at 40 HP, no Companion.
  const initial = buildInitialCombatState(encounter, { heroHp: 40 });
  expect(encounter.participants.length).toBeGreaterThan(0);
  expect(initial.actors.filter((actor) => actor.team === 'enemies')).toHaveLength(encounter.participants.length);
  expect(initial.actors.find((actor) => actor.id === 'h01')?.hp).toBe(40);
  expect(initial.actors.some((actor) => actor.role === 'companion')).toBe(false);

  const started = startCombat(initial);
  expect(started.ok, `${scenarioDir}/${encounterId} starts`).toBe(true);
  if (!started.ok) return;
  let state: CombatState = started.state;
  for (const step of sequence) {
    const command: RoundCommand = { round: step.round, stance: step.stance, actionId: step.actionId, targetId: step.targetId };
    const result = submitRound(state, command);
    expect(result.ok, `${scenarioDir}/${encounterId} round ${step.round} ${step.actionId} accepted`).toBe(true);
    if (!result.ok) return;
    state = result.state;
  }
  expect(state.result).toBe('WIN');
  expect(state.phase).toBe('FINISHED');
}

describe('C6 winnability: recorded command sequences reach WIN (hero 40 HP, no Companion)', () => {
  for (const [scenarioDir, encounters] of Object.entries(WINNING_LINES)) {
    for (const [encounterId, sequence] of Object.entries(encounters)) {
      it(`${scenarioDir}/${encounterId} wins in ${sequence.length} rounds`, () => {
        playToWin(scenarioDir, encounterId, sequence);
      });
    }
  }

  it('covers every converted Encounter in all five Scenarios', () => {
    expect(Object.keys(WINNING_LINES).sort()).toEqual([...SCENARIO_DIRS].sort());
    const covered = new Set<string>();
    for (const [scenarioDir, encounters] of Object.entries(WINNING_LINES)) {
      for (const encounterId of Object.keys(encounters)) covered.add(`${scenarioDir}/${encounterId}`);
    }
    const shipped: string[] = [];
    for (const scenarioDir of SCENARIO_DIRS) {
      for (const encounter of loadScenarioOrFail(scenarioDir).encounters) {
        shipped.push(`${scenarioDir}/${encounter.id}`);
      }
    }
    expect(shipped.sort()).toEqual([...covered].sort());
    expect(shipped.length).toBeGreaterThan(0);
  });
});
