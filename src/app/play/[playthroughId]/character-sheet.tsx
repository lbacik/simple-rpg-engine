// The Character sheet (docs/spec/ui.md, Character sheet): a header with a
// large Health medal, the Attributes with pips, Health with a segment bar,
// and the equipped mini list.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly with react-dom/server.

import type { Scenario } from '../../../content/model';
import { effectiveAttributes } from '../../../engine/index';
import {
  equipmentBonusSources,
  EQUIPMENT_SLOTS,
  type EquipmentSlot,
} from '../../../engine/inventory';
import { MAX_HEALTH, type PlaythroughState } from '../../../engine/state';

export const ATTRIBUTE_LABELS = {
  might: 'Might',
  agility: 'Agility',
  wits: 'Wits',
  presence: 'Presence',
} as const;

export type AttributeName = keyof typeof ATTRIBUTE_LABELS;

export function itemName(scenario: Scenario, itemId: string): string {
  return scenario.itemsById[itemId]?.name ?? itemId;
}

/** Health as a clamped 0–100 percentage for the medal ring. */
export function healthPercent(health: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((health / max) * 100)));
}

export function initial(name: string): string {
  const first = name.trim().charAt(0);
  return first === '' ? '?' : first.toUpperCase();
}

/** Health is low at the same threshold as the status card's red ring. */
export function isLowHealth(health: number, max: number = MAX_HEALTH): boolean {
  return healthPercent(health, max) <= 34;
}

function SlotIcon({ slot }: { slot: EquipmentSlot }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="sheet-slot-icon"
    >
      {slot === 'weapon' ? (
        <>
          <path d="M20 4 9.5 14.5" />
          <path d="M20 4h-4M20 4v4" />
          <path d="M6.5 11.5l6 6" />
          <path d="M8.5 15.5 4 20" />
        </>
      ) : slot === 'outfit' ? (
        <path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3q-4 3-8 0Z" />
      ) : (
        <>
          <path d="M7 3q5 7 10 0" />
          <circle cx="12" cy="15" r="5" />
          <path d="M12 12l2 3-2 3-2-3Z" />
        </>
      )}
    </svg>
  );
}

const SLOT_LABELS = {
  weapon: 'Weapon',
  outfit: 'Outfit',
  talisman: 'Talisman',
} as const;

/**
 * One Attribute row: five pips (filled ● base first, then ◆ gold equipment
 * bonus, so the filled pips equal the effective value), the effective value
 * as a large number, and the bonus source line when Equipment contributes.
 * The pips are decorative; the value and explanation are plain text.
 */
function AttributeRow({
  label,
  base,
  effective,
  counted,
  ignored,
}: {
  label: string;
  base: number;
  effective: number;
  /** Bonus sources that add to the total (at most two: the bonus cap). */
  counted: string[];
  /** Bonus sources beyond the +2 cap, adding nothing. */
  ignored: string[];
}) {
  return (
    <li className="sheet-attr">
      <span className="sheet-attr-name">{label}</span>
      <span className="pips" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            className={index < base ? 'pip base' : index < effective ? 'pip bonus' : 'pip'}
          />
        ))}
      </span>
      <span className="sheet-attr-total">{effective}</span>
      {counted.length > 0 || ignored.length > 0 ? (
        <span className="sheet-attr-src">
          base {base}
          {counted.map((name) => (
            <span key={name}> · +1 {name}</span>
          ))}
          {ignored.map((name) => (
            <span key={name}>
              {' · '}
              <s title="bonus capped at +2">+1 {name}</s>
            </span>
          ))}
          {ignored.length > 0 ? ' · bonus capped at +2' : null}
        </span>
      ) : null}
    </li>
  );
}

/**
 * The Character sheet. Best effort when content is gone: unknown Templates,
 * Locations and items read as their ids or as empty.
 */
export function CharacterSheet({
  scenario,
  state,
  locationName,
}: {
  scenario: Scenario;
  state: PlaythroughState;
  /** The current Location's name, resolved by the caller from the game view. */
  locationName: string;
}) {
  const template = scenario.templatesById[state.character.templateId];
  const effective = effectiveAttributes(scenario, state);
  const sources = equipmentBonusSources(scenario, state);
  const percent = healthPercent(state.character.health, MAX_HEALTH);
  const low = isLowHealth(state.character.health, MAX_HEALTH);
  return (
    <section aria-label="Character" className="sheet">
      <header className="sheet-hero">
        <span
          className={low ? 'status-medal sheet-medal low' : 'status-medal sheet-medal'}
          style={{ '--status-health': `${percent}%` } as React.CSSProperties}
          aria-hidden="true"
        >
          <span className="status-face">{initial(state.character.name)}</span>
        </span>
        <div className="sheet-hero-text">
          <h2 className="sheet-name">{state.character.name}</h2>
          <p className="meta">
            {template ? template.name : state.character.templateId} · {locationName}
          </p>
          {template?.description ? <p className="sheet-lede">{template.description}</p> : null}
        </div>
      </header>
      <div className="sheet-cols">
        <section aria-label="Attributes">
          <h3>Attributes</h3>
          <ul className="sheet-attrs">
            {(Object.keys(ATTRIBUTE_LABELS) as AttributeName[]).map((name) => {
              const ids = sources[name];
              return (
                <AttributeRow
                  key={name}
                  label={ATTRIBUTE_LABELS[name]}
                  base={state.character.baseAttributes[name]}
                  effective={effective[name]}
                  counted={ids.slice(0, 2).map((id) => itemName(scenario, id))}
                  ignored={ids.slice(2).map((id) => itemName(scenario, id))}
                />
              );
            })}
          </ul>
          <p className="meta sheet-legend">● base ◆ equipment bonus (max +2)</p>
        </section>
        <div>
          <section aria-label="Health">
            <h3>Health</h3>
            <p className="sheet-health">
              {state.character.health}
              <span className="meta"> / {MAX_HEALTH}</span>
            </p>
            <span
              className={low ? 'health-segments low' : 'health-segments'}
              role="img"
              aria-label={`Health ${state.character.health} of ${MAX_HEALTH}`}
            >
              {Array.from({ length: MAX_HEALTH }, (_, index) => (
                <span key={index} className={index < state.character.health ? 'on' : ''} />
              ))}
            </span>
          </section>
          <section aria-label="Equipped">
            <h3>Equipped</h3>
            <ul className="sheet-slots">
              {EQUIPMENT_SLOTS.map((slot) => {
                const equippedId = state.equipment[slot];
                const equippedName =
                  equippedId !== undefined ? scenario.itemsById[equippedId]?.name : undefined;
                return (
                  <li key={slot} className={equippedName === undefined ? 'empty' : ''}>
                    <SlotIcon slot={slot} />
                    <span className="meta">{SLOT_LABELS[slot]}</span>
                    <span>{equippedName ?? '—'}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </section>
  );
}
