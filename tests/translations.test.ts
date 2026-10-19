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
import { describe, expect, it, vi } from 'vitest';
import { checkPlaythroughCompatibility, loadAllScenarios, loadScenario } from '../src/content/index';
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
    expect(pl?.encounters['wolf-ambush']?.surrender?.text).toContain('wycofujesz');
    expect(pl?.encounters['wolf-ambush']?.draw?.text).toContain('zatacza krąg');
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

describe('translation warnings', () => {
  it('a warning inside an accepted Translation rides with the base warnings', () => {
    const dir = copyFixture('two-bridges');
    // A Markdown heading is outside the narration subset: a warning, not an error.
    writeRel(
      dir,
      'translations/pl/scenes/arrival.yaml',
      readRel(dir, 'translations/pl/scenes/arrival.yaml').replace(
        '  Przewoźnik zastawia',
        '  # Most\n  Przewoźnik zastawia',
      ),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The Translation is accepted despite the warning.
    expect(result.scenario.translations).toHaveLength(1);
    expect(result.rejectedTranslations).toEqual([]);
    const warning = result.warnings.find((d) => d.code === 'schema/markdown-outside-subset');
    expect(warning).toMatchObject({
      severity: 'warning',
      file: 'translations/pl/scenes/arrival.yaml',
      translation: TWO_BRIDGES_MANIFEST,
    });
  });

  it('prints the Translation warning and exits 0', () => {
    const dir = copyFixture('two-bridges');
    writeRel(
      dir,
      'translations/pl/scenes/arrival.yaml',
      readRel(dir, 'translations/pl/scenes/arrival.yaml').replace(
        '  Przewoźnik zastawia',
        '  # Most\n  Przewoźnik zastawia',
      ),
    );
    const { stdout, status } = runValidate([dir]);
    expect(status).toBe(0);
    expect(stdout).toContain('warning schema/markdown-outside-subset');
    expect(stdout).toContain('0 errors, 1 warning');
  });
});

describe('rejected translation content', () => {
  it('a rejected Translation still feeds the content hash and the watch list', () => {
    const dir = copyFixture('two-bridges');
    // A T2 error after a clean T1: the whole Translation package was read.
    writeRel(dir, 'translations/pl/scenes/ferry.yaml', `${readRel(dir, 'translations/pl/scenes/ferry.yaml')}when: { flag: something }\n`);
    const broken = loadScenario(dir);
    expect(broken.ok).toBe(true);
    if (!broken.ok) return;
    expect(broken.rejectedTranslations).toHaveLength(1);
    // The dev registry watches the rejected Translation's files, so fixing
    // them reloads the Scenario on the next request.
    expect(broken.scenario.listedPaths).toContain(TWO_BRIDGES_MANIFEST);
    expect(broken.scenario.listedPaths).toContain('translations/pl/scenes/ferry.yaml');
    const started = startPlaythrough(broken.scenario, 'wayfarer', 'Aldric', () => 1);
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    // Editing the rejected Translation's text changes the hash, and no id
    // changed, so the stored Playthrough survives the reference check.
    writeRel(
      dir,
      'translations/pl/items.yaml',
      readRel(dir, 'translations/pl/items.yaml').replace('Miecz mostowy', 'Miecz rzeczny'),
    );
    const edited = loadScenario(dir);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.rejectedTranslations).toHaveLength(1);
    expect(edited.scenario.contentHash).not.toBe(broken.scenario.contentHash);
    expect(checkPlaythroughCompatibility(edited.scenario, started.state)).toEqual({ ok: true });
  });
});

