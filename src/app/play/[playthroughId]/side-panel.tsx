// The game-screen side panel (docs/spec/ui.md, Character and inventory
// panel): a status card (medal with a Health ring, name, Template, readable
// Health line, segmented Health bar, effective Attributes), the Character /
// Inventory / Journal / Map launchers, then the compact Location map with an
// Expand link. The Character sheet, the inventory, the Journal and the expanded
// map open in modals over the game screen; the compact map stays visible behind
// the map modal on desktop.
//
// The Character, inventory and map modals are part of the URL (`?panel=`): the
// server renders them open from the URL, so those launchers are plain links
// and the panel works without JavaScript. The Journal modal is client state
// over the same trigger link, so opening and closing it never reloads the game
// screen and keeps its state; without JavaScript the trigger navigates to the
// full Journal page.

import Link from 'next/link';
import { travelAction } from '@/app/lib/travel';
import type { Scenario } from '@/content/model';
import {
  effectiveAttributes,
  inventoryEquipReason,
  inventoryUseReason,
  type GameView,
} from '@/engine/index';
import { EQUIPMENT_SLOTS } from '@/engine/inventory';
import { MAX_HEALTH, type PlaythroughState } from '@/engine/state';
import { formatNumber, type Catalogue, type InterfaceLanguage } from '@/i18n/index';
import { playHref, type PanelId } from '@/app/lib/panel';
import { journalEntriesText, type RenderedJournalEntry } from '@/app/lib/journal';
import { CharacterSheet, healthPercent, initial, isLowHealth } from './character-sheet';
import { LocationMap } from './map';
import { PanelModal } from './panel-modal';
import { JournalModalLink } from './journal/journal-modal';
import {
  InventoryBrowser,
  type InventoryBrowserText,
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
 * The status card (variant A order: first in the side panel): a medallion with
 * the Character's initial inside a ring that fills with the Health fraction
 * (red when Health is low), the Character's name, the Template, a readable
 * Health line, the segmented Health bar, and the effective Attribute values.
 */
function StatusCard({
  scenario,
  state,
  catalogue,
  language,
}: {
  scenario: Scenario;
  state: PlaythroughState;
  catalogue: Catalogue;
  language: InterfaceLanguage;
}) {
  const template = scenario.templatesById[state.character.templateId];
  const percent = healthPercent(state.character.health, MAX_HEALTH);
  const low = isLowHealth(state.character.health, MAX_HEALTH);
  const effective = effectiveAttributes(scenario, state);
  const attributes = (
    [
      ['might', catalogue.attributes.might],
      ['agility', catalogue.attributes.agility],
      ['wits', catalogue.attributes.wits],
      ['presence', catalogue.attributes.presence],
    ] as const
  ).map(([id, label]) => ({ id, label, value: effective[id] }));
  return (
    <section aria-label={catalogue.character.status} className="status-card">
      <div className="status-top">
        <span
          className={low ? 'status-medal low' : 'status-medal'}
          style={{ '--status-health': `${percent}%` } as React.CSSProperties}
          title={catalogue.character.short(state.character.health, MAX_HEALTH)}
          aria-hidden="true"
        >
          <span className="status-face">{initial(state.character.name)}</span>
        </span>
        <div className="status-text">
          <p className="status-name">
            <strong>{state.character.name}</strong>
          </p>
          {template ? (
            <p className="meta status-template" lang={scenario.language}>
              {template.name}
            </p>
          ) : null}
        </div>
      </div>
      <p className="status-health">
        <span>{catalogue.character.health}</span>
        <strong>
          {formatNumber(language, state.character.health)}
          <span className="meta"> / {formatNumber(language, MAX_HEALTH)}</span>
        </strong>
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
      <dl className="status-attrs">
        {attributes.map((attr) => (
          <div key={attr.id} className="status-attr">
            <dt>{attr.label}</dt>
            <dd>{formatNumber(language, attr.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The facts the inventory modal shows for an item: the stat lines (bonus,
 * and Damage and Reach for weapons) double as the filled-slot stats and,
 * prefixed with the kind chip, as the detail-pane chips. Attribute, slot and
 * Reach names come from the catalogue, never as raw ids.
 */
function itemFacts(
  itemId: string,
  scenario: Scenario,
  catalogue: Catalogue,
): { name: string; magic: boolean; stats: string[]; chips: InventoryTileData['chips'] } {
  const item = scenario.itemsById[itemId];
  if (item === undefined || item.kind === 'key') {
    return {
      name: itemName(scenario, itemId),
      magic: item?.magic ?? false,
      stats: [],
      chips: [catalogue.inventory.keyChip],
    };
  }
  if (item.kind === 'consumable') {
    return {
      name: item.name,
      magic: item.magic,
      stats: [],
      chips: [catalogue.inventory.consumableChip(item.heal)],
    };
  }
  const stats: string[] = [];
  if (item.bonus !== undefined) {
    stats.push(catalogue.inventory.bonusStat(catalogue.attributes[item.bonus]));
  }
  if (item.slot === 'weapon') {
    stats.push(
      catalogue.inventory.weaponStats(
        item.damage,
        catalogue.reach[item.reach ?? 'melee'],
      ),
    );
  }
  return {
    name: item.name,
    magic: item.magic,
    stats,
    chips: [catalogue.inventory.equipmentChip(catalogue.slots[item.slot]), ...stats],
  };
}

/** The rendered strings the client inventory browser shows. */
function inventoryBrowserText(catalogue: Catalogue): InventoryBrowserText {
  return {
    equipped: catalogue.inventory.equipped,
    carried: catalogue.inventory.carried,
    carriedEmpty: catalogue.inventory.carriedEmpty,
    emptySlot: catalogue.inventory.emptySlot,
    ribbon: catalogue.inventory.ribbon,
    magicTitle: catalogue.inventory.magicTitle,
    magicLabel: catalogue.inventory.magicLabel,
    equip: catalogue.inventory.equip,
    unequip: catalogue.inventory.unequip,
    use: catalogue.inventory.use,
    noChangeInCombat: catalogue.inventory.noChangeInCombat,
    noUseInCombat: catalogue.inventory.noUseInCombat,
    fullHealth: catalogue.inventory.fullHealth,
  };
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
  catalogue,
  language,
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
  /** Interface Text: the game screen passes the current catalogue. */
  catalogue: Catalogue;
  language: InterfaceLanguage;
}) {
  const readOnly = forceReadOnly === true || state.status !== 'active';
  // Unavailable inventory reasons come from the view as codes
  // (`inventoryEquipReason` / `inventoryUseReason`) and are rendered from the
  // catalogue into the browser strings below.
  const equipReason = inventoryEquipReason(state);
  const useReason = inventoryUseReason(state);
  const inCombat = equipReason === 'in-combat';
  const slots: InventorySlotData[] = EQUIPMENT_SLOTS.map((slot) => {
    const equippedId = state.equipment[slot];
    // Best effort: an equipped id that is gone from the content reads as empty.
    if (equippedId === undefined || scenario.itemsById[equippedId] === undefined) {
      return { slot, label: catalogue.slots[slot], item: undefined };
    }
    const { name, magic, stats } = itemFacts(equippedId, scenario, catalogue);
    return {
      slot,
      label: catalogue.slots[slot],
      item: { id: equippedId, name, magic, stats },
    };
  });
  // Best effort: anything whose id is gone from the content is left out.
  const items: InventoryTileData[] = Object.entries(state.inventory).flatMap(
    ([itemId, quantity]) => {
      const item = scenario.itemsById[itemId];
      if (item === undefined) return [];
      const { name, magic, chips } = itemFacts(itemId, scenario, catalogue);
      return [
        {
          id: itemId,
          name,
          quantity: formatNumber(language, quantity),
          stacked: quantity > 1,
          kind: item.kind,
          slot: item.kind === 'equipment' ? item.slot : undefined,
          magic,
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
    <section aria-label={catalogue.inventory.title}>
      <h2>{catalogue.inventory.title}</h2>
      {inCombat ? <p className="meta">{catalogue.inventory.combatNote}</p> : null}
      <InventoryBrowser
        // Remount when the `?item=` tile changes elsewhere (back/forward):
        // the browser owns the selection as client state seeded from this id.
        key={initialSelectedId}
        slots={slots}
        items={items}
        playthroughId={playthroughId}
        step={step}
        readOnly={readOnly}
        inCombat={inCombat}
        fullHealth={useReason === 'full-health'}
        initialSelectedId={initialSelectedId}
        seen={seen}
        showUnknownExits={showUnknownExits}
        text={inventoryBrowserText(catalogue)}
        lang={scenario.language}
      />
    </section>
  );
}

function ModalShell({
  title,
  closeHref,
  closeLabel,
  noticeText,
  children,
}: {
  title: string;
  closeHref: string;
  /** Accessible name of the close control, rendered by the game screen. */
  closeLabel: string;
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
          aria-label={closeLabel}
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
  journalEntries,
  journalNextCursor,
  seen,
  selectedItem,
  catalogue,
  language,
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
  /** Newest Journal batch for the modal: newest first with the older-batch cursor. */
  journalEntries: RenderedJournalEntry[];
  /** Cursor for older batches inside the modal (`null` at the start of the Journal). */
  journalNextCursor: number | null;
  seen?: number;
  /** The `?item=` tile the inventory detail pane selects. */
  selectedItem?: string;
  /** Interface Text: the game screen passes the current catalogue. */
  catalogue: Catalogue;
  language: InterfaceLanguage;
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
  const healthShort = catalogue.character.short(state.character.health, MAX_HEALTH);
  const itemsCount = catalogue.inventory.count(itemCount);
  const entriesCount = catalogue.journal.count(journalTotal);
  // The label and sublabel are separate inline spans, so the accessible name
  // is set explicitly instead of relying on their concatenation.
  const characterName = catalogue.character.name(healthShort);
  const inventoryName = catalogue.inventory.name(itemsCount);
  const journalName = catalogue.journal.name(entriesCount);
  // Variant A order: Character status, launchers, then the compact map.
  // The compact map carries an Expand link and the Map launcher opens the
  // same enlarged modal, so it is reachable on desktop and phones alike; on
  // phones the inline map hides behind the Map launcher.
  const expandHref = playHref(playthroughId, 'map', notice, seen, showUnknownExits);
  return (
    <aside className="side" aria-label={catalogue.character.panelLabel}>
      <StatusCard scenario={scenario} state={state} catalogue={catalogue} language={language} />
      <nav aria-label={catalogue.character.panelLabel} className="launchers">
        <Link
          id="launcher-character"
          className="launcher"
          href={characterHref}
          aria-label={characterName}
        >
          <LauncherIcon name="character" />
          <span className="launcher-label">{catalogue.character.title}</span>
          <span className="launcher-sub">{healthShort}</span>
        </Link>
        <Link
          id="launcher-inventory"
          className="launcher"
          href={inventoryHref}
          aria-label={inventoryName}
        >
          <LauncherIcon name="inventory" />
          <span className="launcher-label">{catalogue.inventory.title}</span>
          <span className="launcher-sub">{itemsCount}</span>
        </Link>
        <JournalModalLink
          playthroughId={playthroughId}
          initialEntries={journalEntries}
          initialNextCursor={journalNextCursor}
          total={journalTotal}
          id="launcher-journal"
          className="launcher"
          ariaLabel={journalName}
          text={{
            ...journalEntriesText(catalogue),
            viewJournal: catalogue.game.viewJournal,
            title: catalogue.journal.title,
            total: catalogue.journal.total(journalTotal),
            openInNewTab: catalogue.journal.openInNewTab,
            close: catalogue.journal.close,
          }}
        >
          <LauncherIcon name="journal" />
          <span className="launcher-label">{catalogue.journal.title}</span>
          <span className="launcher-sub">{entriesCount}</span>
        </JournalModalLink>
        <Link
          id="launcher-map"
          className="launcher"
          href={mapHref}
          aria-label={catalogue.map.title}
        >
          <LauncherIcon name="map" />
          <span className="launcher-label">{catalogue.map.title}</span>
          <span className="launcher-sub">{catalogue.map.travelSub}</span>
        </Link>
      </nav>
      <div className="map-inline map-card">
        <LocationMap
          map={gameView.map}
          playthroughId={playthroughId}
          step={step}
          canTravel={canTravel}
          travelAction={travelAction}
          showUnknownExits={showUnknownExits}
          toggleHref={toggleHref}
          expandHref={expandHref}
          markerId="map-arrow-desktop"
          catalogue={catalogue}
          lang={scenario.language}
        />
      </div>
      {panel === 'character' ? (
        <PanelModal
          label={catalogue.character.title}
          closeHref={closeHref}
          launcherId="launcher-character"
        >
          <ModalShell
            title={catalogue.character.title}
            closeHref={closeHref}
            closeLabel={catalogue.closePanel(catalogue.character.title)}
            noticeText={noticeText}
          >
            <CharacterSheet
              scenario={scenario}
              state={state}
              locationName={locationName}
              catalogue={catalogue}
              language={language}
            />
          </ModalShell>
        </PanelModal>
      ) : null}
      {panel === 'inventory' ? (
        <PanelModal
          label={catalogue.inventory.title}
          closeHref={closeHref}
          launcherId="launcher-inventory"
        >
          <ModalShell
            title={catalogue.inventory.title}
            closeHref={closeHref}
            closeLabel={catalogue.closePanel(catalogue.inventory.title)}
            noticeText={noticeText}
          >
            <InventorySheet
              scenario={scenario}
              state={state}
              playthroughId={playthroughId}
              step={step}
              forceReadOnly={forceReadOnly}
              seen={seen}
              showUnknownExits={showUnknownExits}
              selectedItem={selectedItem}
              catalogue={catalogue}
              language={language}
            />
          </ModalShell>
        </PanelModal>
      ) : null}
      {panel === 'map' ? (
        <PanelModal
          label={catalogue.map.label}
          closeHref={closeHref}
          launcherId="launcher-map"
        >
          <ModalShell
            title={catalogue.map.title}
            closeHref={closeHref}
            closeLabel={catalogue.closePanel(catalogue.map.title)}
            noticeText={noticeText}
          >
            <LocationMap
              map={gameView.map}
              playthroughId={playthroughId}
              step={step}
              canTravel={canTravel}
              travelAction={travelAction}
              showUnknownExits={showUnknownExits}
              toggleHref={toggleHref}
              markerId="map-arrow-modal"
              catalogue={catalogue}
              lang={scenario.language}
            />
          </ModalShell>
        </PanelModal>
      ) : null}
    </aside>
  );
}
