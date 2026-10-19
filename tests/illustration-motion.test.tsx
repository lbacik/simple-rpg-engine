// Illustration Motion tracer (issue #215): authoring `motion.layers` on an
// image validates, Layer files get the image codes, the Still plus the
// distinct Layer files stay within 4 MiB, static Layers warn, Layer bytes join
// the content hash, the asset route serves Layer files, the engine view
// exposes Layers with the Showing key, and the browser composes them over the
// Still. See docs/spec/scenario-format.md (Images, Illustration Motion),
// docs/spec/validation.md, docs/spec/architecture.md and docs/spec/ui.md.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadAllScenarios, loadScenario } from '../src/content/index';
import type { Diagnostic } from '../src/content/index';
import { GET } from '../src/app/scenarios/[scenarioId]/assets/[hash]/[...path]/route';
import { Illustration, layerGeometry } from '../src/app/play/[playthroughId]/illustration';
import { startPlaythrough, view, type Rng } from '../src/engine/index';
import { makePng } from './pngFixture';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');
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

/** A PNG padded with trailing bytes to exactly `bytes` (signature and dimensions still read). */
function paddedPng(bytes: number, width = 1, height = 1): Buffer {
  const base = makePng(width, height);
  if (base.length > bytes) throw new Error('fixture PNG larger than its target size');
  return Buffer.concat([base, Buffer.alloc(bytes - base.length)]);
}

const MANIFEST = `schemaVersion: 1
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
  damage: 3
- id: bread
  kind: consumable
  name: Bread
  heal: 2
`;

const ENEMIES = `- id: rat
  name: Rat
  attributes: { might: 1, agility: 2, wits: 0, presence: 0 }
  health: 3
  damage: 1
`;

const ENCOUNTERS = `- id: rats
  enemy: rat
  text: |
    Rats pour from the walls.
  victory:
    text: |
      Silence returns.
    move: home
  escape:
    text: |
      You run.
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

const TWO_LAYERS = `  motion:
    layers:
      - path: images/layers/gleam.png
      - path: images/layers/mote.png
        at: { x: 25, y: 75 }
        anchor: { x: 50, y: 100 }
        width: 50
        blend: multiply
