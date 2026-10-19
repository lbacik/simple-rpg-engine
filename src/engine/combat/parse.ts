// Shared Combat core: strict validation of the §12 state shape.
//
// Rejects every §12 rule with a ParseIssue code: unknown or mismatched
// rulesVersion, duplicate or malformed actor ids, unknown profiles,
// hp/stamina out of profile range, bad groups and nextGroupSerial,
// incorrect engagements, a missing hero, more than one companion,
// anything outside 1–5 enemies, an active fight without a living hero
// or living enemies, malformed frozen plans, and a malformed log.
//
// Reversed and repeated engagement pairs are reduced to one canonical
// pair (rules §12); valid states round-trip unchanged. The MVP
// stateVersion key is never stored (combat-contract.md deviation 1)
// and is rejected. Pure function: no IO, no Date, no randomness, no text.

import { MAX_ENEMIES, MAX_ROUNDS, MIN_ENEMIES, MIN_ROUND, PROFILES, STANCE_IDS, SUPPORTED_RULES_VERSIONS } from './rules';
import { canonicalizeEngagements } from './range';
import type {
  ActorId,
  CombatActor,
  CombatEvent,
  CombatState,
  FrozenPlan,
  ParseIssue,
  ParseResult,
  ProfileId,
} from './types';

const ACTOR_ID_PATTERN = /^(h01|c01|e0[1-5])$/;
const GROUP_ID_PATTERN = /^g\d+$/;

