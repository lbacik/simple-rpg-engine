// The Inventory modal body, variant A (docs/spec/ui.md, Character and
// inventory panel): a "paper doll" of the equipped slots beside a grid of
// carried item tiles, with a detail pane for the selected tile below the
// tiles.
//
// Tile selection is client state (buttons with `aria-pressed`), defaulting to
// the `?item=` tile the redirect after an action preserves, else the first
// carried item. Every form carries the selected tile along as `item`, so the
// redirect after the action lands back with the same tile selected (or the
// first item, when the selected one is gone). Focus order is slots, then
// tiles, then the pane, by DOM order.

'use client';

import { useState } from 'react';
import { equipAction, unequipAction, useItemAction } from '@/app/lib/inventory';

export type InventorySlotId = 'weapon' | 'outfit' | 'talisman';

export type InventorySlotData = {
  slot: InventorySlotId;
  label: string;
  item:
    | {
        id: string;
        name: string;
        magic: boolean;
        /** Stat lines: bonus, and Damage/Reach for weapons. */
        stats: string[];
      }
    | undefined;
};

export type InventoryTileData = {
  id: string;
  name: string;
  quantity: number;
  kind: 'equipment' | 'consumable' | 'key';
  /** Equipment slot, for the tile icon. */
  slot: InventorySlotId | undefined;
  magic: boolean;
  description: string | undefined;
  equippedSlot: InventorySlotId | undefined;
  /** Chips: kind/slot, bonus, Damage and Reach or healing. */
  chips: string[];
};

/** The equipment-slot glyphs, shared by the carried tiles and the paper doll. */
function SlotIconPaths({ slot }: { slot: InventorySlotId }) {
  if (slot === 'weapon') {
    return (
      <>
        <path d="M20 4 9.5 14.5" />
        <path d="M20 4h-4M20 4v4" />
        <path d="M6.5 11.5l6 6" />
        <path d="M8.5 15.5 4 20" />
      </>
    );
  }
  if (slot === 'outfit') {
    return <path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3q-4 3-8 0Z" />;
  }
  return (
    <>
      <path d="M7 3q5 7 10 0" />
      <circle cx="12" cy="15" r="5" />
      <path d="M12 12l2 3-2 3-2-3Z" />
    </>
  );
}

