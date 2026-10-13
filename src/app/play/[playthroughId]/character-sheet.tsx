// The Character sheet (docs/spec/ui.md, Character sheet): a header with a
// large Health medal, the Attributes with pips, Health with a segment bar,
// and the equipped mini list.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly with react-dom/server.

import type { AttributeName, Scenario } from '../../../content/model';
import { effectiveAttributes } from '../../../engine/index';
import {
  equipmentBonusSources,
  EQUIPMENT_SLOTS,
  type EquipmentSlot,
} from '../../../engine/inventory';
import { MAX_HEALTH, type PlaythroughState } from '../../../engine/state';
import { en, type Catalogue } from '../../../i18n/en';
import { formatNumber } from '../../../i18n/format';
import type { InterfaceLanguage } from '../../../i18n/languages';

/** Attribute rows render in this order, named by the catalogue. */
const ATTRIBUTE_ORDER: AttributeName[] = ['might', 'agility', 'wits', 'presence'];

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

/**
 * One Attribute row: five pips (filled ● base first, then ◆ gold equipment
 * bonus, so the filled pips equal the effective value), the effective value
 * as a large number, and the bonus source line when Equipment contributes.
 * The pips are decorative; the value and explanation are plain text.
 */
function AttributeRow({
  catalogue,
  language,
  label,
  base,
  effective,
  counted,
  ignored,
}: {
  catalogue: Catalogue;
  language: InterfaceLanguage;
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
      <span className="sheet-attr-total">{formatNumber(language, effective)}</span>
      {counted.length > 0 || ignored.length > 0 ? (
        <span className="sheet-attr-src">
          {catalogue.character.bonusBase(base)}
          {counted.map((name) => (
            <span key={name}> · {catalogue.character.bonusPoint(name)}</span>
          ))}
          {ignored.map((name) => (
            <span key={name}>
              {' · '}
              <s title={catalogue.character.bonusCapped}>
                {catalogue.character.bonusPoint(name)}
              </s>
            </span>
          ))}
          {ignored.length > 0 ? ` · ${catalogue.character.bonusCapped}` : null}
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
  catalogue = en,
  language = 'en',
}: {
  scenario: Scenario;
  state: PlaythroughState;
  /** The current Location's name, resolved by the caller from the game view. */
  locationName: string;
  /** Interface Text: the game screen passes the current catalogue. */
  catalogue?: Catalogue;
  language?: InterfaceLanguage;
}) {
  const template = scenario.templatesById[state.character.templateId];
  const effective = effectiveAttributes(scenario, state);
  const sources = equipmentBonusSources(scenario, state);
  const percent = healthPercent(state.character.health, MAX_HEALTH);
  const low = isLowHealth(state.character.health, MAX_HEALTH);
  return (
    <section aria-label={catalogue.character.title} className="sheet">
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
            {template ? (
              <span lang={scenario.language}>{template.name}</span>
            ) : (
              state.character.templateId
            )}{' '}
            · <span lang={scenario.language}>{locationName}</span>
          </p>
          {template?.description ? (
            <p className="sheet-lede" lang={scenario.language}>
              {template.description}
            </p>
          ) : null}
        </div>
      </header>
      <div className="sheet-cols">
        <section aria-label={catalogue.character.attributes}>
          <h3>{catalogue.character.attributes}</h3>
          <ul className="sheet-attrs">
            {ATTRIBUTE_ORDER.map((name) => {
              const ids = sources[name];
              return (
                <AttributeRow
                  key={name}
                  catalogue={catalogue}
                  language={language}
                  label={catalogue.attributes[name]}
                  base={state.character.baseAttributes[name]}
                  effective={effective[name]}
                  counted={ids.slice(0, 2).map((id) => itemName(scenario, id))}
                  ignored={ids.slice(2).map((id) => itemName(scenario, id))}
                />
              );
            })}
          </ul>
          <p className="meta sheet-legend">{catalogue.character.legend}</p>
        </section>
        <div>
          <section aria-label={catalogue.character.health}>
            <h3>{catalogue.character.health}</h3>
            <p className="sheet-health">
              {formatNumber(language, state.character.health)}
              <span className="meta"> / {formatNumber(language, MAX_HEALTH)}</span>
            </p>
            <span
              className={low ? 'health-segments low' : 'health-segments'}
              role="img"
              aria-label={catalogue.character.label(state.character.health, MAX_HEALTH)}
            >
              {Array.from({ length: MAX_HEALTH }, (_, index) => (
                <span key={index} className={index < state.character.health ? 'on' : ''} />
              ))}
            </span>
          </section>
          <section aria-label={catalogue.character.equipped}>
            <h3>{catalogue.character.equipped}</h3>
            <ul className="sheet-slots">
              {EQUIPMENT_SLOTS.map((slot) => {
                const equippedId = state.equipment[slot];
                const equippedName =
                  equippedId !== undefined ? scenario.itemsById[equippedId]?.name : undefined;
                return (
                  <li key={slot} className={equippedName === undefined ? 'empty' : ''}>
                    <SlotIcon slot={slot} />
                    <span className="meta">{catalogue.slots[slot]}</span>
                    {equippedName === undefined ? (
                      <span>—</span>
                    ) : (
                      <span lang={scenario.language}>{equippedName}</span>
                    )}
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
