// Shared Combat core: the Range relation (rules §3).
//
// Range is a relation between two characters, computed from each
// character's groupId and the set of engagement pairs:
//
//   same id              -> SELF (validation marker, not a combat range)
//   pair in engagements  -> MELEE
//   same groupId         -> NEAR
//   otherwise            -> FAR
//
// Groups are proximity labels, not coordinates: joining a group makes
// the actor Near every member of that group without engagements.
// Pure functions: no IO, no Date, no randomness, no text.

import type { ActorId, CombatState, GroupId, Range } from './types';

export type { Range };

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function actorById(state: CombatState, id: string) {
  return state.actors.find((actor) => actor.id === id);
}

function isLivingEnemyOf(state: CombatState, id: string, otherId: string): boolean {
  const self = actorById(state, id);
  const other = actorById(state, otherId);
  return (
    self !== undefined &&
    other !== undefined &&
    self.team !== other.team &&
    other.team === 'enemies' &&
    other.hp > 0
  );
}

function touchesPair(pair: readonly string[], id: string): boolean {
  return pair[0] === id || pair[1] === id;
}

export function rangeOf(state: CombatState, aId: ActorId, bId: ActorId): Range {
  if (aId === bId) return 'self';
  const a = actorById(state, aId);
  const b = actorById(state, bId);
  if (a === undefined || b === undefined) return 'far';
  // Elimination removes edges (§3.3): a pair with a dead endpoint reads
  // as if removed, so the survivors fall back to their groups.
  if (a.hp > 0 && b.hp > 0) {
    for (const pair of state.engagements) {
      if (touchesPair(pair, aId) && touchesPair(pair, bId)) return 'melee';
    }
  }
  return a.groupId === b.groupId ? 'near' : 'far';
}

/** Free: no engagement with any living enemy. */
export function isFree(state: CombatState, id: ActorId): boolean {
  return engagementsOf(state, id).length === 0;
}

/** Ids of living enemies engaged with the actor. */
export function engagementsOf(state: CombatState, id: ActorId): ActorId[] {
  const partners: ActorId[] = [];
  for (const pair of state.engagements) {
    if (!touchesPair(pair, id)) continue;
    const other = pair[0] === id ? pair[1] : pair[0];
    if (other !== undefined && isLivingEnemyOf(state, id, other)) partners.push(other);
  }
  return partners.sort(compareIds);
}

/** Ids of all actors sharing the group, sorted, including the actor itself. */
export function groupMembers(state: CombatState, groupId: GroupId): ActorId[] {
  return state.actors
    .filter((actor) => actor.groupId === groupId)
    .map((actor) => actor.id)
    .sort(compareIds);
}

/**
 * Canonical form: each pair sorted ascending, pairs sorted
 * lexicographically, exact duplicates removed. Self-pairs are kept
 * verbatim so the strict parser can reject them.
 */
export function canonicalizeEngagements(pairs: readonly (readonly string[])[]): [string, string][] {
  const sorted = pairs.map((pair) => {
    const [a, b] = pair;
    return (compareIds(a ?? '', b ?? '') <= 0 ? [a, b] : [b, a]) as [string, string];
  });
  sorted.sort((x, y) => compareIds(x[0], y[0]) || compareIds(x[1], y[1]));
  const out: [string, string][] = [];
  for (const pair of sorted) {
    const last = out[out.length - 1];
    if (last === undefined || last[0] !== pair[0] || last[1] !== pair[1]) out.push(pair);
  }
  return out;
}

/** Add one engagement edge; already-engaged pairs are returned unchanged. */
export function addEngagement(
  pairs: readonly (readonly ActorId[])[],
  a: ActorId,
  b: ActorId,
): [ActorId, ActorId][] {
  const canonical = canonicalizeEngagements(pairs);
  const next: [ActorId, ActorId] = compareIds(a, b) <= 0 ? [a, b] : [b, a];
  if (canonical.some((pair) => pair[0] === next[0] && pair[1] === next[1])) return canonical;
  return canonicalizeEngagements([...canonical, next]);
}

/** Remove every edge touching the actor; the group is unchanged. */
export function removeEngagementsOf(
  pairs: readonly (readonly ActorId[])[],
  id: ActorId,
): [ActorId, ActorId][] {
  return canonicalizeEngagements(pairs.filter((pair) => pair[0] !== id && pair[1] !== id));
}
