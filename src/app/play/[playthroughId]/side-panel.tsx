// The game-screen side panel (docs/spec/ui.md, Character and inventory
// panel): the Location map, a status card (medal with a Health ring, name,
// Template, segmented Health bar) and the Character / Inventory / Journal
// launchers. The Character sheet and the inventory open in modals over the
// game screen; on phones a fourth Map launcher opens the map in a modal.
//
// The open modal is part of the URL (`?panel=`): the server renders it open
// from the URL, so the launchers are plain links and the panel works without
// JavaScript. The modal content is today's Character and Inventory content,
// unchanged.

import Link from 'next/link';
import type { CompiledItem, Scenario } from '@/content/model';
import { effectiveAttributes, type GameView } from '@/engine/index';
import { equipmentBonusSources, EQUIPMENT_SLOTS } from '@/engine/inventory';
import { MAX_HEALTH, type PlaythroughState } from '@/engine/state';
import { equipAction, unequipAction, useItemAction } from '@/app/lib/inventory';
import { playHref, type PanelId } from '@/app/lib/panel';
import { LocationMap } from './map';
import { PanelModal } from './panel-modal';

const ATTRIBUTE_LABELS = {
  might: 'Might',
  agility: 'Agility',
  wits: 'Wits',
  presence: 'Presence',
} as const;

type AttributeName = keyof typeof ATTRIBUTE_LABELS;

function itemName(scenario: Scenario, itemId: string): string {
  return scenario.itemsById[itemId]?.name ?? itemId;
}

/** Health as a clamped 0–100 percentage for the medal ring. */
function healthPercent(health: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((health / max) * 100)));
}

function initial(name: string): string {
  const first = name.trim().charAt(0);
  return first === '' ? '?' : first.toUpperCase();
}

function LauncherIcon({ name }: { name: 'character' | 'inventory' | 'journal' | 'map' }) {
  const paths =
    name === 'character' ? (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21q0-7 8-7t8 7" />
      </>
    ) : name === 'inventory' ? (
      <path d="M5 9h14l-1 12H6ZM9 9V7q0-3.5 3-3.5T15 7v2" />
    ) : name === 'journal' ? (
      <path d="M4 4.5q4-1 8 1.5 4-2.5 8-1.5V19q-4-1-8 1-4-2-8-1ZM12 6v14" />
    ) : (
      <>
        <path d="M12 21q-7-6.5-7-11a7 7 0 0 1 14 0q0 4.5-7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    );
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="launcher-icon"
    >
      {paths}
    </svg>
  );
}

/**
 * The status card: a medal with the Character's initial inside a ring that
 * fills with the Health fraction (as in the Combat arena; red when Health is
 * low), the Character's name, the Template, and a segmented Health bar.
 */
function StatusCard({
  scenario,
  state,
}: {
  scenario: Scenario;
  state: PlaythroughState;
}) {
  const template = scenario.templatesById[state.character.templateId];
  const percent = healthPercent(state.character.health, MAX_HEALTH);
  const low = percent <= 34;
  return (
    <section aria-label="Character status" className="status-card">
      <span
        className={low ? 'status-medal low' : 'status-medal'}
        style={{ '--status-health': `${percent}%` } as React.CSSProperties}
        title={`Health ${state.character.health}/${MAX_HEALTH}`}
        aria-hidden="true"
      >
        <span className="status-face">{initial(state.character.name)}</span>
      </span>
      <div className="status-text">
        <p className="status-name">
          <strong>{state.character.name}</strong>
        </p>
        {template ? <p className="meta status-template">{template.name}</p> : null}
        <span
          className={low ? 'health-segments low' : 'health-segments'}
          role="img"
          aria-label={`Health ${state.character.health} of ${MAX_HEALTH}`}
        >
          {Array.from({ length: MAX_HEALTH }, (_, index) => (
            <span key={index} className={index < state.character.health ? 'on' : ''} />
          ))}
        </span>
      </div>
    </section>
  );
}

