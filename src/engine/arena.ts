// Arena mode: engine-level Combat testing without any authored Scenario,
// Encounter, Outcome or Ending (docs/spec/architecture.md, engine contract).
//
// An Arena Setup describes one fight directly: opponents with inline Enemy
// definitions, a Range per opponent, and a Character with Attributes, Health
// and Equipment. `startArena` turns a validated Setup into a running Combat;
// `applyArenaAction` is the public action entry point and resolves every Round
// with the same rules as Scenario Combat: Intent selection and the Round order
// are reused from `tactical.ts` (`selectIntents`, `orderActions`), and Range,
// Reach, hitting, Speed, preparation, Guarded/counterattack, Wary, Escape and
// Fall back follow docs/spec/mechanics.md unchanged.
//
// Combat end yields a plain Arena result (`arenaResult`: victory, death or
// escape) with no Scenario Ending or Outcome involved. Arena state carries
// `kind: 'arena'` and no Scenario, Encounter, Ending, Flag or inventory
// records, so it can never be stored as, or mistaken for, a PlaythroughState;
// this module owns no persistence and imports none.
//
// Name note: the Scenario Combat panel projection in `index.ts` is also called
// an "arena" (`CombatArenaView`). That projection renders one Encounter fight;
// this module is the Arena *mode*. The two share the tactical vocabulary but
// neither reads the other's state.
//
// Dice come from the injected random source, mirroring `crypto.randomInt(min,
// max)`: `min` inclusive, `max` exclusive. Production rolls each die with
// `randomInt(1, 7)`; tests pass a deterministic function.

import { z } from 'zod';
import type { CompiledParticipant } from '../content/model';
import type {
  CombatAction,
  CombatActionGroup,
  CombatArenaAction,
  CombatArenaOrderEntry,
  CombatArenaParticipant,
  CombatArenaTarget,
  CombatArenaView,
  CombatRoll,
  CombatStopReason,
  Rng,
  TacticalActionEvent,
  TacticalActor,
} from './index';
import { MAX_HEALTH, type IntentKind } from './state';
import {
  CHARACTER_ACTION_SPEED,
  INTENT_SPEED,
  intentInReach,
  orderActions,
  selectIntents,
  type QueuedAction,
  type SelectionParticipant,
  type Speed,
} from './tactical';

// ---------------------------------------------------------------------------
// The Arena Setup: what a fight is described by.
// ---------------------------------------------------------------------------

const arenaAttributesSchema = z.strictObject({
  might: z.number().int().min(0).max(3),
  agility: z.number().int().min(0).max(3),
  wits: z.number().int().min(0).max(3),
  presence: z.number().int().min(0).max(3),
});

export type ArenaAttributes = z.infer<typeof arenaAttributesSchema>;

const arenaEnemySchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  attributes: arenaAttributesSchema,
  health: z.number().int().min(1).max(30),
  damage: z.number().int().min(1).max(6),
  reach: z.enum(['melee', 'ranged']).default('melee'),
  behaviour: z.enum(['steady', 'heavy']).default('steady'),
});

export type ArenaEnemyDefinition = z.infer<typeof arenaEnemySchema>;

const arenaWeaponSchema = z
  .strictObject({
    damage: z.number().int().min(2).max(4),
    reach: z.enum(['melee', 'ranged']).default('melee'),
  })
  .refine(
    (weapon) => weapon.reach === 'melee' || weapon.damage <= 3,
    { message: 'A ranged weapon deals 2-3 Damage' },
  );

export type ArenaWeapon = z.infer<typeof arenaWeaponSchema>;

const arenaBonusesSchema = z.strictObject({
  might: z.number().int().min(0).max(2).optional(),
  agility: z.number().int().min(0).max(2).optional(),
  wits: z.number().int().min(0).max(2).optional(),
  presence: z.number().int().min(0).max(2).optional(),
});

const arenaCharacterSchema = z.strictObject({
  attributes: arenaAttributesSchema,
  /** Current Health, 1-12. Maximum Health is always 12 (MAX_HEALTH). */
  health: z.number().int().min(1).max(MAX_HEALTH),
  weapon: arenaWeaponSchema.optional(),
  /** Passive Equipment bonuses, each 0-2; the +2 cap holds by construction. */
  bonuses: arenaBonusesSchema.optional(),
});

export type ArenaCharacterDefinition = z.infer<typeof arenaCharacterSchema>;

const arenaOpponentSchema = z.strictObject({
  /** Identity within the Setup; defaults to `foe-<n>` by position. */
  id: z.string().trim().min(1).max(40).optional(),
  enemy: arenaEnemySchema,
  range: z.enum(['near', 'far']).default('far'),
});

export type ArenaOpponentDefinition = z.infer<typeof arenaOpponentSchema>;

/**
 * One Arena fight: a Character with Attributes, Health and Equipment, and one
 * or two opponents with their Enemy definitions and a Range each. At most 2
 * opponents (the mechanics limit); Attributes are 0-3 each with no sum limit:
 * the Arena deliberately allows extremes no Character Template could take.
 */
export const arenaSetupSchema = z.strictObject({
  character: arenaCharacterSchema,
  opponents: z.array(arenaOpponentSchema).min(1).max(2),
});

export type ArenaSetup = z.infer<typeof arenaSetupSchema>;

export type ArenaSetupIssue = {
  path: string;
  message: string;
};

export type ValidateArenaSetupResult =
  | { ok: true; setup: ArenaSetup }
  | { ok: false; issues: ArenaSetupIssue[] };

/**
 * Validate an Arena Setup: rejects more than 2 opponents and any out-of-range
 * Attribute, Health, Damage or weapon value. Draws no dice, reads no content.
 */
export function validateArenaSetup(input: unknown): ValidateArenaSetupResult {
  const parsed = arenaSetupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }
  // Two opponents sharing an id would be ambiguous targets: the mechanics
  // give each participant its own identity, so the Setup must too.
  const ids = parsed.data.opponents.map((opponent, index) => opponent.id ?? `foe-${index + 1}`);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    return {
      ok: false,
      issues: duplicates.map((id) => ({
        path: 'opponents',
        message: `Duplicate opponent id "${id}"`,
      })),
    };
  }
  return { ok: true, setup: parsed.data };
}

