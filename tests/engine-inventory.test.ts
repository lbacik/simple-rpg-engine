// Engine unit tests for the inventory actions (docs/spec/playthrough-state.md,
// Equip / Unequip / Use item): legality outside Combat only, the +2 bonus
// cap, full-Health rejection, and the take-item unequip rule.

import { describe, expect, it } from 'vitest';
import type { Scenario } from '../src/content/index';
import {
  applyAction,
  effectiveAttributes,
  startPlaythrough,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';
import { equipmentBonusSources, removeFromInventory } from '../src/engine/inventory';
import { loadInventoryScenario } from './fixtures/inventory';

const rng: Rng = () => 1;

function loadFixture(): Scenario {
  return loadInventoryScenario();
}

function started(scenario: Scenario): PlaythroughState {
  const result = startPlaythrough(scenario, 'hunter', 'Robin', rng);
  if (!result.ok) throw new Error('fixture start failed');
  return result.state;
}

function inCombat(state: PlaythroughState): PlaythroughState {
  return {
    ...state,
    activeCombat: {
      encounterId: 'ambush',
      round: 1,
      startedParticipants: ['ambush-foe'],
      roundParticipantOrder: ['ambush-foe'],
      participants: { 'ambush-foe': { range: 'far', intent: 'strike', prepared: false } },
    },
  };
}

describe('equip', () => {
  it('equips held Equipment into an empty slot, advances step and journals', () => {
    const scenario = loadFixture();
    const state = { ...started(scenario), equipment: {} };
    const result = applyAction(scenario, state, { kind: 'equip', itemId: 'cloak', expectedStep: 0 }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.equipment).toEqual({ outfit: 'cloak' });
    expect(result.state.step).toBe(1);
    expect(result.state.currentLocationId).toBe(state.currentLocationId);
    expect(result.journal).toEqual([
      {
        type: 'inventory',
        lang: 'en',
        action: 'equipped',
        itemId: 'cloak',
        name: "Hunter's Cloak",
      },
    ]);
    expect(result.journal[0]).not.toHaveProperty('text');
  });

  it('replaces the occupant of the slot', () => {
    const scenario = loadFixture();
    const base = started(scenario);
    const state = {
      ...base,
      inventory: { ...base.inventory, coat: 1 },
      equipment: { outfit: 'cloak' },
    };
    const result = applyAction(scenario, state, { kind: 'equip', itemId: 'coat', expectedStep: 0 }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.equipment).toEqual({ outfit: 'coat' });
    expect(result.state.step).toBe(1);
  });

  it('updates the effective Attribute read by the game', () => {
    const scenario = loadFixture();
    const state = { ...started(scenario), equipment: {} };
    expect(effectiveAttributes(scenario, state).agility).toBe(1);
    const result = applyAction(scenario, state, { kind: 'equip', itemId: 'cloak', expectedStep: 0 }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(effectiveAttributes(scenario, result.state).agility).toBe(2);
  });

  it('rejects re-equipping what is already equipped without changing state', () => {
    const scenario = loadFixture();
    const state = { ...started(scenario), equipment: { outfit: 'cloak' } };
    const result = applyAction(scenario, state, { kind: 'equip', itemId: 'cloak', expectedStep: 0 }, rng);
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
  });

  it('rejects unknown, unheld and non-Equipment items without changing state', () => {
    const scenario = loadFixture();
    const state = { ...started(scenario), equipment: {} };
    for (const itemId of ['no-such-item', 'herbs', 'charm']) {
      const before = state;
      const result = applyAction(scenario, before, { kind: 'equip', itemId, expectedStep: 0 }, rng);
      expect(result).toEqual({ ok: false, reason: 'illegal-action' });
    }
    // 'herbs' is a held Consumable, 'charm' a held Key Item: neither equips.
    const unheld = { ...state, inventory: {} };
    expect(
      applyAction(scenario, unheld, { kind: 'equip', itemId: 'cloak', expectedStep: 0 }, rng),
    ).toEqual({ ok: false, reason: 'illegal-action' });
  });

  it('is rejected during Combat with step unchanged', () => {
    const scenario = loadFixture();
    const state = inCombat({ ...started(scenario), equipment: {} });
    const result = applyAction(scenario, state, { kind: 'equip', itemId: 'cloak', expectedStep: 0 }, rng);
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
  });

  it('is legal while a Scene is active', () => {
    const scenario = loadFixture();
    const state = { ...started(scenario), equipment: {}, activeSceneId: 'path' };
    const result = applyAction(scenario, state, { kind: 'equip', itemId: 'cloak', expectedStep: 0 }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.activeSceneId).toBe('path');
  });
});

describe('unequip', () => {
  it('empties an occupied slot, advances step and journals', () => {
    const scenario = loadFixture();
    const state = { ...started(scenario), equipment: { outfit: 'cloak' } };
    const result = applyAction(scenario, state, { kind: 'unequip', slot: 'outfit', expectedStep: 0 }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.equipment).toEqual({});
    expect(result.state.step).toBe(1);
    expect(result.journal).toEqual([
      {
        type: 'inventory',
        lang: 'en',
        action: 'unequipped',
        itemId: 'cloak',
        name: "Hunter's Cloak",
      },
    ]);
  });

  it('rejects an empty slot and an unknown slot', () => {
    const scenario = loadFixture();
    const state = { ...started(scenario), equipment: {} };
    expect(
      applyAction(scenario, state, { kind: 'unequip', slot: 'outfit', expectedStep: 0 }, rng),
    ).toEqual({ ok: false, reason: 'illegal-action' });
    expect(
      applyAction(
        scenario,
        state,
        // @ts-expect-error runtime guard for a forged slot value
        { kind: 'unequip', slot: 'head', expectedStep: 0 },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'illegal-action' });
  });

  it('is rejected during Combat with step unchanged', () => {
    const scenario = loadFixture();
    const state = inCombat({ ...started(scenario), equipment: { outfit: 'cloak' } });
    const result = applyAction(scenario, state, { kind: 'unequip', slot: 'outfit', expectedStep: 0 }, rng);
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
  });
});

describe('use item', () => {
  it('heals below full Health, consumes one copy and leaves position unchanged', () => {
    const scenario = loadFixture();
    const state = {
      ...started(scenario),
      character: { templateId: 'hunter', name: 'Robin', baseAttributes: { might: 2, agility: 1, wits: 2, presence: 1 }, health: 8 },
      activeSceneId: 'path',
    };
    const result = applyAction(scenario, state, { kind: 'use-item', itemId: 'herbs', expectedStep: 0 }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.character.health).toBe(11);
    expect(result.state.inventory['herbs']).toBe(1);
    expect(result.state.step).toBe(1);
    expect(result.state.currentLocationId).toBe(state.currentLocationId);
    expect(result.state.activeSceneId).toBe('path');
    expect(result.journal).toEqual([
      { type: 'inventory', lang: 'en', action: 'used', itemId: 'herbs', name: 'Herbs', healed: 3 },
    ]);
  });

  it('caps healing at 12 and reports only the Health restored', () => {
    const scenario = loadFixture();
    const state = {
      ...started(scenario),
      character: { templateId: 'hunter', name: 'Robin', baseAttributes: { might: 2, agility: 1, wits: 2, presence: 1 }, health: 10 },
    };
    const result = applyAction(scenario, state, { kind: 'use-item', itemId: 'herbs', expectedStep: 0 }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.character.health).toBe(12);
    expect(result.journal).toEqual([
      { type: 'inventory', lang: 'en', action: 'used', itemId: 'herbs', name: 'Herbs', healed: 2 },
    ]);
  });

  it('removes the entry when the last copy is consumed', () => {
    const scenario = loadFixture();
    const state = {
      ...started(scenario),
      character: { templateId: 'hunter', name: 'Robin', baseAttributes: { might: 2, agility: 1, wits: 2, presence: 1 }, health: 5 },
      inventory: { elixir: 1 },
    };
    const result = applyAction(scenario, state, { kind: 'use-item', itemId: 'elixir', expectedStep: 0 }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.character.health).toBe(10);
    expect(result.state.inventory).not.toHaveProperty('elixir');
  });

  it('rejects use at full Health with nothing consumed and step unchanged', () => {
    const scenario = loadFixture();
    const state = started(scenario);
    expect(state.character.health).toBe(12);
    const before = state.inventory['herbs'];
    const result = applyAction(scenario, state, { kind: 'use-item', itemId: 'herbs', expectedStep: 0 }, rng);
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
    expect(state.inventory['herbs']).toBe(before);
  });

  it('rejects unheld items and non-Consumables', () => {
    const scenario = loadFixture();
    const state = {
      ...started(scenario),
      character: { templateId: 'hunter', name: 'Robin', baseAttributes: { might: 2, agility: 1, wits: 2, presence: 1 }, health: 5 },
    };
    for (const itemId of ['no-such-item', 'sword', 'charm']) {
      expect(
        applyAction(scenario, state, { kind: 'use-item', itemId, expectedStep: 0 }, rng),
      ).toEqual({ ok: false, reason: 'illegal-action' });
    }
  });

  it('is rejected during Combat with step unchanged', () => {
    const scenario = loadFixture();
    const state = inCombat({
      ...started(scenario),
      character: { templateId: 'hunter', name: 'Robin', baseAttributes: { might: 2, agility: 1, wits: 2, presence: 1 }, health: 5 },
    });
    const result = applyAction(scenario, state, { kind: 'use-item', itemId: 'herbs', expectedStep: 0 }, rng);
    expect(result).toEqual({ ok: false, reason: 'illegal-action' });
  });
});

describe('equipment bonuses', () => {
  it('caps the total bonus per Attribute at +2 with three boosting items', () => {
    const scenario = loadFixture();
    const state = {
      ...started(scenario),
      equipment: { weapon: 'swift-blade', outfit: 'cloak', talisman: 'boots' },
    };
    expect(equipmentBonusSources(scenario, state).agility).toEqual(['swift-blade', 'cloak', 'boots']);
    expect(effectiveAttributes(scenario, state).agility).toBe(3);
  });

  it('gives nothing for a second copy of an equipped item', () => {
    const scenario = loadFixture();
    const state = {
      ...started(scenario),
      inventory: { cloak: 2 },
      equipment: { outfit: 'cloak' },
    };
    expect(effectiveAttributes(scenario, state).agility).toBe(2);
  });

  it('ignores equipped ids that are no longer Equipment', () => {
    const scenario = loadFixture();
    const state = { ...started(scenario), equipment: { outfit: 'cloak' } };
    const withoutCloak = {
      ...scenario,
      itemsById: Object.fromEntries(Object.entries(scenario.itemsById).filter(([id]) => id !== 'cloak')),
    };
    expect(effectiveAttributes(withoutCloak, state).agility).toBe(1);
    expect(equipmentBonusSources(withoutCloak, state).agility).toEqual([]);
  });
});

describe('turn pipeline', () => {
  it('persists an inventory turn with its journal entry', async () => {
    const { openDatabase, migrateDatabase, PlaythroughStore } = await import(
      '../src/persistence/index'
    );
    const { executeTurn } = await import('../src/app/lib/turn');
    const scenario = loadFixture();
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const state = { ...started(scenario), equipment: {} };
      await new PlaythroughStore(db).create(
        {
          id: 'pt-inventory',
          sessionId: 'session-hash-1',
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          contentHash: scenario.contentHash,
          status: state.status,
          step: state.step,
          state,
        },
        [],
      );
      const result = await executeTurn(
        db,
        (id) => (id === scenario.id ? scenario : undefined),
        'pt-inventory',
        'session-hash-1',
        { kind: 'equip', itemId: 'cloak', expectedStep: 0 },
        rng,
      );
      expect(result).toEqual({ ok: true, step: 1 });
      const store = new PlaythroughStore(db);
      const storedInventory = await store.findById('pt-inventory');
      expect((storedInventory?.state as PlaythroughState).equipment).toEqual({
        outfit: 'cloak',
      });
      const journal = await store.listJournal('pt-inventory');
      expect(journal.map((entry) => entry.type)).toEqual(['inventory']);
      expect(journal[0]?.step).toBe(1);
    } finally {
      await db.destroy();
    }
  });
});

describe('removeFromInventory (take-item rule)', () => {
  it('unequips the last copy of an equipped item before removing it', () => {
    const scenario = loadFixture();
    const state = { ...started(scenario), inventory: { cloak: 1 }, equipment: { outfit: 'cloak' } };
    const { inventory, equipment } = removeFromInventory(state, 'cloak', 1);
    expect(inventory).not.toHaveProperty('cloak');
    expect(equipment).toEqual({});
  });

  it('keeps an equipped item equipped when one of two copies is removed', () => {
    const scenario = loadFixture();
    const state = { ...started(scenario), inventory: { cloak: 2 }, equipment: { outfit: 'cloak' } };
    const { inventory, equipment } = removeFromInventory(state, 'cloak', 1);
    expect(inventory).toEqual({ cloak: 1 });
    expect(equipment).toEqual({ outfit: 'cloak' });
  });

  it('removes at most what is held', () => {
    const state = started(loadFixture());
    const { inventory } = removeFromInventory({ ...state, inventory: { herbs: 2 } }, 'herbs', 5);
    expect(inventory).not.toHaveProperty('herbs');
  });
});
