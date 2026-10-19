// The production command panel (Combat MVP 1.0, P4 U2/U3/U4/U8): the shared
// UI C component both modes render. Three columns — hero and companion on the
// left, enemy Intents as the target list in the centre, stance/cards/forecast
// on the right — rebuilt from the prototype's layout (never its code).
//
// The component is server-safe (no hooks, no browser APIs): the no-JavaScript
// render and the interactive panel share this exact markup. Every choice is a
// link whose query parameters resolve through parseSelection without touching
// game state or advancing any step; the forecast comes only from previewRound
// through deriveForecast; Confirm and Surrender are plain POST forms whose
// endpoints the adapters own (P5/P6).

import type { ReactNode } from 'react';
import {
  ATTACK_SLOT_BUDGET,
  CARDS,
  GUARD,
  MOVEMENT_COSTS,
  PROFILES,
  engagementsOf,
  isCardId,
  isPrimaryAttack,
  rangeOf,
} from '../../engine/combat/index';
import type {
  ActionId,
  ActorId,
  CardId,
  CombatActor,
  CombatState,
  OptionReason,
  Range,
  Stance,
} from '../../engine/combat/index';
import { getCombatCatalogue } from '../../i18n/combat';
import type { CombatCatalogue } from '../../i18n/combat';
import type { InterfaceLanguage } from '../../i18n/languages';
import { deriveForecast, type HaltCode } from './forecast';
import { cardReasons, selectionCommand, selectionHref, targetCandidates } from './selection';
import type { PanelSelection } from './selection';

export type CommandPanelNotice = { kind: 'stale' } | { kind: 'rejected'; text: string };

export interface CommandPanelProps {
  state: CombatState;
  language: InterfaceLanguage;
  selection: PanelSelection;
  /** Path the selection links point at, e.g. "/arena". */
  basePath: string;
  /** Plain-POST endpoints owned by the adapters. */
  confirmAction: string;
  surrenderAction: string;
  /** Extra hidden fields for the Confirm form (e.g. the adapter's step guard). */
  confirmFields?: Record<string, string>;
  /** Display names; defaults to the canonical actor id. Adapters name Arena
   *  fighters from their profile and Scenario fighters from content. */
  getActorName?: (actor: CombatActor) => string;
  notice?: CommandPanelNotice | null;
  /** Adapter actions under the finished result (Fight again, Continue, …). */
  footer?: ReactNode;
}

const STANCES: readonly Stance[] = ['aggressive', 'balanced', 'defensive'];
const STANCE_ICON: Record<Stance, string> = { aggressive: '▲', balanced: '◆', defensive: '▼' };
const RANGE_ICON: Record<Range, string> = { self: '◎', melee: '⚔', near: '◐', far: '◌' };
const CARD_GROUP: readonly CardId[] = ['heavy', 'counter', 'feint', 'cover', 'charge', 'prepare'];
const BASIC_GROUP: readonly ActionId[] = ['strike', 'brace', 'shot'];
const MOVE_GROUP: readonly ActionId[] = ['approach', 'disengage', 'withdraw'];

function defaultName(actor: CombatActor): string {
  return actor.id;
}

/** Every listOptions reason code as Interface Text (handoff U3: all of them). */
function reasonText(text: CombatCatalogue, reason: OptionReason): string {
  switch (reason.code) {
    case 'insufficient_stamina':
      return text.reasons.insufficient_stamina(Number(reason.params?.missing ?? 0));
    case 'on_cooldown':
      return text.reasons.on_cooldown(Number(reason.params?.availableRound ?? 0));
    case 'stance_disallows':
      return text.reasons.stance_disallows;
    case 'no_shot_ability':
      return text.reasons.no_shot_ability;
    case 'not_engaged':
      return text.reasons.not_engaged;
    case 'must_disengage':
      return text.reasons.must_disengage;
    case 'actor_engaged':
      return text.reasons.actor_engaged;
    case 'target_far':
      return text.reasons.target_far;
    case 'target_not_near':
      return text.reasons.target_not_near;
    case 'requires_near_ally':
      return text.reasons.requires_near_ally;
    case 'invalid_target':
      return text.reasons.invalid_target;
    case 'wrong_round':
      return text.reasons.wrong_round;
    case 'wrong_phase':
      return text.reasons.wrong_phase;
    case 'in-combat':
      return text.reasons['in-combat'];
  }
}

