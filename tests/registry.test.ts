// Scenario registry: invalid Scenarios are left out, the rest still loads.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAllScenarios } from '../src/content/index';

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

describe('scenario registry', () => {
  it('leaves an invalid Scenario out and still loads the valid one', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-collection-'));
    writeFiles(path.join(root, 'good'), {
      'scenario.yaml': [
        'schemaVersion: 2',
        'id: good',
        'title: Good',
        'description: Fine.',
        'version: "1.0.0"',
        'language: en',
        'startLocation: a',
        'deathEnding: e',
        'locations:',
        '  - locations/a.yaml',
        'scenes:',
        '  - scenes/s.yaml',
        'templates:',
        '  - templates.yaml',
        'endings:',
        '  - endings.yaml',
        '',
      ].join('\n'),
      'locations/a.yaml': 'id: a\nname: A\ndescription: A place.\nmap: { x: 10, y: 20 }\nscenes: [s]\n',
      'scenes/s.yaml':
        'id: s\ntitle: S\ntrigger: on-enter\ntext: A room.\nchoices:\n  - id: go\n    text: Go on.\n    outcome:\n      end: w\n',
      'templates.yaml':
        '- id: t\n  name: T\n  attributes: { might: 2, agility: 1, wits: 2, presence: 1 }\n',
      'endings.yaml':
        '- id: e\n  kind: defeat\n  title: E\n  text: The end.\n- id: w\n  kind: victory\n  title: W\n  text: You win.\n',
    });
    writeFiles(path.join(root, 'bad'), {
      'scenario.yaml': 'schemaVersion: 2\nid: wrong-id\ntitle: Bad\ndescription: Broken.\n',
    });

    const registry = loadAllScenarios(root);
    expect([...registry.keys()]).toEqual(['good']);
  });
});

describe('dev registry reload', () => {
  const previousEnv = process.env.SCENARIO_DIR;

  function writeScenario(root: string, sceneText: string): void {
    const files: Record<string, string> = {
      'solo/scenario.yaml': [
        'schemaVersion: 2',
        'id: solo',
        'title: Solo',
        'description: One room.',
        'version: "1.0.0"',
        'language: en',
        'startLocation: a',
        'deathEnding: e',
        'locations:',
        '  - locations/a.yaml',
        'scenes:',
        '  - scenes/s.yaml',
        'templates:',
        '  - templates.yaml',
        'endings:',
        '  - endings.yaml',
        '',
      ].join('\n'),
      'solo/locations/a.yaml': 'id: a\nname: A\ndescription: A place.\nmap: { x: 10, y: 20 }\nscenes: [s]\n',
      'solo/scenes/s.yaml': [
        'id: s',
        'title: S',
        'trigger: on-enter',
        `text: ${sceneText}`,
        'choices:',
        '  - id: go',
        '    text: Go on.',
        '    outcome:',
        '      end: w',
        '',
      ].join('\n'),
      'solo/templates.yaml':
        '- id: t\n  name: T\n  attributes: { might: 2, agility: 1, wits: 2, presence: 1 }\n',
      'solo/endings.yaml':
        '- id: e\n  kind: defeat\n  title: E\n  text: The end.\n- id: w\n  kind: victory\n  title: W\n  text: You win.\n',
    };
    for (const [relative, content] of Object.entries(files)) {
      const full = path.join(root, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }

  function touchFuture(full: string): void {
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(full, future, future);
  }

  afterEach(() => {
    if (previousEnv === undefined) delete process.env.SCENARIO_DIR;
    else process.env.SCENARIO_DIR = previousEnv;
  });

  it('picks up an edited listed Scene file on the next request without a restart', async () => {
    const { loadAllScenarios, getScenario } = await import('../src/content/index');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reload-'));
    process.env.SCENARIO_DIR = root;
    writeScenario(root, 'A room.');
    loadAllScenarios(root);
    expect(getScenario('solo')?.scenesById['s']?.text).toBe('A room.');
    const before = getScenario('solo')?.contentHash;

    const sceneFile = path.join(root, 'solo', 'scenes', 's.yaml');
    fs.writeFileSync(
      sceneFile,
      'id: s\ntitle: S\ntrigger: on-enter\ntext: A changed room.\nchoices:\n  - id: go\n    text: Go on.\n    outcome:\n      end: w\n',
    );
    touchFuture(sceneFile);
    touchFuture(path.join(root, 'solo', 'scenes'));
    expect(getScenario('solo')?.scenesById['s']?.text).toBe('A changed room.');
    expect(getScenario('solo')?.contentHash).not.toBe(before);
  });

  it('ignores edits to files the manifest does not list', async () => {
    const { loadAllScenarios, getScenario } = await import('../src/content/index');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reload-'));
    process.env.SCENARIO_DIR = root;
    writeScenario(root, 'A room.');
    const extra = path.join(root, 'solo', 'notes.yaml');
    fs.writeFileSync(extra, 'note: hello\n');
    loadAllScenarios(root);
    const before = getScenario('solo');
    fs.writeFileSync(extra, 'note: changed\n');
    touchFuture(extra);
    const after = getScenario('solo');
    expect(after).toBe(before);
  });

  it('leaves out a Scenario whose edit made it invalid', async () => {
    const { loadAllScenarios, getScenario } = await import('../src/content/index');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reload-'));
    process.env.SCENARIO_DIR = root;
    writeScenario(root, 'A room.');
    loadAllScenarios(root);
    expect(getScenario('solo')).toBeDefined();
    fs.rmSync(path.join(root, 'solo', 'scenes', 's.yaml'));
    expect(getScenario('solo')).toBeUndefined();
  });
});
