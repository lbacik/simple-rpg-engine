// Capture genuine v1 Playthrough documents and their Journal rows as test
// fixtures (tactical-combat-handoff, release sequence step 1; state
// playthrough-state.md, version 1 to version 2).
//
// Every fixture is produced by driving the real engine paths
// (`startPlaythrough` + `applyAction` on the real whispering-woods package)
// with injected deterministic dice — nothing is hand-written. The one
// exception is `incompatible`: it starts from an engine-produced document and
// applies a minimal programmatic drift (a stored Location id that no longer
// exists) to simulate a content removal, which is exactly what makes a save
// incompatible. Journal rows use the stored shape (`seq`, `step`, `type`,
// `lang`, `payload`), with each action's entries stamped at the resulting
// state's step, mirroring `src/app/lib/turn.ts`.
//
// Usage: `npx tsx scripts/capture-state-v1-fixtures.ts`. Re-running overwrites
// the fixtures; the fixture test fails when the Scenario content hash moves,
// forcing a deliberate recapture.

import fs from 'node:fs';
import path from 'node:path';
import { loadScenario, type Scenario } from '../src/content/loadScenario';
import {
  applyAction,
  startPlaythrough,
  type Action,
  type ApplyActionResult,
  type NewJournalEntry,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';

const repoRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(repoRoot, 'tests', 'fixtures', 'state-v1');

type StoredRow = {
  seq: number;
  step: number;
  type: string;
  lang: string;
  payload: Record<string, unknown>;
};

type FixtureFile = {
  meta: {
    name: string;
    description: string;
    scenarioId: string;
    scenarioVersion: string;
    contentHash: string;
    scenarioLanguage: string;
    capturedWith: string;
  };
  state: PlaythroughState;
  journal: StoredRow[];
};

type Success = Extract<ApplyActionResult, { ok: true }>;

/** Omit over the Action union, distributed per variant. */
type WithoutStep<T> = T extends unknown ? Omit<T, 'expectedStep'> : never;
type ActionInput = WithoutStep<Action>;

/** Deterministic dice dealing the given values in order, cycling. */
function diceRng(dice: number[]): Rng {
  let index = 0;
  return () => {
    const die = dice[index % dice.length];
    index += 1;
    if (die === undefined) throw new Error('dice ran out');
    return die;
  };
}

/** One capture session: engine state plus accumulated stored-shape Journal rows. */
class Capture {
  state: PlaythroughState;
  journal: StoredRow[] = [];
  private seq = 0;

  constructor(
    readonly scenario: Scenario,
    templateId: string,
    name: string,
  ) {
    const started = startPlaythrough(scenario, templateId, name, diceRng([1]));
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    this.state = started.state;
    this.push(started.journal, started.state.step);
  }

  private push(entries: NewJournalEntry[], step: number): void {
    for (const entry of entries) {
      const { type, lang, ...payload } = entry;
      this.seq += 1;
      this.journal.push({ seq: this.seq, step, type, lang, payload });
    }
  }

  do(action: ActionInput, rng: Rng = diceRng([1])): Success {
    const result = applyAction(
      this.scenario,
      this.state,
      { ...action, expectedStep: this.state.step } as Action,
      rng,
    );
    if (!result.ok) {
      throw new Error(`action failed: ${JSON.stringify(action)}: ${result.reason}`);
    }
    this.state = result.state;
    this.push(result.journal, result.state.step);
    return result;
  }
}

function loadWoods(): Scenario {
  const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
  if (!result.ok) {
    throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

/**
 * Play the legal path from the start to the forest-edge Location view:
 * listen, accept, travel, press on. Whispers has no Test on this path, so no
 * dice are consumed.
 */
function playToDormant(scenario: Scenario): Capture {
  const cap = new Capture(scenario, 'hunter', 'Robin');
  cap.do({ kind: 'choose', choiceId: 'listen' });
  cap.do({ kind: 'choose', choiceId: 'accept' });
  cap.do({ kind: 'travel', targetLocationId: 'forest-edge' });
  cap.do({ kind: 'choose', choiceId: 'press-on' });
  return cap;
}

function metaFor(
  scenario: Scenario,
  name: string,
  description: string,
): FixtureFile['meta'] {
  return {
    name,
    description,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    contentHash: scenario.contentHash,
    scenarioLanguage: scenario.language,
    capturedWith: 'scripts/capture-state-v1-fixtures.ts',
  };
}

function write(name: string, fixture: FixtureFile): void {
  fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`wrote tests/fixtures/state-v1/${name}.json (step ${fixture.state.step})`);
}

function main(): void {
  const scenario = loadWoods();
  fs.mkdirSync(outDir, { recursive: true });
  const index: Array<{ file: string; name: string; description: string }> = [];
  const add = (file: string, fixture: FixtureFile): void => {
    write(file.replace(/\.json$/, ''), fixture);
    index.push({ file, name: fixture.meta.name, description: fixture.meta.description });
  };

  // Dormant mid-Scenario save: Location view at the forest edge.
  const dormant = playToDormant(scenario);
  add('dormant.json', {
    meta: metaFor(
      scenario,
      'dormant',
      'Dormant mid-Scenario save: Location view at the forest edge after the opening scenes.',
    ),
    state: dormant.state,
    journal: dormant.journal,
  });

  // Active one-Enemy Combat at Far, no guard yet: the wolf, round 1.
  const far = playToDormant(scenario);
  far.do({ kind: 'travel', targetLocationId: 'wolf-hollow' });
  far.do({ kind: 'choose', choiceId: 'fight' });
  add('active-combat-far.json', {
    meta: metaFor(
      scenario,
      'active-combat-far',
      'Active one-Enemy Combat at Far (hollow-wolf, round 1) with no guard in its Journal.',
    ),
    state: far.state,
    journal: far.journal,
  });

  // Active one-Enemy Combat at Near: advance against the wolf, round 2.
  // The melee wolf attacks into the advance on dice 1+1 (a miss).
  far.do({ kind: 'combat', combatAction: 'advance' }, diceRng([1, 1]));
  add('active-combat-near.json', {
    meta: metaFor(
      scenario,
      'active-combat-near',
      'Active one-Enemy Combat at Near (hollow-wolf, round 2) after an Advance.',
    ),
    state: far.state,
    journal: far.journal,
  });

  // Active Combat at Far with a raised guard: the bandit archer is ranged, so
  // a Defend keeps the Range at Far while recording guard in the round.
  const guarded = playToDormant(scenario);
  guarded.do({ kind: 'travel', targetLocationId: 'hunters-camp' });
  guarded.do({ kind: 'choose', choiceId: 'fight' });
  guarded.do({ kind: 'combat', combatAction: 'defend' }, diceRng([1, 2]));
  add('active-combat-far-guarded.json', {
    meta: metaFor(
      scenario,
      'active-combat-far-guarded',
      'Active one-Enemy Combat at Far (camp-bandit, round 2) with a raised guard in its Journal.',
    ),
    state: guarded.state,
    journal: guarded.journal,
  });

  // Escaped Encounter with recorded Damage: hit the wolf once (3 Damage on
  // dice 6+6), then Escape at Near (6+6 succeeds). The escape Outcome moves to
  // the forest edge.
  far.do({ kind: 'combat', combatAction: 'attack' }, diceRng([6, 6, 1, 1]));
  far.do({ kind: 'combat', combatAction: 'escape' }, diceRng([6, 6]));
  add('escaped-with-damage.json', {
    meta: metaFor(
      scenario,
      'escaped-with-damage',
      'Escaped Encounter with recorded Damage: hollow-wolf at 3 Damage taken after an Escape.',
    ),
    state: far.state,
    journal: far.journal,
  });

  // Defeated Encounter: a fresh run fights the wolf to victory on fixed dice.
  const won = playToDormant(scenario);
  won.do({ kind: 'travel', targetLocationId: 'wolf-hollow' });
  won.do({ kind: 'choose', choiceId: 'fight' });
  const allSixes = diceRng([6]);
  won.do({ kind: 'combat', combatAction: 'attack' }, allSixes);
  won.do({ kind: 'combat', combatAction: 'attack' }, allSixes);
  won.do({ kind: 'combat', combatAction: 'attack' }, allSixes);
  add('defeated.json', {
    meta: metaFor(
      scenario,
      'defeated',
      'Defeated Encounter: hollow-wolf beaten, victory Outcome applied, back in the Location view.',
    ),
    state: won.state,
    journal: won.journal,
  });

  // Ended save: refuse Brenna at the start, ending on walked-away.
  const ended = new Capture(scenario, 'hunter', 'Robin');
  ended.do({ kind: 'choose', choiceId: 'refuse' });
  add('ended.json', {
    meta: metaFor(
      scenario,
      'ended',
      'Ended save: refused the plea, ended on the walked-away Ending.',
    ),
    state: ended.state,
    journal: ended.journal,
  });

  // Incompatible save: the dormant document with a stored Location id that no
  // longer exists in content, simulating a content removal. The Journal is the
  // engine-produced dormant Journal, untouched.
  const incompatibleState: PlaythroughState = {
    ...dormant.state,
    currentLocationId: 'removed-location',
  };
  add('incompatible.json', {
    meta: metaFor(
      scenario,
      'incompatible',
      'Incompatible save: dormant document whose current Location was removed from content.',
    ),
    state: incompatibleState,
    journal: dormant.journal,
  });

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(
      {
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        contentHash: scenario.contentHash,
        scenarioLanguage: scenario.language,
        fixtures: index,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`wrote tests/fixtures/state-v1/manifest.json (${index.length} fixtures)`);
}

main();