function haltText(text: CombatCatalogue, code: HaltCode): string {
  switch (code) {
    case 'must_disengage':
      return text.reasons.must_disengage;
    case 'target_far':
      return text.reasons.target_far;
    case 'invalid_target':
      return text.reasons.invalid_target;
    default:
      return text.cancelReasons[code];
  }
}

function actionCost(actionId: ActionId): number {
  if (isCardId(actionId)) return CARDS[actionId].cost;
  if (actionId === 'disengage') return MOVEMENT_COSTS['disengage'];
  return 0;
}

function actorById(state: CombatState, id: ActorId): CombatActor | undefined {
  return state.actors.find((actor) => actor.id === id);
}

export function CommandPanel(props: CommandPanelProps) {
  const { state, language, selection, basePath } = props;
  const text = getCombatCatalogue(language);
  const nameOf = (id: ActorId): string => {
    const actor = actorById(state, id);
    if (actor === undefined) return id;
    const name = (props.getActorName ?? defaultName)(actor);
    return name === actor.id ? actor.id : `${name} · ${actor.id}`;
  };
  const hero = actorById(state, 'h01');
  const companion = actorById(state, 'c01') ?? null;
  const enemies = state.actors.filter((actor) => actor.role === 'enemy');
  const finished = state.phase === 'FINISHED';
  const resolved = selectionCommand(state, selection);
  const slotsUsed = state.frozenEnemyPlans.filter((plan) => plan.attackSlot).length;

  return (
    <section className="cp" aria-label={text.panel.forecastHeading}>
      {props.notice !== null && props.notice !== undefined ? (
        <p className="cp-notice" role="status">
          {props.notice.kind === 'stale' ? text.notices.stale : text.notices.rejected(props.notice.text)}
        </p>
      ) : null}
      <ThreatStrip state={state} text={text} nameOf={nameOf} />
      <div className="cp-columns">
        <div className="cp-col cp-left">
          {hero === undefined ? null : (
            <HeroCard
              state={state}
              hero={hero}
              text={text}
              selection={selection}
              basePath={basePath}
              nameOf={nameOf}
            />
          )}
          {companion === null ? null : (
            <CompanionCard
              state={state}
              companion={companion}
              text={text}
              selection={selection}
              basePath={basePath}
              nameOf={nameOf}
            />
          )}
        </div>
        <div className="cp-col cp-center">
          <Perspective state={state} text={text} selection={selection} basePath={basePath} nameOf={nameOf} />
          <h2>{text.panel.intentsHeading}</h2>
          <p className="cp-dim">
            ⚔ {text.panel.slotsLine(slotsUsed, ATTACK_SLOT_BUDGET)}
          </p>
          <div className="cp-intents">
            {enemies.map((enemy) => (
              <Intent
                key={enemy.id}
                state={state}
                enemy={enemy}
                text={text}
                selection={selection}
                basePath={basePath}
                nameOf={nameOf}
              />
            ))}
          </div>
        </div>
        <div className="cp-col cp-right">
          {finished ? (
            <ResultPanel state={state} text={text} footer={props.footer} />
          ) : (
            <>
              <StancePicker text={text} selection={selection} basePath={basePath} />
              <CardPicker
                state={state}
                text={text}
                selection={selection}
                basePath={basePath}
              />
              <TargetStep state={state} text={text} selection={selection} nameOf={nameOf} />
              <Forecast state={state} text={text} selection={selection} resolved={resolved} nameOf={nameOf} />
              <ConfirmForm
                state={state}
                text={text}
                selection={selection}
                resolved={resolved}
                action={props.confirmAction}
                extraFields={props.confirmFields}
              />
              <SurrenderForm state={state} text={text} action={props.surrenderAction} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ThreatStrip({
  state,
  text,
  nameOf,
}: {
  state: CombatState;
  text: CombatCatalogue;
  nameOf: (id: ActorId) => string;
}) {
  const slotted = state.frozenEnemyPlans.filter((plan) => plan.attackSlot);
  if (state.phase === 'FINISHED' || slotted.length === 0) return null;
  return (
    <div className="cp-threat" aria-hidden="true">
      {slotted.map((plan) => (
        <span key={plan.actorId}>
          ⚔ {nameOf(plan.actorId)}: {text.actions[plan.actionId]} →{' '}
          {plan.targetId === null ? '—' : nameOf(plan.targetId)}
        </span>
      ))}
    </div>
  );
}

function LegalityLine({
  legal,
  reasons,
  text,
}: {
  legal: boolean;
  reasons: OptionReason[];
  text: CombatCatalogue;
}) {
  return (
    <small className={legal ? 'cp-ok' : 'cp-reason'}>
      {legal ? `✓ ${text.panel.legalTarget}` : `✕ ${reasons.map((r) => reasonText(text, r)).join(' · ')}`}
    </small>
  );
}

function HeroCard({
  state,
  hero,
  text,
  selection,
  basePath,
  nameOf,
}: {
  state: CombatState;
  hero: CombatActor;
  text: CombatCatalogue;
  selection: PanelSelection;
  basePath: string;
  nameOf: (id: ActorId) => string;
}) {
  const engaged = engagementsOf(state, hero.id);
  const cooldowns = Object.entries(hero.availableRound).filter(([, round]) => (round ?? 0) > state.round);
  const candidates =
    selection.actionId === null ? [] : targetCandidates(state, selection.stance, selection.actionId);
  const selfRow = candidates.find((option) => option.targetId === hero.id);
  const stamina = hero.stamina ?? 0;
  const maxStamina = PROFILES[hero.profileId].maxStamina ?? stamina;
  return (
    <section className="cp-box" aria-label={text.panel.heroHeading}>
      <span className="cp-eyebrow">
        {text.panel.heroHeading} · h01
      </span>
      <h2>{nameOf(hero.id)}</h2>
      <p>{text.panel.hpLine(hero.hp, PROFILES[hero.profileId].maxHp)}</p>
      <Meter value={hero.hp} max={PROFILES[hero.profileId].maxHp} label={text.panel.hpLine(hero.hp, PROFILES[hero.profileId].maxHp)} />
      <p>{text.panel.staminaLine(stamina, maxStamina)}</p>
      <p>
        {STANCE_ICON[selection.stance]} {text.stances[selection.stance]}
      </p>
      <p>{engaged.length > 0 ? `⚔ ${text.panel.engagedWith(engaged.map(nameOf).join(', '))}` : `◯ ${text.panel.free}`}</p>
      <p className="cp-dim">
        ☀ {hero.readyRound !== null ? text.panel.prepared(hero.readyRound) : text.panel.notPrepared}
      </p>
      <p className="cp-dim">
        {text.panel.cooldowns}:{' '}
        {cooldowns.length === 0
          ? text.panel.allReady
          : cooldowns.map(([action, round]) => text.panel.availableFrom(text.actions[action as ActionId], round ?? 0)).join(' · ')}
      </p>
      {selfRow === undefined ? null : (
        <p>
          <TargetLink
            state={state}
            selection={selection}
            basePath={basePath}
            targetId={hero.id}
            legal={selfRow.legal}
            label={text.panel.selfWord}
          />{' '}
          <LegalityLine legal={selfRow.legal} reasons={selfRow.reasons} text={text} />
        </p>
      )}
    </section>
  );
}

function CompanionCard({
  state,
  companion,
  text,
  selection,
  basePath,
  nameOf,
}: {
  state: CombatState;
  companion: CombatActor;
  text: CombatCatalogue;
  selection: PanelSelection;
  basePath: string;
  nameOf: (id: ActorId) => string;
}) {
  const plan = state.frozenCompanionPlan;
  const candidates =
    selection.actionId === null ? [] : targetCandidates(state, selection.stance, selection.actionId);
  const allyRow = candidates.find((option) => option.targetId === companion.id);
  const stamina = companion.stamina ?? 0;
  const maxStamina = PROFILES[companion.profileId].maxStamina ?? stamina;
  return (
    <section className="cp-box" aria-label={text.panel.companionHeading}>
      <span className="cp-eyebrow">
        {text.panel.companionHeading} · c01
      </span>
      <h3>{nameOf(companion.id)}</h3>
      {companion.hp <= 0 ? (
        <p>✝ {text.panel.eliminated}</p>
      ) : (
        <>
          <p>{text.panel.hpLine(companion.hp, PROFILES[companion.profileId].maxHp)}</p>
          <Meter
            value={companion.hp}
            max={PROFILES[companion.profileId].maxHp}
            label={text.panel.hpLine(companion.hp, PROFILES[companion.profileId].maxHp)}
          />
          <p>{text.panel.staminaLine(stamina, maxStamina)}</p>
          {plan === null || state.phase === 'FINISHED' ? null : (
            <p className="cp-dim">
              {STANCE_ICON[plan.stance]} {text.stances[plan.stance]} · {text.actions[plan.actionId]} →{' '}
              {plan.targetId === null ? '—' : nameOf(plan.targetId)}
            </p>
          )}
          {allyRow === undefined ? null : (
            <p>
              <TargetLink
                state={state}
                selection={selection}
                basePath={basePath}
                targetId={companion.id}
                legal={allyRow.legal}
                label={nameOf(companion.id)}
              />{' '}
              <LegalityLine legal={allyRow.legal} reasons={allyRow.reasons} text={text} />
            </p>
          )}
        </>
      )}
    </section>
  );
}

function TargetLink({
  state,
  selection,
  basePath,
  targetId,
  legal,
  label,
}: {
  state: CombatState;
  selection: PanelSelection;
  basePath: string;
  targetId: ActorId;
  legal: boolean;
  label: string;
}) {
  const selected = selection.targetId === targetId && selection.actionId !== null;
  if (!legal && !selected) {
    return (
      <span aria-disabled="true" className="cp-target">
        {label}
      </span>
    );
  }
  return (
    <a
      className="cp-target"
      data-sel=""
      aria-current={selected ? 'true' : undefined}
      href={selectionHref(basePath, selection, { targetId })}
    >
      {label}
    </a>
  );
}

function Perspective({
  state,
  text,
  selection,
  basePath,
  nameOf,
}: {
  state: CombatState;
  text: CombatCatalogue;
  selection: PanelSelection;
  basePath: string;
  nameOf: (id: ActorId) => string;
}) {
  const companion = actorById(state, 'c01');
  const options: ActorId[] = ['h01'];
  if (companion !== undefined && companion.hp > 0) options.push('c01');
  return (
    <p className="cp-dim">
      {text.panel.perspectiveHeading}:{' '}
      {options.map((id, index) => (
        <span key={id}>
          {index > 0 ? ' · ' : null}
          <a data-sel="" aria-current={selection.perspectiveId === id ? 'true' : undefined} href={selectionHref(basePath, selection, { perspectiveId: id })}>
            {nameOf(id)}
          </a>
        </span>
      ))}
    </p>
  );
}

function Intent({
  state,
  enemy,
  text,
  selection,
  basePath,
  nameOf,
}: {
  state: CombatState;
  enemy: CombatActor;
  text: CombatCatalogue;
  selection: PanelSelection;
  basePath: string;
  nameOf: (id: ActorId) => string;
}) {
  const plan = state.frozenEnemyPlans.find((p) => p.actorId === enemy.id);
  const range = rangeOf(state, selection.perspectiveId, enemy.id);
  if (enemy.hp <= 0) {
    return (
      <div className="cp-intent cp-out">
        <small>{enemy.id}</small> <b>{nameOf(enemy.id)}</b> — ✝ {text.panel.eliminated}
      </div>
    );
  }
  const candidates =
    selection.actionId === null ? [] : targetCandidates(state, selection.stance, selection.actionId);
  const row = candidates.find((option) => option.targetId === enemy.id);
  const selected = selection.actionId !== null && selection.targetId === enemy.id;
  const slotBadge =
    plan === undefined ? null : plan.attackSlot ? (
      <b className="cp-badge cp-badge-slot">⚔ {text.panel.slotAttack}</b>
    ) : plan.actionId === 'wait' ? (
      <b className="cp-badge cp-badge-wait">
        ⏸ {text.panel.slotWaiting(GUARD['wait'])} · {text.panel.slotWould(text.actions['wait'])}
      </b>
    ) : (
      <b className="cp-badge">◇ {text.actions[plan.actionId]}</b>
    );
  const body = (
    <>
      <span className="cp-intent-top">
        <small>
          {enemy.id} · {RANGE_ICON[range]} {text.ranges[range]}
          {selection.perspectiveId !== 'h01' ? ` (${nameOf(selection.perspectiveId)})` : null}
        </small>
        {slotBadge}
      </span>
      <span className="cp-intent-name">
        <b>{nameOf(enemy.id)}</b>
        <span>{text.panel.hpLine(enemy.hp, PROFILES[enemy.profileId].maxHp)}</span>
      </span>
      <Meter
        value={enemy.hp}
        max={PROFILES[enemy.profileId].maxHp}
        label={text.panel.hpLine(enemy.hp, PROFILES[enemy.profileId].maxHp)}
      />
      <span className="cp-dim">
        {STANCE_ICON[plan?.stance ?? enemy.stance]} {text.stances[plan?.stance ?? enemy.stance]} ·{' '}
        {text.panel.armorLine(PROFILES[enemy.profileId].armor)}
      </span>
      {plan !== undefined && plan.actionId !== 'wait' && state.phase !== 'FINISHED' ? (
        <strong className="cp-intent-plan">
          {text.actions[plan.actionId]} → {plan.targetId === null ? '—' : nameOf(plan.targetId)}
          {isPrimaryAttack(plan.actionId) ? ` · ${text.panel.priorityLine(plan.priority)}` : null}
        </strong>
      ) : null}
      {row === undefined ? null : <LegalityLine legal={row.legal} reasons={row.reasons} text={text} />}
    </>
  );
  if (row === undefined || (!row.legal && !selected)) {
    return <div className="cp-intent">{body}</div>;
  }
  return (
    <a
      className={`cp-intent${selected ? ' cp-selected' : ''}`}
      data-sel=""
      aria-current={selected ? 'true' : undefined}
      href={selectionHref(basePath, selection, { targetId: enemy.id })}
    >
      {body}
    </a>
  );
}

function StancePicker({
  text,
  selection,
  basePath,
}: {
  text: CombatCatalogue;
  selection: PanelSelection;
  basePath: string;
}) {
  return (
    <fieldset className="cp-step">
      <legend>{text.panel.stanceHeading}</legend>
      <div className="cp-stances">
        {STANCES.map((stance) => (
          <a
            key={stance}
            data-sel=""
            aria-current={selection.stance === stance ? 'true' : undefined}
            href={selectionHref(basePath, selection, { stance })}
          >
            {STANCE_ICON[stance]} {text.stances[stance]}
          </a>
        ))}
      </div>
    </fieldset>
  );
}

function CardPicker({
  state,
  text,
  selection,
  basePath,
}: {
  state: CombatState;
  text: CombatCatalogue;
  selection: PanelSelection;
  basePath: string;
}) {
  const groups: { heading: string | null; actions: readonly ActionId[] }[] = [
    { heading: null, actions: CARD_GROUP },
    { heading: text.panel.basicHeading, actions: BASIC_GROUP },
    { heading: text.panel.movementHeading, actions: MOVE_GROUP },
  ];
  return (
    <fieldset className="cp-step">
      <legend>{text.panel.cardsHeading}</legend>
      {groups.map((group, index) => (
        <div key={index}>
          {group.heading === null ? null : <h3>{group.heading}</h3>}
          <div className="cp-cards">
            {group.actions.map((actionId) => (
              <Card
                key={actionId}
                state={state}
                text={text}
                selection={selection}
                basePath={basePath}
                actionId={actionId}
              />
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

function Card({
  state,
  text,
  selection,
  basePath,
  actionId,
}: {
  state: CombatState;
  text: CombatCatalogue;
  selection: PanelSelection;
  basePath: string;
  actionId: ActionId;
}) {
  const reasons = cardReasons(state, selection.stance, actionId);
  const selectable = targetCandidates(state, selection.stance, actionId).some((option) => option.legal);
  const cost = actionCost(actionId);
  const selected = selection.actionId === actionId;
  const body = (
    <>
      <b>
        {text.actions[actionId]}
        {cost > 0 ? ` · ${text.panel.costLine(cost)}` : null}
      </b>
      {reasons.length === 0 ? null : (
        <small className="cp-reason">{reasons.map((r) => reasonText(text, r)).join(' · ')}</small>
      )}
    </>
  );
  if (!selectable && !selected) {
    return (
      <span className="cp-card" aria-disabled="true">
        {body}
      </span>
    );
  }
  return (
    <a
      className={`cp-card${selected ? ' cp-selected' : ''}`}
      data-sel=""
      aria-current={selected ? 'true' : undefined}
      aria-disabled={selectable ? undefined : 'true'}
      href={selectionHref(basePath, selection, { actionId, targetId: selection.targetId })}
    >
      {body}
    </a>
  );
}

function TargetStep({
  state,
  text,
  selection,
  nameOf,
}: {
  state: CombatState;
  text: CombatCatalogue;
  selection: PanelSelection;
  nameOf: (id: ActorId) => string;
}) {
  const resolved = selectionCommand(state, selection);
  let body: ReactNode;
  if (selection.actionId === null) {
    body = <p className="cp-dim">{text.panel.chooseTargetHint}</p>;
  } else {
    const candidates = targetCandidates(state, selection.stance, selection.actionId);
    if (candidates.length === 0) {
      body = <p className="cp-dim">{text.panel.noTargets}</p>;
    } else if (resolved.ok) {
      body = (
        <p>
          {text.panel.targetHeading}:{' '}
          <b>{resolved.command.targetId === null ? '—' : nameOf(resolved.command.targetId)}</b>
        </p>
      );
    } else if (!resolved.complete) {
      body = <p className="cp-dim">{text.panel.chooseTargetHint}</p>;
    } else {
      body = (
        <p className="cp-reason">
          {resolved.reasons.map((r) => reasonText(text, r)).join(' · ')}
        </p>
      );
    }
  }
  return (
    <div className="cp-step">
      <h3>{text.panel.targetHeading}</h3>
      {body}
    </div>
  );
}

function Forecast({
  state,
  text,
  selection,
  resolved,
  nameOf,
}: {
  state: CombatState;
  text: CombatCatalogue;
  selection: PanelSelection;
  resolved: ReturnType<typeof selectionCommand>;
  nameOf: (id: ActorId) => string;
}) {
  if (selection.actionId === null) {
    return (
      <div className="cp-step">
        <h3>{text.panel.forecastHeading}</h3>
        <p className="cp-dim">{text.panel.forecastNone}</p>
      </div>
    );
  }
  if (!resolved.ok) {
    return (
      <div className="cp-step">
        <h3>{text.panel.forecastHeading}</h3>
        <p className="cp-reason">
          {text.panel.forecastBlocked}{' '}
          {resolved.complete ? resolved.reasons.map((r) => reasonText(text, r)).join(' · ') : null}
        </p>
      </div>
    );
  }
  const derived = deriveForecast(state, resolved.command);
  if (!derived.ok) {
    return (
      <div className="cp-step">
        <h3>{text.panel.forecastHeading}</h3>
        <p className="cp-reason">{text.panel.forecastBlocked}</p>
      </div>
    );
  }
  const { forecast } = derived;
  const terminalCut = forecast.terminal && (forecast.result === 'WIN' || forecast.result === 'LOSS');
  return (
    <div className="cp-step">
      <h3>{text.panel.forecastHeading}</h3>
      <h4>{text.panel.movementHeading}</h4>
      <ul>
        {forecast.moves.map((move, index) => {
          const detail = move.success
            ? [
                move.target === null ? null : nameOf(move.target),
                move.variant === null ? null : text.panel.moveVariant[move.variant],
                move.group === null ? null : text.panel.moveGroup(move.group),
              ]
                .filter((part) => part !== null)
                .join(' · ')
            : move.reason === null
              ? null
              : haltText(text, move.reason);
          return (
            <li key={index}>
              {text.events.moved({
                actor: nameOf(move.actor),
                action: text.actions[move.action as ActionId],
                target: move.target === null ? null : nameOf(move.target),
                success: move.success,
                detail,
              })}
            </li>
          );
        })}
      </ul>
      <h4>{text.panel.blowsHeading}</h4>
      <ul>
        {forecast.blows.map((blow, index) => (
          <li key={index}>
            {blow.redirected ? <b className="cp-tag">{text.panel.coverTag(nameOf(blow.recipient), nameOf(blow.target))}</b> : null}{' '}
            {blow.counter ? <b className="cp-tag">{text.panel.counterTag}</b> : null}{' '}
            {blow.kind === 'riposte' ? <b className="cp-tag">{text.panel.riposteTag}</b> : null}
            <details>
              <summary>
                {text.panel.blowSummary({
                  actor: nameOf(blow.actor),
                  target: nameOf(blow.target),
                  hit: blow.hit,
                  hpLoss: blow.hpLoss,
                })}
              </summary>
              <p>
                {text.events[blow.kind]({
                  actor: nameOf(blow.actor),
                  target: nameOf(blow.target),
                  recipient: nameOf(blow.recipient),
                  redirected: blow.redirected,
                  counter: blow.counter,
                  range: text.ranges[blow.range as Range],
                  attackScore: blow.attackScore,
                  defenseScore: blow.defenseScore,
                  hit: blow.hit,
                  raw: blow.raw,
                  parry: blow.parry,
                  armor: blow.armor,
                  absorbed: blow.absorbed,
                  hpLoss: blow.hpLoss,
                })}
              </p>
            </details>
          </li>
        ))}
        {forecast.cancels.map((cancel, index) => (
          <li key={`cancel-${index}`} className="cp-reason">
            {text.events.cancelled({
              actor: nameOf(cancel.actor),
              target: cancel.target === null ? null : nameOf(cancel.target),
              reason: haltText(text, cancel.reason),
            })}
          </li>
        ))}
        {forecast.eliminations.map((actor) => (
          <li key={`out-${actor}`}>✝ {text.events.eliminated(nameOf(actor))}</li>
        ))}
      </ul>
      {forecast.result === null ? null : <p>{text.events.finished({ result: forecast.result, round: state.round })}</p>}
      {terminalCut && forecast.unacted.length > 0 ? (
        <p className="cp-cutoff">{text.panel.cutoffLine(forecast.unacted.map((u) => nameOf(u.actor)).join(', '))}</p>
      ) : null}
      <h4>{text.panel.afterHeading}</h4>
      <ul>
        {forecast.after.map((after) => (
          <li key={after.id}>
            {nameOf(after.id)} · {text.panel.hpLine(after.hp, after.maxHp)}
            {after.stamina === null || after.maxStamina === null
              ? null
              : ` · ${text.panel.staminaLine(after.stamina, after.maxStamina)}`}
          </li>
        ))}
      </ul>
      <p className="cp-dim">
        {text.panel.engagementsAfter(
          forecast.engagementsAfter.length === 0
            ? text.panel.engagementsNone
            : forecast.engagementsAfter.map((pair) => `${nameOf(pair[0])}–${nameOf(pair[1])}`).join(', '),
        )}
      </p>
      <h4>{text.panel.regenHeading}</h4>
      {terminalCut ? (
        <p className="cp-dim">{text.panel.noRegeneration}</p>
      ) : (
        <ul>
          {forecast.regens.map((regen) => (
            <li key={regen.actor}>
              {text.events.regenerated({ actor: nameOf(regen.actor), gain: regen.gain, stamina: regen.stamina })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfirmForm({
  state,
  text,
  selection,
  resolved,
  action,
  extraFields,
}: {
  state: CombatState;
  text: CombatCatalogue;
  selection: PanelSelection;
  resolved: ReturnType<typeof selectionCommand>;
  action: string;
  extraFields?: Record<string, string>;
}) {
  const command = resolved.ok ? resolved.command : null;
  return (
    <form method="post" action={action}>
      <input type="hidden" name="round" value={String(state.round)} />
      <input type="hidden" name="stance" value={command?.stance ?? selection.stance} />
      <input type="hidden" name="action" value={command?.actionId ?? selection.actionId ?? ''} />
      <input type="hidden" name="target" value={command?.targetId ?? ''} />
      {extraFields === undefined
        ? null
        : Object.entries(extraFields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <button type="submit" disabled={!resolved.ok}>
        {text.panel.confirm}
      </button>
    </form>
  );
}

function SurrenderForm({
  state,
  text,
  action,
}: {
  state: CombatState;
  text: CombatCatalogue;
  action: string;
}) {
  return (
    <form method="post" action={action}>
      <input type="hidden" name="round" value={String(state.round)} />
      <button type="submit">{text.panel.surrender}</button>
    </form>
  );
}

function ResultPanel({ state, text, footer }: { state: CombatState; text: CombatCatalogue; footer?: ReactNode }) {
  return (
    <div className="cp-step">
      <h3>{text.panel.resultHeading}</h3>
      {state.result === null ? null : (
        <p>
          <b>{text.results[state.result]}</b> · {text.panel.roundLine(state.round)}
        </p>
      )}
      {footer}
    </div>
  );
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="cp-meter" role="img" aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
