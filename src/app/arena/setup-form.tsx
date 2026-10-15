// The Arena setup form (issue #168): the Bestiary picker, the Character
// Attribute and Health controls, and the Template preset selector. A Client
// Component, so the preset choice fills the controls without a round trip —
// but the form still posts plain fields to the Start Server Action, which
// re-validates every value, so the fight never trusts the browser. Every word
// arrives as rendered strings in props; no catalogue is imported here.

'use client';

import { useState } from 'react';
import { startArenaAction } from './actions';
import type { ArenaPreset } from './presets';

export type ArenaSetupEnemyOption = {
  id: string;
  name: string;
  description: string;
  meta: string;
};

export type ArenaSetupStrings = {
  bestiaryLegend: string;
  characterLegend: string;
  presetLabel: string;
  presetCustom: string;
  presetHelp: string;
  attributesHelp: string;
  healthLabel: string;
  start: string;
  attributeLabels: { might: string; agility: string; wits: string; presence: string };
};

export default function ArenaSetupForm({
  enemies,
  presets,
  defaults,
  strings,
}: {
  enemies: ArenaSetupEnemyOption[];
  presets: ArenaPreset[];
  defaults: { attributes: ArenaPreset['attributes']; health: number };
  strings: ArenaSetupStrings;
}) {
  const [presetId, setPresetId] = useState('');
  const [might, setMight] = useState(String(defaults.attributes.might));
  const [agility, setAgility] = useState(String(defaults.attributes.agility));
  const [wits, setWits] = useState(String(defaults.attributes.wits));
  const [presence, setPresence] = useState(String(defaults.attributes.presence));
  const [health, setHealth] = useState(String(defaults.health));

  function choosePreset(id: string): void {
    setPresetId(id);
    if (id === '') return;
    const preset = presets.find((candidate) => candidate.id === id);
    if (preset === undefined) return;
    setMight(String(preset.attributes.might));
    setAgility(String(preset.attributes.agility));
    setWits(String(preset.attributes.wits));
    setPresence(String(preset.attributes.presence));
    setHealth(String(preset.health));
  }

  // A manual edit keeps the filled values and marks the setup Custom again:
  // the preset is a starting point, never a lock.
  function edited(setter: (value: string) => void): (value: string) => void {
    return (value: string) => {
      setter(value);
      setPresetId('');
    };
  }

  const setMightEdited = edited(setMight);
  const setAgilityEdited = edited(setAgility);
  const setWitsEdited = edited(setWits);
  const setPresenceEdited = edited(setPresence);
  const setHealthEdited = edited(setHealth);

  return (
    <form action={startArenaAction}>
      <fieldset>
        <legend>{strings.bestiaryLegend}</legend>
        <ul className="cards">
          {enemies.map((enemy, index) => (
            <li key={enemy.id} className="card">
              <label>
                <input
                  type="radio"
                  name="enemy"
                  value={enemy.id}
                  defaultChecked={index === 0}
                />{' '}
                <strong>{enemy.name}</strong>
              </label>
              <p>{enemy.description}</p>
              <p className="meta">{enemy.meta}</p>
            </li>
          ))}
        </ul>
      </fieldset>
      <fieldset>
        <legend>{strings.characterLegend}</legend>
        <p>
          <label htmlFor="arena-preset">{strings.presetLabel}</label>{' '}
          <select
            id="arena-preset"
            name="preset"
            value={presetId}
            onChange={(event) => choosePreset(event.target.value)}
          >
            <option value="">{strings.presetCustom}</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} — {preset.scenarioName}
              </option>
            ))}
          </select>
        </p>
        <p className="meta">{strings.presetHelp}</p>
        <p className="meta">{strings.attributesHelp}</p>
        <p>
          <label htmlFor="arena-might">{strings.attributeLabels.might}</label>{' '}
          <input
            id="arena-might"
            name="might"
            type="number"
            min={0}
            max={3}
            step={1}
            required
            inputMode="numeric"
            value={might}
            onChange={(event) => setMightEdited(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="arena-agility">{strings.attributeLabels.agility}</label>{' '}
          <input
            id="arena-agility"
            name="agility"
            type="number"
            min={0}
            max={3}
            step={1}
            required
            inputMode="numeric"
            value={agility}
            onChange={(event) => setAgilityEdited(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="arena-wits">{strings.attributeLabels.wits}</label>{' '}
          <input
            id="arena-wits"
            name="wits"
            type="number"
            min={0}
            max={3}
            step={1}
            required
            inputMode="numeric"
            value={wits}
            onChange={(event) => setWitsEdited(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="arena-presence">{strings.attributeLabels.presence}</label>{' '}
          <input
            id="arena-presence"
            name="presence"
            type="number"
            min={0}
            max={3}
            step={1}
            required
            inputMode="numeric"
            value={presence}
            onChange={(event) => setPresenceEdited(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="arena-health">{strings.healthLabel}</label>{' '}
          <input
            id="arena-health"
            name="health"
            type="number"
            min={1}
            max={12}
            step={1}
            required
            inputMode="numeric"
            value={health}
            onChange={(event) => setHealthEdited(event.target.value)}
          />
        </p>
      </fieldset>
      <p>
        <button className="button" type="submit">
          {strings.start}
        </button>
      </p>
    </form>
  );
}
