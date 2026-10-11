// Scenario registry: invalid Scenarios are left out, the rest still loads.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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
        'schemaVersion: 1',
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
      'scenario.yaml': 'schemaVersion: 1\nid: wrong-id\ntitle: Bad\ndescription: Broken.\n',
    });

    const registry = loadAllScenarios(root);
    expect([...registry.keys()]).toEqual(['good']);
  });
});
