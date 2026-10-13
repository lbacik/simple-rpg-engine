// Combat Interface Text from the engine's structured events
// (docs/spec/architecture.md, engine contract; ADR 0003): every Combat line
// the Combat panel and the Journal render goes through the catalogue of the
// Interface Language current when it is read, so the engine stores no display
// text for Combat. Scenario names (the Enemy, weapon and item names, and the
// Character's name in roll lines) are placed only where the language needs no
// inflection and are never case-transformed; Damage counts use the language's
// plural forms.
//
// Framework-free, so the Combat panel, the Journal renderer and tests share
// it. Legacy rows (English text, no event) are not rendered here; callers show
// them verbatim.

// Relative imports: vitest has no `@/` alias.
import { escapeHtml } from '../../engine/narration';
import type {
  CombatAvailability,
  CombatParticipantRef,
  CombatRoll,
  CombatRoundView,
  CombatStopReason,
  TacticalActionEvent,
  TacticalActor,
} from '../../engine/index';
import type { Catalogue } from '../../i18n/index';

/** The button label for an available action, from its code and names. */
export function combatActionLabel(availability: CombatAvailability, catalogue: Catalogue): string {
  switch (availability.id) {
    case 'advance':
      return catalogue.combat.advance;
    case 'fall-back':
      return catalogue.combat.fallBack;
    case 'attack':
      return availability.weaponName === undefined
        ? catalogue.combat.attack
        : catalogue.combat.attackWith(availability.weaponName);
    case 'defend':
      return catalogue.combat.defend;
    case 'distract':
      return catalogue.combat.distract;
    case 'use-item':
      return catalogue.combat.useItem(availability.itemName ?? availability.itemId ?? '');
    case 'escape':
      return catalogue.combat.escape;
  }
}

/** The disabled reason for an unavailable action, from its reason code. */
export function combatReasonText(
  availability: CombatAvailability,
  catalogue: Catalogue,
): string | undefined {
  if (availability.enabled || availability.reason === undefined) return undefined;
  switch (availability.reason) {
    case 'already-near':
      return catalogue.combat.reasonAlreadyAt(catalogue.range.near);
    case 'already-far':
      return catalogue.combat.reasonAlreadyAt(catalogue.range.far);
    case 'needs-near':
      return availability.weaponName === undefined
        ? catalogue.combat.reasonNeedsNearUnarmed(catalogue.range.near)
        : catalogue.combat.reasonNeedsNear(availability.weaponName, catalogue.range.near);
    case 'full-health':
      return catalogue.combat.reasonFullHealth;
    case 'wary':
      return catalogue.combat.reasonWary;
  }
}

function rollScore(roll: CombatRoll, catalogue: Catalogue): string {
  return catalogue.combat.rollScore(roll.die1, roll.die2, roll.modifier, roll.total, roll.target);
}

/**
 * One roll as presented: `<name>: d1+d2+mod = total vs target — hit, N
 * Damage | success | miss`. A hit that deals no Damage (Fall back, Escape)
 * reads "success", never "hit, 0 Damage".
 */
export function combatRollLine(
  roll: CombatRoll,
  catalogue: Catalogue,
  characterName: string,
  enemyName: string,
): string {
  const who = roll.side === 'character' ? characterName : enemyName;
  const score = rollScore(roll, catalogue);
  if (roll.hit) {
    return roll.damage > 0
      ? catalogue.combat.rollHit(who, score, catalogue.combat.damage(roll.damage))
      : catalogue.combat.rollSuccess(who, score);
  }
  return catalogue.combat.rollMiss(who, score);
}

/**
 * The lines of one new-shape round entry: the Character's action, then the
 * Enemy's response. Callers show legacy rows (no `enemyName`) verbatim and
 * never call this for them.
 */
