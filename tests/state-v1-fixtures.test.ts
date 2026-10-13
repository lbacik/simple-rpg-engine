// Frozen v1 fixtures: migration evidence for state v2 and legacy-rendering
// evidence for the Journal (tactical-combat-handoff, release sequence step 1;
// docs/spec/playthrough-state.md, version 1 to version 2).
//
// Every document here was captured by driving the real engine paths on the
// real whispering-woods package
// (`scripts/capture-state-v1-fixtures.ts`), not hand-written. This test proves
// each one parses with the frozen v1 schema (and matches the live reader
// exactly, so current behaviour is unchanged), records the Scenario package
// and content hash it was captured against, and renders every Journal row as
// it does today in both Interface Languages.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderJournalEntry } from '../src/app/lib/journal';
import { checkPlaythroughCompatibility, loadScenario } from '../src/content/index';
import {
  combatGuardUp,
  parsePlaythroughState,
  type PlaythroughState,
} from '../src/engine/index';
import {
  parsePlaythroughStateV1,
  PlaythroughStateV1Schema,
} from '../src/engine/state-v1';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'state-v1');

type FixtureFile = {
  meta: {
    name: string;
    description: string;
    scenarioId: string;
    scenarioVersion: string;
    contentHash: string;
    scenarioLanguage: string;
    capturedWith: string;
  };
  state: unknown;
  journal: Array<{
    seq: number;
    step: number;
    type: string;
    lang: string;
    payload: Record<string, unknown>;
  }>;
};

type Manifest = {
  scenarioId: string;
  scenarioVersion: string;
  contentHash: string;
  scenarioLanguage: string;
  fixtures: Array<{ file: string; name: string; description: string }>;
};

const FIXTURE_FILES = [
  'dormant.json',
  'active-combat-far.json',
  'active-combat-near.json',
  'active-combat-far-guarded.json',
  'escaped-with-damage.json',
  'defeated.json',
  'ended.json',
  'incompatible.json',
] as const;

function loadFixture(file: string): FixtureFile {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, file), 'utf8')) as FixtureFile;
}