function AttributeLine({
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
  if (counted.length === 0 && ignored.length === 0) {
    return (
      <li>
        {label} {effective}
      </li>
    );
  }
  return (
    <li>
      {label} {effective} ({[String(base), ...counted.map((name) => `1 ${name}`)].join(' + ')}
      {ignored.length > 0
        ? `; ${ignored.map((name) => `1 ${name}`).join(' + ')} ignored: bonus capped at +2`
        : ''}
      )
    </li>
  );
}

export function CharacterSheet({
  scenario,
  state,
}: {
  scenario: Scenario;
  state: PlaythroughState;
}) {
  const template = scenario.templatesById[state.character.templateId];
  const effective = effectiveAttributes(scenario, state);
  const sources = equipmentBonusSources(scenario, state);
  return (
    <section aria-label="Character">
      <h2>Character</h2>
      <p>
        <strong>{state.character.name}</strong>
        {template ? ` · ${template.name}` : null}
      </p>
      <p>
        Health {state.character.health}/{MAX_HEALTH}
      </p>
      <ul>
        {(Object.keys(ATTRIBUTE_LABELS) as AttributeName[]).map((name) => {
          const ids = sources[name];
          return (
            <AttributeLine
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
    </section>
  );
}

function itemDetails(item: CompiledItem): string[] {
  if (item.kind === 'equipment') {
    const details = [`Equipment · ${item.slot}`];
    if (item.bonus !== undefined) {
      details.push(`+1 ${ATTRIBUTE_LABELS[item.bonus]}`);
    }
    if (item.slot === 'weapon') {
      if (item.damage !== undefined) {
        details.push(`Damage ${item.damage} · Reach ${item.reach}`);
      } else {
        details.push(`Reach ${item.reach}`);
      }
    }
    return details;
  }
  if (item.kind === 'consumable') {
    return [`Consumable · restores ${item.heal} Health`];
  }
  return ['Key item'];
}

/**
 * The game-page query the inventory forms carry along: the Continue
 * acknowledgement (`?seen=`) and the "?" map setting, so the redirect after
 * the turn lands back on the same view instead of bouncing to the result
 * panel or losing the map setting. The Inventory modal stays open because
 * the inventory actions redirect back with `?panel=inventory`.
 */
function PreservedQueryInputs({
  seen,
  showUnknownExits,
}: {
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  return (
    <>
      <input type="hidden" name="panel" value="inventory" />
      {seen !== undefined ? <input type="hidden" name="seen" value={seen} /> : null}
      {showUnknownExits ? <input type="hidden" name="unknown" value="1" /> : null}
    </>
  );
}

export function InventorySheet({
  scenario,
  state,
  playthroughId,
  step,
  forceReadOnly,
  seen,
  showUnknownExits,
}: {
  scenario: Scenario;
  state: PlaythroughState;
  playthroughId: string;
  step: number;
  /** Set for incompatible Playthroughs: no actions, whatever the status. */
  forceReadOnly?: boolean;
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  const readOnly = forceReadOnly === true || state.status !== 'active';
  const inCombat = state.activeCombat != null;
  // Best effort: anything whose id is gone from the content is left out.
  const heldItems = Object.entries(state.inventory).filter(
    ([itemId]) => scenario.itemsById[itemId] !== undefined,
  );
  return (
    <section aria-label="Inventory">
      <h2>Inventory</h2>
      {inCombat ? <p className="meta">Inventory actions are unavailable during Combat.</p> : null}
      {EQUIPMENT_SLOTS.map((slot) => {
        const equippedId = state.equipment[slot];
        // Best effort: an equipped id that is gone from the content reads as empty.
        if (equippedId === undefined || scenario.itemsById[equippedId] === undefined) {
          return (
            <p key={slot}>
              The {slot} slot is empty.{' '}
              {readOnly ? null : (
                <>
                  <button className="button secondary" type="button" disabled>
                    Unequip
                  </button>{' '}
                  <span className="reason">Slot is empty.</span>
                </>
              )}
            </p>
          );
        }
        const disabled = readOnly || inCombat;
        return (
          <p key={slot}>
            {itemName(scenario, equippedId)} is equipped in the {slot} slot.{' '}
            {readOnly ? null : (
              <form action={unequipAction} className="inline">
                <input type="hidden" name="playthroughId" value={playthroughId} />
                <input type="hidden" name="expectedStep" value={step} />
                <input type="hidden" name="slot" value={slot} />
                <PreservedQueryInputs seen={seen} showUnknownExits={showUnknownExits} />
                <button className="button secondary" type="submit" disabled={disabled}>
                  Unequip
                </button>{' '}
                {disabled && !readOnly ? (
                  <span className="reason">Cannot change equipment during Combat.</span>
                ) : null}
              </form>
            )}
          </p>
        );
      })}
      {heldItems.length === 0 ? (
        <p>Empty.</p>
      ) : (
        <ul className="items">
          {heldItems.map(([itemId, quantity]) => {
            const item = scenario.itemsById[itemId];
            if (item === undefined) {
              return (
                <li key={itemId}>
                  {itemId} × {quantity}
                </li>
              );
            }
            const equippedSlot =
              item.kind === 'equipment' && state.equipment[item.slot] === itemId
                ? item.slot
                : undefined;
            return (
              <li key={itemId} className="item">
                <p>
                  <strong>{item.name}</strong> × {quantity}{' '}
                  {item.magic ? (
                    <span className="magic" title="Magic item">
                      ✨ magic
                    </span>
                  ) : null}{' '}
                  {equippedSlot !== undefined ? (
                    <span className="meta">(equipped in {equippedSlot})</span>
                  ) : null}
                </p>
                {item.description ? <p className="meta">{item.description}</p> : null}
                <p className="meta">{itemDetails(item).join(' · ')}</p>
                {readOnly ? null : (
                  <ItemActions
                    item={item}
                    itemId={itemId}
                    equipped={equippedSlot !== undefined}
                    fullHealth={state.character.health >= MAX_HEALTH}
                    inCombat={inCombat}
                    playthroughId={playthroughId}
                    step={step}
                    seen={seen}
                    showUnknownExits={showUnknownExits}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ItemActions({
  item,
  itemId,
  equipped,
  fullHealth,
  inCombat,
  playthroughId,
  step,
  seen,
  showUnknownExits,
}: {
  item: CompiledItem;
  itemId: string;
  equipped: boolean;
  fullHealth: boolean;
  inCombat: boolean;
  playthroughId: string;
  step: number;
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  if (item.kind === 'equipment') {
    if (inCombat) {
      return (
        <p>
          <button className="button secondary" type="button" disabled>
            Equip
          </button>{' '}
          <span className="reason">Cannot change equipment during Combat.</span>
        </p>
      );
    }
    if (equipped) {
      return (
        <p>
          <button className="button secondary" type="button" disabled>
            Equip
          </button>{' '}
          <span className="reason">Already equipped.</span>
        </p>
      );
    }
    return (
      <form action={equipAction} className="inline">
        <input type="hidden" name="playthroughId" value={playthroughId} />
        <input type="hidden" name="expectedStep" value={step} />
        <input type="hidden" name="itemId" value={itemId} />
        <PreservedQueryInputs seen={seen} showUnknownExits={showUnknownExits} />
        <p>
          <button className="button secondary" type="submit">
            Equip
          </button>
        </p>
      </form>
    );
  }
  if (item.kind === 'consumable') {
    if (inCombat) {
      return (
        <p>
          <button className="button secondary" type="button" disabled>
            Use
          </button>{' '}
          <span className="reason">Cannot use items here during Combat.</span>
        </p>
      );
    }
    if (fullHealth) {
      return (
        <p>
          <button className="button secondary" type="button" disabled>
            Use
          </button>{' '}
          <span className="reason">Already at full Health.</span>
        </p>
      );
    }
    return (
      <form action={useItemAction} className="inline">
        <input type="hidden" name="playthroughId" value={playthroughId} />
        <input type="hidden" name="expectedStep" value={step} />
        <input type="hidden" name="itemId" value={itemId} />
        <PreservedQueryInputs seen={seen} showUnknownExits={showUnknownExits} />
        <p>
          <button className="button secondary" type="submit">
            Use
          </button>
        </p>
      </form>
    );
  }
  return null;
}

function ModalShell({
  title,
  closeHref,
  noticeText,
  children,
}: {
  title: string;
  closeHref: string;
  noticeText: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="panel-modal-head">
        <h2 className="panel-modal-title">{title}</h2>
        <Link
          href={closeHref}
          data-modal-close
          aria-label={`Close ${title}`}
          className="panel-modal-close"
        >
          <span aria-hidden="true">×</span>
        </Link>
      </div>
      {noticeText ? (
        <p className="notice" role="status">
          {noticeText}
        </p>
      ) : null}
      {children}
    </>
  );
}

/**
 * The Character and inventory side panel, shared by the compatible and
 * incompatible game screens. Incompatible Playthroughs render it without any
 * actions (`forceReadOnly`) and without map travel (`canTravel` false).
 * Ended and incompatible Playthroughs get the same panel and modals, without
 * item actions, as during play.
 */
export function SidePanel({
  scenario,
  state,
  playthroughId,
  step,
  panel,
  notice,
  noticeText,
  gameView,
  showUnknownExits,
  toggleHref,
  canTravel,
  forceReadOnly,
  journalTotal,
  seen,
}: {
  scenario: Scenario;
  state: PlaythroughState;
  playthroughId: string;
  step: number;
  /** The modal open from the URL, if any. */
  panel: PanelId | null;
  notice: string | undefined;
  /** The transient rejection notice text, repeated inside an open modal. */
  noticeText: string | undefined;
  gameView: GameView;
  showUnknownExits: boolean;
  toggleHref: string;
  canTravel: boolean;
  forceReadOnly?: boolean;
  /** Total Journal entries, for the Journal launcher sublabel. */
  journalTotal: number;
  seen?: number;
}) {
  const closeHref = playHref(playthroughId, null, notice, seen, showUnknownExits);
  const characterHref = playHref(playthroughId, 'character', notice, seen, showUnknownExits);
  const inventoryHref = playHref(playthroughId, 'inventory', notice, seen, showUnknownExits);
  const mapHref = playHref(playthroughId, 'map', notice, seen, showUnknownExits);
  // Best effort: anything whose id is gone from the content is left out.
  const itemCount = Object.entries(state.inventory).reduce(
    (total, [itemId, quantity]) =>
      scenario.itemsById[itemId] === undefined ? total : total + quantity,
    0,
  );
  // The label and sublabel are separate inline spans, so the accessible name
  // is set explicitly instead of relying on their concatenation.
  const characterName = `Character, Health ${state.character.health}/${MAX_HEALTH}`;
  const inventoryName = `Inventory, ${itemCount === 1 ? '1 item' : `${itemCount} items`}`;
  const journalName = `Journal, ${journalTotal === 1 ? '1 entry' : `${journalTotal} entries`}`;
  return (
    <aside className="side" aria-label="Character and inventory">
      <div className="map-inline">
        <LocationMap
          map={gameView.map}
          playthroughId={playthroughId}
          step={step}
          canTravel={canTravel}
          showUnknownExits={showUnknownExits}
          toggleHref={toggleHref}
          markerId="map-arrow-desktop"
        />
      </div>
      <StatusCard scenario={scenario} state={state} />
      <nav aria-label="Character and inventory" className="launchers">
        <Link
          id="launcher-character"
          className="launcher"
          href={characterHref}
          aria-label={characterName}
        >
          <LauncherIcon name="character" />
          <span className="launcher-label">Character</span>
          <span className="launcher-sub">
            Health {state.character.health}/{MAX_HEALTH}
          </span>
        </Link>
        <Link
          id="launcher-inventory"
          className="launcher"
          href={inventoryHref}
          aria-label={inventoryName}
        >
          <LauncherIcon name="inventory" />
          <span className="launcher-label">Inventory</span>
          <span className="launcher-sub">
            {itemCount === 1 ? '1 item' : `${itemCount} items`}
          </span>
        </Link>
        <Link
          id="launcher-journal"
          className="launcher"
          href={`/play/${playthroughId}/journal`}
          aria-label={journalName}
        >
          <LauncherIcon name="journal" />
          <span className="launcher-label">Journal</span>
          <span className="launcher-sub">
            {journalTotal === 1 ? '1 entry' : `${journalTotal} entries`}
          </span>
        </Link>
        <Link id="launcher-map" className="launcher map-only" href={mapHref} aria-label="Map">
          <LauncherIcon name="map" />
          <span className="launcher-label">Map</span>
          <span className="launcher-sub">Travel</span>
        </Link>
      </nav>
      {panel === 'character' ? (
        <PanelModal label="Character" closeHref={closeHref} launcherId="launcher-character">
          <ModalShell title="Character" closeHref={closeHref} noticeText={noticeText}>
            <CharacterSheet scenario={scenario} state={state} />
          </ModalShell>
        </PanelModal>
      ) : null}
      {panel === 'inventory' ? (
        <PanelModal label="Inventory" closeHref={closeHref} launcherId="launcher-inventory">
          <ModalShell title="Inventory" closeHref={closeHref} noticeText={noticeText}>
            <InventorySheet
              scenario={scenario}
              state={state}
              playthroughId={playthroughId}
              step={step}
              forceReadOnly={forceReadOnly}
              seen={seen}
              showUnknownExits={showUnknownExits}
            />
          </ModalShell>
        </PanelModal>
      ) : null}
      {panel === 'map' ? (
        <PanelModal label="Location map" closeHref={closeHref} launcherId="launcher-map">
          <ModalShell title="Map" closeHref={closeHref} noticeText={noticeText}>
            <LocationMap
              map={gameView.map}
              playthroughId={playthroughId}
              step={step}
              canTravel={canTravel}
              showUnknownExits={showUnknownExits}
              toggleHref={toggleHref}
              markerId="map-arrow-modal"
            />
          </ModalShell>
        </PanelModal>
      ) : null}
    </aside>
  );
}
