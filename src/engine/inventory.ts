// Inventory helpers and the outside-Combat actions Equip, Unequip and
// Use item (docs/spec/playthrough-state.md, actions; docs/spec/mechanics.md,
// Items).
//
// Equipment is a pointer to a held item: an equipped copy counts towards the
// held quantity, and removing the last copy unequips it first. The take-item
// rule below is shared by Use item now and by the Outcome Effects in a later
// ticket.

import type { AttributeName, Scenario } from '../content/model';
import type { PlaythroughState } from './state';

export const EQUIPMENT_SLOTS = ['weapon', 'outfit', 'talisman'] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export function isEquipmentSlot(value: string): value is EquipmentSlot {
  return (EQUIPMENT_SLOTS as readonly string[]).includes(value);
}

/**
 * Item ids granting +1 to each Attribute from the currently equipped items,
 * in slot order (weapon, outfit, talisman). Entries that are missing from
 * the Scenario or are not bonus Equipment contribute nothing, so a second
 * copy of an equipped item (which is never equipped twice) gives no extra
 * benefit. The +2 cap itself is applied by `effectiveAttributes`.
 */
export function equipmentBonusSources(
  scenario: Scenario,
  state: PlaythroughState,
): Record<AttributeName, string[]> {
  const sources: Record<AttributeName, string[]> = {
    might: [],
    agility: [],
    wits: [],
    presence: [],
  };
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = state.equipment[slot];
    if (itemId === undefined) continue;
    const item = scenario.itemsById[itemId];
    if (item === undefined || item.kind !== 'equipment' || item.bonus === undefined) continue;
    sources[item.bonus].push(itemId);
  }
  return sources;
}

/**
 * The spec `take-item` rule: quantity − min(n, held); at zero, unequip
 * first, then remove the entry. Entries at zero are never kept.
 */
export function removeFromInventory(
  state: PlaythroughState,
  itemId: string,
  count: number,
): { inventory: PlaythroughState['inventory']; equipment: PlaythroughState['equipment'] } {
  const held = state.inventory[itemId] ?? 0;
  const remaining = held - Math.min(count, held);
  if (remaining <= 0) {
    const inventory = { ...state.inventory };
    delete inventory[itemId];
    let equipment = state.equipment;
    for (const slot of EQUIPMENT_SLOTS) {
      if (equipment[slot] === itemId) {
        equipment = { ...equipment };
        delete equipment[slot];
      }
    }
    return { inventory, equipment };
  }
  return { inventory: { ...state.inventory, [itemId]: remaining }, equipment: state.equipment };
}
