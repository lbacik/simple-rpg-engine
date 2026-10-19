// Generated editor JSON Schemas: existence per file kind, fidelity to the
// Zod definitions (checked with ajv: the example Scenario validates, an
// out-of-range value does not), no drift from the generator, and the example
// VS Code yaml.schemas configuration. See schemas/README.md.

import Ajv from 'ajv/dist/2020';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { FILE_KINDS, buildJsonSchemas } from '../src/content/jsonSchema';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');
const schemasDir = path.join(repoRoot, 'schemas');

function readCommitted(kind: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(schemasDir, `${kind}.json`), 'utf8')) as Record<
    string,
    unknown
  >;
}

function readScenarioYaml(relative: string): unknown {
  return parse(fs.readFileSync(path.join(repoRoot, 'scenarios', 'whispering-woods', relative), 'utf8'));
}

describe('generated schemas', () => {
  it('exist for each file kind and match the generator output', () => {
    expect(FILE_KINDS).toEqual([
      'manifest',
      'location',
      'scene',
      'items',
      'enemies',
      'encounters',
      'companions',
      'templates',
      'endings',
      'images',
      'translation-manifest',
      'translation-location',
      'translation-scene',
      'translation-items',
      'translation-enemies',
      'translation-encounters',
      'translation-companions',
      'translation-templates',
      'translation-endings',
      'translation-images',
    ]);
    const built = buildJsonSchemas();
    for (const kind of FILE_KINDS) {
      expect(readCommitted(kind)).toEqual(built[kind]);
    }
  });

  it('carry defaults without requiring defaulted keys', () => {
    const scene = readCommitted('scene');
    const choice = (
      ((scene['properties'] as Record<string, unknown>)['choices'] as Record<string, unknown>)[
        'items'
      ] as Record<string, unknown>
    ).properties as Record<string, Record<string, unknown>>;
    expect(choice['once']).toMatchObject({ default: false, type: 'boolean' });
    expect(scene['required']).not.toContain('choices');
  });

  it('validate the example Scenario and reject an out-of-range value', () => {
    const ajv = new Ajv({ strict: false });
    const validateLocation = ajv.compile(readCommitted('location'));
    expect(validateLocation(readScenarioYaml('locations/ashford.yaml'))).toBe(true);

    const validateItems = ajv.compile(readCommitted('items'));
    expect(validateItems(readScenarioYaml('items.yaml'))).toBe(true);
    const items = readScenarioYaml('items.yaml') as Record<string, unknown>[];
    const broken = structuredClone(items);
    (broken[0] as Record<string, unknown>)['damage'] = 99;
    expect(validateItems(broken)).toBe(false);
    expect(validateItems.errors?.[0]).toMatchObject({ keyword: 'maximum' });

    const validateScene = ajv.compile(readCommitted('scene'));
    expect(validateScene(readScenarioYaml('scenes/barrow-door.yaml'))).toBe(true);
    const scene = readScenarioYaml('scenes/barrow-door.yaml') as {
      choices: { test?: { difficulty: string } }[];
    };
    const brokenScene = structuredClone(scene);
    // read-runes (index 1) resolves its runes through a wits test.
    brokenScene.choices[1]!.test!.difficulty = 'very hard';
    expect(validateScene(brokenScene)).toBe(false);
  });

  it('validate a Translation manifest and reject a non-translatable key', () => {
    const ajv = new Ajv({ strict: false });
    const validateManifest = ajv.compile(readCommitted('translation-manifest'));
    expect(
      validateManifest({
        language: 'pl',
        baseVersion: '1.0.0',
        title: 'Dwa mosty',
        description: 'Opis.',
        locations: ['translations/pl/locations/east-bank.yaml'],
        templates: ['translations/pl/templates.yaml'],
        endings: ['translations/pl/endings.yaml'],
      }),
    ).toBe(true);

    const validateScene = ajv.compile(readCommitted('translation-scene'));
    expect(validateScene({ id: 'arrival', title: 'Przybycie', text: 'Tekst.' })).toBe(true);
    // A non-translatable field (mechanics live in the base only) is rejected.
    expect(
      validateScene({ id: 'arrival', title: 'Przybycie', text: 'Tekst.', when: { flag: 'x' } }),
    ).toBe(false);
  });

  it('ship an example VS Code yaml.schemas configuration covering every kind', () => {
    // settings.json is JSONC (VS Code allows comments); strip full-line comments.
    const settingsSource = fs
      .readFileSync(path.join(repoRoot, '.vscode', 'settings.json'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const settings = JSON.parse(settingsSource) as {
      'yaml.schemas': Record<string, string>;
    };
    const schemas = settings['yaml.schemas'];
    const targets = Object.keys(schemas);
    expect(targets).toHaveLength(FILE_KINDS.length);
    for (const kind of FILE_KINDS) {
      const target = targets.find((t) => t === `./schemas/${kind}.json`);
      expect(target, `missing yaml.schemas entry for ${kind}`).toBeDefined();
      expect(fs.existsSync(path.join(repoRoot, targets.find((t) => t === `./schemas/${kind}.json`) as string))).toBe(
        true,
      );
    }
    expect(Object.values(schemas).join('\n')).toContain('scenarios/*/scenario.yaml');
  });
});