// ---------------------------------------------------------------------------
// Arena state: a running fight. Never a Playthrough.
// ---------------------------------------------------------------------------

export type ArenaOpponentState = {
  id: string;
  name: string;
  attributes: ArenaAttributes;
  maxHealth: number;
  damage: number;
  reach: 'melee' | 'ranged';
  behaviour: 'steady' | 'heavy';
  range: 'near' | 'far';
  damageTaken: number;
  prepared: boolean;
  intent: IntentKind;
  waryUntilRound?: number;
};

export type ArenaCharacterState = {
  attributes: ArenaAttributes;
  health: number;
  weapon?: ArenaWeapon;
  bonuses?: { might?: number; agility?: number; wits?: number; presence?: number };
};

/**
 * A running Arena fight. The `kind` discriminator and the absence of every
 * Playthrough field (Scenario, Location, Scene, Encounter records, Flags,
 * inventory, Ending) keep Arena runs out of the Session's Playthroughs by
 * construction: no store, reader or list can hold one.
 */
export type ArenaState = {
  kind: 'arena';
  status: 'active' | 'victory' | 'escape' | 'death';
  step: number;
  round: number;
  character: ArenaCharacterState;
  opponents: ArenaOpponentState[];
};

/** Effective Attributes: base plus Equipment bonuses (docs/spec/mechanics.md). */
function effectiveAttributes(state: ArenaState): ArenaAttributes {
  const { attributes, bonuses } = state.character;
  return {
    might: attributes.might + (bonuses?.might ?? 0),
    agility: attributes.agility + (bonuses?.agility ?? 0),
    wits: attributes.wits + (bonuses?.wits ?? 0),
    presence: attributes.presence + (bonuses?.presence ?? 0),
  };
}

/** The Character's attack Damage and Reach: the weapon's, or 2 / melee bare. */
function characterAttack(state: ArenaState): { damage: number; reach: 'melee' | 'ranged' } {
  const weapon = state.character.weapon;
  if (weapon !== undefined) return { damage: weapon.damage, reach: weapon.reach };
  return { damage: 2, reach: 'melee' };
}

/** Surviving opponents, in Setup order. */
function survivorsOf(state: ArenaState): ArenaOpponentState[] {
  return state.opponents.filter((opponent) => opponent.damageTaken < opponent.maxHealth);
}

/**
 * One opponent as presented in an Arena journal entry: its id, its Enemy name
 * and an ordinal — the 1-based position among opponents sharing the name, or
 * none when the name is unique. The ordinal tells two identical foes apart
 * without authored names; wording is presentation.
 */
function opponentRefOf(
  state: ArenaState,
  opponent: ArenaOpponentState,
): { opponentId: string; name: string; ordinal?: number } {
  const ordinal = ordinalOf(state, opponent);
  return ordinal === undefined
    ? { opponentId: opponent.id, name: opponent.name }
    : { opponentId: opponent.id, name: opponent.name, ordinal };
}

/** The 1-based position among same-named opponents; none when unique. */
function ordinalOf(state: ArenaState, opponent: ArenaOpponentState): number | undefined {
  const sameName = state.opponents.filter((candidate) => candidate.name === opponent.name);
  if (sameName.length <= 1) return undefined;
  return sameName.findIndex((candidate) => candidate.id === opponent.id) + 1;
}

/**
 * One opponent as an actor or target inside a Round's action events. The
 * Arena has no separate Enemy catalogue: each opponent is its own kind, so
 * both the participant and the Enemy id are the opponent id.
 */
function actorOf(state: ArenaState, opponent: ArenaOpponentState): TacticalActor {
  const ordinal = ordinalOf(state, opponent);
  return {
    kind: 'participant',
    participantId: opponent.id,
    enemyId: opponent.id,
    name: opponent.name,
    ...(ordinal === undefined ? {} : { ordinal }),
  };
}

/** Adapt an Arena opponent to the shared Intent selection input. */
function selectionEntry(opponent: ArenaOpponentState): SelectionParticipant {
  const participant: CompiledParticipant = {
    id: opponent.id,
    enemy: {
      id: opponent.id,
      name: opponent.name,
      attributes: { ...opponent.attributes },
      health: opponent.maxHealth,
      damage: opponent.damage,
      reach: opponent.reach,
      behaviour: opponent.behaviour,
    },
  };
  return { participant, range: opponent.range, prepared: opponent.prepared };
}

// ---------------------------------------------------------------------------
// Arena journal: structured events, no Interface Text.
// ---------------------------------------------------------------------------

export type ArenaJournalEntry =
  | {
      type: 'arena-start';
      opponents: { opponentId: string; name: string; ordinal?: number }[];
    }
  | {
      type: 'arena-round';
      round: number;
      /** Every action of the Round, in resolution order. */
      actions: TacticalActionEvent[];
      /** How the sequence stopped, if it did; absent on a continuing Round. */
      stop?: CombatStopReason;
    }
  | {
      type: 'arena-end';
      howEnded: 'victory' | 'escape';
    };

// ---------------------------------------------------------------------------
// Starting an Arena fight.
// ---------------------------------------------------------------------------

export type StartArenaResult = {
  state: ArenaState;
  journal: ArenaJournalEntry[];
};

/**
 * Turn a validated Setup into a running Combat: each opponent at its Setup
 * Range, round 1, step 0, and the first Round's Intents selected with the
 * shared selection rules. Nothing resolves and no die is drawn beyond what
 * Intent selection needs.
 */
