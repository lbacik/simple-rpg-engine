// The Combat panel (docs/spec/ui.md, Combat panel): variant C, "Arena,
// compact". From top to bottom: a header with a kicker, the Encounter name
// and the opening narration; a one-line Range arena with Health-ring
// medallions; four action columns (Position, Fight, Items, Leave); and the
// log newest first with a "Last round" callout.
//
// Every line comes from the engine's structured events through the catalogue
// of the current Interface Language: round messages, roll lines, the action
// list with its groups and disabled reasons, and the Range arena. The arena
// comes from state (the engine's view projection), never the Journal; the
// last-round report renders the stored round events through the shared
// tactical renderer — the same renderer as the full Journal, the modal Journal
// and the decisive Round in the result panel. Legacy rows (English text, no
// event) are shown verbatim, one line per round. Guarded is round-scoped and
// appears only in the log of the round it applied to, never as an arena badge:
// legacy guard text never creates one.
//
// Posts plain forms so Combat works without JavaScript; the server action is
// injected (page.tsx passes the Combat server action) so tests can drive this
// module directly with react-dom/server.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly with react-dom/server.

import type { ComponentProps } from 'react';
import {
  renderNarration,
  type CombatAvailability,
  type CombatRoll,
  type CombatRoundView,
  type GameView,
  type TacticalRoundView,
} from '../../../engine/index';
import type { Catalogue } from '../../../i18n/index';
import {
  combatActionLabel,
  combatReasonText,
  combatRollLine,
  combatRoundLines,
  tacticalRoundHtml,
  tacticalRoundSummary,
  wrapScenarioNames,
} from '../../lib/combat-text';

export type CombatView = Extract<GameView, { kind: 'combat' }>;

/** A form target: the Combat server action in production, a URL in tests. */
export type CombatFormAction = ComponentProps<'form'>['action'];

/** Health as a clamped 0–100 percentage for the medallion ring. */
export function healthPercent(health: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((health / max) * 100)));
}

function initial(name: string): string {
  const first = name.trim().charAt(0);
  return first === '' ? '?' : first.toUpperCase();
}

function CombatActionButton({
  availability,
  playthroughId,
  step,
  formAction,
  catalogue,
  lang,
}: {
  availability: CombatAvailability;
  playthroughId: string;
  step: number;
  formAction: CombatFormAction;
  catalogue: Catalogue;
  /** The language of the Scenario names shown in the label and reason. */
  lang: string;
}) {
  const reason = combatReasonText(availability, catalogue);
  // Weapon and item names inside labels and reasons are Scenario text: each
  // keeps its own element with the Scenario language (docs/spec/ui.md, shared
  // presentation), the Interface Text around it does not.
  const names = [availability.weaponName ?? '', availability.itemName ?? ''];
  const label = { __html: wrapScenarioNames(combatActionLabel(availability, catalogue), names, lang) };
  if (!availability.enabled) {
    return (
      <div className="combat-action">
        <button className="combat-button" type="button" disabled dangerouslySetInnerHTML={label} />
        {reason ? (
          <p
            className="combat-reason"
            dangerouslySetInnerHTML={{ __html: wrapScenarioNames(reason, names, lang) }}
          />
        ) : null}
      </div>
    );
  }
  return (
    <form action={formAction} className="combat-action">
      <input type="hidden" name="playthroughId" value={playthroughId} />
      <input type="hidden" name="expectedStep" value={step} />
      <input type="hidden" name="combat" value={availability.id} />
      {availability.itemId !== undefined ? (
        <input type="hidden" name="item" value={availability.itemId} />
      ) : null}
      <p>
        <button className="combat-button" type="submit" dangerouslySetInnerHTML={label} />
      </p>
    </form>
  );
}

