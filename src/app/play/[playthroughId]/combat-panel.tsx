// The Combat panel (docs/spec/ui.md, Combat panel): tactical variant A,
// "Lanes & target picker". From top to bottom: a header with a kicker, the
// Encounter name and the opening narration; one Range lane per participant
// with an Intent bubble and badges; the order strip; the target picker while
// two participants survive; four action groups; and the log newest first
// with a "Last round" callout.
//
// Every mechanic comes from the engine's arena projection: lanes, Intents,
// badges, legal targets, per-target availability, thresholds, Speeds and
// predicted order positions. `?target=` only selects which survivor the
// targeted forms post; the server validates the posted target independently,
// and the parameter itself writes nothing. Posts plain forms so Combat works
// without JavaScript; the server action is injected (page.tsx passes the
// Combat server action) so tests can drive this module directly with
// react-dom/server.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly with react-dom/server.

import type { ComponentProps } from 'react';
import {
  renderNarration,
  type CombatArenaAction,
  type CombatArenaParticipant,
  type CombatArenaTarget,
  type CombatRoll,
  type CombatRoundView,
  type GameView,
} from '../../../engine/index';
import type { Catalogue } from '../../../i18n/index';
import {
  combatActionLabel,
  combatReasonText,
  combatRollLine,
  combatRoundLines,
  combatTargetReasonText,
  intentDisplayName,
  participantDisplayName,
  wrapScenarioNames,
} from '../../lib/combat-text';
import { CombatOrderPreview } from './combat-order-preview';

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

/** The capital letter from a same-kind ordinal (1 → A, 2 → B). */
function ordinalLetter(ordinal: number): string {
  return String.fromCharCode(64 + ordinal);
}

/**
 * The picker's survivor among the arena lanes: the requested id while it
 * names a survivor, else the first survivor. Undefined with no survivors.
 */
function selectedLane(
  lanes: CombatArenaParticipant[],
  legalTargets: readonly string[],
  requestedId: string | undefined,
): CombatArenaParticipant | undefined {
  const id =
    requestedId !== undefined && legalTargets.includes(requestedId)
      ? requestedId
      : legalTargets[0];
  if (id === undefined) return undefined;
  return lanes.find((lane) => lane.participantId === id);
}