export function startArena(setup: ArenaSetup, rng: Rng): StartArenaResult {
  const opponents: ArenaOpponentState[] = setup.opponents.map((definition, index) => ({
    id: definition.id ?? `foe-${index + 1}`,
    name: definition.enemy.name,
    attributes: { ...definition.enemy.attributes },
    maxHealth: definition.enemy.health,
    damage: definition.enemy.damage,
    reach: definition.enemy.reach,
    behaviour: definition.enemy.behaviour,
    range: definition.range,
    damageTaken: 0,
    prepared: false,
    intent: 'strike' as IntentKind,
  }));
  const state: ArenaState = {
    kind: 'arena',
    status: 'active',
    step: 0,
    round: 1,
    character: {
      attributes: { ...setup.character.attributes },
      health: setup.character.health,
      ...(setup.character.weapon !== undefined ? { weapon: { ...setup.character.weapon } } : {}),
      ...(setup.character.bonuses !== undefined ? { bonuses: { ...setup.character.bonuses } } : {}),
    },
    opponents,
  };
  const selection = selectIntents(opponents.map(selectionEntry), rng);
  for (const opponent of opponents) {
    opponent.intent = selection.intents[opponent.id] ?? 'strike';
    opponent.prepared = selection.prepared[opponent.id] ?? false;
  }
  return {
    state,
    journal: [
      {
        type: 'arena-start',
        opponents: opponents.map((opponent) => opponentRefOf(state, opponent)),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// The public action entry point: one Combat Round per call.
// ---------------------------------------------------------------------------

/** Character actions playable in the Arena: every Combat action. */
export type ArenaCombatAction = CombatAction;

export type ArenaAction = {
  action: ArenaCombatAction;
  /**
   * The target opponent id for a targeted action (attack, distract, advance).
   * With one surviving opponent it may be omitted and is then that opponent;
   * with two it is required. A missing, unknown or defeated target, or a
   * target on an action that takes none, is rejected.
   */
  targetId?: string;
  expectedStep: number;
};

export type ApplyArenaActionSuccess = {
  ok: true;
  state: ArenaState;
  journal: ArenaJournalEntry[];
};

export type ApplyArenaActionFailure = {
  ok: false;
  reason: 'stale-step' | 'illegal-action' | 'ended';
};

export type ApplyArenaActionResult = ApplyArenaActionSuccess | ApplyArenaActionFailure;

/** Character actions that name a target opponent. */
const TARGETED_ARENA_ACTIONS: ReadonlySet<ArenaCombatAction> = new Set([
  'attack',
  'advance',
  'distract',
]);

/**
 * One Arena Round (docs/spec/mechanics.md, rounds): the Character's action
 * takes its place in the order among the Round's committed Intents, and the
 * whole Round resolves in one atomic step. Speed order (fast, normal, slow),
 * then effective Agility (the Character wins ties; equal opponents use Setup
 * order). A defeated opponent's queued action is dropped while the Round
 * continues; defeating the last opponent, the Character's death, or a
 * successful Escape stops the sequence with later actions recorded as not
 * reached. A continuing Round increments the round number and `step` once and
 * selects the next Round's Intents; selection dice draw after the resolution
 * rolls, in Setup order.
 *
 * An Arena Setup carries no consumables, so `use-item` is rejected the way an
 * unavailable action is: nothing changes, `step` does not advance and no die
 * is drawn. Every other action resolves under the unchanged Combat rules.
 */
export function applyArenaAction(
  state: ArenaState,
  input: ArenaAction,
  rng: Rng,
): ApplyArenaActionResult {
  if (input.expectedStep !== state.step) {
    return { ok: false, reason: 'stale-step' };
  }
  if (state.status !== 'active') {
    return { ok: false, reason: 'ended' };
  }
  const { action: combatAction, targetId: submittedTarget } = input;
  const survivors = survivorsOf(state);

  // Target validation: a missing, unknown or defeated target, or a target on
  // an action that takes none, is rejected before anything resolves.
  let targetId = submittedTarget;
  if (targetId !== undefined && !TARGETED_ARENA_ACTIONS.has(combatAction)) {
    return { ok: false, reason: 'illegal-action' };
  }
  if (TARGETED_ARENA_ACTIONS.has(combatAction)) {
    if (targetId === undefined) {
      const only = survivors.length === 1 ? survivors[0] : undefined;
      if (only === undefined) {
        return { ok: false, reason: 'illegal-action' };
      }
      targetId = only.id;
    } else if (!survivors.some((opponent) => opponent.id === targetId)) {
      return { ok: false, reason: 'illegal-action' };
    }
  }
  const victim = targetId === undefined ? undefined : state.opponents.find(
    (opponent) => opponent.id === targetId,
  );
  if (targetId !== undefined && victim === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }

  const attack = characterAttack(state);
  if (combatAction === 'attack') {
    if (victim === undefined) {
      return { ok: false, reason: 'illegal-action' };
    }
    if (attack.reach === 'melee' && victim.range === 'far') {
      return { ok: false, reason: 'illegal-action' };
    }
  } else if (combatAction === 'defend') {
    // Defend is always available.
  } else if (combatAction === 'advance') {
    if (victim === undefined || victim.range === 'near') {
      return { ok: false, reason: 'illegal-action' };
    }
  } else if (combatAction === 'fall-back') {
    if (!survivors.some((opponent) => opponent.range === 'near')) {
      return { ok: false, reason: 'illegal-action' };
    }
  } else if (combatAction === 'use-item') {
    // An Arena Setup carries no consumables: always unavailable.
    return { ok: false, reason: 'illegal-action' };
  } else if (combatAction !== 'escape' && combatAction !== 'distract') {
    return { ok: false, reason: 'illegal-action' };
  }
  // Escape is always available. The +2 bonus is captured from the Round as
  // shown when the Character commits: when no surviving opponent was Near
  // then, an opponent that closes in earlier in the order does not remove it.
  const escapeBonus =
    combatAction === 'escape' && survivors.every((opponent) => opponent.range !== 'near') ? 2 : 0;

  const effective = effectiveAttributes(state);
  const characterRef: TacticalActor = { kind: 'character' };
  const round = state.round;
  const damageTaken: Record<string, number> = {};
  const ranges: Record<string, 'near' | 'far'> = {};
  const prepared: Record<string, boolean> = {};
  const waryUntil: Record<string, number | undefined> = {};
  for (const opponent of state.opponents) {
    damageTaken[opponent.id] = opponent.damageTaken;
    ranges[opponent.id] = opponent.range;
    prepared[opponent.id] = opponent.prepared;
    waryUntil[opponent.id] = opponent.waryUntilRound;
  }
  let health = state.character.health;

  const byId = new Map(state.opponents.map((opponent) => [opponent.id, opponent]));
  const opponentOf = (id: string): ArenaOpponentState => {
    const opponent = byId.get(id);
    if (opponent === undefined) throw new Error(`unknown opponent "${id}"`);
    return opponent;
  };
  const defeated = (id: string): boolean =>
    (damageTaken[id] ?? 0) >= opponentOf(id).maxHealth;
  const arenaDefeated = (): boolean => state.opponents.every((opponent) => defeated(opponent.id));

  /**
   * One roll: 2d6 plus the modifier against the base plus the defender's
   * Agility (Might for attacks, Wits for a Distract; 9 instead of 7 against a
   * Guarded Character). A miss deals no Damage.
   */
  const attackRoll = (
    side: 'character' | 'enemy',
    modifier: number,
    agility: number,
    damage: number,
    base = 7,
  ): CombatRoll => {
    const die1 = rng(1, 7);
    const die2 = rng(1, 7);
    const total = die1 + die2 + modifier;
    const target = base + agility;
    const hit = total >= target;
    return { side, die1, die2, modifier, total, target, hit, damage: hit ? damage : 0 };
  };

  // Commit. The Character's action takes its place in the order among the
  // Round's Intents. The order is fixed now; nothing during the Round
  // reorders it.
  const characterSpeed: Speed = CHARACTER_ACTION_SPEED[combatAction] ?? 'normal';
  const setupOrder = state.opponents.map((opponent) => opponent.id);
  const queued: QueuedAction[] = [
    { key: 'character', actor: 'character', speed: characterSpeed, agility: effective.agility },
    ...survivors.map(
      (opponent): QueuedAction => ({
        key: opponent.id,
        actor: 'participant',
        participantId: opponent.id,
        speed: INTENT_SPEED[opponent.intent],
        agility: opponent.attributes.agility,
      }),
    ),
  ];
  const ordered = orderActions(queued, setupOrder);

  if (combatAction === 'distract' && victim !== undefined) {
    // A Wary opponent cannot be distracted again: the attempt is rejected.
    if ((victim.waryUntilRound ?? 0) >= round) {
      return { ok: false, reason: 'illegal-action' };
    }
    // The target's Intent must come later in the Round's order than the
    // Distract. A fast Distract precedes every Intent, so this bar is
    // defensive; it stays explicit because the spec requires it.
    const distractPosition = ordered.findIndex((entry) => entry.actor === 'character');
    const targetPosition = ordered.findIndex((entry) => entry.participantId === victim.id);
    if (targetPosition <= distractPosition) {
      return { ok: false, reason: 'illegal-action' };
    }
  }

  // Resolve in order.
  const actions: TacticalActionEvent[] = [];
  let stop: CombatStopReason | undefined;
  // Guarded from Defend's execution until cleanup: attacks against the
  // Character use the guarded threshold. Round-scoped, never stored.
  let guarded = false;
  // At most one counterattack per Round: only the first missed melee attack
  // against the Guarded Character triggers it.
  let counterUsed = false;
  // Opponents whose Intent a successful Distract interrupted: cancelled at
  // their place in the order.
  const interrupted = new Set<string>();

  /** The given opponent as an actor or target of an action event. */
  function refOf(opponent: ArenaOpponentState): TacticalActor {
    return actorOf(state, opponent);
  }

  /** One opponent Intent at its place in the order. */
  function resolveOpponentAction(opponent: ArenaOpponentState, order: number): void {
    const actor = refOf(opponent);
    const intent = opponent.intent;
    const speed = INTENT_SPEED[intent];
    // Its actor was defeated earlier in the Round: the action is dropped.
    if (defeated(opponent.id)) {
      actions.push({ actor, kind: intent, speed, order, target: characterRef, status: 'dropped' });
      return;
    }
    // A successful Distract interrupted its Intent: cancelled at its place in
    // the order, never replaced. Only a Heavy attack builds on a stored
    // preparation (selection keeps `prepared` only with that Intent, and a
    // fast Distract resolves before any Prepare executes), so only its
    // cancellation clears — and reports — one.
    if (interrupted.has(opponent.id)) {
      if (intent === 'heavy-attack') {
        prepared[opponent.id] = false;
      }
      actions.push({
        actor,
        kind: intent,
        speed,
        order,
        target: characterRef,
        status: 'cancelled',
        cancelReason: 'interrupted',
        ...(intent === 'heavy-attack' ? { prepared: false } : {}),
      });
      return;
    }
    const range = ranges[opponent.id] ?? 'far';
    if (intent === 'close-in') {
      if (range === 'near') {
        actions.push({
          actor, kind: intent, speed, order, target: characterRef,
          status: 'cancelled', cancelReason: 'already-near',
        });
      } else {
        ranges[opponent.id] = 'near';
        actions.push({
          actor, kind: intent, speed, order, target: characterRef,
          status: 'executed', rangeBefore: 'far', rangeAfter: 'near',
        });
      }
      return;
    }
    if (intent === 'prepare') {
      prepared[opponent.id] = true;
      actions.push({
        actor, kind: intent, speed, order, target: characterRef,
        status: 'executed', prepared: true,
      });
      return;
    }
    // Strike and Heavy attack. The Heavy attack is slow and deals base Damage
    // +3. Its miss or Reach cancellation clears the preparation it builds on.
    const heavy = intent === 'heavy-attack';
    const damage = opponent.damage + (heavy ? 3 : 0);
    if (!intentInReach(opponent.reach, range)) {
      if (heavy) {
        prepared[opponent.id] = false;
      }
      actions.push({
        actor, kind: intent, speed, order, target: characterRef,
        status: 'cancelled', cancelReason: 'out-of-reach',
        ...(heavy ? { prepared: false } : {}),
      });
      return;
    }
    // Attacks against the Guarded Character need 9 + Agility instead of 7.
    const roll = attackRoll('enemy', opponent.attributes.might, effective.agility, damage, guarded ? 9 : 7);
    if (roll.hit) {
      health -= damage;
    }
    if (heavy) {
      prepared[opponent.id] = false;
    }
    const event: TacticalActionEvent = {
      actor, kind: intent, speed, order, target: characterRef,
      status: 'executed', roll, damage: roll.hit ? damage : 0,
      ...(heavy ? { prepared: false } : {}),
    };
    // The first melee attack in the Round that misses the Guarded Character
    // triggers the counterattack reaction: the Character's hit roll against
    // that attacker for 1 Damage. Ranged misses trigger none, later misses
    // trigger none, and the reaction triggers no further reaction.
    if (!roll.hit && guarded && !counterUsed && opponent.reach === 'melee') {
      counterUsed = true;
      const counterRoll = attackRoll('character', effective.might, opponent.attributes.agility, 1);
      let counterDefeated: string[] | undefined;
      if (counterRoll.hit) {
        damageTaken[opponent.id] = (damageTaken[opponent.id] ?? 0) + 1;
        if (defeated(opponent.id)) {
          counterDefeated = [opponent.id];
        }
      }
      event.counter = {
        roll: counterRoll,
        damage: counterRoll.hit ? 1 : 0,
        ...(counterDefeated !== undefined ? { defeatedParticipants: counterDefeated } : {}),
      };
      if (counterDefeated !== undefined && arenaDefeated()) {
        stop = 'victory';
      }
    }
    if (roll.hit && health <= 0) {
      event.characterDefeated = true;
      stop = 'death';
    }
    actions.push(event);
  }

  /** Defend at its place in the order: no roll. The Character is Guarded now. */
  function resolveDefend(order: number): void {
    guarded = true;
    actions.push({
      actor: characterRef, kind: 'defend', speed: 'fast', order,
      status: 'executed', guarded: true,
    });
  }

  /** Distract at its place in the order: a Wits roll against the target. */
  function resolveDistract(target: ArenaOpponentState, order: number): void {
    const ref = refOf(target);
    // Cancelled when the target has been defeated.
    if (defeated(target.id)) {
      actions.push({
        actor: characterRef, kind: 'distract', speed: 'fast', order, target: ref,
        status: 'cancelled', cancelReason: 'target-defeated',
      });
      return;
    }
    const roll = attackRoll('character', effective.wits, target.attributes.wits, 0);
    if (!roll.hit) {
      // Failure has no effect: no interruption, no Wary, no prepared change.
      actions.push({
        actor: characterRef, kind: 'distract', speed: 'fast', order, target: ref,
        status: 'executed', roll, damage: 0,
      });
      return;
    }
    // Success interrupts the announced Intent (cancelled at its place in the
    // order), clears the preparation it builds on, and makes the target Wary
    // until the end of the next Round. Only a Heavy attack carries a stored
    // preparation into the Round, so only its interruption reports one cleared.
    interrupted.add(target.id);
    const wasPrepared = prepared[target.id] ?? false;
    if (wasPrepared) {
      prepared[target.id] = false;
    }
    waryUntil[target.id] = round + 1;
    actions.push({
      actor: characterRef, kind: 'distract', speed: 'fast', order, target: ref,
      status: 'executed', roll, damage: 0,
      ...(wasPrepared ? { prepared: false } : {}),
      waryUntilRound: round + 1,
    });
  }

  /** The Character's Attack at its place in the order. */
  function resolveAttack(order: number): void {
    if (victim === undefined) {
      throw new Error('attack committed without a target');
    }
    const ref = refOf(victim);
    // Cancelled when the target has been defeated, or the Character's Reach no
    // longer allows it at the Range to the target.
    if (defeated(victim.id)) {
      actions.push({
        actor: characterRef, kind: 'attack', speed: 'normal', order, target: ref,
        status: 'cancelled', cancelReason: 'target-defeated',
      });
      return;
    }
    const currentRange = ranges[victim.id] ?? 'far';
    if (attack.reach === 'melee' && currentRange === 'far') {
      actions.push({
        actor: characterRef, kind: 'attack', speed: 'normal', order, target: ref,
        status: 'cancelled', cancelReason: 'out-of-reach',
      });
      return;
    }
    const roll = attackRoll('character', effective.might, victim.attributes.agility, attack.damage);
    let defeatedParticipants: string[] | undefined;
    if (roll.hit) {
      damageTaken[victim.id] = (damageTaken[victim.id] ?? 0) + attack.damage;
      if (defeated(victim.id)) {
        defeatedParticipants = [victim.id];
      }
    }
    actions.push({
      actor: characterRef, kind: 'attack', speed: 'normal', order, target: ref,
      status: 'executed', roll, damage: roll.hit ? attack.damage : 0,
      ...(defeatedParticipants !== undefined ? { defeatedParticipants } : {}),
    });
    if (defeatedParticipants !== undefined && arenaDefeated()) {
      stop = 'victory';
    }
  }

  /** Opponents still standing at this place in the order. */
  function currentSurvivors(): ArenaOpponentState[] {
    return survivors.filter((opponent) => !defeated(opponent.id));
  }

  /** The Character's Advance at its place in the order: no roll. */
  function resolveAdvance(order: number): void {
    if (victim === undefined) {
      throw new Error('advance committed without a target');
    }
    const ref = refOf(victim);
    // Cancelled when the target has been defeated, or a faster Close in has
    // already made the Range Near. The Round is spent, not replaced.
    if (defeated(victim.id)) {
      actions.push({
        actor: characterRef, kind: 'advance', speed: characterSpeed, order, target: ref,
        status: 'cancelled', cancelReason: 'target-defeated',
      });
      return;
    }
    if ((ranges[victim.id] ?? 'far') === 'near') {
      actions.push({
        actor: characterRef, kind: 'advance', speed: characterSpeed, order, target: ref,
        status: 'cancelled', cancelReason: 'already-near',
      });
      return;
    }
    // Only the targeted Far lane moves; every other Range is untouched.
    ranges[victim.id] = 'near';
    actions.push({
      actor: characterRef, kind: 'advance', speed: characterSpeed, order, target: ref,
      status: 'executed', rangeBefore: 'far', rangeAfter: 'near',
    });
  }

  /** The Character's Fall back at its place in the order: slow, one roll. */
  function resolveFallBack(order: number): void {
    // Cancelled when no surviving opponent is Near at this place in the order.
    // The opposing Agility is read now, from the currently Near survivors, so
    // an opponent defeated earlier no longer opposes.
    const near = currentSurvivors().filter((opponent) => (ranges[opponent.id] ?? 'far') === 'near');
    if (near.length === 0) {
      actions.push({
        actor: characterRef, kind: 'fall-back', speed: characterSpeed, order,
        status: 'cancelled', cancelReason: 'none-near',
      });
      return;
    }
    const opposing = Math.max(...near.map((opponent) => opponent.attributes.agility));
    const die1 = rng(1, 7);
    const die2 = rng(1, 7);
    const total = die1 + die2 + effective.agility;
    const target = 7 + opposing;
    const success = total >= target;
    const roll: CombatRoll = {
      side: 'character', die1, die2, modifier: effective.agility,
      total, target, hit: success, damage: 0,
    };
    if (!success) {
      actions.push({
        actor: characterRef, kind: 'fall-back', speed: characterSpeed, order,
        status: 'executed', roll, damage: 0,
      });
      return;
    }
    // Success moves every Near lane to Far — including a later melee Heavy
    // attack's lane, which then cancels as out of Reach at its own place in
    // the order. Earlier normal actions already resolved and are unaffected.
    for (const opponent of near) {
      ranges[opponent.id] = 'far';
    }
    actions.push({
      actor: characterRef, kind: 'fall-back', speed: characterSpeed, order,
      status: 'executed', roll, damage: 0, rangeBefore: 'near', rangeAfter: 'far',
    });
  }

  /** The Character's Escape at its place in the order: never cancelled. */
  function resolveEscape(order: number): void {
    // The opposing Agility is read now, from the current survivors, while the
    // +2 bonus was captured at commitment from the Round as shown then.
    const alive = currentSurvivors();
    const opposing = alive.length === 0 ? 0 : Math.max(...alive.map((opponent) => opponent.attributes.agility));
    const die1 = rng(1, 7);
    const die2 = rng(1, 7);
    const modifier = effective.agility + escapeBonus;
    const total = die1 + die2 + modifier;
    const target = 7 + opposing;
    const success = total >= target;
    const roll: CombatRoll = {
      side: 'character', die1, die2, modifier, total, target, hit: success, damage: 0,
    };
    actions.push({
      actor: characterRef, kind: 'escape', speed: characterSpeed, order,
      status: 'executed', roll, damage: 0,
    });
    if (success) {
      stop = 'escape';
    }
  }

  /** The Character's action at its place in the order. */
  function resolveCharacterAction(order: number): void {
    if (combatAction === 'advance') {
      resolveAdvance(order);
    } else if (combatAction === 'fall-back') {
      resolveFallBack(order);
    } else if (combatAction === 'escape') {
      resolveEscape(order);
    } else if (combatAction === 'defend') {
      resolveDefend(order);
    } else if (combatAction === 'distract') {
      if (victim !== undefined) {
        resolveDistract(victim, order);
      }
    } else {
      resolveAttack(order);
    }
  }

  ordered.forEach((queuedAction, index) => {
    const order = index + 1;
    if (queuedAction.actor === 'participant') {
      const opponent =
        queuedAction.participantId === undefined ? undefined : byId.get(queuedAction.participantId);
      if (opponent === undefined) {
        return;
      }
      // The sequence stopped earlier: later actions are recorded as not
      // reached. Otherwise the Intent resolves as announced or is cancelled;
      // it is never swapped for another action.
      if (stop !== undefined) {
        actions.push({
          actor: refOf(opponent), kind: opponent.intent, speed: INTENT_SPEED[opponent.intent],
          order, target: characterRef, status: 'not-reached',
        });
        return;
      }
      resolveOpponentAction(opponent, order);
      return;
    }
    if (stop !== undefined) {
      actions.push({
        actor: characterRef, kind: combatAction, speed: characterSpeed, order,
        ...(victim === undefined ? {} : { target: refOf(victim) }),
        status: 'not-reached',
      });
      return;
    }
    resolveCharacterAction(order);
  });

  // Character death ends the fight: no cleanup selection, no remaining
  // actions, no Ending — the plain death result.
  if (stop === 'death') {
    const ended: ArenaState = {
      ...state,
      status: 'death',
      step: state.step + 1,
      character: { ...state.character, health: 0 },
      opponents: state.opponents.map((opponent) => ({
        ...opponent,
        range: ranges[opponent.id] ?? opponent.range,
        damageTaken: damageTaken[opponent.id] ?? opponent.damageTaken,
        prepared: prepared[opponent.id] ?? false,
        ...(waryUntil[opponent.id] !== undefined ? { waryUntilRound: waryUntil[opponent.id] } : {}),
      })),
    };
    return {
      ok: true,
      state: ended,
      journal: [{ type: 'arena-round', round, actions, stop }],
    };
  }

  // Victory ends the fight: no cleanup selection, no remaining actions, no
  // Outcome — the plain victory result.
  if (stop === 'victory') {
    const ended: ArenaState = {
      ...state,
      status: 'victory',
      step: state.step + 1,
      character: { ...state.character, health },
      opponents: state.opponents.map((opponent) => ({
        ...opponent,
        range: ranges[opponent.id] ?? opponent.range,
        damageTaken: damageTaken[opponent.id] ?? opponent.damageTaken,
        prepared: false,
        ...(waryUntil[opponent.id] !== undefined ? { waryUntilRound: waryUntil[opponent.id] } : {}),
      })),
    };
    return {
      ok: true,
      state: ended,
      journal: [
        { type: 'arena-round', round, actions, stop },
        { type: 'arena-end', howEnded: 'victory' },
      ],
    };
  }

  // A successful Escape ends the fight: later actions do not resolve, no next
  // Intents are selected, no Outcome — the plain escape result.
  if (stop === 'escape') {
    const ended: ArenaState = {
      ...state,
      status: 'escape',
      step: state.step + 1,
      character: { ...state.character, health },
      opponents: state.opponents.map((opponent) => ({
        ...opponent,
        range: ranges[opponent.id] ?? opponent.range,
        damageTaken: damageTaken[opponent.id] ?? opponent.damageTaken,
        prepared: false,
        ...(waryUntil[opponent.id] !== undefined ? { waryUntilRound: waryUntil[opponent.id] } : {}),
      })),
    };
    return {
      ok: true,
      state: ended,
      journal: [
        { type: 'arena-round', round, actions, stop },
        { type: 'arena-end', howEnded: 'escape' },
      ],
    };
  }

  // A continuing Round: the round number and `step` increment once,
  // round-scoped effects expire, then the current Setup order of the survivors
  // is captured and their next Intents are selected and stored. Selection dice
  // draw here, after the resolution rolls, in Setup order.
  const nextRound = round + 1;
  const remaining = state.opponents.filter((opponent) => !defeated(opponent.id));
  const selection = selectIntents(
    remaining.map((opponent) => ({
      participant: selectionEntry({ ...opponent, range: ranges[opponent.id] ?? opponent.range, prepared: prepared[opponent.id] ?? false }).participant,
      range: ranges[opponent.id] ?? opponent.range,
      prepared: prepared[opponent.id] ?? false,
    })),
    rng,
  );
  const next: ArenaState = {
    ...state,
    step: state.step + 1,
    round: nextRound,
    character: { ...state.character, health },
    opponents: state.opponents.map((opponent) => {
      if (defeated(opponent.id)) {
        return {
          ...opponent,
          range: ranges[opponent.id] ?? opponent.range,
          damageTaken: damageTaken[opponent.id] ?? opponent.damageTaken,
          prepared: false,
        };
      }
      const record: ArenaOpponentState = {
        ...opponent,
        range: ranges[opponent.id] ?? opponent.range,
        damageTaken: damageTaken[opponent.id] ?? opponent.damageTaken,
        prepared: selection.prepared[opponent.id] ?? false,
        intent: selection.intents[opponent.id] ?? 'strike',
      };
      // Wary outlasts the step: it lasts until the end of the next Round,
      // including Wary a successful Distract applied this Round.
      const until = waryUntil[opponent.id];
      if (until !== undefined && until >= nextRound) {
        record.waryUntilRound = until;
      }
      return record;
    }),
  };
  return { ok: true, state: next, journal: [{ type: 'arena-round', round, actions }] };
}

// ---------------------------------------------------------------------------
// Availability and result: what the fight offers and how it ended.
// ---------------------------------------------------------------------------

/** Why an Arena action is unavailable. */
export type ArenaDisabledReason =
  | 'already-near'
  | 'already-far'
  | 'needs-near'
  | 'wary';

export type ArenaAvailability = {
  id: Exclude<ArenaCombatAction, 'use-item'>;
  enabled: boolean;
  reason?: ArenaDisabledReason;
};

/**
 * Whether each Character action is available in the current fight. There are
 * no consumable entries: an Arena Setup carries no consumables. The entry
 * point rejects unavailable actions independently.
 */
export function arenaActions(state: ArenaState): ArenaAvailability[] {
  if (state.status !== 'active') {
    return [];
  }
  const survivors = survivorsOf(state);
  const attack = characterAttack(state);
  const inReach =
    attack.reach === 'ranged' || survivors.some((opponent) => opponent.range === 'near');
  const anyFar = survivors.some((opponent) => opponent.range === 'far');
  const anyNear = survivors.some((opponent) => opponent.range === 'near');
  const distractable = survivors.some(
    (opponent) => (opponent.waryUntilRound ?? 0) < state.round,
  );
  return [
    { id: 'advance', enabled: anyFar, ...(anyFar ? {} : { reason: 'already-near' as const }) },
    { id: 'fall-back', enabled: anyNear, ...(anyNear ? {} : { reason: 'already-far' as const }) },
    { id: 'attack', enabled: inReach, ...(inReach ? {} : { reason: 'needs-near' as const }) },
    { id: 'defend', enabled: true },
    { id: 'distract', enabled: distractable, ...(distractable ? {} : { reason: 'wary' as const }) },
    { id: 'escape', enabled: true },
  ];
}

/** How an Arena fight ended: the plain result, with no Ending or Outcome. */
export type ArenaResult = {
  outcome: 'victory' | 'escape' | 'death';
  /** The round the fight ended on. */
  rounds: number;
};

/**
 * The fight's result: undefined while it runs, the plain outcome once it
 * ends. A result carries no Scenario Ending id and no Outcome — there is
 * nothing to apply after it.
 */
export function arenaResult(state: ArenaState): ArenaResult | undefined {
  if (state.status === 'active') {
    return undefined;
  }
  return { outcome: state.status, rounds: state.round };
}

// ---------------------------------------------------------------------------
// Arena view: what the fight shows. A pure projection over the running fight
// for the Arena page (issue #166): lanes, legal targets, reason codes,
// thresholds, Speed and predicted order positions, badges and preparation
// descriptions. No RNG, no mutation, no Journal — mirroring the Scenario
// Combat arena projection (`combatArena` in `index.ts`) over Arena state, so
// the Arena page renders the existing Combat presentation unchanged.
// ---------------------------------------------------------------------------

/** The action group of every Character action playable in the Arena. */
const ARENA_ACTION_GROUP: Record<Exclude<ArenaCombatAction, 'use-item'>, CombatActionGroup> = {
  advance: 'position',
  'fall-back': 'position',
  attack: 'fight',
  defend: 'fight',
  distract: 'fight',
  escape: 'leave',
};

/**
 * Derive the Arena view from the running fight. Pure: no RNG, no mutation, no
 * Journal. Returns undefined once the fight has ended; the result screen reads
 * `arenaResult` instead.
 */
export function arenaView(state: ArenaState): CombatArenaView | undefined {
  if (state.status !== 'active') {
    return undefined;
  }
  const effective = effectiveAttributes(state);
  const attack = characterAttack(state);
  const survivors = survivorsOf(state);
  const setupOrder = state.opponents.map((opponent) => opponent.id);

  // The Intents' places among themselves, in resolution order.
  const intentQueued: QueuedAction[] = survivors.map(
    (opponent): QueuedAction => ({
      key: opponent.id,
      actor: 'participant',
      participantId: opponent.id,
      speed: INTENT_SPEED[opponent.intent],
      agility: opponent.attributes.agility,
    }),
  );
  const intentOrdered = orderActions(intentQueued, setupOrder);
  const intentPosition = new Map(
    intentOrdered.map((queued, index) => [queued.participantId ?? '', index + 1]),
  );

  /** The predicted place of a Character action with itself among the Intents. */
  const predictOrder = (speed: Speed): number => {
    const queued: QueuedAction[] = [
      ...intentQueued,
      { key: 'character', actor: 'character', speed, agility: effective.agility },
    ];
    const ordered = orderActions(queued, setupOrder);
    return ordered.findIndex((queuedAction) => queuedAction.actor === 'character') + 1;
  };

  const refOf = (opponent: ArenaOpponentState): { name: string; ordinal?: number } => {
    const ordinal = ordinalOf(state, opponent);
    return ordinal === undefined ? { name: opponent.name } : { name: opponent.name, ordinal };
  };

  const participants: CombatArenaParticipant[] = state.opponents.map((opponent) => {
    const ref = refOf(opponent);
    const defeated = opponent.damageTaken >= opponent.maxHealth;
    if (defeated) {
      return {
        participantId: opponent.id,
        enemyId: opponent.id,
        ...ref,
        defeated: true,
        health: 0,
        maxHealth: opponent.maxHealth,
        damage: opponent.damage,
        reach: opponent.reach,
        prepared: false,
      };
    }
    const isAttack = opponent.intent === 'strike' || opponent.intent === 'heavy-attack';
    const wary =
      opponent.waryUntilRound !== undefined && opponent.waryUntilRound >= state.round;
    return {
      participantId: opponent.id,
      enemyId: opponent.id,
      ...ref,
      defeated: false,
      range: opponent.range,
      health: Math.max(0, opponent.maxHealth - opponent.damageTaken),
      maxHealth: opponent.maxHealth,
      damage: opponent.damage,
      reach: opponent.reach,
      intent: opponent.intent,
      intentSpeed: INTENT_SPEED[opponent.intent],
      order: intentPosition.get(opponent.id) ?? 0,
      ...(isAttack
        ? {
            threshold: 7 + effective.agility,
            guardedThreshold: 9 + effective.agility,
          }
        : {}),
      prepared: opponent.prepared,
      ...(wary && opponent.waryUntilRound !== undefined
        ? { waryUntilRound: opponent.waryUntilRound }
        : {}),
      ...(opponent.intent === 'prepare' || opponent.prepared
        ? {
            preparation: {
              kind: 'heavy-attack' as const,
              speed: INTENT_SPEED['heavy-attack'],
              damage: opponent.damage + 3,
            },
          }
        : {}),
    };
  });

  const order: CombatArenaOrderEntry[] = intentOrdered.flatMap((queued) => {
    const opponent =
      queued.participantId === undefined
        ? undefined
        : state.opponents.find((candidate) => candidate.id === queued.participantId);
    if (opponent === undefined) {
      return [];
    }
    return [
      {
        participantId: opponent.id,
        ...refOf(opponent),
        intent: opponent.intent,
        speed: INTENT_SPEED[opponent.intent],
        order: intentPosition.get(opponent.id) ?? 0,
      },
    ];
  });

  const legalTargets = survivors.map((opponent) => opponent.id);
  const nearSurvivors = survivors.filter((opponent) => opponent.range === 'near');
  const allFar =
    survivors.length > 0 && survivors.every((opponent) => opponent.range !== 'near');
  const opposingAll =
    survivors.length === 0
      ? 0
      : Math.max(...survivors.map((opponent) => opponent.attributes.agility));
  const opposingNear = Math.max(
    0,
    ...nearSurvivors.map((opponent) => opponent.attributes.agility),
  );

  const availability = arenaActions(state);
  const actions: CombatArenaAction[] = availability.map((entry) => {
    const speed = CHARACTER_ACTION_SPEED[entry.id];
    const base = { ...entry, group: ARENA_ACTION_GROUP[entry.id], speed, order: predictOrder(speed) };
    if (entry.id === 'attack') {
      return {
        ...base,
        targets: survivors.map(
          (opponent): CombatArenaTarget => {
            const reachable = attack.reach === 'ranged' || opponent.range === 'near';
            return {
              participantId: opponent.id,
              ...refOf(opponent),
              range: opponent.range,
              enabled: reachable,
              ...(reachable ? {} : { reason: 'needs-near' as const }),
              threshold: 7 + opponent.attributes.agility,
            };
          },
        ),
      };
    }
    if (entry.id === 'distract') {
      return {
        ...base,
        targets: survivors.map(
          (opponent): CombatArenaTarget => {
            const wary = (opponent.waryUntilRound ?? 0) >= state.round;
            return {
              participantId: opponent.id,
              ...refOf(opponent),
              range: opponent.range,
              enabled: !wary,
              ...(wary ? { reason: 'wary' as const } : {}),
              threshold: 7 + opponent.attributes.wits,
            };
          },
        ),
      };
    }
    if (entry.id === 'advance') {
      return {
        ...base,
        targets: survivors.map(
          (opponent): CombatArenaTarget => {
            const advanceable = opponent.range === 'far';
            return {
              participantId: opponent.id,
              ...refOf(opponent),
              range: opponent.range,
              enabled: advanceable,
              ...(advanceable ? {} : { reason: 'already-near' as const }),
            };
          },
        ),
      };
    }
    if (entry.id === 'fall-back') {
      return {
        ...base,
        ...(nearSurvivors.length === 0 ? {} : { threshold: 7 + opposingNear }),
      };
    }
    if (entry.id === 'escape') {
      return {
        ...base,
        threshold: 7 + opposingAll,
        escapeBonus: allFar ? 2 : 0,
      };
    }
    return base;
  });

  return {
    encounterId: 'arena',
    round: state.round,
    participants,
    legalTargets,
    order,
    actions,
    guarded: false,
  };
}
