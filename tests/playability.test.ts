// Phase 4 (Playability) validation tests: one fixture per play/ rule,
// asserting code, file and position, plus the gating and exemption clauses,
// the reachability fixpoint semantics and the acceptance criteria. See
// docs/spec/validation.md (Phase 4); scenarios/whispering-woods is the
// reference clean fixture.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/content/index';
import type { Diagnostic } from '../src/content/index';
import { makePng } from './pngFixture';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');

function makeScenarioDir(name: string): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-play-')), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePackage(dir: string, files: Record<string, string | Buffer>): void {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

// ---------------------------------------------------------------------------
// Minimal clean base: home reaches a victory ending with no conditions.
// Every variant below starts from this package and adds one construct.
// ---------------------------------------------------------------------------

const MANIFEST = `schemaVersion: 1
id: __ID__
title: Test Scenario
description: A test scenario.
version: "1.0"
language: en
startLocation: home
deathEnding: death
__EXTRA__
locations:
  - locations/home.yaml
scenes:
  - scenes/gate.yaml
templates:
  - templates.yaml
endings:
  - endings.yaml
`;

const HOME = `id: home
name: Home
description: A quiet home.
map: { x: 10, y: 20 }
scenes: [gate]
`;

const GATE = `id: gate
title: The Gate
trigger: on-enter
text: Before you stands a gate.
choices:
  - id: go
    text: Go on.
    outcome:
      end: win
`;

const TEMPLATES = `- id: drifter
  name: Drifter
  attributes: { might: 2, agility: 2, wits: 1, presence: 1 }
`;

const ENDINGS = `- id: death
  kind: defeat
  title: Death
  text: Darkness takes you.
- id: win
  kind: victory
  title: Dawn
  text: Morning comes.
`;

function writeBase(dir: string, extra: Record<string, string | Buffer> = {}, manifestExtra = ''): void {
  const id = path.basename(dir);
  writePackage(dir, {
    'scenario.yaml': MANIFEST.replace('__ID__', id).replace('__EXTRA__', manifestExtra),
    'locations/home.yaml': HOME,
    'scenes/gate.yaml': GATE,
    'templates.yaml': TEMPLATES,
    'endings.yaml': ENDINGS,
    ...extra,
  });
}

function freshBase(name: string, extra: Record<string, string | Buffer> = {}, manifestExtra = ''): string {
  const dir = makeScenarioDir(name);
  writeBase(dir, extra, manifestExtra);
  return dir;
}

function mutate(dir: string, file: string, from: string, to: string): void {
  const full = path.join(dir, file);
  const source = fs.readFileSync(full, 'utf8');
  if (!source.includes(from)) throw new Error(`mutation source not found in ${file}: ${from}`);
  fs.writeFileSync(full, source.replace(from, to));
}

function fail(dir: string): Diagnostic[] {
  const result = loadScenario(dir);
  if (result.ok) throw new Error(`expected ${dir} to be rejected, but it loaded`);
  return result.diagnostics;
}

