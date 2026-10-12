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
  CombatRoll,
  CombatRoundView,
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
