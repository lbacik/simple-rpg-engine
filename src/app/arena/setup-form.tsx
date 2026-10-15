// The Arena setup form (issues #168-#169): the Bestiary picker, the
// Character Attribute and Health controls with the Template preset selector,
// and the Equipment controls (weapon, outfit, talisman, Consumables). A Client
// Component, so the preset choice fills the Attribute and Health controls
// without a round trip — but the form still posts plain fields to the Start
// Server Action, which re-validates every value, so the fight never trusts
// the browser. Every word arrives as rendered strings in props; no catalogue
// is imported here.

'use client';

import { useState } from 'react';
import { startArenaAction } from './actions';
import type { ArenaPreset } from './presets';

export type ArenaSetupEnemyOption = {
  id: string;
  name: string;
  description: string;
  meta: string;
  range: 'near' | 'far';
};

export type ArenaSetupEquipmentOption = {
  id: string;
  name: string;
  description: string;
  meta: string;
};

export type ArenaSetupStrings = {
  bestiaryLegend: string;
  opponentOne: string;
  opponentTwo: string;
  noSecondOpponent: string;
  startingRange: string;
  rangeLabels: { near: string; far: string };
  characterLegend: string;
  presetLabel: string;
  presetCustom: string;
  presetHelp: string;
  attributesHelp: string;
  healthLabel: string;
  equipmentLegend: string;
  weaponLabel: string;
  outfitLabel: string;
  talismanLabel: string;
  consumablesLabel: string;
  consumablesHelp: string;
  start: string;
  attributeLabels: { might: string; agility: string; wits: string; presence: string };
};

export default function ArenaSetupForm({
  enemies,
  presets,
  defaults,
  weapons,
  outfits,
  talismans,
  consumablesMax,
  strings,
}: {
  enemies: ArenaSetupEnemyOption[];
  presets: ArenaPreset[];
  defaults: {
    attributes: ArenaPreset['attributes'];
    health: number;
    weapon: string;
    outfit: string;
    talisman: string;
    consumables: number;
  };
  weapons: ArenaSetupEquipmentOption[];
  outfits: ArenaSetupEquipmentOption[];
  talismans: ArenaSetupEquipmentOption[];
  consumablesMax: number;
  strings: ArenaSetupStrings;
}) {
  const [presetId, setPresetId] = useState('');
  const [might, setMight] = useState(String(defaults.attributes.might));
  const [agility, setAgility] = useState(String(defaults.attributes.agility));
  const [wits, setWits] = useState(String(defaults.attributes.wits));
  const [presence, setPresence] = useState(String(defaults.attributes.presence));
  const [health, setHealth] = useState(String(defaults.health));
  // The Equipment selects stand outside the preset: a preset fills the
  // Attributes and Health above, while the weapon, outfit, talisman and
  // Consumables stay exactly as chosen.
  const [weapon, setWeapon] = useState(defaults.weapon);
  const [outfit, setOutfit] = useState(defaults.outfit);
  const [talisman, setTalisman] = useState(defaults.talisman);
  const [consumables, setConsumables] = useState(String(defaults.consumables));

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
      {[1, 2].map((slot) => (
        <fieldset key={slot}>
          <legend>{slot === 1 ? strings.opponentOne : strings.opponentTwo}</legend>
          <p>
            <label htmlFor={`arena-enemy${slot}`}>{strings.bestiaryLegend}</label>{' '}
            <select
              id={`arena-enemy${slot}`}
              name={`enemy${slot}`}
              defaultValue={slot === 1 ? enemies[0]?.id : ''}
            >
              {slot === 2 ? <option value="">{strings.noSecondOpponent}</option> : null}
              {enemies.map((enemy) => (
                <option key={enemy.id} value={enemy.id}>
                  {enemy.name}
                </option>
              ))}
            </select>
          </p>
          <p>
            <span id={`arena-range${slot}-label`}>{strings.startingRange}</span>{' '}
            <span role="group" aria-labelledby={`arena-range${slot}-label`}>
              {(['near', 'far'] as const).map((range) => (
                <label key={range}>
                  <input
                    type="radio"
                    name={`range${slot}`}
                    value={range}
                    defaultChecked={range === (slot === 1 ? (enemies[0]?.range ?? 'near') : 'far')}
                  />{' '}
                  {strings.rangeLabels[range]}{' '}
                </label>
              ))}
            </span>
          </p>
        </fieldset>
      ))}
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
      <fieldset>
        <legend>{strings.equipmentLegend}</legend>
        <p>
          <label htmlFor="arena-weapon">{strings.weaponLabel}</label>{' '}
          <select id="arena-weapon" name="weapon" value={weapon} onChange={(event) => setWeapon(event.target.value)}>
            {weapons.map((option) => (
              <option key={option.id} value={option.id} title={option.description}>
                {option.name} — {option.meta}
              </option>
            ))}
          </select>
        </p>
        <p>
          <label htmlFor="arena-outfit">{strings.outfitLabel}</label>{' '}
          <select id="arena-outfit" name="outfit" value={outfit} onChange={(event) => setOutfit(event.target.value)}>
            {outfits.map((option) => (
              <option key={option.id} value={option.id} title={option.description}>
                {option.meta === '' ? option.name : `${option.name} — ${option.meta}`}
              </option>
            ))}
          </select>
        </p>
        <p>
          <label htmlFor="arena-talisman">{strings.talismanLabel}</label>{' '}
          <select
            id="arena-talisman"
            name="talisman"
            value={talisman}
            onChange={(event) => setTalisman(event.target.value)}
          >
            {talismans.map((option) => (
              <option key={option.id} value={option.id} title={option.description}>
                {option.meta === '' ? option.name : `${option.name} — ${option.meta}`}
              </option>
            ))}
          </select>
        </p>
        <p>
          <label htmlFor="arena-consumables">{strings.consumablesLabel}</label>{' '}
          <input
            id="arena-consumables"
            name="consumables"
            type="number"
            min={0}
            max={consumablesMax}
            step={1}
            required
            inputMode="numeric"
            value={consumables}
            onChange={(event) => setConsumables(event.target.value)}
          />
        </p>
        <p className="meta">{strings.consumablesHelp}</p>
      </fieldset>
      <p>
        <button className="button" type="submit">
          {strings.start}
        </button>
      </p>
    </form>
  );
}
