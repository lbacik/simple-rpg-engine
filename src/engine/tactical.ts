// Pure tactical Combat rules shared by Round resolution (issue #120) and the
// deterministic v1 migration (issue #124): Intent selection, Speed and the
// Round order. This module owns no state shape and draws dice only through
// the injected random source.
//
// Selection (docs/spec/mechanics.md, selecting Intents): at the start of a
// Combat and at the end of each Round, the surviving participants select
// their Intents in participant order, each taking the first rule that
// applies: prepared (a Heavy attack in Reach), out of Reach (a melee Enemy at
// Far closes in), preparing (a heavy Enemy draws one die: Prepare on 1-2,
// unless another participant is prepared or has selected Prepare in this same
// selection), else Strike. At most one Heavy attack is ever in preparation,
// and a disallowed second Prepare consumes no die. Only the preparing rule
// uses randomness, drawn in participant order after the Round's resolution
// rolls. The migration reuses this selection with the Prepare draw disabled,
// so a carried-over Combat's first Intents need no randomness.

import type { CompiledParticipant } from '../content/model';
import type { Rng } from './index';
import type { IntentKind } from './state';

/** Every Character action and Intent Speed (docs/spec/mechanics.md, rounds). */
export type Speed = 'fast' | 'normal' | 'slow';

export const INTENT_SPEED: Record<IntentKind, Speed> = {
  strike: 'normal',
  'close-in': 'normal',
  prepare: 'normal',
  'heavy-attack': 'slow',
};

/** Character action Speeds (docs/spec/mechanics.md, character actions). */
export const CHARACTER_ACTION_SPEED: Record<string, Speed> = {
  defend: 'fast',
  distract: 'fast',
  attack: 'normal',
  advance: 'normal',
  'use-item': 'normal',
  escape: 'normal',
  'fall-back': 'slow',
};

const SPEED_RANK: Record<Speed, number> = {
  fast: 0,
  normal: 1,
  slow: 2,
};

/** One participant's selection input: current Range and prepared state. */
export type SelectionParticipant = {
  participant: CompiledParticipant;
  range: 'near' | 'far';
  prepared: boolean;
};

export type SelectIntentsOptions = {
  /**
   * Rule 3 draws one die per heavy participant. The v1 migration disables the
   * draw: a carried-over Combat's first Intents select Close in/Strike
   * deterministically, unprepared. Defaults to true.
   */
  allowPrepareDraw?: boolean;
};

export type SelectIntentsResult = {
  /** The selected Intent kind per participant id, in selection order. */
  intents: Record<string, IntentKind>;
  /**
   * Prepared state after selection: rule 1 keeps it, rule 1's fallback clears
   * it when the Heavy attack would be out of Reach, everything else leaves it
   * (Prepare sets it when it resolves, not when it is selected).
   */
  prepared: Record<string, boolean>;
};

/**
 * Select each surviving participant's Intent in participant (content) order.
 * Dice come from the injected source, in that order, only where rule 3 needs
 * them. Pure: no state is read or written.
 */
