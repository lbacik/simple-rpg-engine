// Translation pipelines T1 (Package) and T2 (Structure):
// docs/spec/validation.md (Translations), docs/spec/scenario-format.md
// (Translation files), ADR 0002.
//
// Invalid variants are derived by copying a reference fixture
// (tests/fixtures/scenarios/two-bridges, stara-studnia) to a temporary
// directory and changing one file; the Scenario id must equal the directory
// name, so the copy keeps the fixture's name.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkPlaythroughCompatibility, loadScenario } from '../src/content/index';
import { startPlaythrough } from '../src/engine/index';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');
const fixturesDir = path.join(testsDir, 'fixtures', 'scenarios');

const TWO_BRIDGES_MANIFEST = 'translations/pl/translation.yaml';

function fixturePath(name: string): string {
  return path.join(fixturesDir, name);
}

/** Copy a fixture to a temp directory under its own name (id rule). */
function copyFixture(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-tr-'));
  const dest = path.join(dir, name);
  fs.cpSync(fixturePath(name), dest, { recursive: true });
  return dest;
}

function readRel(dir: string, rel: string): string {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

function writeRel(dir: string, rel: string, content: string): void {
  fs.writeFileSync(path.join(dir, rel), content);
}

function runValidate(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', 'src/cli/validate.ts', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120_000,
    });
    return { stdout, status: 0 };
  } catch (error) {
    const failure = error as { status?: unknown; stdout?: unknown };
    return {
      stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
      status: typeof failure.status === 'number' ? failure.status : 1,
    };
  }
}

