// Layer Drift (issue #217): a Layer's anchor moves linearly from `from`
// to `to` in `duration` seconds after `delay`; one-shot by default, looping
// with `loop: true`. See docs/spec/scenario-format.md (Layer, Illustration
// Motion), docs/spec/validation.md and docs/spec/ui.md (Motion, Timeline).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/content/index';
import type { Diagnostic } from '../src/content/index';
import { driftPosition, layerGeometry } from '../src/app/play/[playthroughId]/illustration';
import { startPlaythrough, view, type Rng } from '../src/engine/index';
import { makePng } from './pngFixture';

const rng: Rng = () => 1;

function makeScenarioDir(prefix: string, name: string): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), prefix)), name);
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

function mutate(dir: string, file: string, from: string, to: string): void {
  const full = path.join(dir, file);
  const source = fs.readFileSync(full, 'utf8');
  if (!source.includes(from)) throw new Error(`mutation source not found in ${file}: ${from}`);
  fs.writeFileSync(full, source.replace(from, to));
}

const MANIFEST = `schemaVersion: 2
id: __ID__
title: Test Scenario
description: A test scenario.
version: "1.0"
language: en
startLocation: home
deathEnding: death
locations:
  - locations/home.yaml
scenes:
  - scenes/gate.yaml
items:
  - items.yaml
enemies:
  - enemies.yaml
encounters:
  - encounters.yaml
templates:
  - templates.yaml
endings:
  - endings.yaml
images:
  - images.yaml
`;

const LOCATION = `id: home
name: Home
description: |
  A quiet home, {name}.
illustration: gate-img
map: { x: 10, y: 20 }
scenes: [gate]
`;

const GATE_SCENE = `id: gate
title: The Gate
trigger: on-enter
illustration: gate-img
text: |
  Before you stands a gate, {name}.
choices:
  - id: rest
    text: Rest a while.
    outcome:
      end: dawn
`;

const ITEMS = `- id: sword
  kind: equipment
  name: Sword
  slot: weapon
- id: bread
  kind: consumable
  name: Bread
  heal: 2
`;

const ENEMIES = `- id: rat
  name: Rat
  profile: raider
`;

const ENCOUNTERS = `- id: rats
  enemy: rat
  startRange: melee
  text: |
    Rats pour from the walls.
  victory:
    text: |
      Silence returns.
    move: home
  surrender:
    text: |
      You yield.
    move: home
  draw:
    text: |
      You break off.
    move: home
`;

const TEMPLATES = `- id: drifter
  name: Drifter
  attributes: { might: 2, agility: 2, wits: 1, presence: 1 }
  items:
    - { item: sword }
    - { item: bread, quantity: 2 }
`;

const ENDINGS = `- id: death
  kind: defeat
  title: Death
  text: |
    Darkness takes you.
- id: dawn
  kind: victory
  title: Dawn
  text: |
    Morning comes.
`;

const STILL = `- id: gate-img
  path: images/gate.png
  alt: An old gate.
`;

const LAYER_FILE = 'images/layers/gleam.png';

