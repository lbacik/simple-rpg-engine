// Illustration Camera (issue #219): `motion.camera` zooms, pans or both
// over the Still and every Layer together, from `from` (default the whole
// Still) to `to` in `duration` seconds, eased in and out, after `delay`.
// One-shot by default, looping with `loop: true`. See
// docs/spec/scenario-format.md (Camera, Illustration Motion),
// docs/spec/validation.md and docs/spec/ui.md (Motion, Timeline).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/content/index';
import type { Diagnostic } from '../src/content/index';
import {
  cameraFramingAt,
  cameraTransform,
} from '../src/app/play/[playthroughId]/illustration';
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

/** A fresh valid package whose image carries a Camera-only motion, with the Still on disk. */
function freshCameraDir(
  name: string,
  camera = 'camera:\n      to: { zoom: 110, x: 30, y: 55 }\n      duration: 18',
  stillWidth = 1600,
  stillHeight = 900,
): string {
  const dir = makeScenarioDir('rpg-camera-', name);
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
    'images.yaml': `${STILL}  motion:\n    ${camera}\n`,
    'images/gate.png': makePng(stillWidth, stillHeight),
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

describe('structure phase: camera validation', () => {
  it('a Camera-only motion validates, applying the from, delay and loop defaults', () => {
    const result = loadScenario(freshCameraDir('camera-valid'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.imagesById['gate-img']?.motion?.camera).toEqual({
      from: { zoom: 100, x: 50, y: 50 },
      to: { zoom: 110, x: 30, y: 55 },
      duration: 18,
      delay: 0,
      loop: false,
    });
    expect(result.scenario.imagesById['gate-img']?.motion?.layers).toEqual([]);
  });

  it('a motion with Layers and a Camera validates, carrying both', () => {
    const dir = freshCameraDir('camera-with-layers');
    mutate(
      dir,
      'images.yaml',
      '  motion:\n',
      '  motion:\n    layers:\n      - path: images/layers/gleam.png\n',
    );
    const full = path.join(dir, 'images/layers/gleam.png');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, makePng(8, 4));
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.imagesById['gate-img']?.motion?.layers).toHaveLength(1);
    expect(result.scenario.imagesById['gate-img']?.motion?.camera?.to).toEqual({
      zoom: 110,
      x: 30,
      y: 55,
    });
  });

  it('a Camera-only motion draws no Motion warnings', () => {
    const codes = succeed(freshCameraDir('camera-quiet')).map((warning) => warning.code);
    expect(codes).not.toContain('schema/empty-motion');
    expect(codes).not.toContain('play/motionless');
    expect(codes).not.toContain('play/camera-low-resolution');
    expect(codes).not.toContain('play/static-layer');
  });

  it('accepts the boundary framing and timing values', () => {
    const dir = freshCameraDir(
      'camera-boundaries',
      'camera:\n' +
        '      from: { zoom: 400, x: 0, y: 0 }\n' +
        '      to: { zoom: 100, x: 100, y: 100 }\n' +
        '      duration: 600\n' +
        '      delay: 600\n' +
        '      loop: true',
    );
    expect(loadScenario(dir).ok).toBe(true);
  });

  it('rejects out-of-range zoom, never clamping', () => {
    const low = freshCameraDir(
      'camera-zoom-low',
      'camera:\n      to: { zoom: 99, x: 30, y: 55 }\n      duration: 18',
    );
    expect(only(fail(low), 'schema/invalid-value').path).toEqual([
      0,
      'motion',
      'camera',
      'to',
      'zoom',
    ]);
    const high = freshCameraDir(
      'camera-zoom-high',
      'camera:\n      to: { zoom: 401, x: 30, y: 55 }\n      duration: 18',
    );
    expect(only(fail(high), 'schema/invalid-value').path).toEqual([
      0,
      'motion',
      'camera',
      'to',
      'zoom',
    ]);
  });

  it('rejects a fixed point outside 0-100', () => {
    const dir = freshCameraDir(
      'camera-point-range',
      'camera:\n      to: { zoom: 110, x: 101, y: 55 }\n      duration: 18',
    );
    expect(only(fail(dir), 'schema/invalid-value').path).toEqual([
      0,
      'motion',
      'camera',
      'to',
      'x',
    ]);
  });

  it('rejects a zero or over-long duration', () => {
    const zero = freshCameraDir(
      'camera-duration-zero',
      'camera:\n      to: { zoom: 110, x: 30, y: 55 }\n      duration: 0',
    );
    expect(only(fail(zero), 'schema/invalid-value').path).toEqual([
      0,
      'motion',
      'camera',
      'duration',
    ]);
    const long = freshCameraDir(
      'camera-duration-long',
      'camera:\n      to: { zoom: 110, x: 30, y: 55 }\n      duration: 601',
    );
    expect(only(fail(long), 'schema/invalid-value').path).toEqual([
      0,
      'motion',
      'camera',
      'duration',
    ]);
  });

  it('rejects an out-of-range delay', () => {
    const dir = freshCameraDir(
      'camera-delay-range',
      'camera:\n      to: { zoom: 110, x: 30, y: 55 }\n      duration: 18\n      delay: 601',
    );
    expect(only(fail(dir), 'schema/invalid-value').path).toEqual([
      0,
      'motion',
      'camera',
      'delay',
    ]);
  });

  it('rejects a non-boolean loop', () => {
    const dir = freshCameraDir(
      'camera-loop-type',
      'camera:\n      to: { zoom: 110, x: 30, y: 55 }\n      duration: 18\n      loop: maybe',
    );
    expect(only(fail(dir), 'schema/invalid-value').path).toEqual([
      0,
      'motion',
      'camera',
      'loop',
    ]);
  });

  it('schema/missing-field for a Camera without to', () => {
    const dir = freshCameraDir('camera-missing-to', 'camera:\n      duration: 18');
    expect(only(fail(dir), 'schema/missing-field').path).toEqual([0, 'motion', 'camera', 'to']);
  });

  it('schema/missing-field for a framing without zoom', () => {
    const dir = freshCameraDir(
      'camera-framing-missing-zoom',
      'camera:\n      to: { x: 30, y: 55 }\n      duration: 18',
    );
    expect(only(fail(dir), 'schema/missing-field').path).toEqual([
      0,
      'motion',
      'camera',
      'to',
      'zoom',
    ]);
  });

  it('rejects an unknown camera key', () => {
    const dir = freshCameraDir(
      'camera-unknown-key',
      'camera:\n      to: { zoom: 110, x: 30, y: 55 }\n      duration: 18\n      speed: 2',
    );
    expect(only(fail(dir), 'schema/unknown-key').path).toEqual([0, 'motion', 'camera', 'speed']);
  });
});

