// PROTOTYPE (throwaway): plain, serialisable data for the Character / Inventory /
// Journal modal variants in side-panel.prototype.tsx. Duplicates a little of
// page.tsx on purpose; nothing here is meant to survive into main.

import type { CompiledItem } from '@/content/model';
import type { Scenario } from '@/content/index';
import { effectiveAttributes } from '@/engine/index';
import { equipmentBonusSources, EQUIPMENT_SLOTS } from '@/engine/inventory';
import { MAX_HEALTH, type PlaythroughState } from '@/engine/state';
import { renderJournalEntry } from '@/app/lib/journal';
import type { StoredJournalEntry } from '@/persistence/index';

const ATTRIBUTE_LABELS = {
  might: 'Might',
  agility: 'Agility',
  wits: 'Wits',
  presence: 'Presence',
} as const;

type AttributeName = keyof typeof ATTRIBUTE_LABELS;

/** Variant keys and names for the floating switcher. */
export const PROTOTYPE_VARIANTS = [
  { key: 'A', name: 'Separate modals · pips + paper doll' },
  { key: 'B', name: 'One ledger modal · book spread + table' },
  { key: 'C', name: 'Slide-over drawer · stat block + rows' },
  { key: 'current', name: 'Current tabs (baseline)' },
] as const;

export type ProtoAction = {
  label: 'Equip' | 'Unequip' | 'Use';
  /** Set when the action is shown disabled. */
  reason?: string;
};

export type ProtoItem = {
  id: string;
  name: string;
  quantity: number;
  kind: 'equipment' | 'consumable' | 'key';
  slot?: 'weapon' | 'outfit' | 'talisman';
  bonus?: string;
  damage?: number;
  reach?: 'melee' | 'ranged';
  heal?: number;
  magic: boolean;
  description?: string;
  equippedIn?: string;
  details: string[];
  action?: ProtoAction;
};

export type ProtoSheet = {
  name: string;
  templateName?: string;
  templateDescription?: string;
  health: number;
  maxHealth: number;
  locationName: string;
  status: 'active' | 'ended';
  inCombat: boolean;
  readOnly: boolean;
  attributes: {
    key: AttributeName;
    label: string;
    base: number;
    effective: number;
    counted: string[];
    ignored: string[];
  }[];
  slots: { slot: 'weapon' | 'outfit' | 'talisman'; item?: ProtoItem; action?: ProtoAction }[];
  items: ProtoItem[];
  journalTotal: number;
  journal: { seq: number; step: number; label: string; html: string }[];
};

function details(item: CompiledItem): string[] {
  if (item.kind === 'equipment') {
    const out = [`Equipment · ${item.slot}`];
    if (item.bonus !== undefined) out.push(`+1 ${ATTRIBUTE_LABELS[item.bonus]}`);
    if (item.slot === 'weapon') {
      out.push(item.damage !== undefined ? `Damage ${item.damage} · Reach ${item.reach}` : `Reach ${item.reach}`);
    }
    return out;
  }
  if (item.kind === 'consumable') return [`Consumable · restores ${item.heal} Health`];
  return ['Key item'];
}

export function buildProtoSheet({
  scenario,
  state,
  journal,
  locationName,
}: {
  scenario: Scenario;
  state: PlaythroughState;
  journal: StoredJournalEntry[];
  locationName: string;
}): ProtoSheet {
  const readOnly = state.status !== 'active';
  const inCombat = state.activeCombat != null;
  const fullHealth = state.character.health >= MAX_HEALTH;
  const template = scenario.templatesById[state.character.templateId];
  const effective = effectiveAttributes(scenario, state);
  const sources = equipmentBonusSources(scenario, state);
  const nameOf = (id: string) => scenario.itemsById[id]?.name ?? id;

  const toItem = (id: string, quantity: number): ProtoItem | undefined => {
    const item = scenario.itemsById[id];
    if (item === undefined) return undefined;
    const equippedIn =
      item.kind === 'equipment' && state.equipment[item.slot] === id ? item.slot : undefined;
    let action: ProtoAction | undefined;
    if (!readOnly) {
      if (item.kind === 'equipment') {
        action = inCombat
          ? { label: 'Equip', reason: 'Cannot change equipment during Combat.' }
          : equippedIn
            ? { label: 'Unequip' }
            : { label: 'Equip' };
      } else if (item.kind === 'consumable') {
        action = inCombat
          ? { label: 'Use', reason: 'Cannot use items here during Combat.' }
          : fullHealth
            ? { label: 'Use', reason: 'Already at full Health.' }
            : { label: 'Use' };
      }
    }
    return {
      id,
      name: item.name,
      quantity,
      kind: item.kind,
      slot: item.kind === 'equipment' ? item.slot : undefined,
      bonus: item.kind === 'equipment' && item.bonus ? ATTRIBUTE_LABELS[item.bonus] : undefined,
      damage: item.kind === 'equipment' ? item.damage : undefined,
      reach: item.kind === 'equipment' && item.slot === 'weapon' ? item.reach : undefined,
      heal: item.kind === 'consumable' ? item.heal : undefined,
      magic: item.magic,
      description: item.description,
      equippedIn,
      details: details(item),
      action,
    };
  };

  const items = Object.entries(state.inventory)
    .map(([id, quantity]) => toItem(id, quantity))
    .filter((item): item is ProtoItem => item !== undefined);

  return {
    name: state.character.name,
    templateName: template?.name,
    templateDescription: template?.description,
    health: state.character.health,
    maxHealth: MAX_HEALTH,
    locationName,
    status: state.status === 'active' ? 'active' : 'ended',
    inCombat,
    readOnly,
    attributes: (Object.keys(ATTRIBUTE_LABELS) as AttributeName[]).map((key) => ({
      key,
      label: ATTRIBUTE_LABELS[key],
      base: state.character.baseAttributes[key],
      effective: effective[key],
      counted: sources[key].slice(0, 2).map(nameOf),
      ignored: sources[key].slice(2).map(nameOf),
    })),
    slots: EQUIPMENT_SLOTS.map((slot) => {
      const id = state.equipment[slot];
      const item = id ? items.find((candidate) => candidate.id === id) ?? toItem(id, 1) : undefined;
      const action: ProtoAction | undefined =
        readOnly || item === undefined
          ? undefined
          : inCombat
            ? { label: 'Unequip', reason: 'Cannot change equipment during Combat.' }
            : { label: 'Unequip' };
      return { slot, item, action };
    }),
    items,
    journalTotal: journal.length,
    journal: journal
      .slice(-30)
      .reverse()
      .map((entry) => {
        const rendered = renderJournalEntry(entry.type, entry.payload, state.character.name);
        return { seq: entry.seq, step: entry.step, label: rendered.label, html: rendered.html };
      }),
  };
}
