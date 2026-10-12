// The Combat panel (docs/spec/ui.md, Combat panel): variant C, "Arena,
// compact". From top to bottom: a header with a kicker, the Encounter name
// and the opening narration; a one-line Range arena with Health-ring
// medallions; four action columns (Position, Fight, Items, Leave); and the
// log newest first with a "Last round" callout.
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
} from '../../../engine/index';

export type CombatView = Extract<GameView, { kind: 'combat' }>;

/** A form target: the Combat server action in production, a URL in tests. */
export type CombatFormAction = ComponentProps<'form'>['action'];

/**
 * One roll as presented: `<name>: d1+d2+mod = total vs target — hit, N
 * Damage | success | miss`. A hit that deals no Damage (Fall back, Escape)
 * reads "success", never "hit, 0 Damage".
 */
export function formatCombatRoll(
  roll: CombatRoll,
  characterName: string,
  enemyName: string,
): string {
  const who = roll.side === 'character' ? characterName : enemyName;
  const outcome = roll.hit
    ? roll.damage > 0
      ? `hit, ${roll.damage} Damage`
      : 'success'
    : 'miss';
  return `${who}: ${roll.die1}+${roll.die2}+${roll.modifier} = ${roll.total} vs ${roll.target} — ${outcome}`;
}

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
}: {
  availability: CombatAvailability;
  playthroughId: string;
  step: number;
  formAction: CombatFormAction;
}) {
  if (!availability.enabled) {
    return (
      <div className="combat-action">
        <button className="combat-button" type="button" disabled>
          {availability.label}
        </button>
        {availability.reason ? <p className="combat-reason">{availability.reason}</p> : null}
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
        <button className="combat-button" type="submit">
          {availability.label}
        </button>
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
  guard,
}: {
  side: 'character' | 'enemy';
  name: string;
  health: number;
  maxHealth: number;
  detail: string;
  guard?: boolean;
}) {
  const percent = healthPercent(health, maxHealth);
  return (
    <div className={side === 'character' ? 'combat-medallion char' : 'combat-medallion enemy'}>
      <div
        className={percent <= 34 ? 'combat-ring low' : 'combat-ring'}
        style={{ '--combat-health': `${percent}%` } as React.CSSProperties}
        title={`Health ${health}/${maxHealth}`}
      >
        <span className="combat-face" aria-hidden="true">
          {initial(name)}
        </span>
        {guard ? <span className="combat-guard">Guard up</span> : null}
      </div>
      <p className="combat-name">{name}</p>
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
  const group =
    id === 'advance' || id === 'fall-back'
      ? 'Position'
      : id === 'attack' || id === 'defend'
        ? 'Fight'
        : id === 'use-item'
          ? 'Items'
          : 'Leave';
  return { id, group, label: id, enabled: false };
}

export function CombatPanel({
  combat,
  playthroughId,
  step,
  guardUp,
  rounds,
  consumables,
  formAction,
}: {
  combat: CombatView;
  playthroughId: string;
  step: number;
  /** Derived from the latest round's Journal entry; never stored. */
  guardUp: boolean;
  /** The rolls of the current Combat, since its opening narration. */
  rounds: CombatRoundView[];
  consumables: { itemId: string; name: string }[];
  formAction: CombatFormAction;
}) {
  const near = combat.range === 'near';
  const [latest, ...older] = [...rounds].reverse();
  const formatRoll = (roll: CombatRoll): string =>
    formatCombatRoll(roll, combat.characterName, combat.enemy.name);
  const itemActions = consumables.map(
    (consumable) =>
      combat.actions.find(
        (action) => action.id === 'use-item' && action.itemId === consumable.itemId,
      ) ?? {
        id: 'use-item' as const,
        group: 'Items' as const,
        label: `Use ${consumable.name}`,
        enabled: false,
        itemId: consumable.itemId,
      },
  );
  return (
    <>
      <header className="combat-header">
        <p className="combat-kicker">
          Combat · {combat.locationName} · Round {combat.round}
        </p>
        <h1>{combat.encounterName}</h1>
        <div
          className="combat-narration"
          dangerouslySetInnerHTML={{
            __html: renderNarration(combat.text, combat.characterName),
          }}
        />
      </header>
      <section
        className={near ? 'combat-arena near' : 'combat-arena far'}
        aria-label={near ? 'Range: Near' : 'Range: Far'}
      >
        <div className="combat-ground" aria-hidden="true" />
        <div className="combat-gap" aria-hidden="true">
          {near ? (
            <span className="combat-clash">⚔</span>
          ) : (
            <span className="combat-far">‹ — — Far — — ›</span>
          )}
        </div>
        <Medallion
          side="character"
          name={combat.characterName}
          health={combat.character.health}
          maxHealth={combat.character.maxHealth}
          detail={`${combat.character.weaponName} · Reach ${combat.character.reach} · Damage ${combat.character.damage}`}
          guard={guardUp}
        />
        <Medallion
          side="enemy"
          name={combat.enemy.name}
          health={combat.enemy.health}
          maxHealth={combat.enemy.maxHealth}
          detail={`Reach ${combat.enemy.reach} · Damage ${combat.enemy.damage}`}
        />
        <div className="combat-range">{near ? 'NEAR' : 'FAR'}</div>
      </section>
      <div className="combat-actions">
        <section aria-label="Position" className="combat-group">
          <h2>Position</h2>
          <CombatActionButton
            availability={actionById(combat.actions, 'advance')}
            playthroughId={playthroughId}
            step={step}
            formAction={formAction}
          />
          <CombatActionButton
            availability={actionById(combat.actions, 'fall-back')}
            playthroughId={playthroughId}
            step={step}
            formAction={formAction}
          />
        </section>
        <section aria-label="Fight" className="combat-group">
          <h2>Fight</h2>
          <CombatActionButton
            availability={actionById(combat.actions, 'attack')}
            playthroughId={playthroughId}
            step={step}
            formAction={formAction}
          />
          <CombatActionButton
            availability={actionById(combat.actions, 'defend')}
            playthroughId={playthroughId}
            step={step}
            formAction={formAction}
          />
        </section>
        <section aria-label="Items" className="combat-group">
          <h2>Items</h2>
          {itemActions.length === 0 ? (
            <p className="combat-reason">No Consumables held.</p>
          ) : (
            itemActions.map((availability) => (
              <CombatActionButton
                key={availability.itemId}
                availability={availability}
                playthroughId={playthroughId}
                step={step}
                formAction={formAction}
              />
            ))
          )}
        </section>
        <section aria-label="Leave" className="combat-group">
          <h2>Leave</h2>
          <CombatActionButton
            availability={actionById(combat.actions, 'escape')}
            playthroughId={playthroughId}
            step={step}
            formAction={formAction}
          />
        </section>
      </div>
      <section aria-label="Combat log" className="combat-log">
        <h2>Log</h2>
        {latest === undefined ? (
          <p className="meta">No rolls yet.</p>
        ) : (
          <>
            <div className="combat-latest">
              <p className="combat-kicker">Last round · {latest.round}</p>
              <p>{latest.text}</p>
              <ul className="combat-rolls">
                {latest.rolls.map((roll, index) => (
                  <li key={index} className={roll.hit ? 'combat-roll hit' : 'combat-roll miss'}>
                    {formatRoll(roll)}
                  </li>
                ))}
              </ul>
            </div>
            {older.length > 0 ? (
              <ol className="combat-older">
                {older.map((round) => (
                  <li key={round.round}>
                    <strong>{round.round}.</strong> {round.text}
                    {round.rolls.length > 0 ? (
                      <span className="combat-reason"> · {round.rolls.map(formatRoll).join(' · ')}</span>
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