/** A fresh valid package whose image carries one drifting Layer, with the files on disk. */
function freshDriftDir(
  name: string,
  drift = 'drift: { from: { x: 38, y: 16 }, to: { x: 108, y: 9 }, duration: 14, delay: 1.5 }',
): string {
  const dir = makeScenarioDir('rpg-drift-', name);
  const id = path.basename(dir);
  writePackage(dir, {
    'scenario.yaml': MANIFEST.replace('__ID__', id),
    'locations/home.yaml': LOCATION,
    'scenes/gate.yaml': GATE_SCENE,
    'items.yaml': ITEMS,
    'enemies.yaml': ENEMIES,
    'encounters.yaml': ENCOUNTERS,
    'templates.yaml': TEMPLATES,
    'endings.yaml': ENDINGS,
    'images.yaml': `${STILL}  motion:\n    layers:\n      - path: ${LAYER_FILE}\n        ${drift}\n`,
    'images/gate.png': makePng(),
    [LAYER_FILE]: makePng(8, 4),
  });
  return dir;
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

describe('structure phase: drift validation', () => {
  it('a Layer with drift validates, applying the delay and loop defaults', () => {
    const dir = freshDriftDir('drift-valid');
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.imagesById['gate-img']?.motion?.layers[0]?.drift).toEqual({
      from: { x: 38, y: 16 },
      to: { x: 108, y: 9 },
      duration: 14,
      delay: 1.5,
      loop: false,
    });
  });

  it('defaults delay to 0 and loop to false when omitted', () => {
    const dir = freshDriftDir(
      'drift-defaults',
      'drift: { from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, duration: 10 }',
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.imagesById['gate-img']?.motion?.layers[0]?.drift).toEqual({
      from: { x: 0, y: 0 },
      to: { x: 100, y: 100 },
      duration: 10,
      delay: 0,
      loop: false,
    });
  });

  it('accepts the boundary drift values', () => {
    const dir = freshDriftDir(
      'drift-boundaries',
      'drift: { from: { x: -100, y: 200 }, to: { x: 200, y: -100 }, duration: 600, delay: 600, loop: true }',
    );
    expect(loadScenario(dir).ok).toBe(true);
  });

  it('rejects out-of-range drift points, never clamping', () => {
    const dir = freshDriftDir(
      'drift-point-range',
      'drift: { from: { x: 201, y: 16 }, to: { x: 108, y: 9 }, duration: 14 }',
    );
    const diag = only(fail(dir), 'schema/invalid-value');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0, 'drift', 'from', 'x']);
  });

  it('rejects a drift point below -100', () => {
    const dir = freshDriftDir(
      'drift-point-low',
      'drift: { from: { x: 38, y: 16 }, to: { x: 108, y: -101 }, duration: 14 }',
    );
    const diag = only(fail(dir), 'schema/invalid-value');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0, 'drift', 'to', 'y']);
  });

  it('rejects a zero or over-long duration', () => {
    const zero = freshDriftDir(
      'drift-duration-zero',
      'drift: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, duration: 0 }',
    );
    expect(only(fail(zero), 'schema/invalid-value').path).toEqual([
      0,
      'motion',
      'layers',
      0,
      'drift',
      'duration',
    ]);
    const long = freshDriftDir(
      'drift-duration-long',
      'drift: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, duration: 601 }',
    );
    expect(only(fail(long), 'schema/invalid-value').path).toEqual([
      0,
      'motion',
      'layers',
      0,
      'drift',
      'duration',
    ]);
  });

  it('rejects an out-of-range delay', () => {
    const dir = freshDriftDir(
      'drift-delay-range',
      'drift: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, duration: 10, delay: 601 }',
    );
    const diag = only(fail(dir), 'schema/invalid-value');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0, 'drift', 'delay']);
  });

  it('rejects a non-boolean loop', () => {
    const dir = freshDriftDir(
      'drift-loop-type',
      'drift: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, duration: 10, loop: maybe }',
    );
    const diag = only(fail(dir), 'schema/invalid-value');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0, 'drift', 'loop']);
  });

  it('schema/missing-field for drift without to', () => {
    const dir = freshDriftDir(
      'drift-missing-to',
      'drift: { from: { x: 0, y: 0 }, duration: 10 }',
    );
    const diag = only(fail(dir), 'schema/missing-field');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0, 'drift', 'to']);
  });

  it('schema/drift-and-at fires when a Layer has both', () => {
    const dir = freshDriftDir('drift-and-at');
    mutate(
      dir,
      'images.yaml',
      `      - path: ${LAYER_FILE}\n`,
      `      - path: ${LAYER_FILE}\n        at: { x: 50, y: 50 }\n`,
    );
    const diag = only(fail(dir), 'schema/drift-and-at');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0]);
  });
});

describe('playability phase: drift warnings', () => {
  it('play/motionless warns on a Drift whose from equals its to, pointing at the Layer', () => {
    const dir = freshDriftDir(
      'drift-motionless',
      'drift: { from: { x: 30, y: 40 }, to: { x: 30, y: 40 }, duration: 10 }',
    );
    const diag = only(succeed(dir), 'play/motionless');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0]);
  });

  it('no play/motionless warning when from differs from to', () => {
    const warnings = succeed(freshDriftDir('drift-moving'));
    expect(warnings.filter((warning) => warning.code === 'play/motionless')).toHaveLength(0);
  });

  it('a Layer with drift no longer triggers play/static-layer', () => {
    const warnings = succeed(freshDriftDir('drift-not-static'));
    expect(warnings.filter((warning) => warning.code === 'play/static-layer')).toHaveLength(0);
  });
});

