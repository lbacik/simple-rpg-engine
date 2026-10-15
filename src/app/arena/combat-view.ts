// The Arena Combat adapter (issue #166): the stored Arena run rendered
// through the existing Combat presentation. The adapter derives the Scenario
// Combat view shape from Arena state — the opponent name as stored at setup,
// its localized description, the default Character, the Arena view projection
// — so the Arena page reuses the Combat panel and its actions unchanged. The
// Combat log reads the stored Arena journal, never the state, so it survives
// a reload.

import {
  arenaView,
  type ArenaJournalEntry,
  type ArenaState,
  type GameView,
  type TacticalRoundView,
} from '../../engine/index';
import { MAX_HEALTH } from '../../engine/state';
import { getCatalogue, type InterfaceLanguage } from '../../i18n/index';
import { bestiaryById, bestiaryDescription } from './bestiary';

export type ArenaCombat = Extract<GameView, { kind: 'combat' }>;

/**
 * One opponent's display name: its stored name plus the ordinal letter when
 * the fight holds two of the same kind ("Grey Wolf A"), mirroring the Combat
 * lanes, so duplicates are distinguishable. Author ids are never shown.
 */
export function arenaFoeDisplayName(state: ArenaState, opponentId: string): string {
  const opponent = state.opponents.find((candidate) => candidate.id === opponentId);
  if (opponent === undefined) return '';
  const sameName = state.opponents.filter((candidate) => candidate.name === opponent.name);
  if (sameName.length <= 1) return opponent.name;
  const ordinal = sameName.findIndex((candidate) => candidate.id === opponent.id) + 1;
  return `${opponent.name} ${String.fromCharCode(64 + ordinal)}`;
}

/**
 * The fight's opponents, named as stored when the Setup was built — the way
 * the Journal stores Scenario text as presented, so a mid-fight language
 * switch never renames a foe out from under the stored narration. One foe
 * reads as its name; two read joined with " + ".
 */
export function arenaFoeName(state: ArenaState): string {
  return state.opponents.map((opponent) => arenaFoeDisplayName(state, opponent.id)).join(' + ');
}

function arenaFoeDescription(state: ArenaState, language: InterfaceLanguage): string {
  const texts = state.opponents.map((opponent) => {
    // A duplicate's participant id carries a "-2" suffix: strip it to find
    // the Bestiary entry the opponent was built from.
    const entry = bestiaryById(opponent.id) ?? bestiaryById(opponent.id.replace(/-2$/, ''));
    if (entry === undefined) return '';
    return bestiaryDescription(entry, language);
  });
  return texts.filter((text) => text !== '').join('\n\n');
}

/**
 * The existing Combat view over the running fight. Undefined once the fight
 * has ended; the result screen reads `arenaResult` instead.
 */
export function arenaCombatView(
  state: ArenaState,
  language: InterfaceLanguage,
): ArenaCombat | undefined {
  const arena = arenaView(state);
  if (arena === undefined) {
    return undefined;
  }
  const catalogue = getCatalogue(language);
  const foe = arenaFoeName(state);
  const weapon = state.character.weapon;
  const attack = weapon === undefined ? { damage: 2, reach: 'melee' as const } : weapon;
  const first = state.opponents[0];
  return {
    kind: 'combat',
    locationId: 'arena',
    locationName: catalogue.combat.arenaLabel,
    encounterId: 'arena',
    encounterName: foe,
    text: arenaFoeDescription(state, language),
    characterName: catalogue.arena.you,
    range:
      state.opponents.find((opponent) => opponent.damageTaken < opponent.maxHealth)?.range ??
      'far',
    round: state.round,
    character: {
      health: state.character.health,
      maxHealth: MAX_HEALTH,
      ...(weapon?.name === undefined ? {} : { weaponName: weapon.name }),
      reach: attack.reach,
      damage: attack.damage,
    },
    enemy:
      first === undefined
        ? { name: foe, health: 0, maxHealth: 0, damage: 0, reach: 'melee' as const }
        : {
            name: foe,
            health: Math.max(0, first.maxHealth - first.damageTaken),
            maxHealth: first.maxHealth,
            damage: first.damage,
            reach: first.reach,
          },
    actions: arena.actions.map((action) => ({
      id: action.id,
      group: action.group,
      enabled: action.enabled,
      ...(action.reason === undefined ? {} : { reason: action.reason }),
      ...(action.itemId === undefined ? {} : { itemId: action.itemId }),
      ...(action.itemName === undefined ? {} : { itemName: action.itemName }),
      ...(action.weaponName === undefined ? {} : { weaponName: action.weaponName }),
    })),
    arena,
    map: { nodes: [], edges: [], currentLocationId: 'arena', travelTargetIds: [] },
  };
}

/** The stored Arena Rounds as the Combat log, oldest first. */
export function arenaTacticalRounds(journal: ArenaJournalEntry[]): TacticalRoundView[] {
  return journal.flatMap((entry) =>
    entry.type === 'arena-round'
      ? [
          {
            round: entry.round,
            actions: entry.actions,
            ...(entry.stop === undefined ? {} : { stop: entry.stop }),
          },
        ]
      : [],
  );
}
