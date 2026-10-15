// The remembered Arena Setup (issue #171): the last setup is remembered per
// Session, so reopening the Arena restores it and Fight again starts a new
// Combat with the identical setup. The snapshot keeps the raw form fields —
// option ids, not resolved bonuses — so an outfit-only bonus restores as the
// outfit, never as a talisman, and a duplicate Enemy kind restores twice.

import { describe, expect, it } from 'vitest';
import type { InterfaceLanguage } from '../src/i18n/index';
import {
  arenaSetupFromRemembered,
  captureRememberedSetup,
  parseRememberedSetup,
  rememberedFormDefaults,
  rememberedSetupToFormData,
  type RememberedArenaSetup,
} from '../src/app/arena/last-setup';

function formDataFor(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function fullFields(): Record<string, string> {
  return {
    enemy1: 'grey-wolf',
    range1: 'near',
    enemy2: 'bandit-archer',
    range2: 'far',
    might: '2',
    agility: '2',
    wits: '1',
    presence: '1',
    health: '9',
    weapon: 'hunting-bow',
    outfit: 'chain-shirt',
    talisman: 'none',
    consumables: '2',
  };
}

describe('remembered arena setup', () => {
  it('captures the form and rebuilds the identical validated setup', () => {
    const snapshot = captureRememberedSetup(formDataFor(fullFields()));
    expect(snapshot).toBeDefined();
    if (snapshot === undefined) throw new Error('expected a snapshot');
    for (const language of ['en', 'pl'] as InterfaceLanguage[]) {
      const setup = arenaSetupFromRemembered(snapshot, language);
      expect(setup).toBeDefined();
      if (setup === undefined) throw new Error('expected a setup');
      expect(setup.opponents).toHaveLength(2);
      expect(setup.opponents[0]).toMatchObject({ id: 'grey-wolf', range: 'near' });
      expect(setup.opponents[1]).toMatchObject({ id: 'bandit-archer', range: 'far' });
      expect(setup.character.attributes).toEqual({ might: 2, agility: 2, wits: 1, presence: 1 });
      expect(setup.character.health).toBe(9);
      expect(setup.character.weapon).toMatchObject({ damage: 3, reach: 'ranged' });
      expect(setup.character.bonuses).toEqual({ might: 1 });
      expect(setup.character.consumables).toMatchObject({ count: 2 });
    }
  });

  it('round-trips through FormData, so a rematch reuses the start pipeline', () => {
    const snapshot = captureRememberedSetup(formDataFor(fullFields()));
    if (snapshot === undefined) throw new Error('expected a snapshot');
    const rebuilt = captureRememberedSetup(rememberedSetupToFormData(snapshot));
    expect(rebuilt).toEqual(snapshot);
  });

  it('keeps a duplicate Enemy kind as two opponents', () => {
    const snapshot = captureRememberedSetup(
      formDataFor({ ...fullFields(), enemy1: 'grey-wolf', enemy2: 'grey-wolf' }),
    );
    if (snapshot === undefined) throw new Error('expected a snapshot');
    const setup = arenaSetupFromRemembered(snapshot, 'en');
    if (setup === undefined) throw new Error('expected a setup');
    expect(setup.opponents).toHaveLength(2);
    expect(setup.opponents[0]?.id).not.toBe(setup.opponents[1]?.id);
  });

  it('restores an outfit-only bonus as the outfit, never as a talisman', () => {
    const snapshot = captureRememberedSetup(formDataFor(fullFields()));
    if (snapshot === undefined) throw new Error('expected a snapshot');
    const defaults = rememberedFormDefaults(snapshot);
    expect(defaults.weapon).toBe('hunting-bow');
    expect(defaults.outfit).toBe('chain-shirt');
    expect(defaults.talisman).toBe('none');
    expect(defaults.consumables).toBe(2);
    expect(defaults.attributes).toEqual({ might: 2, agility: 2, wits: 1, presence: 1 });
    expect(defaults.health).toBe(9);
    expect(defaults.opponent1).toEqual({ enemy: 'grey-wolf', range: 'near' });
    expect(defaults.opponent2).toEqual({ enemy: 'bandit-archer', range: 'far' });
  });

  it('restores a single opponent with no second slot', () => {
    const fields = fullFields();
    const snapshot = captureRememberedSetup(
      formDataFor({ ...fields, enemy2: '', range2: 'far' }),
    );
    if (snapshot === undefined) throw new Error('expected a snapshot');
    const setup = arenaSetupFromRemembered(snapshot, 'en');
    if (setup === undefined) throw new Error('expected a setup');
    expect(setup.opponents).toHaveLength(1);
    const defaults = rememberedFormDefaults(snapshot);
    expect(defaults.opponent2).toBeNull();
  });

  it('rejects forged snapshots at parse time', () => {
    const snapshot = captureRememberedSetup(formDataFor(fullFields()));
    if (snapshot === undefined) throw new Error('expected a snapshot');
    const good = JSON.stringify(snapshot);
    expect(parseRememberedSetup(good)).toEqual(snapshot);
    expect(parseRememberedSetup('not json')).toBeUndefined();
    expect(parseRememberedSetup('[]')).toBeUndefined();
    expect(
      parseRememberedSetup(JSON.stringify({ ...snapshot, range1: 'sideways' })),
    ).toBeUndefined();
    expect(
      parseRememberedSetup(JSON.stringify({ ...snapshot, enemy1: '' })),
    ).toBeUndefined();
    const { might: dropped, ...withoutMight } = snapshot;
    expect(dropped).toBe('2');
    expect(parseRememberedSetup(JSON.stringify(withoutMight))).toBeUndefined();
  });

  it('falls back per field when the catalogue no longer knows an id', () => {
    const snapshot: RememberedArenaSetup = {
      enemy1: 'no-such-foe',
      range1: 'near',
      enemy2: '',
      range2: 'far',
      might: '2',
      agility: '2',
      wits: '1',
      presence: '1',
      health: '9',
      weapon: 'no-such-weapon',
      outfit: 'chain-shirt',
      talisman: 'no-such-talisman',
      consumables: '2',
    };
    // Unknown ids never rebuild into a fight...
    expect(arenaSetupFromRemembered(snapshot, 'en')).toBeUndefined();
    // ...but the setup form still opens, with fallbacks only where needed.
    const defaults = rememberedFormDefaults(snapshot);
    expect(defaults.opponent1.enemy).toBe('grey-wolf');
    expect(defaults.opponent1.range).toBe('near');
    expect(defaults.opponent2).toBeNull();
    expect(defaults.weapon).toBe('unarmed');
    expect(defaults.outfit).toBe('chain-shirt');
    expect(defaults.talisman).toBe('none');
    expect(defaults.health).toBe(9);
  });

  it('captures nothing from a forged third slot or a repeated field', () => {
    const third = formDataFor(fullFields());
    third.set('enemy3', 'grey-wolf');
    expect(captureRememberedSetup(third)).toBeUndefined();
    const repeated = formDataFor(fullFields());
    repeated.append('enemy1', 'grey-wolf');
    expect(captureRememberedSetup(repeated)).toBeUndefined();
  });
});