describe('drift timeline math', () => {
  const drift = {
    from: { x: 0, y: 0 },
    to: { x: 100, y: 50 },
    duration: 10,
    delay: 2,
    loop: false,
  };

  it('waits at from before the delay ends, counting from t = 0', () => {
    expect(driftPosition(drift, 0)).toEqual({ x: 0, y: 0 });
    expect(driftPosition(drift, 1.9)).toEqual({ x: 0, y: 0 });
    expect(driftPosition(drift, 2)).toEqual({ x: 0, y: 0 });
  });

  it('moves linearly after the delay and holds at to', () => {
    expect(driftPosition(drift, 7)).toEqual({ x: 50, y: 25 });
    expect(driftPosition(drift, 12)).toEqual({ x: 100, y: 50 });
    expect(driftPosition(drift, 100)).toEqual({ x: 100, y: 50 });
  });

  it('a looping Drift restarts at from with no delay between passes', () => {
    const looping = { ...drift, loop: true };
    // First pass starts after the delay; the second starts at once.
    expect(driftPosition(looping, 12)).toEqual({ x: 0, y: 0 });
    expect(driftPosition(looping, 13)).toEqual({ x: 10, y: 5 });
    expect(driftPosition(looping, 22)).toEqual({ x: 0, y: 0 });
    expect(driftPosition(looping, 27)).toEqual({ x: 50, y: 25 });
  });
});

describe('engine view with drift', () => {
  it('exposes the Drift with defaults applied, asset URLs and pixel sizes', () => {
    const result = loadScenario(freshDriftDir('engine-drift'));
    if (!result.ok) throw new Error(`drift fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
    const scenario = result.scenario;
    const started = startPlaythrough(scenario, 'drifter', 'Robin', rng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const layerFile = scenario.imagesById['gate-img']?.motion?.layers[0]?.file;
    expect(layerFile).toBeDefined();
    const locationView = view(scenario, { ...started.state, activeSceneId: null });
    expect(locationView.kind).toBe('location');
    if (locationView.kind !== 'location') throw new Error('expected a Location view');
    expect(locationView.illustration?.layers).toEqual([
      {
        path: LAYER_FILE,
        at: { x: 50, y: 50 },
        anchor: { x: 50, y: 50 },
        width: 100,
        blend: 'normal',
        drift: {
          from: { x: 38, y: 16 },
          to: { x: 108, y: 9 },
          duration: 14,
          delay: 1.5,
          loop: false,
        },
        src: `/scenarios/${scenario.id}/assets/${layerFile?.hash}/${LAYER_FILE}`,
        pixelWidth: 8,
        pixelHeight: 4,
      },
    ]);
  });
});

describe('illustration component with drift', () => {
  it('places a drifting Layer from its from point, so it can hang outside the box', () => {
    // The Layer's anchor sits on `from` (0, 0): half the Layer hangs outside
    // the box, where the composition's overflow clips it
    // (docs/spec/ui.md, the box).
    expect(
      layerGeometry(
        {
          at: { x: 50, y: 50 },
          anchor: { x: 50, y: 50 },
          width: 100,
          drift: {
            from: { x: 0, y: 0 },
            to: { x: 100, y: 100 },
            duration: 10,
            delay: 2,
            loop: false,
          },
        },
        { pixelWidth: 16, pixelHeight: 9 },
        { width: 640, height: 360 },
      ),
    ).toEqual({ widthPct: 100, leftPct: -50, topPct: -50 });
  });

  it('keeps placing a Layer without drift from its at point', () => {
    expect(
      layerGeometry(
        { at: { x: 50, y: 50 }, anchor: { x: 50, y: 50 }, width: 100 },
        { pixelWidth: 16, pixelHeight: 9 },
        { width: 640, height: 360 },
      ),
    ).toEqual({ widthPct: 100, leftPct: 0, topPct: 0 });
  });
});