function succeed(dir: string): Diagnostic[] {
  const result = loadScenario(dir);
  if (!result.ok) {
    throw new Error(`expected ${dir} to load, but got: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.warnings;
}

function only(diags: Diagnostic[], code: string): Diagnostic {
  const match = diags.filter((d) => d.code === code);
  expect(match).toHaveLength(1);
  return match[0] as Diagnostic;
}

function codesOf(diags: Diagnostic[]): string[] {
  return diags.map((d) => d.code);
}

describe('playability phase: reference fixtures', () => {
  it('reports no errors and no warnings for scenarios/whispering-woods', () => {
    const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toEqual([]);
  });

  it('loads the minimal base with no diagnostics', () => {
    expect(succeed(freshBase('base-clean'))).toEqual([]);
  });
});

describe('playability phase: errors', () => {
  it('play/no-victory when the only victory ending is unreachable', () => {
    const dir = freshBase('no-victory');
    mutate(dir, 'scenes/gate.yaml', 'end: win', 'end: death');
    const diags = fail(dir);
    const diag = only(diags, 'play/no-victory');
    expect(diag.severity).toBe('error');
    expect(diag.message).toContain('victory');
    // The unreachable victory ending still warns.
    only(diags, 'play/unreachable-ending');
  });

  it('play/no-victory for a copy of the example with the victory ends removed', () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-play-')), 'whispering-woods');
    fs.cpSync(path.join(repoRoot, 'scenarios', 'whispering-woods'), dir, { recursive: true });
    const endingsFile = path.join(dir, 'endings.yaml');
    fs.writeFileSync(endingsFile, fs.readFileSync(endingsFile, 'utf8').replaceAll('kind: victory', 'kind: defeat'));
    const diags = fail(dir);
    expect(codesOf(diags)).toEqual(['play/no-victory']);
  });

  it('play/no-way-out for a location looping back into a dead end', () => {
    const dir = freshBase('no-way-out', {
      'locations/pocket.yaml': `id: pocket
name: Pocket
description: A dead end.
map: { x: 60, y: 60 }
scenes: [rest]
connections:
  - to: cellar
`,
      'locations/cellar.yaml': `id: cellar
name: Cellar
description: A deeper dead end.
map: { x: 80, y: 80 }
scenes: [rest2]
connections:
  - to: pocket
`,
      'scenes/rest.yaml': `id: rest
title: Rest
trigger: on-enter
text: Nothing here.
`,
      'scenes/rest2.yaml': `id: rest2
title: Rest Again
trigger: on-enter
text: Still nothing.
`,
    });
    mutate(dir, 'scenario.yaml', 'locations:\n  - locations/home.yaml', 'locations:\n  - locations/home.yaml\n  - locations/pocket.yaml\n  - locations/cellar.yaml');
    mutate(dir, 'scenario.yaml', '  - scenes/gate.yaml', '  - scenes/gate.yaml\n  - scenes/rest.yaml\n  - scenes/rest2.yaml');
    mutate(
      dir,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n  - id: wander\n    text: Wander off.\n    outcome:\n      move: pocket\n',
    );
    const diags = fail(dir);
    const stuck = diags.filter((d) => d.code === 'play/no-way-out');
    expect(stuck.length).toBeGreaterThanOrEqual(2);
    expect(stuck.every((d) => d.severity === 'error')).toBe(true);
    expect(stuck.some((d) => d.message.includes('"pocket"'))).toBe(true);
    expect(stuck.some((d) => d.message.includes('"cellar"'))).toBe(true);
    for (const diag of stuck) expect(diag.path).toEqual(['id']);
    // The victory is still reachable from home, so no-victory stays silent.
    expect(codesOf(diags)).not.toContain('play/no-victory');
  });
});

describe('playability phase: unreachable warnings', () => {
  it('warns for unreachable locations, scenes, encounters and endings, exempting the death ending', () => {
    const dir = freshBase(
      'unreachable',
      {
        'locations/far.yaml': `id: far
name: Far
description: Nowhere near.
map: { x: 90, y: 90 }
`,
        'scenes/lost.yaml': `id: lost
title: Lost
text: Nobody comes here.
`,
        'enemies.yaml': `- id: rat
  name: Rat
  attributes: { might: 1, agility: 1, wits: 1, presence: 0 }
  health: 3
  damage: 1
`,
        'encounters.yaml': `- id: rats
  enemy: rat
  text: Rats.
  escape:
    text: You run.
`,
        'endings.yaml': `${ENDINGS}- id: win2
  kind: victory
  title: Later
  text: Another dawn.
`,
      },
      'enemies:\n  - enemies.yaml\nencounters:\n  - encounters.yaml\n',
    );
    mutate(dir, 'scenario.yaml', 'locations:\n  - locations/home.yaml', 'locations:\n  - locations/home.yaml\n  - locations/far.yaml');
    mutate(dir, 'scenario.yaml', '  - scenes/gate.yaml', '  - scenes/gate.yaml\n  - scenes/lost.yaml');
    const warnings = succeed(dir);
    const location = only(warnings, 'play/unreachable-location');
    expect(location.message).toContain('"far"');
    expect(location.file).toBe('locations/far.yaml');
    expect(location.path).toEqual(['id']);
    expect(location.range).toBeDefined();
    const scene = only(warnings, 'play/unreachable-scene');
    expect(scene.message).toContain('"lost"');
    expect(scene.file).toBe('scenes/lost.yaml');
    const encounter = only(warnings, 'play/unreachable-encounter');
    expect(encounter.message).toContain('"rats"');
    const ending = only(warnings, 'play/unreachable-ending');
    expect(ending.message).toContain('"win2"');
    // The unreachable death ending is exempt.
    expect(warnings.some((d) => d.message.includes('"death"'))).toBe(false);
  });

  it('evaluates attribute bounds against base values and equipment slots', () => {
    const dir = freshBase('attr-bounds', {
      'scenes/tall.yaml': `id: tall
title: Tall
trigger: on-demand
when: { attribute: { name: might, atLeast: 3 } }
text: Reachable.
`,
      'scenes/taller.yaml': `id: taller
title: Taller
trigger: on-demand
when: { attribute: { name: might, atLeast: 4 } }
text: Unreachable.
`,
    });
    mutate(dir, 'scenario.yaml', '  - scenes/gate.yaml', '  - scenes/gate.yaml\n  - scenes/tall.yaml\n  - scenes/taller.yaml');
    mutate(dir, 'locations/home.yaml', 'scenes: [gate]', 'scenes: [gate, tall, taller]');
    // Drifter might is 2 with no might-granting equipment: atLeast 3 is
    // satisfiable (a template could grant it), atLeast 4 is certainly false.
    mutate(dir, 'templates.yaml', 'attributes: { might: 2, agility: 2, wits: 1, presence: 1 }', 'attributes: { might: 3, agility: 1, wits: 1, presence: 1 }');
    const warnings = succeed(dir);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: 'play/unreachable-scene' });
    expect(warnings[0]?.message).toContain('"taller"');
  });

  it('a flag set by a reachable outcome keeps the gated scene reachable', () => {
    const dir = freshBase('flag-chain');
    mutate(
      dir,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    outcome:\n      effects:\n        - set-flag: met\n      move: home\n  - id: win\n    text: Win.\n    when: { flag: met }\n    outcome:\n      end: win\n',
    );
    mutate(dir, 'scenario.yaml', 'deathEnding: death\n', 'deathEnding: death\nflags:\n  - met\n');
    expect(succeed(dir)).toEqual([]);
  });

  it('an any with an unknown member is unknown, so the gated scene stays reachable', () => {
    const dir = freshBase('any-unknown');
    mutate(
      dir,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    outcome:\n      effects:\n        - set-flag: met\n      move: home\n  - id: win\n    text: Win.\n    when: { any: [{ flag: met }, { not: { flag: met } }] }\n    outcome:\n      end: win\n',
    );
    mutate(dir, 'scenario.yaml', 'deathEnding: death\n', 'deathEnding: death\nflags:\n  - met\n');
    expect(succeed(dir)).toEqual([]);
  });
});

describe('playability phase: authoring warnings', () => {
  it('play/all-choices-conditional when every choice has a when', () => {
    const dir = freshBase('all-conditional');
    mutate(
      dir,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    when: { health: { atLeast: 2 } }\n    outcome:\n      end: win\n  - id: wait\n    text: Wait.\n    when: { health: { atMost: 11 } }\n',
    );
    const warnings = succeed(dir);
    const diag = only(warnings, 'play/all-choices-conditional');
    expect(diag.message).toContain('"gate"');
    expect(diag.file).toBe('scenes/gate.yaml');

    const clean = freshBase('all-conditional-clean');
    mutate(
      clean,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    when: { health: { atLeast: 2 } }\n    outcome:\n      end: win\n  - id: wait\n    text: Wait.\n',
    );
    expect(succeed(clean)).toEqual([]);
  });

  it('play/take-without-has unless gated by a has on the choice, scene or top-level all', () => {
    const withItem = (scene: string): Record<string, string> => ({
      'items.yaml': '- id: bread\n  kind: consumable\n  name: Bread\n  heal: 2\n',
      'templates.yaml': `${TEMPLATES}  items:\n    - { item: bread }\n`,
      'scenes/gate.yaml': scene,
    });
    const takeScene = (when: string): string => `id: gate
title: The Gate
trigger: on-enter
text: Before you stands a gate.
choices:
  - id: go
    text: Go on.
    ${when}outcome:
      effects:
        - take-item: { item: bread }
      end: win
  - id: plain
    text: Walk away.
    outcome:
      end: win
`;
    const manifestExtra = 'items:\n  - items.yaml\n';

    const bare = freshBase('take-bare', withItem(takeScene('')), manifestExtra);
    only(succeed(bare), 'play/take-without-has');

    const choiceGate = freshBase('take-choice-gate', withItem(takeScene('when: { has: { item: bread } }\n    ')), manifestExtra);
    expect(succeed(choiceGate)).toEqual([]);

    const sceneGate = freshBase(
      'take-scene-gate',
      withItem(
        `id: gate
title: The Gate
trigger: on-enter
when: { has: { item: bread } }
text: Before you stands a gate.
choices:
  - id: go
    text: Go on.
    outcome:
      effects:
        - take-item: { item: bread }
      end: win
`,
      ),
      manifestExtra,
    );
    expect(succeed(sceneGate)).toEqual([]);

    const allGate = freshBase(
      'take-all-gate',
      withItem(takeScene('when: { all: [{ has: { item: bread } }, { health: { atLeast: 2 } }] }\n    ')),
      manifestExtra,
    );
    expect(succeed(allGate)).toEqual([]);

    const anyGate = freshBase(
      'take-any-gate',
      withItem(takeScene('when: { any: [{ has: { item: bread } }] }\n    ')),
      manifestExtra,
    );
    only(succeed(anyGate), 'play/take-without-has');
  });

  it('play/take-without-has always warns for encounter outcomes', () => {
    const dir = freshBase(
      'take-encounter',
      {
        'enemies.yaml': `- id: rat
  name: Rat
  attributes: { might: 1, agility: 1, wits: 1, presence: 0 }
  health: 3
  damage: 1
`,
        'encounters.yaml': `- id: rats
  enemy: rat
  text: Rats.
  victory:
    text: Won.
    effects:
      - take-item: { item: bread }
    end: win
  escape:
    text: You run.
`,
        'items.yaml': '- id: bread\n  kind: consumable\n  name: Bread\n  heal: 2\n',
        'templates.yaml': `${TEMPLATES}  items:\n    - { item: bread }\n`,
      },
      'items:\n  - items.yaml\nenemies:\n  - enemies.yaml\nencounters:\n  - encounters.yaml\n',
    );
    mutate(
      dir,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    outcome:\n      start-combat: rats\n',
    );
    only(succeed(dir), 'play/take-without-has');
  });

  it('play/repeatable-combat unless gated by not defeated on the scene, choice or top-level all', () => {
    const combatPackage = (scene: string): Record<string, string> => ({
      'enemies.yaml': `- id: rat
  name: Rat
  attributes: { might: 1, agility: 1, wits: 1, presence: 0 }
  health: 3
  damage: 1
`,
      'encounters.yaml': `- id: rats
  enemy: rat
  text: Rats.
  victory:
    text: Won.
    end: win
  escape:
    text: You run.
`,
      'scenes/gate.yaml': scene,
    });
    const manifestExtra = 'enemies:\n  - enemies.yaml\nencounters:\n  - encounters.yaml\n';
    const combatScene = (header: string, choiceWhen: string): string => `id: gate
title: The Gate
trigger: on-enter
repeatable: true
${header}text: Before you stands a gate.
choices:
  - id: go
    text: Go on.
    ${choiceWhen}outcome:
      start-combat: rats
  - id: plain
    text: Walk away.
    outcome:
      end: win
`;

    const bare = freshBase('combat-bare', combatPackage(combatScene('', '')), manifestExtra);
    only(succeed(bare), 'play/repeatable-combat');

    const sceneGate = freshBase(
      'combat-scene-gate',
      combatPackage(combatScene('when: { not: { defeated: rats } }\n', '')),
      manifestExtra,
    );
    expect(succeed(sceneGate)).toEqual([]);

    const choiceGate = freshBase(
      'combat-choice-gate',
      combatPackage(combatScene('', 'when: { not: { defeated: rats } }\n    ')),
      manifestExtra,
    );
    expect(succeed(choiceGate)).toEqual([]);

    const allGate = freshBase(
      'combat-all-gate',
      combatPackage(combatScene('when: { all: [{ not: { defeated: rats } }, { health: { atLeast: 2 } }] }\n', '')),
      manifestExtra,
    );
    expect(succeed(allGate)).toEqual([]);

    const anyGate = freshBase(
      'combat-any-gate',
      combatPackage(combatScene('when: { any: [{ not: { defeated: rats } }] }\n', '')),
      manifestExtra,
    );
    only(succeed(anyGate), 'play/repeatable-combat');

    const doubleNot = freshBase(
      'combat-double-not',
      combatPackage(combatScene('', 'when: { not: { not: { defeated: rats } } }\n    ')),
      manifestExtra,
    );
    only(succeed(doubleNot), 'play/repeatable-combat');

    const once = freshBase('combat-once', combatPackage(combatScene('repeatable: false\n', '').replace('repeatable: true\n', '')), manifestExtra);
    expect(codesOf(succeed(once))).not.toContain('play/repeatable-combat');
  });

  it('play/next-to-fired-scene for shared, repeatable and self sources', () => {
    const midPackage = (gate: string, extraScenes: Record<string, string>): Record<string, string> => ({
      'scenes/gate.yaml': gate,
      ...extraScenes,
    });
    const manifestExtra = (scenes: string): string => scenes;
    const afterChoice = (from: string): string => `  - id: after
    text: After.
    outcome:
      next: ${from}
`;

    // Two distinct sources leading to mid.
    const shared = freshBase(
      'next-shared',
      midPackage(
        `id: gate
title: The Gate
trigger: on-enter
text: Before you stands a gate.
choices:
  - id: go
    text: Go on.
    outcome:
      next: mid
  - id: other
    text: Otherwise.
    outcome:
      next: first
`,
        {
          'scenes/first.yaml': `id: first
title: First
text: First.
choices:
${afterChoice('mid')}`,
          'scenes/mid.yaml': `id: mid
title: Mid
text: Mid.
choices:
  - id: end
    text: End.
    outcome:
      end: win
`,
        },
      ),
      manifestExtra(''),
    );
    mutate(shared, 'scenario.yaml', '  - scenes/gate.yaml', '  - scenes/gate.yaml\n  - scenes/first.yaml\n  - scenes/mid.yaml');
    only(succeed(shared), 'play/next-to-fired-scene');

    // A single non-repeatable source stays silent.
    const single = freshBase(
      'next-single',
      midPackage(
        `id: gate
title: The Gate
trigger: on-enter
text: Before you stands a gate.
choices:
  - id: go
    text: Go on.
    outcome:
      next: mid
`,
        {
          'scenes/mid.yaml': `id: mid
title: Mid
text: Mid.
choices:
  - id: end
    text: End.
    outcome:
      end: win
`,
        },
      ),
      manifestExtra(''),
    );
    mutate(single, 'scenario.yaml', '  - scenes/gate.yaml', '  - scenes/gate.yaml\n  - scenes/mid.yaml');
    expect(succeed(single)).toEqual([]);

    // A repeatable source warns even alone.
    const repeatable = freshBase(
      'next-repeatable',
      midPackage(
        `id: gate
title: The Gate
trigger: on-enter
repeatable: true
text: Before you stands a gate.
choices:
  - id: go
    text: Go on.
    outcome:
      next: mid
`,
        {
          'scenes/mid.yaml': `id: mid
title: Mid
text: Mid.
choices:
  - id: end
    text: End.
    outcome:
      end: win
`,
        },
      ),
      manifestExtra(''),
    );
    mutate(repeatable, 'scenario.yaml', '  - scenes/gate.yaml', '  - scenes/gate.yaml\n  - scenes/mid.yaml');
    only(succeed(repeatable), 'play/next-to-fired-scene');

    // A scene that is its own source warns.
    const self = freshBase(
      'next-self',
      midPackage(
        `id: gate
title: The Gate
trigger: on-enter
text: Before you stands a gate.
choices:
  - id: go
    text: Go on.
    outcome:
      next: loop
`,
        {
          'scenes/loop.yaml': `id: loop
title: Loop
text: Loop.
choices:
  - id: again
    text: Again.
    outcome:
      next: loop
  - id: out
    text: Out.
    outcome:
      end: win
`,
        },
      ),
      manifestExtra(''),
    );
    mutate(self, 'scenario.yaml', '  - scenes/gate.yaml', '  - scenes/gate.yaml\n  - scenes/loop.yaml');
    const selfDiag = only(succeed(self), 'play/next-to-fired-scene');
    expect(selfDiag.message).toContain('"loop"');

    // A repeatable target stays silent.
    const target = freshBase(
      'next-target-repeatable',
      midPackage(
        `id: gate
title: The Gate
trigger: on-enter
text: Before you stands a gate.
choices:
  - id: go
    text: Go on.
    outcome:
      next: mid
  - id: other
    text: Otherwise.
    outcome:
      next: first
`,
        {
          'scenes/first.yaml': `id: first
title: First
text: First.
choices:
${afterChoice('mid')}`,
          'scenes/mid.yaml': `id: mid
title: Mid
repeatable: true
text: Mid.
choices:
  - id: end
    text: End.
    outcome:
      end: win
`,
        },
      ),
      manifestExtra(''),
    );
    mutate(target, 'scenario.yaml', '  - scenes/gate.yaml', '  - scenes/gate.yaml\n  - scenes/first.yaml\n  - scenes/mid.yaml');
    expect(succeed(target)).toEqual([]);

    // An encounter escape leading to mid warns.
    const escape = freshBase(
      'next-escape',
      {
        'enemies.yaml': `- id: rat
  name: Rat
  attributes: { might: 1, agility: 1, wits: 1, presence: 0 }
  health: 3
  damage: 1
`,
        'encounters.yaml': `- id: rats
  enemy: rat
  text: Rats.
  victory:
    text: Won.
    end: win
  escape:
    text: You run.
    next: mid
`,
        'scenes/gate.yaml': `id: gate
title: The Gate
trigger: on-enter
text: Before you stands a gate.
choices:
  - id: go
    text: Go on.
    outcome:
      start-combat: rats
`,
        'scenes/mid.yaml': `id: mid
title: Mid
text: Mid.
choices:
  - id: end
    text: End.
    outcome:
      end: win
`,
      },
      'enemies:\n  - enemies.yaml\nencounters:\n  - encounters.yaml\n',
    );
    mutate(escape, 'scenario.yaml', '  - scenes/gate.yaml', '  - scenes/gate.yaml\n  - scenes/mid.yaml');
    only(succeed(escape), 'play/next-to-fired-scene');
  });

  it('play/flag-never-set and play/flag-never-read', () => {
    const unset = freshBase('flag-unset', {}, 'flags:\n  - ghost\n');
    only(succeed(unset), 'play/flag-never-set');

    const unread = freshBase('flag-unread', {}, 'flags:\n  - met\n');
    mutate(
      unread,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    outcome:\n      effects:\n        - set-flag: met\n      end: win\n',
    );
    only(succeed(unread), 'play/flag-never-read');

    const clean = freshBase('flag-clean', {}, 'flags:\n  - met\n');
    mutate(
      clean,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    when: { flag: met }\n    outcome:\n      end: win\n  - id: set\n    text: Set.\n    outcome:\n      effects:\n        - set-flag: met\n      end: win\n',
    );
    expect(succeed(clean)).toEqual([]);
  });

  it('play/item-never-obtainable for items in no template and no give-item', () => {
    const dir = freshBase(
      'item-lost',
      {
        'items.yaml': '- id: bread\n  kind: consumable\n  name: Bread\n  heal: 2\n',
      },
      'items:\n  - items.yaml\n',
    );
    const diag = only(succeed(dir), 'play/item-never-obtainable');
    expect(diag.message).toContain('"bread"');

    const given = freshBase(
      'item-given',
      {
        'items.yaml': '- id: bread\n  kind: consumable\n  name: Bread\n  heal: 2\n',
        'templates.yaml': TEMPLATES,
      },
      'items:\n  - items.yaml\n',
    );
    mutate(
      given,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    outcome:\n      effects:\n        - give-item: { item: bread }\n      end: win\n',
    );
    expect(succeed(given)).toEqual([]);

    const templated = freshBase(
      'item-templated',
      {
        'items.yaml': '- id: bread\n  kind: consumable\n  name: Bread\n  heal: 2\n',
        'templates.yaml': `${TEMPLATES}  items:\n    - { item: bread }\n`,
      },
      'items:\n  - items.yaml\n',
    );
    expect(succeed(templated)).toEqual([]);
  });

  it('play/key-item-unused for key items used in no condition', () => {
    const dir = freshBase(
      'key-unused',
      {
        'items.yaml': '- id: seal\n  kind: key\n  name: Seal\n',
        'templates.yaml': `${TEMPLATES}  items:\n    - { item: seal }\n`,
      },
      'items:\n  - items.yaml\n',
    );
    only(succeed(dir), 'play/key-item-unused');

    const used = freshBase(
      'key-used',
      {
        'items.yaml': '- id: seal\n  kind: key\n  name: Seal\n',
        'templates.yaml': `${TEMPLATES}  items:\n    - { item: seal }\n`,
      },
      'items:\n  - items.yaml\n',
    );
    mutate(
      used,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    when: { has: { item: seal } }\n    outcome:\n      end: win\n  - id: plain\n    text: Plain.\n    outcome:\n      end: win\n',
    );
    expect(succeed(used)).toEqual([]);
  });

  it('play/enemy-unused for enemies with no encounter', () => {
    const dir = freshBase(
      'enemy-unused',
      {
        'enemies.yaml': `- id: rat
  name: Rat
  attributes: { might: 1, agility: 1, wits: 1, presence: 0 }
  health: 3
  damage: 1
`,
      },
      'enemies:\n  - enemies.yaml\n',
    );
    only(succeed(dir), 'play/enemy-unused');

    const used = freshBase(
      'enemy-used',
      {
        'enemies.yaml': `- id: rat
  name: Rat
  attributes: { might: 1, agility: 1, wits: 1, presence: 0 }
  health: 3
  damage: 1
`,
        'encounters.yaml': `- id: rats
  enemy: rat
  text: Rats.
  victory:
    text: Won.
    end: win
  escape:
    text: You run.
`,
      },
      'enemies:\n  - enemies.yaml\nencounters:\n  - encounters.yaml\n',
    );
    mutate(
      used,
      'scenes/gate.yaml',
      '  - id: go\n    text: Go on.\n    outcome:\n      end: win\n',
      '  - id: go\n    text: Go on.\n    outcome:\n      start-combat: rats\n',
    );
    expect(codesOf(succeed(used))).not.toContain('play/enemy-unused');
  });

  it('play/image-unused for images referenced by no scene', () => {
    const dir = freshBase(
      'image-unused',
      {
        'images.yaml': '- id: gate-img\n  path: images/gate.png\n  alt: An old gate.\n',
        'images/gate.png': makePng(),
      },
      'images:\n  - images.yaml\n',
    );
    only(succeed(dir), 'play/image-unused');

    const used = freshBase(
      'image-used',
      {
        'images.yaml': '- id: gate-img\n  path: images/gate.png\n  alt: An old gate.\n',
        'images/gate.png': makePng(),
      },
      'images:\n  - images.yaml\n',
    );
    mutate(used, 'scenes/gate.yaml', 'trigger: on-enter\n', 'trigger: on-enter\nillustration: gate-img\n');
    expect(succeed(used)).toEqual([]);
  });

  it('play/missing-map-coordinates for locations without a map', () => {
    const dir = freshBase('map-missing');
    mutate(dir, 'locations/home.yaml', 'map: { x: 10, y: 20 }\n', '');
    const diag = only(succeed(dir), 'play/missing-map-coordinates');
    expect(diag.message).toContain('"home"');
  });

  it('play/map-too-close for locations less than 5 units apart', () => {
    const dir = freshBase('map-close', {
      'locations/near.yaml': `id: near
name: Near
description: Very close.
map: { x: 12, y: 21 }
connections:
  - to: home
`,
    });
    mutate(dir, 'scenario.yaml', 'locations:\n  - locations/home.yaml', 'locations:\n  - locations/home.yaml\n  - locations/near.yaml');
    mutate(
      dir,
      'locations/home.yaml',
      'scenes: [gate]\n',
      'scenes: [gate]\nconnections:\n  - to: near\n',
    );
    const diag = only(succeed(dir), 'play/map-too-close');
    expect(diag.message).toContain('"home"');
    expect(diag.message).toContain('"near"');

    const apart = freshBase('map-apart', {
      'locations/near.yaml': `id: near
name: Near
description: Far enough.
map: { x: 13, y: 24 }
connections:
  - to: home
`,
    });
    mutate(apart, 'scenario.yaml', 'locations:\n  - locations/home.yaml', 'locations:\n  - locations/home.yaml\n  - locations/near.yaml');
    mutate(
      apart,
      'locations/home.yaml',
      'scenes: [gate]\n',
      'scenes: [gate]\nconnections:\n  - to: near\n',
    );
    // Exactly 5 units apart stays silent.
    expect(codesOf(succeed(apart))).not.toContain('play/map-too-close');
  });

  it('no error for a state-dependent soft-lock the analysis cannot prove', () => {
    // The key to the vault may be thrown away before the vault is opened.
    // Ordering and take-item are ignored, so this stays silent.
    const dir = freshBase(
      'soft-lock',
      {
        'items.yaml': '- id: brass-key\n  kind: key\n  name: Brass Key\n',
        'templates.yaml': TEMPLATES,
      },
      'items:\n  - items.yaml\nflags:\n  - vault-open\n',
    );
    writePackage(dir, {
      'scenes/gate.yaml': `id: gate
title: The Gate
trigger: on-enter
text: Before you stands a gate.
choices:
  - id: take-key
    text: Take the key.
    outcome:
      effects:
        - give-item: { item: brass-key }
  - id: drop-key
    text: Throw the key away.
    when: { has: { item: brass-key } }
    outcome:
      effects:
        - take-item: { item: brass-key }
  - id: open
    text: Open the vault.
    when: { has: { item: brass-key } }
    outcome:
      effects:
        - set-flag: vault-open
      move: vault
`,
      'locations/vault.yaml': `id: vault
name: Vault
description: The vault.
map: { x: 50, y: 50 }
scenes: [prize]
`,
      'scenes/prize.yaml': `id: prize
title: Prize
trigger: on-enter
when: { flag: vault-open }
text: You made it.
choices:
  - id: win
    text: Win.
    outcome:
      end: win
`,
    });
    mutate(dir, 'scenario.yaml', 'locations:\n  - locations/home.yaml', 'locations:\n  - locations/home.yaml\n  - locations/vault.yaml');
    mutate(dir, 'scenario.yaml', '  - scenes/gate.yaml', '  - scenes/gate.yaml\n  - scenes/prize.yaml');
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual([]);
    }
  });
});