export function combatRoundLines(round: CombatRoundView, catalogue: Catalogue): string[] {
  const enemy = round.enemyName ?? '';
  const lines: string[] = [];
  const rangeAfter = catalogue.range[round.rangeAfter];
  const characterRoll = round.rolls.find((roll) => roll.side === 'character');
  const enemyRoll = round.rolls.find((roll) => roll.side === 'enemy');
  switch (round.action) {
    case 'advance':
      lines.push(catalogue.combat.lineAdvance(rangeAfter));
      break;
    case 'fall-back': {
      const score = characterRoll === undefined ? '' : rollScore(characterRoll, catalogue);
      lines.push(
        characterRoll?.hit === true
          ? catalogue.combat.lineFallBackSuccess(score, rangeAfter)
          : catalogue.combat.lineFallBackFailure(score, rangeAfter),
      );
      break;
    }
    case 'escape': {
      const score = characterRoll === undefined ? '' : rollScore(characterRoll, catalogue);
      lines.push(
        characterRoll?.hit === true
          ? catalogue.combat.lineEscapeSuccess(score)
          : catalogue.combat.lineEscapeFailure(score),
      );
      break;
    }
    case 'use-item':
      lines.push(
        catalogue.combat.lineUseItem(round.itemName ?? '', round.healed ?? 0),
      );
      break;
    case 'attack': {
      const weapon = round.weaponName ?? catalogue.combat.unarmed;
      const score = characterRoll === undefined ? '' : rollScore(characterRoll, catalogue);
      lines.push(
        characterRoll?.hit === true
          ? catalogue.combat.lineAttackHit(
              weapon,
              score,
              catalogue.combat.damage(characterRoll.damage),
            )
          : catalogue.combat.lineAttackMiss(weapon, score),
      );
      break;
    }
    case 'defend':
      lines.push(catalogue.combat.lineDefend);
      break;
  }
  if (enemyRoll !== undefined) {
    const score = rollScore(enemyRoll, catalogue);
    lines.push(
      enemyRoll.hit
        ? catalogue.combat.lineEnemyAttackHit(
            enemy,
            score,
            catalogue.combat.damage(enemyRoll.damage),
          )
        : catalogue.combat.lineEnemyAttackMiss(enemy, score, round.guard),
    );
  } else if (
    round.action !== 'escape' &&
    round.rangeBefore === 'far' &&
    round.rangeAfter === 'near'
  ) {
    // No Enemy roll and the Range closed: the melee Enemy closed in instead of
    // attacking. Every other roll-less ending (a won fight, an Escape) leaves
    // the Range as it was.
    lines.push(catalogue.combat.lineEnemyClosesIn(enemy, rangeAfter));
  }
  return lines;
}

/** The Combat start entry's opponent line naming each participant taking part. */
export function combatStartLine(enemyName: string, catalogue: Catalogue): string {
  return catalogue.combat.opponent(enemyName);
}

/** The Combat end entry's closing line, from how the Combat ended. */
export function combatEndLine(
  howEnded: 'victory' | 'escape',
  enemyName: string,
  catalogue: Catalogue,
): string {
  return howEnded === 'escape'
    ? catalogue.combat.combatEndEscape(enemyName)
    : catalogue.combat.combatEndVictory(enemyName);
}

/** The Enemy-defeated notice, shown when the Encounter has no victory Outcome. */
export function enemyDefeatedLine(enemyName: string, catalogue: Catalogue): string {
  return catalogue.combat.enemyDefeated(enemyName);
}

/**
 * Wrap each Scenario name in a rendered Interface Text message in its own
 * element carrying the entry's `lang`, so mixed languages stay visibly marked.
 * Names are matched literally and never transformed; the longest names match
 * first. A name the message does not contain leaves the message unchanged.
 */
export function wrapScenarioNames(message: string, names: string[], lang: string): string {
  let escaped = escapeHtml(message);
  const unique = [...new Set(names.filter((name) => name !== ''))].sort(
    (a, b) => b.length - a.length,
  );
  for (const name of unique) {
    const needle = escapeHtml(name);
    if (!escaped.includes(needle)) continue;
    escaped = escaped
      .split(needle)
      .join(`<span lang="${escapeHtml(lang)}">${needle}</span>`);
  }
  return escaped;
}

// ---------------------------------------------------------------------------
// Tactical round report (docs/spec/ui.md, log; docs/spec/playthrough-state.md,
// combat events). One renderer serves the full Journal, the modal Journal, the
// Combat panel's last-round callout and the decisive Round in the result panel:
// every action of the Round in resolution order — executed, cancelled,
// dropped or not reached — with its roll and result, any nested counterattack,
// defeats and the stop reason. Participants sharing an Enemy kind are told
// apart by a capital letter from the stored ordinal ("Grey Wolf A",
// "Grey Wolf B"; "Szary Wilk A" in Polish), never by a number, so letters never
// read as places in the order. Rendering needs only the stored events and the
// catalogue, never the Scenario content: defeated participant ids resolve to
// names through the actor and target references of the same Round.
// ---------------------------------------------------------------------------