const CARD_IDS: readonly string[] = ['heavy', 'counter', 'feint', 'cover', 'charge', 'prepare'];
const STANCES: readonly string[] = STANCE_IDS;
const ACTION_IDS: readonly string[] = [
  'heavy',
  'counter',
  'feint',
  'cover',
  'charge',
  'prepare',
  'strike',
  'brace',
  'shot',
  'approach',
  'disengage',
  'withdraw',
  'wait',
];
const RESULTS: readonly string[] = ['WIN', 'LOSS', 'LOSS_SURRENDER', 'DRAW_LIMIT'];
const PHASES: readonly string[] = ['PLAN', 'CHOOSE', 'FINISHED'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function groupNumber(groupId: string): number | null {
  const match = /^g(\d+)$/.exec(groupId);
  return match === null ? null : Number(match[1]);
}

function roleForId(id: string): CombatActor['role'] | null {
  if (id === 'h01') return 'hero';
  if (id === 'c01') return 'companion';
  if (/^e0[1-5]$/.test(id)) return 'enemy';
  return null;
}

export function parseCombatState(json: unknown): ParseResult {
  const issues: ParseIssue[] = [];
  if (!isRecord(json)) return { ok: false, issues: [{ code: 'bad_state' }] };

  if (json['rulesVersion'] !== SUPPORTED_RULES_VERSIONS[0]) {
    issues.push({
      code: 'bad_rules_version',
      params: { actual: typeof json['rulesVersion'] === 'string' ? (json['rulesVersion'] as string) : 'missing' },
    });
  }

  if ('stateVersion' in json || 'expectedStateVersion' in json) {
    issues.push({ code: 'unexpected_state_version' });
  }

  if (issues.length > 0) return { ok: false, issues };

  if (
    !isNonNegativeInteger(json['round']) ||
    (json['round'] as number) < MIN_ROUND ||
    (json['round'] as number) > MAX_ROUNDS
  ) {
    issues.push({ code: 'bad_round' });
  }

  const phase = json['phase'];
  if (typeof phase !== 'string' || !PHASES.includes(phase)) {
    issues.push({ code: 'bad_phase' });
  }

  const result = json['result'];
  if (result !== null && (typeof result !== 'string' || !RESULTS.includes(result))) {
    issues.push({ code: 'bad_result' });
  } else if (phase === 'FINISHED' && result === null) {
    issues.push({ code: 'finished_without_result' });
  } else if ((phase === 'PLAN' || phase === 'CHOOSE') && result !== null) {
    issues.push({ code: 'result_before_finish' });
  }

  // Actors.
  const actorsRaw = json['actors'];
  const actors: CombatActor[] = [];
  const byId = new Map<string, CombatActor>();
  if (!Array.isArray(actorsRaw)) {
    issues.push({ code: 'bad_actors' });
  } else {
    const seen = new Set<string>();
    for (const entry of actorsRaw) {
      if (!isRecord(entry)) {
        issues.push({ code: 'bad_actors' });
        continue;
      }
      const id = entry['id'];
      if (typeof id !== 'string' || !ACTOR_ID_PATTERN.test(id)) {
        issues.push({ code: 'bad_actor_id', params: { id: typeof id === 'string' ? id : 'missing' } });
        continue;
      }
      if (seen.has(id)) {
        issues.push({ code: 'duplicate_actor_id', params: { id } });
        continue;
      }
      seen.add(id);

      const expectedRole = roleForId(id);
      const role = entry['role'];
      const team = entry['team'];
      const expectedTeam = expectedRole === 'enemy' ? 'enemies' : 'heroes';
      if (role !== expectedRole || team !== expectedTeam) {
        issues.push({ code: 'bad_team_role', params: { id } });
      }

      const profileId = entry['profileId'] as ProfileId;
      const profile = typeof profileId === 'string' ? PROFILES[profileId as ProfileId] : undefined;
      if (profile === undefined) {
        issues.push({
          code: 'unknown_profile',
          params: { id, profileId: typeof profileId === 'string' ? profileId : 'missing' },
        });
      } else if (
        (expectedRole === 'hero' && profileId !== 'hero') ||
        (expectedRole === 'companion' && profileId !== 'party-sentinel' && profileId !== 'party-archer') ||
        (expectedRole === 'enemy' &&
          profileId !== 'raider' &&
          profileId !== 'brute' &&
          profileId !== 'sentinel' &&
          profileId !== 'archer')
      ) {
        issues.push({ code: 'bad_profile_role', params: { id } });
      }

      const ref = entry['ref'];
      if (ref !== null && typeof ref !== 'string') {
        issues.push({ code: 'bad_ref', params: { id } });
      }

      if (typeof entry['stance'] !== 'string' || !STANCES.includes(entry['stance'])) {
        issues.push({ code: 'bad_stance', params: { id } });
      }
      if (typeof entry['groupId'] !== 'string' || !GROUP_ID_PATTERN.test(entry['groupId'])) {
        issues.push({ code: 'bad_group_id', params: { id } });
      }

      if (profile !== undefined) {
        if (!isNonNegativeInteger(entry['hp']) || (entry['hp'] as number) > profile.maxHp) {
          issues.push({ code: 'hp_out_of_range', params: { id, max: profile.maxHp } });
        }
      }
      if (expectedRole === 'enemy') {
        if (entry['stamina'] !== null) issues.push({ code: 'bad_stamina', params: { id } });
      } else if (!isNonNegativeInteger(entry['stamina']) || (profile !== undefined && (entry['stamina'] as number) > (profile.maxStamina ?? 0))) {
        issues.push({ code: 'bad_stamina', params: { id } });
      }

      const readyRound = entry['readyRound'];
      if (readyRound !== null && (!isNonNegativeInteger(readyRound) || (readyRound as number) < 1)) {
        issues.push({ code: 'bad_ready_round', params: { id } });
      }

      const availableRound = entry['availableRound'];
      if (!isRecord(availableRound)) {
        issues.push({ code: 'bad_available_round', params: { id } });
      } else {
        for (const [key, value] of Object.entries(availableRound)) {
          if (!CARD_IDS.includes(key) || !isNonNegativeInteger(value) || (value as number) < 1) {
            issues.push({ code: 'bad_available_round', params: { id } });
            break;
          }
        }
      }

      // Power: enemies carry an explicit non-negative instance value
      // (rules §8.1); the hero and companions hold their table power of 0.
      const power = entry['power'];
      if (expectedRole === 'enemy') {
        if (power !== undefined && !isNonNegativeInteger(power)) {
          issues.push({ code: 'bad_power', params: { id } });
        }
      } else if (power !== undefined && power !== 0) {
        issues.push({ code: 'bad_power', params: { id } });
      }
      for (const [key, code] of [
        ['phaseOffset', 'bad_phase_offset'],
        ['waitAge', 'bad_wait_age'],
      ] as const) {
        const value = entry[key];
        if (value !== undefined && !isNonNegativeInteger(value)) {
          issues.push({ code, params: { id } });
        }
      }

      const actor = entry as unknown as CombatActor;
      actors.push(actor);
      byId.set(id, actor);
    }
  }

  const heroes = actors.filter((a) => a.role === 'hero');
  const companions = actors.filter((a) => a.role === 'companion');
  const enemies = actors.filter((a) => a.role === 'enemy');
  if (heroes.length !== 1) issues.push({ code: 'missing_hero' });
  if (companions.length > 1) issues.push({ code: 'too_many_companions', params: { count: companions.length } });
  if (enemies.length < MIN_ENEMIES || enemies.length > MAX_ENEMIES) {
    issues.push({ code: 'bad_enemy_count', params: { count: enemies.length } });
  }

  const activeFight = phase === 'PLAN' || phase === 'CHOOSE';
  if (activeFight) {
    if (!heroes.some((h) => typeof h.hp === 'number' && h.hp > 0)) {
      issues.push({ code: 'no_living_hero' });
    }
    if (!enemies.some((e) => typeof e.hp === 'number' && e.hp > 0)) {
      issues.push({ code: 'no_living_enemies' });
    }
  }

  // nextGroupSerial must be greater than every group number in use.
  let maxGroup = -1;
  for (const actor of actors) {
    if (typeof actor.groupId === 'string') {
      const n = groupNumber(actor.groupId);
      if (n !== null && n > maxGroup) maxGroup = n;
    }
  }
  if (!isNonNegativeInteger(json['nextGroupSerial']) || (json['nextGroupSerial'] as number) <= maxGroup) {
    issues.push({ code: 'bad_next_group_serial' });
  }

  // Engagements: reversed and repeated pairs reduce to one canonical pair.
  let engagements: [ActorId, ActorId][] = [];
  const engagementsRaw = json['engagements'];
  if (!Array.isArray(engagementsRaw)) {
    issues.push({ code: 'bad_engagements' });
  } else {
    let malformed = false;
    for (const pair of engagementsRaw) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') {
        malformed = true;
      }
    }
    if (malformed) {
      issues.push({ code: 'bad_engagements' });
    } else {
      engagements = canonicalizeEngagements(engagementsRaw as string[][]) as [ActorId, ActorId][];
      for (const [a, b] of engagements) {
        const actorA = byId.get(a);
        const actorB = byId.get(b);
        if (actorA === undefined || actorB === undefined) {
          issues.push({ code: 'bad_engagement', params: { a, b, reason: 'unknown_actor' } });
        } else if (a === b) {
          issues.push({ code: 'bad_engagement', params: { a, b, reason: 'self' } });
        } else if (actorA.team === actorB.team) {
          issues.push({ code: 'bad_engagement', params: { a, b, reason: 'allies' } });
        } else if (actorA.groupId !== actorB.groupId) {
          issues.push({ code: 'bad_engagement', params: { a, b, reason: 'different_groups' } });
        } else if (
          typeof actorA.hp !== 'number' ||
          typeof actorB.hp !== 'number' ||
          actorA.hp <= 0 ||
          actorB.hp <= 0
        ) {
          issues.push({ code: 'bad_engagement', params: { a, b, reason: 'not_living' } });
        }
      }
    }
  }

  // Frozen plans.
  const enemyPlansRaw = json['frozenEnemyPlans'];
  const companionPlanRaw = json['frozenCompanionPlan'];
  const enemyPlans: FrozenPlan[] = [];
  let companionPlan: FrozenPlan | null = null;
  if (phase === 'PLAN') {
    if (Array.isArray(enemyPlansRaw) && enemyPlansRaw.length > 0) {
      issues.push({ code: 'bad_frozen_plans' });
    } else if (!Array.isArray(enemyPlansRaw)) {
      issues.push({ code: 'bad_frozen_plans' });
    }
    if (companionPlanRaw !== null && companionPlanRaw !== undefined) {
      issues.push({ code: 'bad_frozen_plans' });
    }
  } else if (phase === 'CHOOSE' || phase === 'FINISHED') {
    if (!Array.isArray(enemyPlansRaw)) {
      issues.push({ code: 'bad_frozen_plans' });
    } else {
      const planActorIds = new Set<string>();
      for (const planRaw of enemyPlansRaw) {
        const planIssue = checkFrozenPlan(planRaw, byId);
        if (planIssue !== null) {
          issues.push(planIssue);
          continue;
        }
        const plan = planRaw as unknown as FrozenPlan;
        const owner = byId.get(plan.actorId);
        if (owner === undefined || owner.role !== 'enemy') {
          issues.push({ code: 'bad_frozen_plan', params: { reason: 'not_enemy' } });
          continue;
        }
        if (planActorIds.has(plan.actorId)) {
          issues.push({ code: 'bad_frozen_plan', params: { reason: 'duplicate' } });
          continue;
        }
        planActorIds.add(plan.actorId);
        enemyPlans.push(plan);
      }
      if (phase === 'CHOOSE') {
        const livingEnemies = enemies.filter((e) => typeof e.hp === 'number' && e.hp > 0).map((e) => e.id).sort();
        const planned = [...planActorIds].sort();
        if (livingEnemies.length !== planned.length || livingEnemies.some((id, i) => id !== planned[i])) {
          issues.push({ code: 'bad_frozen_plans' });
        }
      }
    }
    if (companionPlanRaw !== null && companionPlanRaw !== undefined) {
      const planIssue = checkFrozenPlan(companionPlanRaw, byId);
      if (planIssue !== null) {
        issues.push(planIssue);
      } else {
        const plan = companionPlanRaw as unknown as FrozenPlan;
        const owner = byId.get(plan.actorId);
        if (owner === undefined || owner.role !== 'companion') {
          issues.push({ code: 'bad_frozen_plan', params: { reason: 'not_companion' } });
        } else {
          companionPlan = plan;
        }
      }
    } else if (phase === 'CHOOSE' && companions.some((c) => typeof c.hp === 'number' && c.hp > 0)) {
      issues.push({ code: 'bad_frozen_plans' });
    }
  }

  // Log: an array of objects; event typing arrives with the resolver (P1c).
  const logRaw = json['log'];
  if (!Array.isArray(logRaw) || logRaw.some((entry) => !isRecord(entry))) {
    issues.push({ code: 'bad_log' });
  }

  if (issues.length > 0) return { ok: false, issues };

  const round = json['round'] as number;
  const state: CombatState = {
    ...(json as Record<string, unknown>),
    rulesVersion: SUPPORTED_RULES_VERSIONS[0] as CombatState['rulesVersion'],
    round,
    phase: phase as CombatState['phase'],
    result: result as CombatState['result'],
    nextGroupSerial: json['nextGroupSerial'] as number,
    actors: actors.map((actor) => ({
      ...actor,
      availableRound: { ...actor.availableRound },
    })),
    engagements,
    frozenEnemyPlans: enemyPlans.map((plan) => ({ ...plan })),
    frozenCompanionPlan: companionPlan === null ? null : { ...companionPlan },
    log: (logRaw as CombatEvent[]).map((entry) => ({ ...entry })),
  };
  return { ok: true, state };
}