`;

function writeMotionPackage(
  dir: string,
  imagesYaml: string,
  extraFiles: Record<string, string | Buffer> = {},
): void {
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
    'images.yaml': imagesYaml,
    'images/gate.png': makePng(),
    ...extraFiles,
  });
}

/** A valid package whose image carries two Layers: one defaulted, one placed. */
function freshMotionDir(name: string): string {
  const dir = makeScenarioDir('rpg-motion-', name);
  writeMotionPackage(dir, `${STILL}${TWO_LAYERS}`, {
    'images/layers/gleam.png': makePng(8, 4),
    'images/layers/mote.png': makePng(4, 4),
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

describe('integrity phase: motion layer files', () => {
  it('ref/invalid-image-path on the Layer path for an unsupported extension', () => {
    const dir = freshMotionDir('layer-invalid-path');
    mutate(dir, 'images.yaml', 'path: images/layers/gleam.png', 'path: images/layers/gleam.gif');
    const diag = only(fail(dir), 'ref/invalid-image-path');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0, 'path']);
    expect(diag.message).toContain('images/layers/gleam.gif');
  });

  it('ref/missing-image-file on the Layer path for a file that is not on disk', () => {
    const dir = freshMotionDir('layer-missing-file');
    mutate(dir, 'images.yaml', 'path: images/layers/gleam.png', 'path: images/layers/ghost.png');
    const diag = only(fail(dir), 'ref/missing-image-file');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0, 'path']);
    expect(diag.message).toContain('images/layers/ghost.png');
  });

  it('ref/image-format-mismatch on the Layer path when the signature disagrees', () => {
    const dir = freshMotionDir('layer-format-mismatch');
    writePackage(dir, { 'images/layers/gleam.jpg': makePng(8, 4) });
    mutate(dir, 'images.yaml', 'path: images/layers/gleam.png', 'path: images/layers/gleam.jpg');
    const diag = only(fail(dir), 'ref/image-format-mismatch');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0, 'path']);
  });

  it('ref/image-too-large on the Layer path for a file over 2 MiB', () => {
    const dir = freshMotionDir('layer-too-large');
    writePackage(dir, { 'images/layers/gleam.png': paddedPng(2 * 1024 * 1024 + 1, 8, 4) });
    const diag = only(fail(dir), 'ref/image-too-large');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'motion', 'layers', 0, 'path']);
  });

  it('a file shared by several Layers of one image is not a duplicate path', () => {
    const dir = makeScenarioDir('rpg-motion-', 'layer-shared-within-image');
    writeMotionPackage(
      dir,
      `${STILL}  motion:\n    layers:\n      - path: images/layers/gleam.png\n      - path: images/layers/gleam.png\n        width: 50\n`,
      { 'images/layers/gleam.png': makePng(8, 4) },
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No duplicate-path error; the Layers warn as static (the encounter is
    // unreachable by construction, which is unrelated).
    expect(result.warnings.filter((warning) => warning.code === 'play/static-layer')).toHaveLength(2);
    const image = result.scenario.imagesById['gate-img'];
    // One registry entry for the distinct file, two declared Layers over it.
    expect(image?.layers).toHaveLength(1);
    expect(image?.motion?.layers).toHaveLength(2);
  });

  it('a duplicate Still path still errors when Layers are exempt', () => {
    const dir = freshMotionDir('still-duplicate-with-motion');
    fs.appendFileSync(path.join(dir, 'images.yaml'), '- id: gate-img-again\n  path: images/gate.png\n  alt: The gate again.\n');
    const diag = only(fail(dir), 'ref/duplicate-image-path');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([1, 'path']);
  });
});

describe('integrity phase: illustration size budget', () => {
  it('ref/illustration-too-large when the Still plus distinct Layers exceed 4 MiB', () => {
    const mib = 1024 * 1024;
    const dir = makeScenarioDir('rpg-motion-', 'illustration-too-large');
    writeMotionPackage(dir, `${STILL}${TWO_LAYERS}`, {
      'images/gate.png': paddedPng(Math.floor(1.5 * mib)),
      'images/layers/gleam.png': paddedPng(Math.floor(1.5 * mib), 8, 4),
      'images/layers/mote.png': paddedPng(Math.floor(1.5 * mib), 4, 4),
    });
    const diag = only(fail(dir), 'ref/illustration-too-large');
    expect(diag.file).toBe('images.yaml');
    expect(diag.path).toEqual([0, 'motion']);
    expect(diag.message).toContain('gate-img');
  });

  it('a file shared within one image counts once towards the 4 MiB budget', () => {
    const twoMib = 2 * 1024 * 1024;
    const dir = makeScenarioDir('rpg-motion-', 'illustration-shared-once');
    writeMotionPackage(
      dir,
      `${STILL}  motion:\n    layers:\n      - path: images/layers/gleam.png\n      - path: images/layers/gleam.png\n        width: 50\n`,
      {
        'images/gate.png': paddedPng(twoMib),
        'images/layers/gleam.png': paddedPng(twoMib, 8, 4),
      },
    );
    // Exactly 4 MiB: counted twice it would be 6 MiB and rejected.
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
  });

  it('a file shared with another image counts in each image', () => {
    const twoMib = 1024 * 1024 * 2;
    const dir = makeScenarioDir('rpg-motion-', 'illustration-shared-across');
    writeMotionPackage(
      dir,
      `${STILL}  motion:\n    layers:\n      - path: images/layers/shared.png\n      - path: images/layers/a.png\n` +
        `- id: gate-img-2\n  path: images/gate2.png\n  alt: Another gate.\n` +
        `  motion:\n    layers:\n      - path: images/layers/shared.png\n      - path: images/layers/b.png\n`,
      {
        'images/gate.png': paddedPng(twoMib),
        'images/gate2.png': paddedPng(twoMib),
        'images/layers/shared.png': paddedPng(twoMib, 8, 4),
        'images/layers/a.png': makePng(2, 2),
        'images/layers/b.png': makePng(2, 2),
      },
    );
    const diags = fail(dir).filter((diag) => diag.code === 'ref/illustration-too-large');
    expect(diags).toHaveLength(2);
    expect(diags.map((diag) => diag.path)).toEqual([
      [0, 'motion'],
      [1, 'motion'],
    ]);
  });
});

describe('playability phase: static layers', () => {
  it('play/static-layer warns on every Layer without frames, drift or flicker', () => {
    const warnings = succeed(freshMotionDir('static-layers'));
    const staticLayers = warnings.filter((warning) => warning.code === 'play/static-layer');
    expect(staticLayers).toHaveLength(2);
    expect(staticLayers[0]).toMatchObject({
      file: 'images.yaml',
      path: [0, 'motion', 'layers', 0],
    });
    expect(staticLayers[1]).toMatchObject({
      file: 'images.yaml',
      path: [0, 'motion', 'layers', 1],
    });
  });
});

describe('content hash with motion', () => {
  it('a Layer-only change changes the content hash and the reference check passes', () => {
    const dir = freshMotionDir('hash-layer-change');
    const before = loadScenario(dir);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    writePackage(dir, { 'images/layers/gleam.png': makePng(2, 2) });
    const after = loadScenario(dir);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.scenario.contentHash).not.toBe(before.scenario.contentHash);
  });
});

describe('asset route: layer files', () => {
  function get(params: { scenarioId: string; hash: string; path: string[] }): Promise<Response> {
    return GET(new Request('http://localhost/'), { params: Promise.resolve(params) });
  }

  it('serves a declared Layer path under its own hash with the image headers', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-motion-assets-'));
    try {
      const dir = path.join(root, 'layered-halls');
      fs.mkdirSync(dir, { recursive: true });
      writeMotionPackage(dir, `${STILL}${TWO_LAYERS}`, {
        'images/layers/gleam.png': makePng(8, 4),
        'images/layers/mote.png': makePng(4, 4),
      });
      const registry = loadAllScenarios(root);
      const scenario = registry.get('layered-halls');
      expect(scenario).toBeDefined();
      const layer = scenario?.imagesById['gate-img']?.motion?.layers[0];
      expect(layer).toBeDefined();
      const response = await get({
        scenarioId: 'layered-halls',
        hash: layer?.file.hash ?? '',
        path: ['images', 'layers', 'gleam.png'],
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
      const expected = fs.readFileSync(path.join(dir, 'images', 'layers', 'gleam.png'));
      expect(Buffer.from(await response.arrayBuffer())).toEqual(expected);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      loadAllScenarios(path.join(repoRoot, 'scenarios'));
    }
  });

  it('returns 404 for a Layer path with a wrong hash or an undeclared path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-motion-assets-'));
    try {
      const dir = path.join(root, 'layered-halls');
      fs.mkdirSync(dir, { recursive: true });
      writeMotionPackage(dir, `${STILL}${TWO_LAYERS}`, {
        'images/layers/gleam.png': makePng(8, 4),
        'images/layers/mote.png': makePng(4, 4),
      });
      loadAllScenarios(root);
      const wrongHash = await get({
        scenarioId: 'layered-halls',
        hash: '0'.repeat(64),
        path: ['images', 'layers', 'gleam.png'],
      });
      expect(wrongHash.status).toBe(404);
      const undeclared = await get({
        scenarioId: 'layered-halls',
        hash: '0'.repeat(64),
        path: ['images', 'layers', 'unpainted.png'],
      });
      expect(undeclared.status).toBe(404);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      loadAllScenarios(path.join(repoRoot, 'scenarios'));
    }
  });
});

describe('engine view with motion', () => {
  function loadMotion() {
    const result = loadScenario(freshMotionDir('engine-motion'));
    if (!result.ok) {
      throw new Error(`motion fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
    }
    return result.scenario;
  }

  it('exposes Layers with defaults applied, asset URLs, pixel sizes and the Location key', () => {
    const scenario = loadMotion();
    const started = startPlaythrough(scenario, 'drifter', 'Robin', rng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const layerFile = scenario.imagesById['gate-img']?.motion?.layers[0]?.file;
    expect(layerFile).toBeDefined();
    const locationView = view(scenario, { ...started.state, activeSceneId: null });
    expect(locationView.kind).toBe('location');
    if (locationView.kind !== 'location') throw new Error('expected a Location view');
    expect(locationView.illustration?.showingKey).toBe('location:home');
    expect(locationView.illustration?.layers).toEqual([
      {
        path: 'images/layers/gleam.png',
        at: { x: 50, y: 50 },
        anchor: { x: 50, y: 50 },
        width: 100,
        blend: 'normal',
        src: `/scenarios/${scenario.id}/assets/${layerFile?.hash}/images/layers/gleam.png`,
        pixelWidth: 8,
        pixelHeight: 4,
      },
      {
        path: 'images/layers/mote.png',
        at: { x: 25, y: 75 },
        anchor: { x: 50, y: 100 },
        width: 50,
        blend: 'multiply',
        src: `/scenarios/${scenario.id}/assets/${scenario.imagesById['gate-img']?.motion?.layers[1]?.file.hash}/images/layers/mote.png`,
        pixelWidth: 4,
        pixelHeight: 4,
      },
    ]);
  });

  it('exposes the Scene key while a Scene is active', () => {
    const scenario = loadMotion();
    const started = startPlaythrough(scenario, 'drifter', 'Robin', rng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    // The opening on-enter Scene is active at start.
    expect(started.state.activeSceneId).toBe('gate');
    const sceneView = view(scenario, started.state);
    expect(sceneView.kind).toBe('scene');
    if (sceneView.kind !== 'scene') throw new Error('expected a Scene view');
    expect(sceneView.illustration?.showingKey).toBe('scene:gate');
    expect(sceneView.illustration?.layers).toHaveLength(2);
  });

  it('carries no layers or Showing key on an image without motion', () => {
    const scenario = loadMotion();
    const started = startPlaythrough(scenario, 'drifter', 'Robin', rng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const plain = { ...scenario.imagesById['gate-img']!, motion: undefined, layers: [] };
    const withoutMotion = {
      ...scenario,
      locationsById: {
        ...scenario.locationsById,
        home: { ...scenario.locationsById['home']!, illustration: plain },
      },
    };
    const locationView = view(withoutMotion, { ...started.state, activeSceneId: null });
    expect(locationView.kind).toBe('location');
    if (locationView.kind !== 'location') throw new Error('expected a Location view');
    expect(locationView.illustration?.layers).toBeUndefined();
    expect(locationView.illustration?.showingKey).toBeUndefined();
  });
});

describe('illustration component', () => {
  const layers = [
    {
      src: '/scenarios/demo/assets/abc/images/layers/gleam.png',
      at: { x: 50, y: 50 },
      anchor: { x: 50, y: 50 },
      width: 100,
      blend: 'normal' as const,
      pixelWidth: 8,
      pixelHeight: 4,
    },
  ];

  it('server-renders only the Still when the image has motion', () => {
    const html = renderToStaticMarkup(
      <Illustration
        src="/scenarios/demo/assets/def/images/gate.png"
        width={640}
        height={360}
        alt="An old gate."
        layers={layers}
        showingKey="location:home"
      />,
    );
    expect(html).toContain('src="/scenarios/demo/assets/def/images/gate.png"');
    expect(html).toContain('alt="An old gate."');
    expect(html).not.toContain('gleam.png');
    expect(html).not.toContain('illustration-motion');
  });

  it('server-renders the Still alone without motion', () => {
    const html = renderToStaticMarkup(
      <Illustration src="/s.png" width={10} height={5} alt="A gate." />,
    );
    expect(html).toContain('src="/s.png"');
    expect(html).not.toContain('illustration-motion');
  });

  it('places a defaulted Layer over the whole Still', () => {
    // A Layer drawn in the Still's proportions with the defaults covers it.
    expect(
      layerGeometry(
        { at: { x: 50, y: 50 }, anchor: { x: 50, y: 50 }, width: 100 },
        { pixelWidth: 16, pixelHeight: 9 },
        { width: 640, height: 360 },
      ),
    ).toEqual({ widthPct: 100, leftPct: 0, topPct: 0 });
  });

  it('places an anchored Layer from its at, anchor and file aspect', () => {
    const geometry = layerGeometry(
      { at: { x: 25, y: 75 }, anchor: { x: 50, y: 100 }, width: 50 },
      { pixelWidth: 100, pixelHeight: 200 },
      { width: 640, height: 360 },
    );
    expect(geometry.widthPct).toBe(50);
    expect(geometry.leftPct).toBe(0);
    // The Layer is 50% of 640 wide and twice as tall: 177.78% of the box height.
    expect(geometry.topPct).toBeCloseTo(75 - 177.77777777777777, 10);
  });
});

describe('translation images with motion', () => {
  const fixturesDir = path.join(testsDir, 'fixtures', 'scenarios');

  function copyFixture(name: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-tr-motion-'));
    const dest = path.join(dir, name);
    fs.cpSync(path.join(fixturesDir, name), dest, { recursive: true });
    return dest;
  }

  it('motion in a Translation image file is schema/unknown-key', () => {
    const dir = copyFixture('two-bridges');
    const file = 'translations/pl/images.yaml';
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    fs.writeFileSync(
      path.join(dir, file),
      source.replace(
        '- id: east-bank\n',
        '- id: east-bank\n  motion:\n    layers:\n      - path: images/east-bank.png\n',
      ),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejectedTranslations).toHaveLength(1);
    const diagnostics = result.rejectedTranslations[0]?.diagnostics ?? [];
    expect(diagnostics.map((diag) => diag.code)).toContain('schema/unknown-key');
    const unknown = diagnostics.find((diag) => diag.code === 'schema/unknown-key');
    expect(unknown).toMatchObject({ file, path: [0, 'motion'] });
  });
});