describe('stage T3 match', () => {
  it('translation/missing-text rejects only that Translation and points at the base', () => {
    const dir = copyFixture('two-bridges');
    // The base gives bridge-sword a description; drop it from the Translation.
    writeRel(
      dir,
      'translations/pl/items.yaml',
      readRel(dir, 'translations/pl/items.yaml').replace(
        '  description: Krótka klinga, wżerana przez rzeczną wodę.\n',
        '',
      ),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toEqual([]);
    expect(result.rejectedTranslations).toHaveLength(1);
    const diagnostics = result.rejectedTranslations[0]?.diagnostics ?? [];
    const missing = diagnostics.find((d) => d.code === 'translation/missing-text');
    expect(missing).toMatchObject({
      severity: 'error',
      file: 'items.yaml',
      translation: TWO_BRIDGES_MANIFEST,
    });
    expect(missing?.message).toContain('bridge-sword');
  });

  it('translation/unmatched rejects an entry with no base counterpart', () => {
    const dir = copyFixture('two-bridges');
    writeRel(
      dir,
      'translations/pl/items.yaml',
      `${readRel(dir, 'translations/pl/items.yaml')}- id: extra-trinket\n  name: Dodatkowa błyskotka\n`,
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toEqual([]);
    const diagnostics = result.rejectedTranslations[0]?.diagnostics ?? [];
    const unmatched = diagnostics.find((d) => d.code === 'translation/unmatched');
    expect(unmatched).toMatchObject({
      severity: 'error',
      file: 'translations/pl/items.yaml',
      translation: TWO_BRIDGES_MANIFEST,
    });
    expect(unmatched?.message).toContain('extra-trinket');
  });

  it('translation/unmatched rejects an Outcome branch the base does not have', () => {
    const dir = copyFixture('two-bridges');
    // "sneak" is a bare start-combat Outcome in the base; giving it text is unmatched.
    writeRel(
      dir,
      'translations/pl/scenes/ferry.yaml',
      readRel(dir, 'translations/pl/scenes/ferry.yaml').replace(
        '  - id: sneak\n    text: Przemknij obok niego w stronę wilczych trzcin.\n',
        '  - id: sneak\n    text: Przemknij obok niego w stronę wilczych trzcin.\n    outcome:\n      text: Ciche kroki wśród trzcin.\n',
      ),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toEqual([]);
    const diagnostics = result.rejectedTranslations[0]?.diagnostics ?? [];
    expect(diagnostics.map((d) => d.code)).toContain('translation/unmatched');
  });

  it('translation/duplicate-entry names the first entry in related', () => {
    const dir = copyFixture('two-bridges');
    writeRel(
      dir,
      'translations/pl/items.yaml',
      `${readRel(dir, 'translations/pl/items.yaml')}- id: bread\n  name: Chleb bis\n`,
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toEqual([]);
    const diagnostics = result.rejectedTranslations[0]?.diagnostics ?? [];
    const duplicate = diagnostics.find((d) => d.code === 'translation/duplicate-entry');
    expect(duplicate).toMatchObject({
      severity: 'error',
      file: 'translations/pl/items.yaml',
      translation: TWO_BRIDGES_MANIFEST,
    });
    expect(duplicate?.message).toContain('bread');
    expect(duplicate?.related).toHaveLength(1);
    expect(duplicate?.related?.[0]).toMatchObject({ file: 'translations/pl/items.yaml' });
  });

  it('translation/base-language rejects a Translation in the Base Language', () => {
    const dir = copyFixture('two-bridges');
    writeRel(
      dir,
      TWO_BRIDGES_MANIFEST,
      readRel(dir, TWO_BRIDGES_MANIFEST).replace('language: pl', 'language: en'),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toEqual([]);
    const diagnostics = result.rejectedTranslations[0]?.diagnostics ?? [];
    const same = diagnostics.find((d) => d.code === 'translation/base-language');
    expect(same).toMatchObject({
      severity: 'error',
      file: TWO_BRIDGES_MANIFEST,
      translation: TWO_BRIDGES_MANIFEST,
      path: ['language'],
    });
  });

  it('translation/duplicate-language rejects both Translations', () => {
    const dir = copyFixture('two-bridges');
    // A second Translation with its own files but the same primary language.
    fs.cpSync(path.join(dir, 'translations', 'pl'), path.join(dir, 'translations', 'pl-bis'), {
      recursive: true,
    });
    for (const rel of [
      'translations/pl-bis/translation.yaml',
      'translations/pl-bis/locations/east-bank.yaml',
      'translations/pl-bis/locations/west-bank.yaml',
      'translations/pl-bis/scenes/arrival.yaml',
      'translations/pl-bis/scenes/ferry.yaml',
      'translations/pl-bis/items.yaml',
      'translations/pl-bis/enemies.yaml',
      'translations/pl-bis/encounters.yaml',
      'translations/pl-bis/templates.yaml',
      'translations/pl-bis/endings.yaml',
      'translations/pl-bis/images.yaml',
    ]) {
      writeRel(dir, rel, readRel(dir, rel).replaceAll('translations/pl/', 'translations/pl-bis/'));
    }
    writeRel(
      dir,
      'scenario.yaml',
      readRel(dir, 'scenario.yaml').replace(
        '  - translations/pl/translation.yaml',
        '  - translations/pl/translation.yaml\n  - translations/pl-bis/translation.yaml',
      ),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Neither has precedence: no Translation is available.
    expect(result.scenario.translations).toEqual([]);
    expect(result.rejectedTranslations).toHaveLength(2);
    for (const rejected of result.rejectedTranslations) {
      const duplicate = rejected.diagnostics.find((d) => d.code === 'translation/duplicate-language');
      expect(duplicate).toMatchObject({ severity: 'error', translation: rejected.manifestPath });
      expect(duplicate?.related).toHaveLength(1);
    }
  });

  it('a T3 rejection leaves another valid Translation available', () => {
    const dir = copyFixture('two-bridges');
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
    // Break only the pl Translation: drop a description the base has.
    writeRel(
      dir,
      'translations/pl/items.yaml',
      readRel(dir, 'translations/pl/items.yaml').replace(
        '  description: Krótka klinga, wżerana przez rzeczną wodę.\n',
        '',
      ),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejectedTranslations).toHaveLength(1);
    expect(result.rejectedTranslations[0]?.manifestPath).toBe(TWO_BRIDGES_MANIFEST);
    expect(result.scenario.translations).toHaveLength(1);
    expect(result.scenario.translations[0]?.language).toBe('de');
  });

  it('translation/not-interface-language warns and keeps the Translation', () => {
    const dir = copyFixture('two-bridges');
    writeRel(
      dir,
      TWO_BRIDGES_MANIFEST,
      readRel(dir, TWO_BRIDGES_MANIFEST).replace('language: pl', 'language: de'),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toHaveLength(1);
    expect(result.rejectedTranslations).toEqual([]);
    const warning = result.warnings.find((d) => d.code === 'translation/not-interface-language');
    expect(warning).toMatchObject({
      severity: 'warning',
      file: TWO_BRIDGES_MANIFEST,
      translation: TWO_BRIDGES_MANIFEST,
    });
  });

  it('translation/stale warns, names both versions and keeps the Translation', () => {
    const dir = copyFixture('two-bridges');
    writeRel(
      dir,
      TWO_BRIDGES_MANIFEST,
      readRel(dir, TWO_BRIDGES_MANIFEST).replace('baseVersion: "1.0.0"', 'baseVersion: "0.9.0"'),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.translations).toHaveLength(1);
    expect(result.rejectedTranslations).toEqual([]);
    const warning = result.warnings.find((d) => d.code === 'translation/stale');
    expect(warning).toMatchObject({
      severity: 'warning',
      file: TWO_BRIDGES_MANIFEST,
      translation: TWO_BRIDGES_MANIFEST,
      path: ['baseVersion'],
    });
    expect(warning?.message).toContain('0.9.0');
    expect(warning?.message).toContain('1.0.0');
  });
});

describe('duplicate connection targets', () => {
  it('ref/duplicate-connection-target rejects a Location with two Connections to one target', () => {
    const dir = copyFixture('two-bridges');
    writeRel(
      dir,
      'locations/east-bank.yaml',
      readRel(dir, 'locations/east-bank.yaml').replace(
        'connections:\n  - to: west-bank\n    label: Cross the near bridge\n',
        'connections:\n  - to: west-bank\n    label: Cross the near bridge\n  - to: west-bank\n    label: Cross again\n',
      ),
    );
    const result = loadScenario(dir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const duplicate = result.diagnostics.find((d) => d.code === 'ref/duplicate-connection-target');
    expect(duplicate).toMatchObject({
      severity: 'error',
      file: 'locations/east-bank.yaml',
      path: ['connections', 1, 'to'],
    });
    expect(duplicate?.message).toContain('west-bank');
    expect(duplicate?.related).toHaveLength(1);
  });

  it('the shipped Scenarios still pass with no diagnostics', () => {
    // P3a converts whispering-woods only; P3b (#235) converts the other four
    // and restores them to this list. See the Q17 CI gate in #184.
    for (const name of ['whispering-woods']) {
      const result = loadScenario(path.join(repoRoot, 'scenarios', name));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.warnings).toEqual([]);
      expect(result.rejectedTranslations).toEqual([]);
    }
  });
});

describe('registry logging with translations', () => {
  it('names the rejected Translation even when the Scenario itself is invalid', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-tr-collection-'));
    const dir = path.join(root, 'two-bridges');
    fs.cpSync(fixturePath('two-bridges'), dir, { recursive: true });
    // Break playability (no victory reachable) and the pl Translation.
    writeRel(dir, 'endings.yaml', readRel(dir, 'endings.yaml').replace('kind: victory', 'kind: defeat'));
    writeRel(dir, 'translations/pl/scenes/ferry.yaml', `${readRel(dir, 'translations/pl/scenes/ferry.yaml')}when: { flag: something }\n`);
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });
    try {
      loadAllScenarios(root);
    } finally {
      spy.mockRestore();
    }
    expect(errors.join('\n')).toContain(
      `translation "${TWO_BRIDGES_MANIFEST}" (pl) is invalid and was left out`,
    );
  });
});