describe('playability phase: camera warnings', () => {
  it('play/motionless warns on a Camera whose to equals its from, pointing at the Camera', () => {
    const dir = freshCameraDir(
      'camera-motionless',
      'camera:\n' +
        '      from: { zoom: 150, x: 30, y: 40 }\n' +
        '      to: { zoom: 150, x: 30, y: 40 }\n' +
        '      duration: 10',
    );
    const diag = only(succeed(dir), 'play/motionless');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'motion', 'camera']);
  });

  it('play/motionless warns when to equals the defaulted from', () => {
    const dir = freshCameraDir(
      'camera-motionless-default-from',
      'camera:\n      to: { zoom: 100, x: 50, y: 50 }\n      duration: 10',
    );
    const diag = only(succeed(dir), 'play/motionless');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'motion', 'camera']);
  });

  it('no play/motionless warning when to differs from from', () => {
    const warnings = succeed(freshCameraDir('camera-moving'));
    expect(warnings.filter((warning) => warning.code === 'play/motionless')).toHaveLength(0);
  });

  it('play/camera-low-resolution warns when the most zoomed-in view is below 1000 px', () => {
    const dir = freshCameraDir(
      'camera-low-resolution',
      'camera:\n      to: { zoom: 200, x: 30, y: 55 }\n      duration: 18',
      800,
      450,
    );
    const diag = only(succeed(dir), 'play/camera-low-resolution');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'motion', 'camera']);
  });

  it('play/camera-low-resolution counts the larger zoom of from and to', () => {
    const dir = freshCameraDir(
      'camera-low-resolution-from',
      'camera:\n' +
        '      from: { zoom: 200, x: 30, y: 55 }\n' +
        '      to: { zoom: 100, x: 50, y: 50 }\n' +
        '      duration: 18',
      1200,
      675,
    );
    expect(only(succeed(dir), 'play/camera-low-resolution').path).toEqual([
      0,
      'motion',
      'camera',
    ]);
  });

  it('no play/camera-low-resolution warning at 1000 px or above', () => {
    // 1600 × 100 / 110 = 1455 px: the whispering-woods arithmetic.
    const warnings = succeed(freshCameraDir('camera-sharp'));
    expect(
      warnings.filter((warning) => warning.code === 'play/camera-low-resolution'),
    ).toHaveLength(0);
  });

  it('images without a Camera are not checked for resolution', () => {
    const dir = makeScenarioDir('rpg-camera-', 'camera-no-check-without-camera');
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
      'images.yaml': `${STILL}  motion:\n    layers:\n      - path: images/layers/gleam.png\n`,
      'images/gate.png': makePng(1, 1),
      'images/layers/gleam.png': makePng(8, 4),
    });
    // A drifting Layer silences play/static-layer; the 1 px Still draws no
    // camera warning without a Camera.
    mutate(
      dir,
      'images.yaml',
      '      - path: images/layers/gleam.png\n',
      '      - path: images/layers/gleam.png\n        drift: { from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, duration: 10 }\n',
    );
    const warnings = succeed(dir);
    expect(
      warnings.filter((warning) => warning.code === 'play/camera-low-resolution'),
    ).toHaveLength(0);
  });
});