describe('translation reference fixtures', () => {
  it.each(['two-bridges', 'stara-studnia'])('%s loads with no diagnostics', (name) => {
    const result = loadScenario(fixturePath(name));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.rejectedTranslations).toEqual([]);
  });

  it('two-bridges holds the accepted pl text keyed for a later overlay', () => {
    const result = loadScenario(fixturePath('two-bridges'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Mechanics stay in the base only: the Base Language still shows.
    expect(result.scenario.language).toBe('en');
    expect(result.scenario.title).toBe('Two Bridges');
    expect(result.scenario.translations).toHaveLength(1);
    const [pl] = result.scenario.translations;
    expect(pl?.manifestPath).toBe(TWO_BRIDGES_MANIFEST);
    expect(pl?.language).toBe('pl');
    expect(pl?.baseVersion).toBe('1.0.0');
    expect(pl?.title).toBe('Dwa mosty');
    expect(pl?.intro).toContain('{name}');
    expect(pl?.locations['east-bank']?.name).toBe('Wschodni Brzeg');
    expect(pl?.locations['east-bank']?.connections).toEqual([
      { to: 'west-bank', label: 'Przejdź przez bliski most' },
    ]);
    expect(pl?.locations['west-bank']?.connections).toEqual([]);
    expect(pl?.scenes['arrival']?.title).toBe('Bliski most');
    expect(pl?.scenes['arrival']?.choices.find((c) => c.id === 'listen')?.text).toBe(
      'Zapytaj, jaki klucz ma na myśli.',
    );
    // "sneak" carries no Outcome text in the base, so none here either.
    expect(pl?.scenes['ferry']?.choices.find((c) => c.id === 'sneak')?.outcome).toBeUndefined();
    expect(pl?.scenes['ferry']?.choices.find((c) => c.id === 'pay')?.outcome?.text).toContain(
      'Przygryza klucz',
    );
    expect(pl?.items['bread']).toEqual({ id: 'bread', name: 'Chleb', description: undefined });
    expect(pl?.enemies['river-wolf']?.name).toBe('Rzeczny wilk');
    expect(pl?.encounters['wolf-ambush']?.escape?.text).toContain('Brodząc');
    expect(pl?.templates['wayfarer']?.name).toBe('Wędrowiec');
    expect(pl?.endings['home']?.title).toBe('Cicha droga');
    expect(pl?.images['arrival']?.alt).toContain('Przewoźnik');
  });

  it('stara-studnia falls back to its non-English Base Language', () => {
    const result = loadScenario(fixturePath('stara-studnia'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.language).toBe('pl');
    expect(result.scenario.title).toBe('Stara studnia');
    expect(result.scenario.translations).toHaveLength(1);
    expect(result.scenario.translations[0]?.language).toBe('en');
    expect(result.scenario.translations[0]?.locations['rynek']?.name).toBe('The Square');
  });
});

describe('rejected translations', () => {
  it('a missing Translation manifest rejects only that Translation', () => {
    const dir = copyFixture('two-bridges');
    fs.rmSync(path.join(dir, TWO_BRIDGES_MANIFEST));
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The Scenario stays valid and shows its Base Language.
    expect(result.scenario.title).toBe('Two Bridges');
    expect(result.scenario.translations).toEqual([]);
    expect(result.rejectedTranslations).toHaveLength(1);
    const [rejected] = result.rejectedTranslations;
    expect(rejected?.manifestPath).toBe(TWO_BRIDGES_MANIFEST);
    expect(rejected?.diagnostics).toHaveLength(1);
    expect(rejected?.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'package/missing-file',
      file: 'scenario.yaml',
      translation: TWO_BRIDGES_MANIFEST,
    });
    expect(result.warnings).toContain(rejected?.diagnostics[0]);
  });

  it('a Translation listing a base file is rejected', () => {
    const dir = copyFixture('two-bridges');
    writeRel(
      dir,
      TWO_BRIDGES_MANIFEST,
      readRel(dir, TWO_BRIDGES_MANIFEST).replace(
        '  - translations/pl/locations/west-bank.yaml',
        '  - translations/pl/locations/west-bank.yaml\n  - locations/east-bank.yaml',
      ),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toEqual([]);
    expect(result.rejectedTranslations).toHaveLength(1);
    const codes = result.rejectedTranslations[0]?.diagnostics.map((d) => d.code) ?? [];
    expect(codes).toContain('package/duplicate-file');
    for (const diagnostic of result.rejectedTranslations[0]?.diagnostics ?? []) {
      expect(diagnostic.translation).toBe(TWO_BRIDGES_MANIFEST);
    }
  });

  it('two Translations listing one file are both rejected', () => {
    const dir = copyFixture('two-bridges');
    // A second Translation sharing every file with the pl one.
    fs.mkdirSync(path.join(dir, 'translations', 'de'), { recursive: true });
    writeRel(
      dir,
      'translations/de/translation.yaml',
      readRel(dir, TWO_BRIDGES_MANIFEST).replace('language: pl', 'language: de'),
    );
    writeRel(
      dir,
      'scenario.yaml',
      readRel(dir, 'scenario.yaml').replace(
        '  - translations/pl/translation.yaml',
        '  - translations/pl/translation.yaml\n  - translations/de/translation.yaml',
      ),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toEqual([]);
    expect(result.rejectedTranslations).toHaveLength(2);
    for (const rejected of result.rejectedTranslations) {
      expect(rejected.diagnostics.map((d) => d.code)).toContain('package/duplicate-file');
      for (const diagnostic of rejected.diagnostics) {
        expect(diagnostic.translation).toBe(rejected.manifestPath);
      }
    }
  });

  it('a rejected Translation leaves another valid Translation available', () => {
    const dir = copyFixture('two-bridges');
    // A second Translation with its own files, valid throughout.
    fs.cpSync(path.join(dir, 'translations', 'pl'), path.join(dir, 'translations', 'de'), {
      recursive: true,
    });
    for (const rel of [
      'translations/de/translation.yaml',
      'translations/de/locations/east-bank.yaml',
      'translations/de/locations/west-bank.yaml',
      'translations/de/scenes/arrival.yaml',
      'translations/de/scenes/ferry.yaml',
      'translations/de/items.yaml',
      'translations/de/enemies.yaml',
      'translations/de/encounters.yaml',
      'translations/de/templates.yaml',
      'translations/de/endings.yaml',
      'translations/de/images.yaml',
    ]) {
      writeRel(dir, rel, readRel(dir, rel).replaceAll('translations/pl/', 'translations/de/'));
    }
    writeRel(
      dir,
      'translations/de/translation.yaml',
      readRel(dir, 'translations/de/translation.yaml').replace('language: pl', 'language: de'),
    );
    writeRel(
      dir,
      'scenario.yaml',
      readRel(dir, 'scenario.yaml').replace(
        '  - translations/pl/translation.yaml',
        '  - translations/pl/translation.yaml\n  - translations/de/translation.yaml',
      ),
    );
    // Break only the pl Translation with a non-translatable key.
    writeRel(dir, 'translations/pl/scenes/ferry.yaml', `${readRel(dir, 'translations/pl/scenes/ferry.yaml')}when: { flag: something }\n`);
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejectedTranslations).toHaveLength(1);
    expect(result.rejectedTranslations[0]?.manifestPath).toBe(TWO_BRIDGES_MANIFEST);
    expect(result.scenario.translations).toHaveLength(1);
    expect(result.scenario.translations[0]?.language).toBe('de');
  });

  it('a non-translatable key is schema/unknown-key', () => {
    const dir = copyFixture('two-bridges');
    writeRel(dir, 'translations/pl/scenes/ferry.yaml', `${readRel(dir, 'translations/pl/scenes/ferry.yaml')}when: { flag: something }\n`);
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toEqual([]);
    const diagnostics = result.rejectedTranslations[0]?.diagnostics ?? [];
    expect(diagnostics.map((d) => d.code)).toContain('schema/unknown-key');
    const unknown = diagnostics.find((d) => d.code === 'schema/unknown-key');
    expect(unknown).toMatchObject({
      file: 'translations/pl/scenes/ferry.yaml',
      translation: TWO_BRIDGES_MANIFEST,
      path: ['when'],
    });
  });

  it.each(['language', 'baseVersion'])('a missing %s is schema/missing-field', (key) => {
    const dir = copyFixture('two-bridges');
    const lines = readRel(dir, TWO_BRIDGES_MANIFEST)
      .split('\n')
      .filter((line) => !line.startsWith(`${key}:`));
    writeRel(dir, TWO_BRIDGES_MANIFEST, lines.join('\n'));
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toEqual([]);
    const diagnostics = result.rejectedTranslations[0]?.diagnostics ?? [];
    const missing = diagnostics.find((d) => d.code === 'schema/missing-field');
    expect(missing).toMatchObject({ file: TWO_BRIDGES_MANIFEST, translation: TWO_BRIDGES_MANIFEST });
    expect(missing?.path).toEqual([key]);
  });
});

describe('translation content hash', () => {
  it('a Translation-only change changes the hash and passes the reference check', () => {
    const before = loadScenario(fixturePath('two-bridges'));
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const started = startPlaythrough(before.scenario, 'wayfarer', 'Aldric', () => 1);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const dir = copyFixture('two-bridges');
    writeRel(
      dir,
      'translations/pl/items.yaml',
      readRel(dir, 'translations/pl/items.yaml').replace('Miecz mostowy', 'Miecz rzeczny'),
    );
    const after = loadScenario(dir);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.warnings).toEqual([]);
    expect(after.scenario.contentHash).not.toBe(before.scenario.contentHash);
    // No id changed, so the stored Playthrough survives the reference check.
    expect(checkPlaythroughCompatibility(after.scenario, started.state)).toEqual({ ok: true });
  });
});

describe('validate CLI with translations', () => {
  it('names the rejected Translation and exits 1', () => {
    const dir = copyFixture('two-bridges');
    writeRel(dir, 'translations/pl/scenes/ferry.yaml', `${readRel(dir, 'translations/pl/scenes/ferry.yaml')}when: { flag: something }\n`);
    const { stdout, status } = runValidate([dir]);
    expect(status).toBe(1);
    expect(stdout).toContain(`; Translation ${TWO_BRIDGES_MANIFEST} (pl) rejected`);
  });

  it('reports an unreadable language as unknown and exits 1', () => {
    const dir = copyFixture('two-bridges');
    fs.rmSync(path.join(dir, TWO_BRIDGES_MANIFEST));
    const { stdout, status } = runValidate([dir]);
    expect(status).toBe(1);
    expect(stdout).toContain(`; Translation ${TWO_BRIDGES_MANIFEST} (unknown) rejected`);
  });
});