function TileIcon({ tile }: { tile: InventoryTileData }) {
  const name =
    tile.kind === 'equipment' ? (tile.slot ?? 'weapon') : tile.kind === 'consumable' ? 'consumable' : 'key';
  const paths =
    name === 'weapon' || name === 'outfit' || name === 'talisman' ? (
      <SlotIconPaths slot={name} />
    ) : name === 'consumable' ? (
      <>
        <path d="M10 3h4M10.5 3v6l-5 9.5Q5 21 7.5 21h9q2.5 0 2-2.5l-5-9.5V3" />
        <path d="M7.5 15h9" />
      </>
    ) : (
      <>
        <circle cx="8" cy="8" r="4.5" />
        <path d="M11.2 11.2 20 20M16 16l2-2M18.5 18.5l2-2" />
      </>
    );
  return (
    <svg
      width={34}
      height={34}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

function SlotIcon({ slot }: { slot: InventorySlotId }) {
  return (
    <span className="inv-slot-icon" aria-hidden="true">
      <svg
        width={28}
        height={28}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <SlotIconPaths slot={slot} />
      </svg>
    </span>
  );
}

/** A disabled action with its reason. */
function DisabledAction({ label, reason }: { label: string; reason: string }) {
  return (
    <p>
      <button className="button secondary" type="button" disabled>
        {label}
      </button>{' '}
      <span className="reason">{reason}</span>
    </p>
  );
}

/** An inventory Server Action form: the identity inputs, the preserved query
 * inputs and the submit button. */
function InventoryActionForm({
  action,
  field,
  value,
  label,
  selectedId,
  playthroughId,
  step,
  seen,
  showUnknownExits,
}: {
  action: (formData: FormData) => Promise<never>;
  /** The subject input: `slot` for unequip, `itemId` for equip and use. */
  field: 'slot' | 'itemId';
  value: string;
  label: string;
  selectedId: string | undefined;
  playthroughId: string;
  step: number;
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="playthroughId" value={playthroughId} />
      <input type="hidden" name="expectedStep" value={step} />
      <input type="hidden" name={field} value={value} />
      <PreservedInputs selectedId={selectedId} seen={seen} showUnknownExits={showUnknownExits} />
      <p>
        <button className="button secondary" type="submit">
          {label}
        </button>
      </p>
    </form>
  );
}

/** Hidden inputs every inventory form carries: the modal, the Continue
 * acknowledgement, the "?" map setting and the selected tile. */
function PreservedInputs({
  selectedId,
  seen,
  showUnknownExits,
}: {
  selectedId: string | undefined;
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  return (
    <>
      <input type="hidden" name="panel" value="inventory" />
      {seen !== undefined ? <input type="hidden" name="seen" value={seen} /> : null}
      {showUnknownExits ? <input type="hidden" name="unknown" value="1" /> : null}
      {selectedId !== undefined ? <input type="hidden" name="item" value={selectedId} /> : null}
    </>
  );
}

export function InventoryBrowser({
  slots,
  items,
  playthroughId,
  step,
  readOnly,
  inCombat,
  fullHealth,
  initialSelectedId,
  seen,
  showUnknownExits,
}: {
  slots: InventorySlotData[];
  items: InventoryTileData[];
  playthroughId: string;
  step: number;
  readOnly: boolean;
  inCombat: boolean;
  fullHealth: boolean;
  initialSelectedId: string | undefined;
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialSelectedId ?? items[0]?.id,
  );
  // The selected tile survives the redirect via `?item=`; when it is gone
  // (the last copy used, the state re-rendered), fall back to the first item.
  const selected = items.find((tile) => tile.id === selectedId) ?? items[0];

  return (
    <div className="inv-grid">
      <section aria-label="Equipped" className="inv-doll">
        <h3>Equipped</h3>
        {slots.map(({ slot, label, item }) =>
          item === undefined ? (
            <div key={slot} className="inv-slot empty">
              <SlotIcon slot={slot} />
              <div>
                <p className="meta">{label}</p>
                <p>
                  <em>Empty</em>
                </p>
              </div>
            </div>
          ) : (
            <div key={slot} className="inv-slot">
              <SlotIcon slot={slot} />
              <div>
                <p className="meta">{label}</p>
                <p>
                  <strong>{item.name}</strong>
                  {item.magic ? (
                    <span className="inv-spark" title="Magic item">
                      {' '}
                      ✦
                    </span>
                  ) : null}
                </p>
                {item.stats.length > 0 ? <p className="meta">{item.stats.join(' · ')}</p> : null}
                {readOnly ? null : inCombat ? (
                  <DisabledAction label="Unequip" reason="Cannot change equipment during Combat." />
                ) : (
                  <InventoryActionForm
                    action={unequipAction}
                    field="slot"
                    value={slot}
                    label="Unequip"
                    selectedId={selected?.id}
                    playthroughId={playthroughId}
                    step={step}
                    seen={seen}
                    showUnknownExits={showUnknownExits}
                  />
                )}
              </div>
            </div>
          ),
        )}
      </section>
      <section aria-label="Carried">
        <h3>Carried</h3>
        {items.length === 0 ? (
          <p>Empty.</p>
        ) : (
          <ul className="inv-tiles">
            {items.map((tile) => (
              <li key={tile.id}>
                <button
                  type="button"
                  className={`inv-tile${tile.id === selected?.id ? ' selected' : ''}`}
                  aria-pressed={tile.id === selected?.id}
                  onClick={() => setSelectedId(tile.id)}
                >
                  {tile.magic ? (
                    <span className="inv-spark corner" title="Magic item">
                      ✦
                    </span>
                  ) : null}
                  {tile.quantity > 1 ? <span className="inv-qty">×{tile.quantity}</span> : null}
                  <TileIcon tile={tile} />
                  <span className="inv-tile-name">{tile.name}</span>
                  {tile.equippedSlot !== undefined ? (
                    <span className="inv-ribbon">equipped</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected ? (
          <div className="inv-detail">
            <p>
              <strong>{selected.name}</strong> × {selected.quantity}
              {selected.magic ? (
                <span className="magic" title="Magic item">
                  {' '}
                  ✦ magic
                </span>
              ) : null}
            </p>
            {selected.description ? <p className="inv-desc">{selected.description}</p> : null}
            <p className="inv-chips">
              {selected.chips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </p>
            {readOnly ? null : <DetailAction
              tile={selected}
              inCombat={inCombat}
              fullHealth={fullHealth}
              playthroughId={playthroughId}
              step={step}
              seen={seen}
              showUnknownExits={showUnknownExits}
            />}
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** The selected tile's real action: Equip, Unequip or Use, disabled with its
 * reason when unavailable. Key items have no action. */
function DetailAction({
  tile,
  inCombat,
  fullHealth,
  playthroughId,
  step,
  seen,
  showUnknownExits,
}: {
  tile: InventoryTileData;
  inCombat: boolean;
  fullHealth: boolean;
  playthroughId: string;
  step: number;
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  const formProps = {
    selectedId: tile.id,
    playthroughId,
    step,
    seen,
    showUnknownExits,
  };
  if (tile.kind === 'equipment') {
    if (inCombat) {
      const label = tile.equippedSlot !== undefined ? 'Unequip' : 'Equip';
      return <DisabledAction label={label} reason="Cannot change equipment during Combat." />;
    }
    if (tile.equippedSlot !== undefined) {
      return (
        <InventoryActionForm
          action={unequipAction}
          field="slot"
          value={tile.equippedSlot}
          label="Unequip"
          {...formProps}
        />
      );
    }
    return (
      <InventoryActionForm
        action={equipAction}
        field="itemId"
        value={tile.id}
        label="Equip"
        {...formProps}
      />
    );
  }
  if (tile.kind === 'consumable') {
    if (inCombat) {
      return <DisabledAction label="Use" reason="Cannot use items here during Combat." />;
    }
    if (fullHealth) {
      return <DisabledAction label="Use" reason="Already at full Health." />;
    }
    return (
      <InventoryActionForm
        action={useItemAction}
        field="itemId"
        value={tile.id}
        label="Use"
        {...formProps}
      />
    );
  }
  return null;
}