export function selectIntents(
  survivors: SelectionParticipant[],
  rng: Rng,
  options: SelectIntentsOptions = {},
): SelectIntentsResult {
  const allowPrepareDraw = options.allowPrepareDraw ?? true;
  const intents: Record<string, IntentKind> = {};
  const prepared: Record<string, boolean> = {};
  // At most one Heavy attack is ever in preparation: a participant that is
  // already prepared, or that selects Prepare in this same selection, blocks
  // every later preparing draw (which then consumes no die).
  let heavyTaken = survivors.some((entry) => entry.prepared);
  let prepareSelected = false;
  for (const [index, entry] of survivors.entries()) {
    const { participant } = entry;
    const enemy = participant.enemy;
    // Rule 1: prepared. A Heavy attack in Reach is selected; otherwise the
    // prepared state ends and selection continues with rule 2. Clearing the
    // state unblocks a later preparing draw: only another participant that is
    // still prepared, or that has selected Prepare in this same selection,
    // keeps the block.
    if (entry.prepared) {
      if (heavyInReach(enemy.reach, entry.range)) {
        intents[participant.id] = 'heavy-attack';
        prepared[participant.id] = true;
        continue;
      }
      prepared[participant.id] = false;
      heavyTaken =
        prepareSelected ||
        survivors.some(
          (other, otherIndex) =>
            other.participant.id !== participant.id &&
            (otherIndex < index ? (prepared[other.participant.id] ?? false) : other.prepared),
        );
    } else {
      prepared[participant.id] = false;
    }
    // Rule 2: out of Reach. A melee Enemy at Far closes in (a ranged Enemy
    // never moves).
    if (enemy.reach === 'melee' && entry.range === 'far') {
      intents[participant.id] = 'close-in';
      continue;
    }
    // Rule 3: preparing. A heavy Enemy draws one die: Prepare on 1-2, unless
    // another participant is prepared or has selected Prepare in this same
    // selection (then it draws nothing and goes on to rule 4).
    if (enemy.behaviour === 'heavy' && allowPrepareDraw && !heavyTaken) {
      const drawn = rng(1, 7);
      if (drawn <= 2) {
        intents[participant.id] = 'prepare';
        prepareSelected = true;
        heavyTaken = true;
        continue;
      }
    }
    // Rule 4: Strike.
    intents[participant.id] = 'strike';
  }
  return { intents, prepared };
}

/** A prepared Heavy attack is selected only when in Reach at the Range. */
function heavyInReach(reach: 'melee' | 'ranged', range: 'near' | 'far'): boolean {
  return reach === 'ranged' || range === 'near';
}

/** An Intent's attack Reach allows it at the Range (Strike, Heavy attack). */
export function intentInReach(
  reach: 'melee' | 'ranged',
  range: 'near' | 'far',
): boolean {
  return heavyInReach(reach, range);
}

// ---------------------------------------------------------------------------
// The Round order.
// ---------------------------------------------------------------------------

/** One queued action awaiting resolution, in commitment order. */
export type QueuedAction = {
  key: string;
  actor: 'character' | 'participant';
  /** Participant id for Enemy actions; undefined for the Character. */
  participantId?: string;
  speed: Speed;
  /** Effective Agility (the Character's) or Agility (an Enemy's). */
  agility: number;
};

function compareSpeedThenAgility(
  left: QueuedAction,
  right: QueuedAction,
  savedOrder: readonly string[],
): number {
  const speed = SPEED_RANK[left.speed] - SPEED_RANK[right.speed];
  if (speed !== 0) return speed;
  if (left.agility !== right.agility) return right.agility - left.agility;
  // Ties: the Character acts before an Enemy with equal Agility. Enemy
  // participants with equal Agility act in the participant order saved when
  // this Round's Intents were selected. Nothing is rolled for order.
  if (left.actor === 'character' && right.actor !== 'character') return -1;
  if (right.actor === 'character' && left.actor !== 'character') return 1;
  if (left.actor === 'participant' && right.actor === 'participant') {
    const leftIndex = savedOrder.indexOf(left.participantId ?? '');
    const rightIndex = savedOrder.indexOf(right.participantId ?? '');
    return leftIndex - rightIndex;
  }
  return 0;
}

/**
 * The Round's resolution order: fast precedes normal precedes slow; higher
 * Agility precedes lower within a Speed; the Character wins equal-Agility
 * ties; equal Enemies use the saved participant order. Fixed when the
 * Character commits: nothing during the Round reorders it. Stable for actions
 * that compare equal, so commitment order breaks any residual tie.
 */
export function orderActions(
  queued: QueuedAction[],
  savedOrder: readonly string[],
): QueuedAction[] {
  return [...queued]
    .map((action, index) => ({ action, index }))
    .sort((left, right) => {
      const compared = compareSpeedThenAgility(left.action, right.action, savedOrder);
      return compared !== 0 ? compared : left.index - right.index;
    })
    .map((entry) => entry.action);
}