/**
 * One participant as presented: the Enemy name, with the capital letter from
 * its ordinal when the Encounter holds several of the kind.
 */
export function tacticalParticipantName(ref: CombatParticipantRef): string {
  if (ref.ordinal === undefined) return ref.name;
  return `${ref.name} ${String.fromCharCode(64 + ref.ordinal)}`;
}

/** The display name of one action's actor: the Character or a participant. */
function tacticalActorName(actor: TacticalActor, characterName: string): string {
  return actor.kind === 'character' ? characterName : tacticalParticipantName(actor);
}

/** The Speed tag of one action, from the catalogue. */
function tacticalSpeedTag(speed: TacticalActionEvent['speed'], catalogue: Catalogue): string {
  switch (speed) {
    case 'fast':
      return catalogue.combat.tactical.speedFast;
    case 'slow':
      return catalogue.combat.tactical.speedSlow;
    default:
      return catalogue.combat.tactical.speedNormal;
  }
}

/** The action or Intent name of one action, from the catalogue and stored names. */
function tacticalActionName(action: TacticalActionEvent, catalogue: Catalogue): string {
  if (action.actor.kind === 'character') {
    switch (action.kind) {
      case 'advance':
        return catalogue.combat.advance;
      case 'fall-back':
        return catalogue.combat.fallBack;
      case 'attack':
        return action.weaponName === undefined
          ? catalogue.combat.attack
          : catalogue.combat.attackWith(action.weaponName);
      case 'defend':
        return catalogue.combat.defend;
      case 'distract':
        return catalogue.combat.distract;
      case 'use-item':
        return catalogue.combat.useItem(action.itemName ?? '');
      case 'escape':
        return catalogue.combat.escape;
      default:
        return action.kind;
    }
  }
  switch (action.kind) {
    case 'strike':
      return catalogue.combat.tactical.intentStrike;
    case 'close-in':
      return catalogue.combat.tactical.intentCloseIn;
    case 'prepare':
      return catalogue.combat.tactical.intentPrepare;
    case 'heavy-attack':
      return catalogue.combat.tactical.intentHeavyAttack;
    default:
      return action.kind;
  }
}

/** The cancellation reason of one cancelled action, from its reason code. */
function tacticalCancelReason(action: TacticalActionEvent, catalogue: Catalogue): string {
  switch (action.cancelReason) {
    case 'interrupted':
      return catalogue.combat.tactical.cancelInterrupted;
    case 'target-defeated':
      return catalogue.combat.tactical.cancelTargetDefeated;
    case 'out-of-reach':
      return catalogue.combat.tactical.cancelOutOfReach;
    case 'already-near':
      return catalogue.combat.tactical.cancelAlreadyNear;
    case 'none-near':
      return catalogue.combat.tactical.cancelNoneNear;
    default:
      return action.cancelReason ?? '';
  }
}

/** Participant display names by participant id, from the Round's own references. */
function tacticalNameById(
  actions: ReadonlyArray<TacticalActionEvent>,
  characterName: string,
): Map<string, string> {
  const names = new Map<string, string>();
  const consider = (actor: TacticalActor): void => {
    if (actor.kind === 'participant' && !names.has(actor.participantId)) {
      names.set(actor.participantId, tacticalParticipantName(actor));
    }
  };
  for (const action of actions) {
    consider(action.actor);
    if (action.target !== undefined) consider(action.target);
  }
  void characterName;
  return names;
}

/** Every Scenario name one Round's lines can hold, for `lang` wrapping. */
function tacticalRoundNames(
  actions: ReadonlyArray<TacticalActionEvent>,
  characterName: string,
): string[] {
  const names = [characterName];
  const push = (name: string | undefined): void => {
    if (name !== undefined && name !== '' && !names.includes(name)) names.push(name);
  };
  const byId = tacticalNameById(actions, characterName);
  for (const action of actions) {
    push(tacticalActorName(action.actor, characterName));
    if (action.target !== undefined) push(tacticalActorName(action.target, characterName));
    push(action.weaponName);
    push(action.itemName);
    for (const id of [...(action.defeatedParticipants ?? []), ...(action.counter?.defeatedParticipants ?? [])]) {
      push(byId.get(id) ?? id);
    }
  }
  return names;
}