function CombatArenaActionButton({
  entry,
  target,
  waryUntilRound,
  total,
  playthroughId,
  step,
  formAction,
  catalogue,
  lang,
}: {
  entry: CombatArenaAction;
  /** The picker's survivor for targeted actions; undefined on untargeted ones. */
  target?: CombatArenaTarget;
  /** The selected lane's last Wary round, for the Distract reason. */
  waryUntilRound?: number;
  /** The predicted order's total: the Intents plus the Character's action. */
  total: number;
  playthroughId: string;
  step: number;
  formAction: CombatFormAction;
  catalogue: Catalogue;
  /** The language of the Scenario names shown in the label, meta and reason. */
  lang: string;
}) {
  const targeted = entry.targets !== undefined;
  const targetName =
    target === undefined ? '' : participantDisplayName(target.name, target.ordinal);
  // A targeted action is available only when both the entry and the selected
  // target allow it; the reason names the selected target where applicable.
  const enabled = entry.enabled && (target === undefined || target.enabled);
  const reason = !entry.enabled
    ? combatReasonText(entry, catalogue)
    : target === undefined
      ? undefined
      : combatTargetReasonText(entry, target, { waryUntilRound }, catalogue);
  // Weapon and item names inside labels, meta and reasons are Scenario text:
  // each keeps its own element with the Scenario language (docs/spec/ui.md,
  // shared presentation), the Interface Text around it does not.
  const names = [entry.weaponName ?? '', entry.itemName ?? '', targetName];
  const label = {
    __html: wrapScenarioNames(combatActionLabel(entry, catalogue), names, lang),
  };
  const meta: string[] = [
    catalogue.combat.speeds[entry.speed],
    catalogue.combat.actsOrder(entry.order, total),
  ];
  // A targeted rolled action (Attack, Distract) reads its threshold against
  // the selected target; an untargeted rolled action (Fall back, Escape)
  // carries its own.
  const threshold = targeted ? target?.threshold : entry.threshold;
  if (threshold !== undefined) meta.push(catalogue.combat.needsThreshold(threshold));
  if (entry.id === 'escape' && entry.escapeBonus !== undefined && entry.escapeBonus > 0) {
    meta.push(catalogue.combat.escapeBonus(entry.escapeBonus));
  }
  if (targetName !== '') meta.push(catalogue.combat.towards(targetName));
  const metaHtml = {
    __html: wrapScenarioNames(meta.join(' · '), names, lang),
  };
  const reasonId = `combat-reason-${entry.id}${entry.itemId === undefined ? '' : `-${entry.itemId}`}`;
  const reasonHtml =
    reason === undefined
      ? null
      : { __html: wrapScenarioNames(reason, names, lang) };
  // The order-strip preview text is composed server-side; the client only
  // swaps it into the hint chip, never inventing a position.
  const previewText = catalogue.combat.previewChip(
    entry.order,
    combatActionLabel(entry, catalogue),
  );
  const body = (
    <>
      <span className="combat-button-label" dangerouslySetInnerHTML={label} />
      <span className="combat-meta" dangerouslySetInnerHTML={metaHtml} />
    </>
  );
  if (!enabled) {
    return (
      <div className="combat-action">
        <button
          className="combat-button"
          type="button"
          disabled
          aria-describedby={reasonHtml === null ? undefined : reasonId}
          data-preview-order={entry.order}
          data-preview-text={previewText}
        >
          {body}
        </button>
        {reasonHtml === null ? null : (
          <p id={reasonId} className="combat-reason" dangerouslySetInnerHTML={reasonHtml} />
        )}
      </div>
    );
  }
  return (
    <form action={formAction} className="combat-action">
      <input type="hidden" name="playthroughId" value={playthroughId} />
      <input type="hidden" name="expectedStep" value={step} />
      <input type="hidden" name="combat" value={entry.id} />
      {targeted && target !== undefined ? (
        <input type="hidden" name="target" value={target.participantId} />
      ) : null}
      {entry.itemId !== undefined ? (
        <input type="hidden" name="item" value={entry.itemId} />
      ) : null}
      <p>
        <button
          className="combat-button"
          type="submit"
          data-preview-order={entry.order}
          data-preview-text={previewText}
        >
          {body}
        </button>
      </p>
    </form>
  );
}

function laneSummary(
  lane: CombatArenaParticipant,
  intentTotal: number,
  catalogue: Catalogue,
): string {
  const display = participantDisplayName(lane.name, lane.ordinal);
  if (lane.defeated || lane.intent === undefined || lane.range === undefined) {
    return `${display}: ${catalogue.combat.defeatedBadge}.`;
  }
  const speed = lane.intentSpeed === undefined ? '' : catalogue.combat.speeds[lane.intentSpeed];
  const intent = intentDisplayName(lane.intent, lane.reach, catalogue);
  const effect =
    (lane.intent === 'strike' || lane.intent === 'heavy-attack') &&
    lane.threshold !== undefined &&
    lane.guardedThreshold !== undefined
      ? ` ${catalogue.combat.damage(lane.damage)} · ${catalogue.combat.hitsYouOn(lane.threshold, lane.guardedThreshold)}`
      : '';
  const preparation =
    lane.preparation === undefined
      ? ''
      : ` ${catalogue.combat.preparesNext(
          intentDisplayName('heavy-attack', lane.reach, catalogue),
          catalogue.combat.speeds[lane.preparation.speed],
          lane.preparation.damage,
        )}`;
  const badges: string[] = [];
  if (lane.prepared) {
    badges.push(
      lane.reach === 'ranged' ? catalogue.combat.preparedRanged : catalogue.combat.preparedMelee,
    );
  }
  if (lane.waryUntilRound !== undefined) {
    badges.push(catalogue.combat.waryUntil(lane.waryUntilRound));
  }
  const badgesText = badges.length === 0 ? '' : ` ${badges.join(' · ')}`;
  return (
    `${display}: ${catalogue.range[lane.range]}, ` +
    `Health ${lane.health}/${lane.maxHealth}. ` +
    `${intent}, ${speed}${effect}${preparation}.${badgesText} ` +
    `${catalogue.combat.placeOf(lane.order ?? 0, intentTotal)}.`
  );
}