function checkFrozenPlan(planRaw: unknown, byId: Map<string, CombatActor>): ParseIssue | null {
  if (!isRecord(planRaw)) return { code: 'bad_frozen_plan', params: { reason: 'shape' } };
  const plan = planRaw as Record<string, unknown>;
  if (typeof plan['actorId'] !== 'string' || !byId.has(plan['actorId'])) {
    return { code: 'bad_frozen_plan', params: { reason: 'unknown_actor' } };
  }
  if (typeof plan['stance'] !== 'string' || !STANCES.includes(plan['stance'])) {
    return { code: 'bad_frozen_plan', params: { reason: 'stance' } };
  }
  if (typeof plan['actionId'] !== 'string' || !ACTION_IDS.includes(plan['actionId'])) {
    return { code: 'bad_frozen_plan', params: { reason: 'action' } };
  }
  const actionId = plan['actionId'] as string;
  const targetId = plan['targetId'];
  if (actionId === 'withdraw') {
    if (targetId !== null) return { code: 'bad_frozen_plan', params: { reason: 'target' } };
  } else if (typeof targetId !== 'string' || !byId.has(targetId)) {
    return { code: 'bad_frozen_plan', params: { reason: 'target' } };
  } else if (
    (actionId === 'brace' ||
      actionId === 'prepare' ||
      actionId === 'counter' ||
      actionId === 'disengage') &&
    targetId !== plan['actorId']
  ) {
    return { code: 'bad_frozen_plan', params: { reason: 'target' } };
  }
  const moveVariant = plan['moveVariant'];
  if (moveVariant !== null && moveVariant !== 'JOIN' && moveVariant !== 'ENGAGE') {
    return { code: 'bad_frozen_plan', params: { reason: 'move_variant' } };
  }
  if (typeof plan['wasCandidate'] !== 'boolean' || typeof plan['attackSlot'] !== 'boolean') {
    return { code: 'bad_frozen_plan', params: { reason: 'slot' } };
  }
  if (typeof plan['baseDamage'] !== 'number' || typeof plan['priority'] !== 'number') {
    return { code: 'bad_frozen_plan', params: { reason: 'numbers' } };
  }
  return null;
}
