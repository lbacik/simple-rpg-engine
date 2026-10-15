// The Arena's framework-free helpers (docs/spec/architecture.md, turn
// transport): the Scenario ids the Arena content agrees on, enemy picking,
// the Bestiary view-model, the result-screen outcome and the fight URLs.
//
// The Server Actions live in `src/app/arena/actions.ts`; the page in
// `src/app/arena/page.tsx`. This module stays free of Next.js, React and
// persistence imports, so tests drive it directly: relative imports only.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly.

import type { Scenario } from '../../content/model';

/** The Scenario id of the Arena content package (`scenarios/arena`). */
export const ARENA_SCENARIO_ID = 'arena';

/** The Arena's single Character Template: the player keeps this fighter. */
export const ARENA_TEMPLATE_ID = 'arena-fighter';

/** The Arena fighter's name: no name is asked, the default is kept. */
export const ARENA_CHARACTER_NAME = 'Champion';

/**
 * The call scene listing one fight choice per Bestiary enemy. The Start
 * action starts the Playthrough (which activates this on-enter Scene) and
 * takes the choice for the picked enemy straight into Combat.
 */
export const ARENA_CALL_SCENE_ID = 'choose-foe';

/**
 * The Encounter (and the call-scene choice) staging the fight with an enemy:
 * one Encounter per Bestiary enemy, `fight-<enemyId>`.
 */
export function arenaEncounterId(enemyId: string): string {
  return `fight-${enemyId}`;
}

/** A validated Bestiary pick: the enemy with its Encounter and choice. */
export type ArenaPick = {
  enemyId: string;
  encounterId: string;
  choiceId: string;
};

/**
 * Validate a submitted enemy value against the Arena Scenario: the enemy
 * must be listed, its Encounter must exist and stage it, and the call scene
 * must offer its choice. Anything else is undefined (a forged value).
 */
export function parseArenaEnemy(
  value: string | undefined,
  scenario: Scenario,
): ArenaPick | undefined {
  const enemyId = (value ?? '').trim();
  if (enemyId === '') return undefined;
  const encounterId = arenaEncounterId(enemyId);
  if (scenario.enemiesById[enemyId] === undefined) return undefined;
  const encounter = scenario.encountersById[encounterId];
  if (encounter === undefined) return undefined;
  if (!encounter.participants.some((participant) => participant.enemy.id === enemyId)) {
    return undefined;
  }
  const scene = scenario.scenesById[ARENA_CALL_SCENE_ID];
  if (scene === undefined) return undefined;
  if (!scene.choices.some((choice) => choice.id === encounterId)) return undefined;
  return { enemyId, encounterId, choiceId: encounterId };
}

/** One Bestiary row for the setup screen, in Scenario order. */
export type ArenaBestiaryEntry = {
  id: string;
  name: string;
  description: string | undefined;
  might: number;
  agility: number;
  wits: number;
  presence: number;
  health: number;
  damage: number;
  reach: 'melee' | 'ranged';
  encounterId: string;
};

/** Every enemy of the Arena Scenario with its fight stats. */
export function arenaBestiary(scenario: Scenario): ArenaBestiaryEntry[] {
  return scenario.enemies.map((enemy) => ({
    id: enemy.id,
    name: enemy.name,
    description: enemy.description,
    might: enemy.attributes.might,
    agility: enemy.attributes.agility,
    wits: enemy.attributes.wits,
    presence: enemy.attributes.presence,
    health: enemy.health,
    damage: enemy.damage,
    reach: enemy.reach,
    encounterId: arenaEncounterId(enemy.id),
  }));
}

/** How a finished Arena fight ended, for the result screen. */
export type ArenaOutcome = 'victory' | 'escape' | 'death';

/** The state the outcome is derived from: status, ending and combat presence. */
export type ArenaOutcomeState = {
  status: 'active' | 'ended';
  endingId?: string;
  /** Present while a Combat runs; only its presence matters here. */
  activeCombat?: unknown;
};

/** A Journal row as read from the store: only type, step and payload matter. */
export type ArenaJournalRow = {
  type: string;
  step: number;
  payload: unknown;
};

/**
 * Derive the result-screen outcome: undefined while the Combat runs. Victory
 * and death both end the Playthrough, told apart by the reached Ending's
 * kind; an escape leaves the fight active at the pit with a `combat-end`
 * entry carrying how the Combat ended.
 */
export function arenaOutcomeKind(
  state: ArenaOutcomeState,
  scenario: Scenario,
  rows: readonly ArenaJournalRow[],
): ArenaOutcome | undefined {
  if (state.activeCombat != null) return undefined;
  if (state.status === 'ended') {
    const ending =
      state.endingId === undefined ? undefined : scenario.endingsById[state.endingId];
    return ending?.kind === 'victory' ? 'victory' : 'death';
  }
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row === undefined || row.type !== 'combat-end') continue;
    const howEnded = (row.payload as { howEnded?: unknown } | null | undefined)?.howEnded;
    if (howEnded === 'victory') return 'victory';
    if (howEnded === 'escape') return 'escape';
    return undefined;
  }
  return undefined;
}

/** The query the Arena fight page preserves across navigation. */
export type ArenaQuery = {
  notice?: string;
  /** The Combat target picker selection (`?target=`). It is not game state. */
  target?: string | null;
};

function arenaQueryString(query: ArenaQuery): string {
  const params = new URLSearchParams();
  if (query.notice === 'stale' || query.notice === 'unavailable') {
    params.set('notice', query.notice);
  }
  const target = query.target?.trim();
  if (target !== undefined && target !== '') params.set('target', target);
  return params.toString();
}

/** `/arena?fight=<id>` with the rejection notice and target preserved. */
export function arenaFightHref(fightId: string, query: ArenaQuery = {}): string {
  const base = `/arena?fight=${encodeURIComponent(fightId)}`;
  const suffix = arenaQueryString(query);
  return suffix === '' ? base : `${base}&${suffix}`;
}

/**
 * A target-picker link: the same fight carrying `?target=` while preserving
 * the transient notice. Following it changes no game state, advances no
 * `step` and appends no Journal entries.
 */
export function arenaTargetHref(
  fightId: string,
  targetId: string,
  query: Omit<ArenaQuery, 'target'> = {},
): string {
  return arenaFightHref(fightId, { ...query, target: targetId });
}