/** The defeat fragments of one executed action ("— Grey Wolf A falls."). */
function tacticalFalls(
  ids: ReadonlyArray<string> | undefined,
  byId: Map<string, string>,
  catalogue: Catalogue,
): string {
  if (ids === undefined || ids.length === 0) return '';
  return ` ${ids.map((id) => catalogue.combat.tactical.falls(byId.get(id) ?? id)).join(' ')}`;
}

function tacticalRollChip(roll: CombatRoll, catalogue: Catalogue): string {
  return catalogue.combat.rollScore(roll.die1, roll.die2, roll.modifier, roll.total, roll.target);
}

/**
 * The result fragment of one executed action (no roll chip, no header): hit or
 * miss with Damage, success or failure, Range changes, Guarded, Wary,
 * preparation and healing. The caller tracks whether Defend already resolved
 * this Round, so attacks against the Guarded Character read "(your guard
 * held)" on a miss and "(through your guard)" on a hit.
 */
function tacticalExecutedResult(
  action: TacticalActionEvent,
  catalogue: Catalogue,
  characterName: string,
  guarded: boolean,
  byId: Map<string, string>,
): string {
  const tactical = catalogue.combat.tactical;
  const actorName = tacticalActorName(action.actor, characterName);
  const targetName =
    action.target === undefined ? '' : tacticalActorName(action.target, characterName);
  const guardNote =
    guarded && action.actor.kind === 'participant' && (action.kind === 'strike' || action.kind === 'heavy-attack')
      ? action.roll?.hit === true
        ? ` ${tactical.guardThrough}`
        : ` ${tactical.guardHeld}`
      : '';
  switch (action.kind) {
    case 'defend':
      return tactical.guarded;
    case 'distract': {
      if (action.roll === undefined || !action.roll.hit) return tactical.failure;
      const wary =
        action.waryUntilRound === undefined ? '' : `; ${tactical.waryUntil(action.waryUntilRound)}`;
      const preparation = action.prepared === false ? `; ${tactical.preparationLost}` : '';
      return `${tactical.success} — ${targetName}${wary}${preparation}`;
    }
    case 'advance':
      return tactical.nowNear(targetName);
    case 'fall-back': {
      if (action.roll !== undefined && !action.roll.hit) return tactical.failure;
      return `${tactical.success}, ${tactical.nowFar}`;
    }
    case 'escape': {
      if (action.roll !== undefined && !action.roll.hit) return tactical.failure;
      return tactical.success;
    }
    case 'use-item':
      return tactical.healed(action.healed ?? 0);
    case 'close-in':
      return tactical.nowNear(actorName);
    case 'prepare':
      return tactical.prepared;
    default: {
      // Attack, Strike and Heavy attack: a roll with Damage.
      if (action.roll === undefined) return '';
      const damage = catalogue.combat.damage(action.roll.damage);
      const outcome = action.roll.hit ? tactical.hit(damage) : tactical.miss;
      const falls = tacticalFalls(action.defeatedParticipants, byId, catalogue);
      return `${outcome}${guardNote}${falls}`;
    }
  }
}

/** One action's header: order, actor, action with target, and Speed tag. */
function tacticalActionHeader(
  action: TacticalActionEvent,
  catalogue: Catalogue,
  characterName: string,
): string {
  const actorName = tacticalActorName(action.actor, characterName);
  const name = tacticalActionName(action, catalogue);
  // Only the Character's targeted actions name a target; Intents always target
  // the Character, so they read without one ("Grey Wolf A: Strike").
  const target =
    action.actor.kind === 'character' &&
    (action.kind === 'attack' || action.kind === 'distract' || action.kind === 'advance') &&
    action.target !== undefined
      ? ` → ${tacticalActorName(action.target, characterName)}`
      : '';
  return `${action.order}. ${actorName}: ${name}${target} [${tacticalSpeedTag(action.speed, catalogue)}]`;
}

/** One action as plain text (header, roll chip, result), before name wrapping. */
function tacticalActionText(
  action: TacticalActionEvent,
  catalogue: Catalogue,
  characterName: string,
  guarded: boolean,
  byId: Map<string, string>,
): string {
  const tactical = catalogue.combat.tactical;
  const header = tacticalActionHeader(action, catalogue, characterName);
  if (action.status === 'cancelled') {
    const reason = tacticalCancelReason(action, catalogue);
    const preparation = action.prepared === false ? ` ${tactical.preparationLost}.` : '';
    return `${header} — ${tactical.cancelled(reason)}${preparation}`;
  }
  if (action.status === 'dropped') return `${header} — ${tactical.dropped}`;
  if (action.status === 'not-reached') return `${header} — ${tactical.notReached}`;
  const result = tacticalExecutedResult(action, catalogue, characterName, guarded, byId);
  if (action.roll === undefined) return `${header} — ${result}`;
  return `${header} — ${tacticalRollChip(action.roll, catalogue)} — ${result}`;
}