function Lane({
  lane,
  intentTotal,
  catalogue,
  lang,
}: {
  lane: CombatArenaParticipant;
  /** The Intents' count, for the screen-reader place ("1st of 2"). */
  intentTotal: number;
  catalogue: Catalogue;
  /** The language of the Scenario names shown. */
  lang: string;
}) {
  const display = participantDisplayName(lane.name, lane.ordinal);
  const defeated = lane.defeated || lane.intent === undefined || lane.range === undefined;
  const percent = healthPercent(lane.health, lane.maxHealth);
  const rangeWord = lane.range === undefined ? '' : catalogue.range[lane.range];
  const speedName =
    lane.intentSpeed === undefined ? '' : catalogue.combat.speeds[lane.intentSpeed];
  const intentName =
    lane.intent === undefined ? '' : intentDisplayName(lane.intent, lane.reach, catalogue);
  const isAttack = lane.intent === 'strike' || lane.intent === 'heavy-attack';
  const summaryNames = [display];
  return (
    <div className="tactical-lane">
      {/* The lane drawing is decorative; the summary below carries its text. */}
      <div
        className={defeated ? 'tactical-lane-visual is-defeated' : `tactical-lane-visual ${lane.range}`}
        aria-hidden="true"
      >
        {!defeated && lane.intent !== undefined ? (
          <p
            className={lane.intent === 'prepare' ? 'tactical-intent is-prepare' : 'tactical-intent'}
            data-bubble-order={lane.order}
          >
            <span className="tactical-disc" data-bubble-disc>
              {lane.order}
            </span>{' '}
            <span className="tactical-speed">{speedName}</span>{' '}
            <strong>{intentName}</strong>
            {isAttack &&
            lane.threshold !== undefined &&
            lane.guardedThreshold !== undefined ? (
              <>
                {' '}
                <span className="tactical-effect">
                  {catalogue.combat.damage(lane.damage)} ·{' '}
                  {catalogue.combat.hitsYouOn(lane.threshold, lane.guardedThreshold)}
                </span>
              </>
            ) : null}
            {lane.preparation !== undefined ? (
              <>
                {' '}
                <span className="tactical-effect">
                  {catalogue.combat.preparesNext(
                    intentDisplayName('heavy-attack', lane.reach, catalogue),
                    catalogue.combat.speeds[lane.preparation.speed],
                    lane.preparation.damage,
                  )}
                </span>
              </>
            ) : null}
          </p>
        ) : null}
        <div className="tactical-ground" />
        {defeated ? null : lane.range === 'near' ? (
          <span className="tactical-clash">⚔</span>
        ) : (
          <span className="tactical-far">{catalogue.combat.farMarker(rangeWord)}</span>
        )}
        <div className="tactical-medallion">
          <div className={percent <= 34 ? 'combat-ring low' : 'combat-ring'}>
            <span className={defeated ? 'combat-face is-defeated' : 'combat-face'}>
              {initial(lane.name)}
            </span>
            {lane.ordinal === undefined ? null : (
              <span className="combat-letter">{ordinalLetter(lane.ordinal)}</span>
            )}
          </div>
          <p className="combat-name">{display}</p>
          <p className="combat-health">
            {lane.health}/{lane.maxHealth}
          </p>
          <p className="combat-detail">
            {catalogue.inventory.weaponStats(lane.damage, catalogue.reach[lane.reach])}
          </p>
          <p className="combat-badges">
            {lane.prepared ? (
              <span className="combat-badge">
                {lane.reach === 'ranged'
                  ? catalogue.combat.preparedRanged
                  : catalogue.combat.preparedMelee}
              </span>
            ) : null}
            {lane.waryUntilRound !== undefined ? (
              <span className="combat-badge">{catalogue.combat.waryUntil(lane.waryUntilRound)}</span>
            ) : null}
            {lane.defeated ? (
              <span className="combat-badge is-defeated">{catalogue.combat.defeatedBadge}</span>
            ) : null}
          </p>
        </div>
        {defeated ? null : <div className="tactical-range">{rangeWord}</div>}
      </div>
      <p
        className="visually-hidden"
        dangerouslySetInnerHTML={{
          __html: wrapScenarioNames(laneSummary(lane, intentTotal, catalogue), summaryNames, lang),
        }}
      />
    </div>
  );
}