function Medallion({
  side,
  name,
  health,
  maxHealth,
  detail,
  catalogue,
  lang,
}: {
  side: 'character' | 'enemy';
  name: string;
  health: number;
  maxHealth: number;
  detail: string;
  catalogue: Catalogue;
  /** The language of the name shown: set for the Enemy only, never the Character. */
  lang?: string;
}) {
  const percent = healthPercent(health, maxHealth);
  return (
    <div className={side === 'character' ? 'combat-medallion char' : 'combat-medallion enemy'}>
      <div
        className={percent <= 34 ? 'combat-ring low' : 'combat-ring'}
        style={{ '--combat-health': `${percent}%` } as React.CSSProperties}
        title={catalogue.character.short(health, maxHealth)}
      >
        <span className="combat-face" aria-hidden="true">
          {initial(name)}
        </span>
      </div>
      {lang === undefined ? (
        <p className="combat-name">{name}</p>
      ) : (
        <p className="combat-name" lang={lang}>
          {name}
        </p>
      )}
      <p className="combat-health">
        {health}/{maxHealth}
      </p>
      <p className="combat-detail">{detail}</p>
    </div>
  );
}

function actionById(actions: CombatAvailability[], id: CombatAvailability['id']): CombatAvailability {
  const found = actions.find((action) => action.id === id);
  if (found !== undefined) return found;
  // The engine always returns every action; this fallback only keeps the
  // panel rendering if that ever changes.
  const group: CombatAvailability['group'] =
    id === 'advance' || id === 'fall-back'
      ? 'position'
      : id === 'attack' || id === 'defend' || id === 'distract'
        ? 'fight'
        : id === 'use-item'
          ? 'items'
          : 'leave';
  return { id, group, enabled: false };
}

/** The roll chips of one round, rendered from the rolls as events. */
function RollChips({
  rolls,
  enemyName,
  characterName,
  catalogue,
  lang,
}: {
  rolls: CombatRoll[];
  enemyName: string;
  characterName: string;
  catalogue: Catalogue;
  /** The language of the Scenario names shown in the roll lines. */
  lang: string;
}) {
  return (
    <>
      {rolls.map((roll, index) => (
        <li
          key={index}
          className={roll.hit ? 'combat-roll hit' : 'combat-roll miss'}
          dangerouslySetInnerHTML={{
            __html: wrapScenarioNames(
              combatRollLine(roll, catalogue, characterName, enemyName),
              [characterName, enemyName],
              lang,
            ),
          }}
        />
      ))}
    </>
  );
}