/** The nested counterattack line inside the missed melee attack it answers. */
function tacticalCounterText(
  action: TacticalActionEvent,
  catalogue: Catalogue,
  byId: Map<string, string>,
): string | undefined {
  const counter = action.counter;
  if (counter === undefined) return undefined;
  const tactical = catalogue.combat.tactical;
  const damage = catalogue.combat.damage(counter.roll.damage);
  const outcome = counter.roll.hit ? tactical.hit(damage) : tactical.miss;
  const falls = tacticalFalls(counter.defeatedParticipants, byId, catalogue);
  return `${tactical.counter} ${tacticalRollChip(counter.roll, catalogue)} — ${outcome}${falls}`;
}

/** The Round's closing line, when the sequence stopped. */
function tacticalStopText(stop: CombatStopReason | undefined, catalogue: Catalogue): string {
  if (stop === 'escape') return catalogue.combat.tactical.stopEscape;
  if (stop === 'victory') return catalogue.combat.tactical.stopVictory;
  if (stop === 'death') return catalogue.combat.tactical.stopDeath;
  return '';
}

/**
 * One tactical Round as HTML: an ordered list with one numbered line per
 * action in resolution order — executed with its roll chip and result
 * (counterattacks nested inside the action they answer), cancelled with its
 * reason, dropped, or not reached — then the stop reason when the sequence
 * stopped. Scenario names keep the entry's `lang`; Interface Text follows the
 * catalogue.
 */
export function tacticalRoundHtml(
  actions: ReadonlyArray<TacticalActionEvent>,
  catalogue: Catalogue,
  lang: string,
  characterName: string,
  options: { round?: number; stop?: CombatStopReason } = {},
): string {
  const names = tacticalRoundNames(actions, characterName);
  const byId = tacticalNameById(actions, characterName);
  const wrap = (text: string): string => wrapScenarioNames(text, names, lang);
  let guarded = false;
  const items = actions.map((action) => {
    const text = tacticalActionText(action, catalogue, characterName, guarded, byId);
    if (action.status === 'executed' && action.kind === 'defend') guarded = true;
    const counter = tacticalCounterText(action, catalogue, byId);
    return `<li><p>${wrap(text)}</p>${counter === undefined ? '' : `<p class="tactical-counter">${wrap(counter)}</p>`}</li>`;
  });
  const stop = tacticalStopText(options.stop, catalogue);
  const heading =
    options.round === undefined ? '' : `<p class="meta">${wrap(catalogue.combat.round(options.round))}</p>`;
  return `${heading}<ol class="tactical-round">${items.join('')}</ol>${stop === '' ? '' : `<p class="tactical-stop">${wrap(stop)}</p>`}`;
}

/**
 * One tactical Round as a compact one-line summary for older rounds:
 * "`<n>`. Idris: Attack → Grey Wolf A — miss · Grey Wolf A: Strike — hit, 2
 * Damage · Grey Wolf B: Close in — Cancelled: …". Same events and catalogue as
 * the full report, so the compact list never disagrees with the Journal.
 */
export function tacticalRoundSummary(
  round: number,
  actions: ReadonlyArray<TacticalActionEvent>,
  catalogue: Catalogue,
  lang: string,
  characterName: string,
): string {
  const names = tacticalRoundNames(actions, characterName);
  const byId = tacticalNameById(actions, characterName);
  const wrap = (text: string): string => wrapScenarioNames(text, names, lang);
  let guarded = false;
  const parts = actions.map((action) => {
    const text = tacticalActionText(action, catalogue, characterName, guarded, byId);
    if (action.status === 'executed' && action.kind === 'defend') guarded = true;
    // The summary drops the order number each full line carries ("1. Idris:
    // …"), since the Round number already heads the line.
    return text.replace(/^\d+\. /, '');
  });
  return wrap(`${catalogue.combat.round(round)}. ${parts.join(' · ')}`);
}
