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
import type { Scenario } from '@/content/model';
import type { GameView } from '@/engine/index';
import { EQUIPMENT_SLOTS } from '@/engine/inventory';
import { MAX_HEALTH, type PlaythroughState } from '@/engine/state';
import { playHref, type PanelId } from '@/app/lib/panel';
import {
  ATTRIBUTE_LABELS,
  CharacterSheet,
  healthPercent,
  initial,
  isLowHealth,
} from './character-sheet';
import { LocationMap } from './map';
import { PanelModal } from './panel-modal';
import {
  InventoryBrowser,
  type InventorySlotData,
  type InventoryTileData,
} from './inventory-browser';

function itemName(scenario: Scenario, itemId: string): string {
  return scenario.itemsById[itemId]?.name ?? itemId;
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
  const low = isLowHealth(state.character.health, MAX_HEALTH);
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

const SLOT_LABELS = {
  weapon: 'Weapon',
  outfit: 'Outfit',
  talisman: 'Talisman',
} as const;

/** Stat lines for a filled slot: the bonus, and Damage and Reach for weapons. */
function slotStats(itemId: string, scenario: Scenario): { name: string; magic: boolean; stats: string[] } {
  const item = scenario.itemsById[itemId];
  if (item === undefined || item.kind !== 'equipment') {
    return { name: itemName(scenario, itemId), magic: false, stats: [] };
  }
  const stats: string[] = [];
  if (item.bonus !== undefined) {
    stats.push(`+1 ${ATTRIBUTE_LABELS[item.bonus]}`);
  }
  if (item.slot === 'weapon') {
    stats.push(
      item.damage !== undefined ? `Damage ${item.damage} · Reach ${item.reach}` : `Reach ${item.reach}`,
    );
  }
  return { name: item.name, magic: item.magic, stats };
}

/** Chips for the detail pane: kind/slot, bonus, Damage and Reach or healing. */
function tileChips(itemId: string, scenario: Scenario): { chips: InventoryTileData['chips']; bonusLabel: string | undefined } {
  const item = scenario.itemsById[itemId];
  if (item === undefined || item.kind !== 'equipment') {
    if (item?.kind === 'consumable') {
      return { chips: [`Consumable · restores ${item.heal} Health`], bonusLabel: undefined };
    }
    return { chips: ['Key item'], bonusLabel: undefined };
  }
  const chips = [`Equipment · ${item.slot}`];
  const bonusLabel = item.bonus !== undefined ? ATTRIBUTE_LABELS[item.bonus] : undefined;
  if (bonusLabel !== undefined) {
    chips.push(`+1 ${bonusLabel}`);
  }
  if (item.slot === 'weapon') {
    chips.push(
      item.damage !== undefined ? `Damage ${item.damage} · Reach ${item.reach}` : `Reach ${item.reach}`,
    );
  }
  return { chips, bonusLabel };
}

/**
 * The Inventory modal body, variant A (docs/spec/ui.md, Character and
 * inventory panel): a "paper doll" of the equipped slots beside a grid of
 * carried item tiles, with a detail pane for the selected tile. The server
 * builds the slot and tile data; the client `InventoryBrowser` owns the
 * selection.
 */
export function InventorySheet({
  scenario,
  state,
  playthroughId,
  step,
  forceReadOnly,
  seen,
  showUnknownExits,
  selectedItem,
}: {
  scenario: Scenario;
  state: PlaythroughState;
  playthroughId: string;
  step: number;
  /** Set for incompatible Playthroughs: no actions, whatever the status. */
  forceReadOnly?: boolean;
  seen: number | undefined;
  showUnknownExits: boolean;
  /** The `?item=` tile the detail pane selects; else the first carried item. */
  selectedItem: string | undefined;
}) {
  const readOnly = forceReadOnly === true || state.status !== 'active';
  const inCombat = state.activeCombat != null;
  const slots: InventorySlotData[] = EQUIPMENT_SLOTS.map((slot) => {
    const equippedId = state.equipment[slot];
    // Best effort: an equipped id that is gone from the content reads as empty.
    if (equippedId === undefined || scenario.itemsById[equippedId] === undefined) {
      return { slot, label: SLOT_LABELS[slot], item: undefined };
    }
    const { name, magic, stats } = slotStats(equippedId, scenario);
    return { slot, label: SLOT_LABELS[slot], item: { id: equippedId, name, magic, stats } };
  });
  // Best effort: anything whose id is gone from the content is left out.
  const items: InventoryTileData[] = Object.entries(state.inventory).flatMap(
    ([itemId, quantity]) => {
      const item = scenario.itemsById[itemId];
      if (item === undefined) return [];
      const { chips, bonusLabel } = tileChips(itemId, scenario);
      return [
        {
          id: itemId,
          name: item.name,
          quantity,
          kind: item.kind,
          slot: item.kind === 'equipment' ? item.slot : undefined,
          bonusLabel,
          damage: item.kind === 'equipment' ? item.damage : undefined,
          reach: item.kind === 'equipment' && item.slot === 'weapon' ? item.reach : undefined,
          heal: item.kind === 'consumable' ? item.heal : undefined,
          magic: item.magic,
          description: item.description,
          equippedSlot:
            item.kind === 'equipment' && state.equipment[item.slot] === itemId
              ? item.slot
              : undefined,
          chips,
        },
      ];
    },
  );
  // Only a carried tile can be selected; anything else falls back to the first.
  const initialSelectedId =
    selectedItem !== undefined && items.some((tile) => tile.id === selectedItem)
      ? selectedItem
      : undefined;
  return (
    <section aria-label="Inventory">
      <h2>Inventory</h2>
      {inCombat ? <p className="meta">Inventory actions are unavailable during Combat.</p> : null}
      <InventoryBrowser
        slots={slots}
        items={items}
        playthroughId={playthroughId}
        step={step}
        readOnly={readOnly}
        inCombat={inCombat}
        fullHealth={state.character.health >= MAX_HEALTH}
        initialSelectedId={initialSelectedId}
        seen={seen}
        showUnknownExits={showUnknownExits}
      />
    </section>
  );
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
  selectedItem,
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
  /** The `?item=` tile the inventory detail pane selects. */
  selectedItem?: string;
}) {
  const closeHref = playHref(playthroughId, null, notice, seen, showUnknownExits);
  const characterHref = playHref(playthroughId, 'character', notice, seen, showUnknownExits);
  const inventoryHref = playHref(
    playthroughId,
    'inventory',
    notice,
    seen,
    showUnknownExits,
    selectedItem,
  );
  const mapHref = playHref(playthroughId, 'map', notice, seen, showUnknownExits);
  // Best effort: anything whose id is gone from the content is left out.
  const itemCount = Object.entries(state.inventory).reduce(
    (total, [itemId, quantity]) =>
      scenario.itemsById[itemId] === undefined ? total : total + quantity,
    0,
  );
  // The Character sheet header names the current Location. Ended views
  // carry no Location, so fall back to the stored Location id; anything gone
  // from the content reads best effort.
  const locationName =
    gameView.kind === 'location'
      ? gameView.name
      : gameView.kind === 'scene' || gameView.kind === 'combat'
        ? gameView.locationName
        : (scenario.locationsById[state.currentLocationId]?.name ?? state.currentLocationId);
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
            <CharacterSheet scenario={scenario} state={state} locationName={locationName} />
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
              selectedItem={selectedItem}
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
