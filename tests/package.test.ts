// Phase 1 (Package) validation tests: one invalid fixture package per
// package/ rule, asserting code, file and line/column.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/content/index';
import type { Diagnostic } from '../src/content/index';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');

function makeScenarioDir(name: string): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-package-')), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePackage(dir: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function manifestFor(id: string, sections: string): string {
  return `schemaVersion: 1\nid: ${id}\n${sections}`;
}

const STANDARD_SECTIONS =
  'locations:\n  - locations/a.yaml\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n';

/** Minimal valid package whose manifest id equals the directory name. Valid
 * across every implemented phase, so Phase 1 tests can assert a clean load:
 * the start location reaches a victory ending, so play/no-victory and
 * play/no-way-out stay silent. */
function writeMinimalPackage(dir: string): void {
  const id = path.basename(dir);
  writePackage(dir, {
    'scenario.yaml': manifestFor(
      id,
      'title: T\ndescription: D\nversion: "1.0.0"\nlanguage: en\nstartLocation: a\ndeathEnding: e\n' +
        STANDARD_SECTIONS +
        'scenes:\n  - scenes/s.yaml\n',
    ),
    'locations/a.yaml': 'id: a\nname: A\ndescription: A place.\nmap: { x: 10, y: 20 }\nscenes: [s]\n',
    'scenes/s.yaml':
      'id: s\ntitle: S\ntrigger: on-enter\ntext: A room.\nchoices:\n  - id: go\n    text: Go on.\n    outcome:\n      end: w\n',
    'templates.yaml':
      '- id: t\n  name: T\n  attributes: { might: 2, agility: 1, wits: 2, presence: 1 }\n',
    'endings.yaml':
      '- id: e\n  kind: defeat\n  title: E\n  text: The end.\n- id: w\n  kind: victory\n  title: W\n  text: You win.\n',
  });
}

function errorsOf(dir: string): Diagnostic[] {
  const result = loadScenario(dir);
  if (result.ok) throw new Error(`expected ${dir} to be rejected, but it loaded`);
  return result.diagnostics;
}

function lineOf(diagnostic: Diagnostic): [number, number] {
  if (!diagnostic.range) throw new Error(`expected a range on ${diagnostic.code}`);
  return [diagnostic.range.line, diagnostic.range.column];
}