function loadWoods() {
  const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
  if (!result.ok) {
    throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

describe('state v1 fixtures', () => {
  it('covers every listed scenario with a manifest', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'),
    ) as Manifest;
    expect(manifest.fixtures.map((entry) => entry.file).sort()).toEqual([...FIXTURE_FILES].sort());
    for (const file of FIXTURE_FILES) {
      expect(fs.existsSync(path.join(fixtureDir, file))).toBe(true);
    }
  });

  it('records the Scenario package and content hash it was captured against', () => {
    const scenario = loadWoods();
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'),
    ) as Manifest;
    // A content edit moves the hash: recapture deliberately with the script
    // and review the diff, never by editing the JSON by hand.
    expect(manifest.scenarioId).toBe(scenario.id);
    expect(manifest.scenarioVersion).toBe(scenario.version);
    expect(manifest.contentHash).toBe(scenario.contentHash);
    for (const file of FIXTURE_FILES) {
      const fixture = loadFixture(file);
      expect(fixture.meta.scenarioId).toBe(scenario.id);
      expect(fixture.meta.scenarioVersion).toBe(scenario.version);
      expect(fixture.meta.contentHash).toBe(scenario.contentHash);
      expect(fixture.meta.capturedWith).toBe('scripts/capture-state-v1-fixtures.ts');
    }
  });

  it('parses every captured document with the frozen v1 schema, rejected by the live reader', () => {
    for (const file of FIXTURE_FILES) {
      const fixture = loadFixture(file);
      const frozen = parsePlaythroughStateV1(fixture.state);
      expect(frozen.stateVersion).toBe(1);
      // D1: the live schema is now v2 (issue #120); v1 documents are rejected
      // by the live reader and reach v2 through the deterministic migration
      // (issue #124). The frozen v1 schema keeps parsing them unchanged.
      expect(() => parsePlaythroughState(fixture.state)).toThrow();
      expect(PlaythroughStateV1Schema.parse(fixture.state)).toEqual(frozen);
    }
  });

  it('renders every captured Journal row as it does today, in both languages', () => {
    for (const file of FIXTURE_FILES) {
      const fixture = loadFixture(file);
      expect(fixture.journal.length).toBeGreaterThan(0);
      const characterName = parsePlaythroughStateV1(fixture.state).character.name;
      for (const row of fixture.journal) {
        for (const catalogue of [en, pl]) {
          const rendered = renderJournalEntry(
            { type: row.type, lang: row.lang, payload: row.payload },
            catalogue,
            characterName,
          );
          expect(rendered.label.length).toBeGreaterThan(0);
          expect(rendered.html.length).toBeGreaterThan(0);
          expect(rendered.html).not.toContain('undefined');
          expect(rendered.html).not.toContain('NaN');
        }
      }
    }
  });

  it('holds an active one-Enemy Combat at Near', () => {
    const scenario = loadWoods();
    const fixture = loadFixture('active-combat-near.json');
    const state = parsePlaythroughStateV1(fixture.state);
    expect(state.status).toBe('active');
    expect(state.activeCombat).toEqual({
      encounterId: 'hollow-wolf',
      range: 'near',
      round: 2,
    });
    expect(checkPlaythroughCompatibility(scenario, state as unknown as PlaythroughState)).toEqual({ ok: true });
  });

  it('holds an active Combat at Far without a raised guard', () => {
    const scenario = loadWoods();
    const fixture = loadFixture('active-combat-far.json');
    const state = parsePlaythroughStateV1(fixture.state);
    expect(state.activeCombat).toEqual({
      encounterId: 'hollow-wolf',
      range: 'far',
      round: 1,
    });
    const rows = fixture.journal.map((row) => ({ type: row.type, payload: row.payload }));
    expect(combatGuardUp(rows, 'hollow-wolf')).toBe(false);
    expect(checkPlaythroughCompatibility(scenario, state as unknown as PlaythroughState)).toEqual({ ok: true });
  });

  it('holds an active Combat at Far with a raised guard in its Journal', () => {
    const scenario = loadWoods();
    const fixture = loadFixture('active-combat-far-guarded.json');
    const state = parsePlaythroughStateV1(fixture.state);
    expect(state.status).toBe('active');
    expect(state.activeCombat).toEqual({
      encounterId: 'camp-bandit',
      range: 'far',
      round: 2,
    });
    const rows = fixture.journal.map((row) => ({ type: row.type, payload: row.payload }));
    expect(combatGuardUp(rows, 'camp-bandit')).toBe(true);
    expect(checkPlaythroughCompatibility(scenario, state as unknown as PlaythroughState)).toEqual({ ok: true });
  });

  it('holds an Escaped Encounter with recorded Damage', () => {
    const scenario = loadWoods();
    const fixture = loadFixture('escaped-with-damage.json');
    const state = parsePlaythroughStateV1(fixture.state);
    expect(state.status).toBe('active');
    expect(state.activeCombat).toBeNull();
    expect(state.encounterDamage['hollow-wolf']).toBe(3);
    const end = fixture.journal.find((row) => row.type === 'combat-end');
    expect(end?.payload).toMatchObject({ encounterId: 'hollow-wolf', howEnded: 'escape' });
    expect(checkPlaythroughCompatibility(scenario, state as unknown as PlaythroughState)).toEqual({ ok: true });
  });

  it('holds a defeated Encounter', () => {
    const scenario = loadWoods();
    const fixture = loadFixture('defeated.json');
    const state = parsePlaythroughStateV1(fixture.state);
    expect(state.status).toBe('active');
    expect(state.activeCombat).toBeNull();
    const taken = state.encounterDamage['hollow-wolf'] ?? 0;
    expect(taken).toBeGreaterThanOrEqual(scenario.encountersById['hollow-wolf']?.participants[0]?.enemy.health ?? 0);
    const end = fixture.journal.find((row) => row.type === 'combat-end');
    expect(end?.payload).toMatchObject({ encounterId: 'hollow-wolf', howEnded: 'victory' });
    expect(checkPlaythroughCompatibility(scenario, state as unknown as PlaythroughState)).toEqual({ ok: true });
  });

  it('holds a dormant mid-Scenario save', () => {
    const scenario = loadWoods();
    const fixture = loadFixture('dormant.json');
    const state = parsePlaythroughStateV1(fixture.state);
    expect(state.status).toBe('active');
    expect(state.activeCombat).toBeNull();
    expect(state.currentLocationId).toBe('forest-edge');
    expect(checkPlaythroughCompatibility(scenario, state as unknown as PlaythroughState)).toEqual({ ok: true });
  });

  it('holds an ended save', () => {
    const fixture = loadFixture('ended.json');
    const state = parsePlaythroughStateV1(fixture.state);
    expect(state.status).toBe('ended');
    expect(state.endingId).toBe('walked-away');
    const ending = fixture.journal.find((row) => row.type === 'ending');
    expect(ending?.payload).toMatchObject({ endingId: 'walked-away', kind: 'defeat' });
  });

  it('holds a save that is incompatible with current content, with its Journal intact', () => {
    const scenario = loadWoods();
    const fixture = loadFixture('incompatible.json');
    const state = parsePlaythroughStateV1(fixture.state);
    const check = checkPlaythroughCompatibility(scenario, state as unknown as PlaythroughState);
    expect(check.ok).toBe(false);
    if (check.ok) throw new Error('expected incompatibility');
    expect(check.reasons.join('\n')).toContain('removed-location');
    // The Journal stays available: every row still renders.
    const characterName = state.character.name;
    for (const row of fixture.journal) {
      const rendered = renderJournalEntry(
        { type: row.type, lang: row.lang, payload: row.payload },
        en,
        characterName,
      );
      expect(rendered.html.length).toBeGreaterThan(0);
    }
  });
});
