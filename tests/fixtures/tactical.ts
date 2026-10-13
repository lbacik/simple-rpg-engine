// Reference Encounter-participant packages for the tactical Combat
// content-contract tests (docs/spec/tactical-combat-handoff.md, C1-C4).
// Each builder writes a complete, otherwise-clean Scenario package into a
// temp dir: one Location, one on-demand Scene whose only Choice starts the
// Encounter, and a victory Ending reachable through the Encounter, so the
// package loads with no diagnostics. The pair packages exist for loader
// tests, not for turns, and add no narrative branches or Translation fields.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadScenario, type Scenario } from '../../src/content/index';
import {
  applyAction,
  combatArena,
  startPlaythrough,
  type Action,
  type CombatArenaView,
  type NewJournalEntry,
  type PlaythroughState,
  type Rng,
} from '../../src/engine/index';

export type TacticalFixtureKind =
  | 'legacy'
  | 'explicit-solo'
  | 'pair-defaulted'
  | 'pair-wolves'
  | 'pair-heavy';

function write(scenarioDir: string, relative: string, content: string): void {
  const full = path.join(scenarioDir, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

type Behaviour = 'steady' | 'heavy';

const GREY_WOLF = (behaviour: Behaviour | undefined): string =>
  [
    '- id: grey-wolf',
    '  name: Grey Wolf',
    '  description: Lean and scarred.',
    '  attributes: { might: 2, agility: 2, wits: 1, presence: 0 }',
    '  health: 8',
    '  damage: 2',
    '  reach: melee',
    ...(behaviour === undefined ? [] : [`  behaviour: ${behaviour}`]),
    '',
  ].join('\n');

const BANDIT_ARCHER = (behaviour: Behaviour | undefined): string =>
  [
    '- id: bandit-archer',
    '  name: Bandit Archer',
    '  description: A ragged deserter with a longbow.',
    '  attributes: { might: 1, agility: 2, wits: 1, presence: 1 }',
    '  health: 6',
    '  damage: 2',
    '  reach: ranged',
    ...(behaviour === undefined ? [] : [`  behaviour: ${behaviour}`]),
    '',
  ].join('\n');

function encounterDoc(encounterId: string, body: string): string {
  return [
    `- id: ${encounterId}`,
    ...body.split('\n'),
    '  startRange: far',
    '  text: |',
    '    Teeth and arrows in the dark.',
    '  victory:',
    '    text: |',
    '      Quiet returns to the glade.',
    '    end: home',
    '  escape:',
    '    text: |',
    '      You slip away between the trees.',
    '    move: glade',
    '',
  ].join('\n');
}

const FIXTURE_SPECS: Record<
  TacticalFixtureKind,
  { encounterId: string; enemies: string; encounterBody: string }
> = {
  // Unmodified legacy spelling: `enemy:` and no behaviour keys.
  legacy: {
    encounterId: 'legacy-ambush',
    enemies: GREY_WOLF(undefined),
    encounterBody: '  enemy: grey-wolf',
  },
  // One-entry explicit id.
  'explicit-solo': {
    encounterId: 'solo-ambush',
    enemies: GREY_WOLF(undefined),
    encounterBody: '  participants:\n    - id: wolf-solo\n      enemy: grey-wolf',
  },
  // Grey Wolf + Bandit Archer with defaulted ids (steady/heavy).
  'pair-defaulted': {
    encounterId: 'mixed-ambush',
    enemies: GREY_WOLF('steady') + BANDIT_ARCHER('heavy'),
    encounterBody: '  participants:\n    - enemy: grey-wolf\n    - enemy: bandit-archer',
  },
  // Two Grey Wolves with distinct explicit ids.
  'pair-wolves': {
    encounterId: 'wolves-ambush',
    enemies: GREY_WOLF('steady'),
    encounterBody:
      '  participants:\n    - id: wolf-a\n      enemy: grey-wolf\n    - id: wolf-b\n      enemy: grey-wolf',
  },
  // Two-heavy selection fixture: two Bandit Archers with distinct ids.
  'pair-heavy': {
    encounterId: 'archers-ambush',
    enemies: BANDIT_ARCHER('heavy'),
    encounterBody:
      '  participants:\n    - id: archer-a\n      enemy: bandit-archer\n    - id: archer-b\n      enemy: bandit-archer',
  },
};

export function loadTacticalFixture(kind: TacticalFixtureKind): {
  dir: string;
  scenario: Scenario;
} {
  const spec = FIXTURE_SPECS[kind];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rpg-tactical-${kind}-`));
  const name = path.basename(dir);
  const scenarioDir = path.join(dir, name);
  write(
    scenarioDir,
    'scenario.yaml',
    [
      'schemaVersion: 1',
      `id: ${name}`,
      'title: Tactical Fixture',
      'description: Reference participants package.',
      'version: "1.0.0"',
      'language: en',
      'startLocation: glade',
      'deathEnding: death',
      'locations:',
      '  - locations/glade.yaml',
      'scenes:',
      '  - scenes/ambush.yaml',
      'items:',
      '  - items.yaml',
      'enemies:',
      '  - enemies.yaml',
      'encounters:',
      '  - encounters.yaml',
      'templates:',
      '  - templates.yaml',
      'endings:',
      '  - endings.yaml',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/glade.yaml',
    [
      'id: glade',
      'name: Glade',
      'description: Sunlight through leaves.',
      'map: { x: 10, y: 20 }',
      'scenes: [ambush]',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'scenes/ambush.yaml',
    [
      'id: ambush',
      'title: Ambush',
      'trigger: on-demand',
      'text: Something moves beyond the trees.',
      'choices:',
      '  - id: confront',
      '    text: Stand and confront it.',
      '    outcome:',
      `      start-combat: ${spec.encounterId}`,
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'items.yaml',
    '- id: sword\n  kind: equipment\n  name: Sword\n  slot: weapon\n  damage: 3\n',
  );
  write(scenarioDir, 'enemies.yaml', spec.enemies);
  write(scenarioDir, 'encounters.yaml', encounterDoc(spec.encounterId, spec.encounterBody));
  write(
    scenarioDir,
    'templates.yaml',
    '- id: hunter\n  name: Hunter\n  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }\n  items:\n    - { item: sword }\n',
  );
  write(
    scenarioDir,
    'endings.yaml',
    '- id: death\n  kind: defeat\n  title: Gone\n  text: The end.\n- id: home\n  kind: victory\n  title: Home\n  text: You made it.\n',
  );
  const result = loadScenario(scenarioDir);
  if (!result.ok) {
    throw new Error(`tactical fixture ${kind} failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return { dir: scenarioDir, scenario: result.scenario };
}

// ---------------------------------------------------------------------------
// Shared arena examples (R12, issue #123): scenario, live Combat state, the
// projected arena and the Journal so far, for app and UI tests: one
// participant, a same-kind pair, wolf + archer, and a pair with one defeated.
// Built through real engine transitions with finite dice, never hand-built,
// so the layouts stay honest as the rules evolve. The projection itself reads
// no Journal: the entries ride along only as shared round-event layouts.
// ---------------------------------------------------------------------------

export type ArenaExampleKind = 'solo' | 'wolves' | 'mixed' | 'defeated';

export type ArenaExample = {
  scenario: Scenario;
  state: PlaythroughState;
  arena: CombatArenaView;
  journal: NewJournalEntry[];
};

/** An rng that must never be called: proves a step draws no dice. */
function silentRng(): Rng {
  return () => {
    throw new Error('no dice expected');
  };
}

function diceRng(dice: number[]): Rng {
  let index = 0;
  return (min: number, max: number) => {
    const die = dice[index];
    if (die === undefined || die < min || die >= max) {
      throw new Error(`die ${String(die)} outside [${min}, ${max})`);
    }
    index += 1;
    return die;
  };
}

/**
 * Enter the fixture's Encounter: start a Playthrough as the Hunter, open the
 * on-demand ambush Scene and confront it. `selectionDice` feeds the opening
 * Intent selection (only a heavy participant draws there).
 */
function enterEncounter(
  kind: TacticalFixtureKind,
  selectionDice: number[] = [],
): { scenario: Scenario; state: PlaythroughState; journal: NewJournalEntry[] } {
  const { scenario } = loadTacticalFixture(kind);
  const started = startPlaythrough(scenario, 'hunter', 'Robin', silentRng());
  if (!started.ok) {
    throw new Error('arena example failed to start');
  }
  let state = started.state;
  let journal: NewJournalEntry[] = [...started.journal];
  const submit = (action: Action, rng: Rng): void => {
    const result = applyAction(scenario, state, action, rng);
    if (!result.ok) {
      throw new Error(`arena example action failed: ${JSON.stringify(action)}`);
    }
    state = result.state;
    journal = [...journal, ...result.journal];
  };
  submit({ kind: 'open-scene', sceneId: 'ambush', expectedStep: state.step }, silentRng());
  submit(
    { kind: 'choose', choiceId: 'confront', expectedStep: state.step },
    diceRng(selectionDice),
  );
  return { scenario, state, journal };
}

function arenaOf(
  scenario: Scenario,
  state: PlaythroughState,
  journal: NewJournalEntry[],
): ArenaExample {
  const arena = combatArena(scenario, state);
  if (arena === undefined) {
    throw new Error('arena example has no active Combat');
  }
  return { scenario, state, arena, journal };
}

/**
 * One shared layout per kind:
 * - solo: one Grey Wolf (explicit id), opening Round at Far;
 * - wolves: two Grey Wolves (wolf-a, wolf-b), opening Round at Far;
 * - mixed: Grey Wolf + Bandit Archer at Far with the archer preparing
 *   (selection die 1: Prepare), so the layout carries a preparation;
 * - defeated: the wolves pair after Robin advances and defeats wolf-a in
 *   three hits (all Enemy attacks miss), leaving wolf-a's grey lane.
 */
export function loadArenaExample(kind: ArenaExampleKind): ArenaExample {
  if (kind === 'solo') {
    const { scenario, state, journal } = enterEncounter('explicit-solo');
    return arenaOf(scenario, state, journal);
  }
  if (kind === 'wolves') {
    const { scenario, state, journal } = enterEncounter('pair-wolves');
    return arenaOf(scenario, state, journal);
  }
  if (kind === 'mixed') {
    const { scenario, state, journal } = enterEncounter('pair-defaulted', [1]);
    return arenaOf(scenario, state, journal);
  }
  const entered = enterEncounter('pair-wolves');
  const { scenario } = entered;
  let state = entered.state;
  let journal: NewJournalEntry[] = [...entered.journal];
  const submit = (action: Action, dice: number[]): void => {
    const result = applyAction(scenario, state, action, diceRng(dice));
    if (!result.ok) {
      throw new Error(`defeated example action failed: ${JSON.stringify(action)}`);
    }
    state = result.state;
    journal = [...journal, ...result.journal];
  };
  // Round 1: Advance on wolf-a while both wolves close in (no rolls).
  submit(
    {
      kind: 'combat',
      combatAction: 'advance',
      targetParticipantId: 'wolf-a',
      expectedStep: state.step,
    },
    [],
  );
  // Rounds 2-4: Strike wolf-a for 3 Damage a hit (4+4+Might 1 hits on 9);
  // both wolves Strike and miss (1+1+Might 2 misses on 10). The third hit
  // defeats wolf-a; its queued action drops while wolf-b still acts.
  for (let round = 0; round < 3; round += 1) {
    submit(
      {
        kind: 'combat',
        combatAction: 'attack',
        targetParticipantId: 'wolf-a',
        expectedStep: state.step,
      },
      [4, 4, 1, 1, 1, 1],
    );
  }
  return arenaOf(scenario, state, journal);
}