describe('package phase', () => {
  it('loads a minimal valid package with no diagnostics', () => {
    const dir = makeScenarioDir('valid-pkg');
    writeMinimalPackage(dir);
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The compiled model carries far more than the identity; the identity
      // and the clean run are what this phase owns.
      expect(result.scenario.id).toBe('valid-pkg');
      expect(result.scenario.dir).toBe(dir);
      expect(result.warnings).toEqual([]);
    }
  });

  it('reports no Package-phase diagnostics for scenarios/whispering-woods', () => {
    const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scenario.id).toBe('whispering-woods');
      expect(result.warnings).toEqual([]);
    }
  });

  it('ignores files present in the directory but not listed in the manifest', () => {
    const dir = makeScenarioDir('unlisted-ignored');
    writeMinimalPackage(dir);
    writePackage(dir, { 'draft.yaml': '{{{{ not yaml at all', 'notes.txt': 'whatever' });
    const result = loadScenario(dir);
    expect(result.ok).toBe(true);
  });

  it('package/missing-manifest when scenario.yaml is absent', () => {
    const dir = makeScenarioDir('missing-manifest');
    expect(errorsOf(dir)).toEqual([
      {
        severity: 'error',
        code: 'package/missing-manifest',
        message: 'scenario.yaml is missing or unreadable',
        file: 'scenario.yaml',
      },
    ]);
  });

  it('package/yaml-syntax with file and position', () => {
    const dir = makeScenarioDir('yaml-syntax');
    writeMinimalPackage(dir);
    fs.writeFileSync(path.join(dir, 'locations/a.yaml'), 'id: a\n\tname: x\n');
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    const diagnostic = diagnostics[0] as Diagnostic;
    expect(diagnostic.code).toBe('package/yaml-syntax');
    expect(diagnostic.file).toBe('locations/a.yaml');
    expect(diagnostic.range).toEqual({ line: 2, column: 1, endLine: 2, endColumn: 2 });
  });

  it('package/multiple-documents pointing at the second document', () => {
    const dir = makeScenarioDir('multiple-documents');
    writeMinimalPackage(dir);
    fs.writeFileSync(path.join(dir, 'locations/a.yaml'), 'id: a\n---\nid: b\n');
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    const diagnostic = diagnostics[0] as Diagnostic;
    expect(diagnostic.code).toBe('package/multiple-documents');
    expect(diagnostic.file).toBe('locations/a.yaml');
    expect(diagnostic.range).toEqual({ line: 2, column: 1, endLine: 2, endColumn: 1 });
  });

  it('package/forbidden-yaml for anchors, aliases, merge keys and custom tags', () => {
    const dir = makeScenarioDir('forbidden-yaml');
    writeMinimalPackage(dir);
    fs.writeFileSync(
      path.join(dir, 'locations/a.yaml'),
      [
        'id: a',
        'name: A',
        'extra: &anchor value',
        'ref: *anchor',
        'tagged: !custom hi',
        'merged:',
        '  <<: *anchor',
        '',
      ].join('\n'),
    );
    const diagnostics = errorsOf(dir).filter((d) => d.code === 'package/forbidden-yaml');
    expect(diagnostics.map((d) => [d.message, d.file, ...lineOf(d)])).toEqual([
      ['YAML anchor "&anchor" is not allowed in Scenario files', 'locations/a.yaml', 3, 16],
      ['YAML aliases are not allowed in Scenario files', 'locations/a.yaml', 4, 6],
      ['YAML custom tag "!custom" is not allowed in Scenario files', 'locations/a.yaml', 5, 17],
      ['YAML merge keys (<<) are not allowed in Scenario files', 'locations/a.yaml', 7, 3],
      ['YAML aliases are not allowed in Scenario files', 'locations/a.yaml', 7, 7],
    ]);
  });

  it('package/duplicate-key for repeated keys, including nested mappings', () => {
    const dir = makeScenarioDir('duplicate-key');
    writeMinimalPackage(dir);
    fs.writeFileSync(
      path.join(dir, 'locations/a.yaml'),
      'id: a\nnested:\n  x: 1\n  x: 2\nid: b\n',
    );
    const diagnostics = errorsOf(dir).filter((d) => d.code === 'package/duplicate-key');
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]?.file).toBe('locations/a.yaml');
    expect(diagnostics[0]?.message).toBe('duplicate mapping key "x"');
    expect(diagnostics[0]?.range).toEqual({ line: 4, column: 3, endLine: 4, endColumn: 4 });
    expect(diagnostics[1]?.message).toBe('duplicate mapping key "id"');
    expect(diagnostics[1]?.range).toEqual({ line: 5, column: 1, endLine: 5, endColumn: 3 });
  });

  it('package/unsupported-schema-version for a wrong value, pointing at the value', () => {
    const dir = makeScenarioDir('unsupported-schema-version');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': manifestFor(id, STANDARD_SECTIONS).replace('schemaVersion: 1', 'schemaVersion: 2'),
      'locations/a.yaml': 'id: a\n',
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'package/unsupported-schema-version',
      file: 'scenario.yaml',
      range: { line: 1, column: 16, endLine: 1, endColumn: 17 },
    });
  });

  it('package/unsupported-schema-version when schemaVersion is missing', () => {
    const dir = makeScenarioDir('missing-schema-version');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': `id: ${id}\n${STANDARD_SECTIONS}`,
      'locations/a.yaml': 'id: a\n',
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('package/unsupported-schema-version');
    expect(diagnostics[0]?.file).toBe('scenario.yaml');
    expect(diagnostics[0]?.range).toBeUndefined();
  });

  it('package/invalid-manifest when a file list is not a list', () => {
    const dir = makeScenarioDir('invalid-manifest');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': manifestFor(id, 'locations: oops\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n'),
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('package/invalid-manifest');
    expect(diagnostics[0]?.file).toBe('scenario.yaml');
    expect(diagnostics[0]?.range).toEqual({ line: 3, column: 12, endLine: 3, endColumn: 16 });
  });

  it('package/invalid-manifest when a required file list is missing', () => {
    const dir = makeScenarioDir('invalid-manifest-missing');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': manifestFor(id, 'locations:\n  - locations/a.yaml\nendings:\n  - endings.yaml\n'),
      'locations/a.yaml': 'id: a\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('package/invalid-manifest');
    expect(diagnostics[0]?.file).toBe('scenario.yaml');
    expect(diagnostics[0]?.range).toBeUndefined();
    expect(diagnostics[0]?.message).toContain('"templates"');
  });

  it('package/invalid-manifest when a file list holds a non-string', () => {
    const dir = makeScenarioDir('invalid-manifest-entry');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': manifestFor(
        id,
        'locations:\n  - locations/a.yaml\n  - 42\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n',
      ),
      'locations/a.yaml': 'id: a\n',
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('package/invalid-manifest');
    expect(diagnostics[0]?.range).toEqual({ line: 5, column: 5, endLine: 5, endColumn: 7 });
  });

  it('package/invalid-path for absolute, parent, URL and extension-less paths', () => {
    const dir = makeScenarioDir('invalid-path');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': manifestFor(
        id,
        'locations:\n  - /abs.yaml\n  - ../out.yaml\n  - https://example.com/x.yaml\n  - notes.txt\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n',
      ),
      'notes.txt': 'id: notes\n',
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics.map((d) => [d.code, d.file, ...lineOf(d), d.message])).toEqual([
      [
        'package/invalid-path',
        'scenario.yaml',
        4,
        5,
        'listed path "/abs.yaml" is absolute; paths must be relative to the Scenario directory',
      ],
      [
        'package/invalid-path',
        'scenario.yaml',
        5,
        5,
        'listed path "../out.yaml" contains ".."; paths must stay inside the Scenario directory',
      ],
      [
        'package/invalid-path',
        'scenario.yaml',
        6,
        5,
        'listed path "https://example.com/x.yaml" is a URL; paths must be relative to the Scenario directory',
      ],
      [
        'package/invalid-path',
        'scenario.yaml',
        7,
        5,
        'listed path "notes.txt" lacks the .yaml extension',
      ],
    ]);
  });

  it('package/invalid-path for a symlink resolving outside the Scenario directory', () => {
    const dir = makeScenarioDir('symlink-escape');
    const id = path.basename(dir);
    const outside = path.join(path.dirname(dir), 'outside-target.yaml');
    fs.writeFileSync(outside, 'id: outside\n');
    writePackage(dir, {
      'scenario.yaml': manifestFor(
        id,
        'locations:\n  - locations/link.yaml\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n',
      ),
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    fs.mkdirSync(path.join(dir, 'locations'), { recursive: true });
    fs.symlinkSync(outside, path.join(dir, 'locations', 'link.yaml'));
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('package/invalid-path');
    expect(diagnostics[0]?.message).toContain('symlink resolving outside');
    expect(lineOf(diagnostics[0] as Diagnostic)).toEqual([4, 5]);
  });

  it('package/invalid-path for a file under a directory symlinked outside', () => {
    const dir = makeScenarioDir('symlink-escape-dir');
    const id = path.basename(dir);
    const outside = path.join(path.dirname(dir), 'outside-dir');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'file.yaml'), 'id: outside\n');
    writePackage(dir, {
      'scenario.yaml': manifestFor(
        id,
        'locations:\n  - sub/file.yaml\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n',
      ),
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    fs.symlinkSync(outside, path.join(dir, 'sub'));
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('package/invalid-path');
    expect(diagnostics[0]?.message).toContain('symlink resolving outside');
    expect(lineOf(diagnostics[0] as Diagnostic)).toEqual([4, 5]);
  });

  it('package/missing-file for a listed file that does not exist', () => {
    const dir = makeScenarioDir('missing-file');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': manifestFor(
        id,
        'locations:\n  - locations/ghost.yaml\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n',
      ),
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('package/missing-file');
    expect(diagnostics[0]?.file).toBe('scenario.yaml');
    expect(diagnostics[0]?.range).toEqual({ line: 4, column: 5, endLine: 4, endColumn: 25 });
  });

  it('package/duplicate-file for a file listed twice in one section', () => {
    const dir = makeScenarioDir('duplicate-file');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': manifestFor(
        id,
        'locations:\n  - locations/a.yaml\n  - locations/a.yaml\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n',
      ),
      'locations/a.yaml': 'id: a\n',
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    const diagnostic = diagnostics[0] as Diagnostic;
    expect(diagnostic.code).toBe('package/duplicate-file');
    expect(diagnostic.file).toBe('scenario.yaml');
    expect(diagnostic.range).toEqual({ line: 5, column: 5, endLine: 5, endColumn: 21 });
    expect(diagnostic.related).toEqual([
      {
        file: 'scenario.yaml',
        range: { line: 4, column: 5, endLine: 4, endColumn: 21 },
        message: 'first listed here',
      },
    ]);
  });

  it('package/duplicate-file for a file listed across sections', () => {
    const dir = makeScenarioDir('duplicate-file-sections');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': manifestFor(
        id,
        'locations:\n  - shared.yaml\nscenes:\n  - shared.yaml\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n',
      ),
      'shared.yaml': 'id: shared\n',
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('package/duplicate-file');
    expect(lineOf(diagnostics[0] as Diagnostic)).toEqual([6, 5]);
    expect(diagnostics[0]?.related).toEqual([
      {
        file: 'scenario.yaml',
        range: { line: 4, column: 5, endLine: 4, endColumn: 16 },
        message: 'first listed here (in "locations")',
      },
    ]);
  });

  it('package/id-mismatch when the manifest id differs from the directory name', () => {
    const dir = makeScenarioDir('id-mismatch');
    writePackage(dir, {
      'scenario.yaml': manifestFor(
        'other-name',
        'locations:\n  - locations/a.yaml\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n',
      ),
      'locations/a.yaml': 'id: a\n',
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('package/id-mismatch');
    expect(diagnostics[0]?.message).toBe(
      'manifest id "other-name" differs from the directory name "id-mismatch"',
    );
    expect(diagnostics[0]?.range).toEqual({ line: 2, column: 5, endLine: 2, endColumn: 15 });
  });

  it('collects every finding of the phase across files', () => {
    const dir = makeScenarioDir('collected');
    const id = path.basename(dir);
    writePackage(dir, {
      'scenario.yaml': manifestFor(
        id,
        'locations:\n  - locations/broken.yaml\n  - locations/ghost.yaml\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n',
      ),
      'locations/broken.yaml': 'id: broken\n\tname: x\n',
      'templates.yaml': '- id: t\n',
      'endings.yaml': '- id: e\n',
    });
    const diagnostics = errorsOf(dir);
    expect(diagnostics.map((d) => d.code).sort()).toEqual([
      'package/missing-file',
      'package/yaml-syntax',
    ]);
  });
});