function arenaActionById(
  actions: CombatArenaAction[],
  id: CombatArenaAction['id'],
  total: number,
): CombatArenaAction {
  const found = actions.find((action) => action.id === id && action.itemId === undefined);
  if (found !== undefined) return found;
  // The engine always returns every action; this fallback only keeps the
  // panel rendering if that ever changes.
  const group: CombatArenaAction['group'] =
    id === 'advance' || id === 'fall-back'
      ? 'position'
      : id === 'attack' || id === 'defend' || id === 'distract'
        ? 'fight'
        : id === 'use-item'
          ? 'items'
          : 'leave';
  return { id, group, enabled: false, speed: 'normal', order: total };
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
  formAction,
  catalogue,
  lang,
  badge,
  selectedTargetId,
  targetHrefFor,
}: {
  combat: CombatView;
  playthroughId: string;
  step: number;
  /** The rolls of the current Combat, since its opening narration. */
  rounds: CombatRoundView[];
  formAction: CombatFormAction;
  /** Interface Text: the game screen passes the current catalogue. */
  catalogue: Catalogue;
  /** The language of the Scenario text shown. */
  lang: string;
  /** The fallback badge, shown after the Encounter name while the Scenario falls back. */
  badge?: React.ReactNode;
  /**
   * The `?target=` selection: the survivor the targeted forms post. A value
   * naming no survivor falls back to the first survivor, like the page.
   */
  selectedTargetId: string | undefined;
  /** A picker link for a surviving participant. */
  targetHrefFor: (participantId: string) => string;
}) {
  const arena = combat.arena;
  const lanes = arena.participants;
  const survivors = lanes.filter((lane) => !lane.defeated);
  const intentTotal = arena.order.length;
  // The predicted order's total: the Intents plus the Character's action.
  const total = intentTotal + 1;
  const selected = selectedLane(lanes, arena.legalTargets, selectedTargetId);
  const laneById = (participantId: string): CombatArenaParticipant | undefined =>
    lanes.find((lane) => lane.participantId === participantId);
  const targetOf = (entry: CombatArenaAction): CombatArenaTarget | undefined => {
    if (entry.targets === undefined || selected === undefined) return undefined;
    return entry.targets.find((target) => target.participantId === selected.participantId);
  };
  const [latest, ...older] = [...rounds].reverse();
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
  const itemEntries = arena.actions.filter((action) => action.group === 'items');
  const weaponDisplay = combat.character.weaponName ?? catalogue.combat.unarmed;
  const speedName = (speed: CombatArenaAction['speed']): string => catalogue.combat.speeds[speed];
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
      <CombatOrderPreview>
        <section className="tactical-arena" aria-label={catalogue.combat.arenaLabel}>
          <div className="tactical-side">
            <div
              className={
                healthPercent(combat.character.health, combat.character.maxHealth) <= 34
                  ? 'combat-ring low'
                  : 'combat-ring'
              }
            >
              <span className="combat-face" aria-hidden="true">
                {initial(combat.characterName)}
              </span>
            </div>
            <p className="combat-name">{combat.characterName}</p>
            <p className="combat-health">
              {combat.character.health}/{combat.character.maxHealth}
            </p>
            <p className="combat-detail">
              {weaponDisplay} ·{' '}
              {catalogue.inventory.weaponStats(
                combat.character.damage,
                catalogue.reach[combat.character.reach],
              )}
            </p>
          </div>
          {lanes.map((lane) => (
            <Lane
              key={lane.participantId}
              lane={lane}
              intentTotal={intentTotal}
              catalogue={catalogue}
              lang={lang}
            />
          ))}
        </section>
        <section className="combat-order" aria-label={catalogue.combat.thisRound}>
          <h2>{catalogue.combat.thisRound}</h2>
          <ol className="combat-order-list">
            {arena.order.map((entry) => {
              const lane = laneById(entry.participantId);
              const name = participantDisplayName(entry.name, entry.ordinal);
              const text =
                `#${entry.order} · ${speedName(entry.speed)} · ` +
                `${name}: ${intentDisplayName(entry.intent, lane?.reach ?? 'melee', catalogue)}`;
              return (
                <li
                  key={entry.participantId}
                  className="combat-chip"
                  data-order-pos={entry.order}
                  dangerouslySetInnerHTML={{
                    __html: wrapScenarioNames(text, [name], lang),
                  }}
                />
              );
            })}
            <li className="combat-chip is-hint" data-strip-hint>
              {catalogue.combat.orderHint}
            </li>
          </ol>
        </section>
      </CombatOrderPreview>
      {survivors.length > 1 && selected !== undefined ? (
        <nav className="combat-targets" aria-label={catalogue.combat.targetPicker}>
          <span className="combat-targets-label">{catalogue.combat.targetPicker}</span>
          <ul>
            {survivors.map((survivor) => {
              const name = participantDisplayName(survivor.name, survivor.ordinal);
              const current = survivor.participantId === selected.participantId;
              const survivorRange =
                survivor.range === undefined ? '' : catalogue.range[survivor.range];
              return (
                <li key={survivor.participantId}>
                  <a
                    href={targetHrefFor(survivor.participantId)}
                    aria-current={current ? 'true' : undefined}
                  >
                    <span aria-hidden="true">{current ? '◉' : '○'}</span>{' '}
                    <span lang={lang}>{name}</span>{' '}
                    <span className="combat-target-range">{survivorRange}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="meta">{catalogue.combat.targetNote}</p>
        </nav>
      ) : null}
      <div className="combat-actions">
        <section aria-label={catalogue.combat.groups.position} className="combat-group">
          <h2>{catalogue.combat.groups.position}</h2>
          {(['advance', 'fall-back'] as const).map((id) => {
            const entry = arenaActionById(arena.actions, id, total);
            return (
              <CombatArenaActionButton
                key={id}
                entry={entry}
                target={targetOf(entry)}
                waryUntilRound={selected?.waryUntilRound}
                total={total}
                playthroughId={playthroughId}
                step={step}
                formAction={formAction}
                catalogue={catalogue}
                lang={lang}
              />
            );
          })}
        </section>
        <section aria-label={catalogue.combat.groups.fight} className="combat-group">
          <h2>{catalogue.combat.groups.fight}</h2>
          {(['attack', 'defend', 'distract'] as const).map((id) => {
            const entry = arenaActionById(arena.actions, id, total);
            return (
              <CombatArenaActionButton
                key={id}
                entry={entry}
                target={targetOf(entry)}
                waryUntilRound={selected?.waryUntilRound}
                total={total}
                playthroughId={playthroughId}
                step={step}
                formAction={formAction}
                catalogue={catalogue}
                lang={lang}
              />
            );
          })}
        </section>
        <section aria-label={catalogue.combat.groups.items} className="combat-group">
          <h2>{catalogue.combat.groups.items}</h2>
          {itemEntries.length === 0 ? (
            <p className="combat-reason">{catalogue.combat.noConsumables}</p>
          ) : (
            itemEntries.map((entry) => (
              <CombatArenaActionButton
                key={entry.itemId}
                entry={entry}
                target={targetOf(entry)}
                waryUntilRound={selected?.waryUntilRound}
                total={total}
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
          {(['escape'] as const).map((id) => {
            const entry = arenaActionById(arena.actions, id, total);
            return (
              <CombatArenaActionButton
                key={id}
                entry={entry}
                target={targetOf(entry)}
                waryUntilRound={selected?.waryUntilRound}
                total={total}
                playthroughId={playthroughId}
                step={step}
                formAction={formAction}
                catalogue={catalogue}
                lang={lang}
              />
            );
          })}
        </section>
      </div>
      <section aria-label={catalogue.combat.log} className="combat-log">
        <h2>{catalogue.combat.log}</h2>
        {latest === undefined ? (
          <p className="meta">{catalogue.combat.noRolls}</p>
        ) : (
          <>
            <div className="combat-latest">
              <p className="combat-kicker">{catalogue.combat.lastRound(latest.round)}</p>
              {showChips(latest)
                ? roundLines(latest).map((line, index) => (
                    <p
                      key={index}
                      dangerouslySetInnerHTML={{
                        __html: wrapScenarioNames(line, roundNames(latest), lang),
                      }}
                    />
                  ))
                : roundLines(latest).map((line, index) => (
                    <p key={index} lang="en">
                      {line}
                    </p>
                  ))}
              {showChips(latest) && latest.rolls.length > 0 ? (
                <ul className="combat-rolls">
                  <RollChips
                    rolls={latest.rolls}
                    enemyName={enemyNameOf(latest)}
                    characterName={combat.characterName}
                    catalogue={catalogue}
                    lang={lang}
                  />
                </ul>
              ) : null}
            </div>
            {older.length > 0 ? (
              <ol className="combat-older">
                {older.map((round) => (
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