describe('camera transform math', () => {
  it('a zoom-100 framing is the identity', () => {
    expect(cameraTransform({ zoom: 100, x: 50, y: 50 })).toBe('translate(0%, 0%) scale(1)');
  });

  it('zooms about the fixed point from the top-left corner', () => {
    expect(cameraTransform({ zoom: 110, x: 30, y: 55 })).toBe(
      'translate(-3%, -5.5%) scale(1.1)',
    );
    expect(cameraTransform({ zoom: 200, x: 0, y: 100 })).toBe('translate(0%, -100%) scale(2)');
  });
});

describe('camera timeline math', () => {
  const camera = {
    from: { zoom: 100, x: 50, y: 50 },
    to: { zoom: 200, x: 25, y: 75 },
    duration: 10,
    delay: 2,
    loop: false,
  };

  it('holds from until the delay ends, counting from t = 0', () => {
    expect(cameraFramingAt(camera, 0)).toEqual(camera.from);
    expect(cameraFramingAt(camera, 1.9)).toEqual(camera.from);
    expect(cameraFramingAt(camera, 2)).toEqual(camera.from);
  });

  it('eases to to and holds there', () => {
    // Halfway through, the fixed ease-in-out is halfway too.
    expect(cameraFramingAt(camera, 7)).toEqual({ zoom: 150, x: 37.5, y: 62.5 });
    expect(cameraFramingAt(camera, 12)).toEqual(camera.to);
    expect(cameraFramingAt(camera, 100)).toEqual(camera.to);
  });

  it('a looping Camera goes back and forth, duration each way', () => {
    const looping = { ...camera, loop: true };
    // First pass starts after the delay; the way back takes another duration.
    expect(cameraFramingAt(looping, 12)).toEqual(camera.to);
    expect(cameraFramingAt(looping, 17)).toEqual({ zoom: 150, x: 37.5, y: 62.5 });
    expect(cameraFramingAt(looping, 22)).toEqual(camera.from);
    expect(cameraFramingAt(looping, 27)).toEqual({ zoom: 150, x: 37.5, y: 62.5 });
  });

  it('a looping delay applies only before the first pass', () => {
    const looping = { ...camera, loop: true };
    expect(cameraFramingAt(looping, 1)).toEqual(camera.from);
    // The second pass starts at once, with no delay.
    expect(cameraFramingAt(looping, 22)).toEqual(camera.from);
    expect(cameraFramingAt(looping, 22.5)).not.toEqual(camera.from);
  });
});

describe('engine view with a camera', () => {
  it('carries the Camera with defaults applied and the Showing key, with no Layers', () => {
    const result = loadScenario(freshCameraDir('engine-camera-only'));
    if (!result.ok) throw new Error(`camera fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
    const scenario = result.scenario;
    const started = startPlaythrough(scenario, 'drifter', 'Robin', rng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const locationView = view(scenario, { ...started.state, activeSceneId: null });
    expect(locationView.kind).toBe('location');
    if (locationView.kind !== 'location') throw new Error('expected a Location view');
    expect(locationView.illustration?.camera).toEqual({
      from: { zoom: 100, x: 50, y: 50 },
      to: { zoom: 110, x: 30, y: 55 },
      duration: 18,
      delay: 0,
      loop: false,
    });
    expect(locationView.illustration?.layers).toEqual([]);
    expect(locationView.illustration?.showingKey).toBe('location:home');
  });
});