export function CombatPanel({
  combat,
  playthroughId,
  step,
  rounds,
  tacticalRounds,
  consumables,
  formAction,
  catalogue,
  lang,
  badge,
}: {
  combat: CombatView;
  playthroughId: string;
  step: number;
  /** The v1 rolls of the current Combat, since its opening narration. */
  rounds: CombatRoundView[];
  /** The tactical (v2) rounds of the current Combat, oldest first. */
  tacticalRounds: TacticalRoundView[];
  consumables: { itemId: string; name: string }[];
  formAction: CombatFormAction;
  /** Interface Text: the game screen passes the current catalogue. */
  catalogue: Catalogue;
  /** The language of the Scenario text shown. */
  lang: string;
  /** The fallback badge, shown after the Encounter name while the Scenario falls back. */
  badge?: React.ReactNode;
}) {
  const near = combat.range === 'near';
  const rangeWord = catalogue.range[combat.range];
  const [latest, ...older] = [...rounds].reverse();
  // The tactical last round: the newest versioned round entry, rendered through
  // the shared tactical report (the same renderer as the Journal). Older
  // tactical rounds read as one compact line each, like the legacy older list.
  const [tacticalLatest, ...tacticalNewer] = [...tacticalRounds].reverse();
  const tacticalOlder = [...tacticalNewer].reverse();
  // With tactical rounds on record every legacy row is older than them, so the
  // legacy older list holds all of them; otherwise it holds all but the latest.
  const legacyOlder = tacticalLatest === undefined ? older : [...rounds].reverse();
  const enemyNameOf = (round: CombatRoundView): string => round.enemyName ?? combat.enemy.name;
  const roundLines = (round: CombatRoundView): string[] =>
    round.enemyName === undefined ? [round.text ?? ''] : combatRoundLines(round, catalogue);
  // The Scenario names a round line can hold (participants, weapon, item):
  // each keeps its own element with the Scenario language, as in the Journal
  // (docs/spec/ui.md, shared presentation). Legacy rows are stored English
  // text shown verbatim, so they carry `en`.
  const roundNames = (round: CombatRoundView): string[] => [
    combat.characterName,
    enemyNameOf(round),
    round.weaponName ?? '',
    round.itemName ?? '',
  ];
  // Legacy rows (stored English text, no event) render as their stored text
  // verbatim, one line per round (docs/spec/ui.md, Combat panel): no roll
  // chips, which would resolve the Enemy's name from the live Scenario instead
  // of the entry (ADR 0004).
  const showChips = (round: CombatRoundView): boolean => round.enemyName !== undefined;
  const itemActions = consumables.map(
    (consumable) =>
      combat.actions.find(
        (action) => action.id === 'use-item' && action.itemId === consumable.itemId,
      ) ?? {
        id: 'use-item' as const,
        group: 'items' as const,
        enabled: false,
        itemId: consumable.itemId,
        itemName: consumable.name,
      },
  );
  const weaponDisplay = combat.character.weaponName ?? catalogue.combat.unarmed;
  return (
    <>
      <header className="combat-header">
        <p className="combat-kicker">
          {catalogue.combat.title} · <span lang={lang}>{combat.locationName}</span> ·{' '}
          {catalogue.combat.round(combat.round)}
        </p>
        <h1>
          <span lang={lang}>{combat.encounterName}</span>
          {badge === undefined ? null : <> {badge}</>}
        </h1>
        <div
          className="combat-narration"
          lang={lang}
          dangerouslySetInnerHTML={{
            __html: renderNarration(combat.text, combat.characterName),
          }}
        />
      </header>
      <section
        className={near ? 'combat-arena near' : 'combat-arena far'}
        aria-label={catalogue.combat.arenaRange(rangeWord)}
      >
        <div className="combat-ground" aria-hidden="true" />
        <div className="combat-gap" aria-hidden="true">
          {near ? (
            <span className="combat-clash">⚔</span>
          ) : (
            <span className="combat-far">{catalogue.combat.farMarker(rangeWord)}</span>
          )}
        </div>
        <Medallion
          side="character"
          name={combat.characterName}
          health={combat.character.health}
          maxHealth={combat.character.maxHealth}
          detail={`${weaponDisplay} · ${catalogue.inventory.weaponStats(combat.character.damage, catalogue.reach[combat.character.reach])}`}
          catalogue={catalogue}
        />
        <Medallion
          side="enemy"
          name={combat.enemy.name}
          health={combat.enemy.health}
          maxHealth={combat.enemy.maxHealth}
          detail={catalogue.inventory.weaponStats(
            combat.enemy.damage,
            catalogue.reach[combat.enemy.reach],
          )}
          catalogue={catalogue}
          lang={lang}
        />
        <div className="combat-range">{rangeWord}</div>
      </section>
      <div className="combat-actions">
        <section aria-label={catalogue.combat.groups.position} className="combat-group">
          <h2>{catalogue.combat.groups.position}</h2>
          <CombatActionButton
            availability={actionById(combat.actions, 'advance')}
            playthroughId={playthroughId}
            step={step}
            formAction={formAction}
            catalogue={catalogue}
            lang={lang}
          />
          <CombatActionButton
            availability={actionById(combat.actions, 'fall-back')}
            playthroughId={playthroughId}
            step={step}
            formAction={formAction}
            catalogue={catalogue}
            lang={lang}
          />
        </section>
        <section aria-label={catalogue.combat.groups.fight} className="combat-group">
          <h2>{catalogue.combat.groups.fight}</h2>
          <CombatActionButton
            availability={actionById(combat.actions, 'attack')}
            playthroughId={playthroughId}
            step={step}
            formAction={formAction}
            catalogue={catalogue}
            lang={lang}
          />
          <CombatActionButton
            availability={actionById(combat.actions, 'defend')}
            playthroughId={playthroughId}
            step={step}
            formAction={formAction}
            catalogue={catalogue}
            lang={lang}
          />
        </section>
        <section aria-label={catalogue.combat.groups.items} className="combat-group">
          <h2>{catalogue.combat.groups.items}</h2>
          {itemActions.length === 0 ? (
            <p className="combat-reason">{catalogue.combat.noConsumables}</p>
          ) : (
            itemActions.map((availability) => (
              <CombatActionButton
                key={availability.itemId}
                availability={availability}
                playthroughId={playthroughId}
                step={step}
                formAction={formAction}
                catalogue={catalogue}
                lang={lang}
              />
            ))
          )}
        </section>
        <section aria-label={catalogue.combat.groups.leave} className="combat-group">
          <h2>{catalogue.combat.groups.leave}</h2>
          <CombatActionButton
            availability={actionById(combat.actions, 'escape')}
            playthroughId={playthroughId}
            step={step}
            formAction={formAction}
            catalogue={catalogue}
            lang={lang}
          />
        </section>
      </div>
      <section aria-label={catalogue.combat.log} className="combat-log">
        <h2>{catalogue.combat.log}</h2>
        {tacticalLatest === undefined && latest === undefined ? (
          <p className="meta">{catalogue.combat.noRolls}</p>
        ) : (
          <>
            {tacticalLatest === undefined ? null : (
              <div className="combat-latest">
                <p className="combat-kicker">{catalogue.combat.lastRound(tacticalLatest.round)}</p>
                <div
                  dangerouslySetInnerHTML={{
                    __html: tacticalRoundHtml(
                      tacticalLatest.actions,
                      catalogue,
                      lang,
                      combat.characterName,
                      { stop: tacticalLatest.stop },
                    ),
                  }}
                />
              </div>
            )}
            {tacticalLatest !== undefined &&
            tacticalOlder.length === 0 &&
            legacyOlder.length === 0 ? null : tacticalLatest === undefined ? (
              <div className="combat-latest">
                <p className="combat-kicker">{catalogue.combat.lastRound((latest as CombatRoundView).round)}</p>
                {showChips(latest as CombatRoundView)
                  ? roundLines(latest as CombatRoundView).map((line, index) => (
                      <p
                        key={index}
                        dangerouslySetInnerHTML={{
                          __html: wrapScenarioNames(
                            line,
                            roundNames(latest as CombatRoundView),
                            lang,
                          ),
                        }}
                      />
                    ))
                  : roundLines(latest as CombatRoundView).map((line, index) => (
                      <p key={index} lang="en">
                        {line}
                      </p>
                    ))}
                {showChips(latest as CombatRoundView) &&
                (latest as CombatRoundView).rolls.length > 0 ? (
                  <ul className="combat-rolls">
                    <RollChips
                      rolls={(latest as CombatRoundView).rolls}
                      enemyName={enemyNameOf(latest as CombatRoundView)}
                      characterName={combat.characterName}
                      catalogue={catalogue}
                      lang={lang}
                    />
                  </ul>
                ) : null}
              </div>
            ) : null}
            {tacticalOlder.length + legacyOlder.length > 0 ? (
              <ol className="combat-older">
                {tacticalOlder.map((round) => (
                  <li
                    key={`tactical-${round.round}`}
                    dangerouslySetInnerHTML={{
                      __html: tacticalRoundSummary(
                        round.round,
                        round.actions,
                        catalogue,
                        lang,
                        combat.characterName,
                      ),
                    }}
                  />
                ))}
                {legacyOlder.map((round) => (
                  <li key={round.round}>
                    <strong>{round.round}.</strong>{' '}
                    {showChips(round) ? (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: wrapScenarioNames(roundLines(round).join(' · '), roundNames(round), lang),
                        }}
                      />
                    ) : (
                      <span lang="en">{roundLines(round).join(' · ')}</span>
                    )}
                    {showChips(round) && round.rolls.length > 0 ? (
                      <span className="combat-reason">
                        {' '}·{' '}
                        <span
                          dangerouslySetInnerHTML={{
                            __html: wrapScenarioNames(
                              round.rolls
                                .map((roll) =>
                                  combatRollLine(
                                    roll,
                                    catalogue,
                                    combat.characterName,
                                    enemyNameOf(round),
                                  ),
                                )
                                .join(' · '),
                              roundNames(round),
                              lang,
                            ),
                          }}
                        />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
