// The Arena page (Combat MVP 1.0, P5): the Arena playable end to end on the
// new rules. Setup configures 1–5 opponents in explicit order with an
// optional Companion (or a T1–T7 preset); the fight runs Round by Round in
// the shared command panel, persists per Session with origin, setup and
// initial, and ends in a result with Fight again from the remembered Setup.
//
// Every choice is a link and every commit a plain POST, so the Arena works
// without JavaScript: selection parameters never touch game state, the
// server previews through previewRound, and stale or illegal commands
// redirect with a transient notice without changing state or step.

import type { Metadata } from 'next';
import {
  ARENA_COMPANIONS,
  ARENA_OPPONENT_PROFILES,
  ARENA_PRESETS,
  ARENA_PRESET_IDS,
  parseArenaSetup,
  type ArenaPresetId,
  type ArenaRunIssueCode,
  type ArenaSetupIssueCode,
  type CombatActor,
  type ParseIssueCode,
  type ReasonCode,
} from '@/engine/combat/index';
import { getCombatCatalogue } from '@/i18n/combat';
import type { Catalogue } from '@/i18n/en';
import { getCatalogue } from '@/i18n/index';
import { ArenaFightStore, getDatabase } from '@/persistence/index';
import { CommandPanel, type CommandPanelNotice } from '../combat/command-panel';
import { CommandPanelInteractive } from '../combat/command-panel-interactive';
import { parseSelection } from '../combat/selection';
import { getInterfaceLanguage } from '../lib/language';
import { getSessionHash } from '../lib/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return {
    title: catalogue.arena.title,
    description: catalogue.arena.description,
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function initialQuery(params: SearchParams): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined) query[key] = single;
  }
  return query;
}

/**
 * Render a rejected reason with its catalogue line: every lookup below is a
 * typed catalogue key, so a missing or renamed message fails typecheck
 * (ADR 0003). Only the `reason` input itself is untyped — it arrives on the
 * URL — and codes outside all three families (a tampered URL) fall back to
 * the raw value, never to a crash.
 */
/** A raw string parameter off the rejection URL (a tampered URL reads empty). */
function paramText(params: SearchParams, key: string): string {
  return first(params, key) ?? '';
}

/** A numeric parameter off the rejection URL (a tampered URL reads zero). */
function paramCount(params: SearchParams, key: string): number {
  const value = Number(first(params, key) ?? '');
  return Number.isInteger(value) ? value : 0;
}

/**
 * Render a strict-parser failure with its ParseIssue Interface Text (handoff
 * A3): import failures carry a ParseIssue code with its parameters on the
 * URL. Codes outside the ParseIssue family read as null and fall through to
 * the reason-code rendering below.
 */
function parseIssueText(
  combatText: ReturnType<typeof getCombatCatalogue>,
  reason: string,
  params: SearchParams,
): string | null {
  const code = reason as ParseIssueCode;
  const issues = combatText.parseIssues;
  switch (code) {
    case 'bad_rules_version':
      return issues.bad_rules_version(paramText(params, 'actual'));
    case 'unexpected_state_version':
      return issues.unexpected_state_version;
    case 'bad_round':
      return issues.bad_round;
    case 'bad_phase':
      return issues.bad_phase;
    case 'bad_result':
      return issues.bad_result;
    case 'finished_without_result':
      return issues.finished_without_result;
    case 'result_before_finish':
      return issues.result_before_finish;
    case 'bad_next_group_serial':
      return issues.bad_next_group_serial;
    case 'bad_actors':
      return issues.bad_actors;
    case 'duplicate_actor_id':
      return issues.duplicate_actor_id(paramText(params, 'id'));
    case 'bad_actor_id':
      return issues.bad_actor_id(paramText(params, 'id'));
    case 'unknown_profile':
      return issues.unknown_profile({ id: paramText(params, 'id'), profileId: paramText(params, 'profileId') });
    case 'bad_team_role':
      return issues.bad_team_role(paramText(params, 'id'));
    case 'bad_stance':
      return issues.bad_stance(paramText(params, 'id'));
    case 'bad_group_id':
      return issues.bad_group_id(paramText(params, 'id'));
    case 'hp_out_of_range':
      return issues.hp_out_of_range({ id: paramText(params, 'id'), max: paramCount(params, 'max') });
    case 'bad_stamina':
      return issues.bad_stamina(paramText(params, 'id'));
    case 'bad_ready_round':
      return issues.bad_ready_round(paramText(params, 'id'));
    case 'bad_available_round':
      return issues.bad_available_round(paramText(params, 'id'));
    case 'bad_power':
      return issues.bad_power(paramText(params, 'id'));
    case 'bad_phase_offset':
      return issues.bad_phase_offset(paramText(params, 'id'));
    case 'bad_wait_age':
      return issues.bad_wait_age(paramText(params, 'id'));
    case 'missing_hero':
      return issues.missing_hero;
    case 'too_many_companions':
      return issues.too_many_companions(paramCount(params, 'count'));
    case 'bad_enemy_count':
      return issues.bad_enemy_count(paramCount(params, 'count'));
    case 'bad_state':
      return issues.bad_state;
    case 'bad_ref':
      return issues.bad_ref(paramText(params, 'id'));
    case 'bad_profile_role':
      return issues.bad_profile_role(paramText(params, 'id'));
    case 'no_living_hero':
      return issues.no_living_hero;
    case 'no_living_enemies':
      return issues.no_living_enemies;
    case 'bad_engagements':
      return issues.bad_engagements;
    case 'bad_engagement':
      return issues.bad_engagement({
        a: paramText(params, 'a'),
        b: paramText(params, 'b'),
        reason: paramText(params, 'reason'),
      });
    case 'bad_frozen_plans':
      return issues.bad_frozen_plans;
    case 'bad_frozen_plan':
      return issues.bad_frozen_plan(paramText(params, 'reason'));
    case 'bad_log':
      return issues.bad_log;
  }
  // Exhaustive over the ParseIssue family: a new code without a case above
  // fails typecheck here. At runtime a non-ParseIssue code (a reason code or
  // a tampered URL) falls through every case and reads as null, never
  // crashing.
  const _exhaustive: never = code;
  void _exhaustive;
  return null;
}

function rejectedText(
  catalogue: Catalogue,
  reason: string,
  params: SearchParams,
): string {
  const combatText = getCombatCatalogue(catalogue.code);
  const parseText = parseIssueText(combatText, reason, params);
  if (parseText !== null) return parseText;
  const code = reason as ReasonCode | ArenaSetupIssueCode | ArenaRunIssueCode;
  switch (code) {
    case 'insufficient_stamina':
      return combatText.reasons.insufficient_stamina(paramCount(params, 'missing'));
    case 'on_cooldown':
      return combatText.reasons.on_cooldown(paramCount(params, 'availableRound'));
    case 'stance_disallows':
      return combatText.reasons.stance_disallows;
    case 'no_shot_ability':
      return combatText.reasons.no_shot_ability;
    case 'not_engaged':
      return combatText.reasons.not_engaged;
    case 'must_disengage':
      return combatText.reasons.must_disengage;
    case 'actor_engaged':
      return combatText.reasons.actor_engaged;
    case 'target_far':
      return combatText.reasons.target_far;
    case 'target_not_near':
      return combatText.reasons.target_not_near;
    case 'requires_near_ally':
      return combatText.reasons.requires_near_ally;
    case 'invalid_target':
      return combatText.reasons.invalid_target;
    case 'wrong_round':
      return combatText.reasons.wrong_round;
    case 'wrong_phase':
      return combatText.reasons.wrong_phase;
    case 'in-combat':
      return combatText.reasons['in-combat'];
    case 'bad_setup':
      return catalogue.arena.setupErrors.bad_setup;
    case 'bad_opponent_count':
      return catalogue.arena.setupErrors.bad_opponent_count;
    case 'bad_opponent_profile':
      return catalogue.arena.setupErrors.bad_opponent_profile;
    case 'bad_starting_group':
      return catalogue.arena.setupErrors.bad_starting_group;
    case 'bad_engaged_flag':
      return catalogue.arena.setupErrors.bad_engaged_flag;
    case 'bad_phase_offset':
      return catalogue.arena.setupErrors.bad_phase_offset;
    case 'bad_power':
      return catalogue.arena.setupErrors.bad_power;
    case 'bad_companion':
      return catalogue.arena.setupErrors.bad_companion;
    case 'malformed':
      return combatText.importIssues.malformed;
    case 'unknown_schema_version':
      return combatText.importIssues.unknown_schema_version;
    case 'unexpected_state_version':
      return combatText.importIssues.unexpected_state_version;
    case 'bad_origin':
      return combatText.importIssues.bad_origin;
    case 'bad_initial':
      return combatText.importIssues.bad_initial;
  }
  // Exhaustive over the three code families: a new code without a case
  // above fails typecheck here (ADR 0003). At runtime a tampered URL falls
  // through every case and reads back raw, never crashing.
  const _exhaustive: never = code;
  void _exhaustive;
  return reason;
}

function panelNotice(catalogue: Catalogue, params: SearchParams): CommandPanelNotice | null {
  if (first(params, 'notice') === 'stale') return { kind: 'stale' };
  if (first(params, 'notice') === 'rejected') {
    return { kind: 'rejected', text: rejectedText(catalogue, first(params, 'reason') ?? '', params) };
  }
  return null;
}

export default async function ArenaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const catalogue = getCatalogue(await getInterfaceLanguage());
  const combatText = getCombatCatalogue(catalogue.code);
  const sessionHash = await getSessionHash();
  const fights = new ArenaFightStore(getDatabase());
  const read = sessionHash === undefined ? { status: 'missing' as const } : await fights.read(sessionHash);
  const rememberedRaw = sessionHash === undefined ? null : await fights.readSetup(sessionHash);
  const remembered = parseArenaSetup(rememberedRaw);
  const notice = panelNotice(catalogue, params);
  const confirm = first(params, 'confirm');
  const nameOf = (actor: CombatActor): string => catalogue.arena.profiles[actor.profileId];

  if (read.status === 'unreadable') {
    return (
      <main>
        <h1>{catalogue.arena.title}</h1>
        <p>{catalogue.arena.description}</p>
        <p role="status">{combatText.notices.unreadable}</p>
        <SetupSection catalogue={catalogue} needsConfirm={false} />
        <TransferSection catalogue={catalogue} canExport={false} needsConfirm={false} />
      </main>
    );
  }

  if (read.status === 'missing') {
    return (
      <main>
        <h1>{catalogue.arena.title}</h1>
        <p>{catalogue.arena.description}</p>
        {notice === null ? null : (
          <p role="status">
            {notice.kind === 'stale' ? combatText.notices.stale : combatText.notices.rejected(notice.text)}
          </p>
        )}
        <SetupSection catalogue={catalogue} needsConfirm={false} />
        <TransferSection catalogue={catalogue} canExport={false} needsConfirm={false} />
      </main>
    );
  }

  const { fight } = read;
  const state = fight.combat;
  const selection = parseSelection(params, state);

  if (state.phase === 'FINISHED') {
    return (
      <main>
        <h1>{catalogue.arena.title}</h1>
        <p>{catalogue.arena.description}</p>
        {fight.origin === 'import' ? (
          <p role="status">{combatText.notices.importUnverified}</p>
        ) : null}
        <CommandPanel
          state={state}
          language={catalogue.code}
          selection={selection}
          basePath="/arena"
          confirmAction="/arena/confirm"
          surrenderAction="/arena/surrender"
          getActorName={nameOf}
          notice={notice}
          footer={
            remembered.ok ? (
              <form method="post" action="/arena/start">
                <p className="cp-dim">{catalogue.arena.fightAgainBlurb}</p>
                <input type="hidden" name="fightAgain" value="1" />
                <button type="submit">{catalogue.arena.fightAgain}</button>
              </form>
            ) : undefined
          }
        />
        <TransferSection catalogue={catalogue} canExport={true} needsConfirm={false} />
        {remembered.ok ? null : (
          <>
            <p role="status">{catalogue.arena.noRememberedSetup}</p>
            <SetupSection catalogue={catalogue} needsConfirm={false} />
          </>
        )}
      </main>
    );
  }

  // Restart returns to the opening `initial`: Setup-started runs always
  // carry one, and so do PLAN imports (A3); CHOOSE and FINISHED imports
  // store none.
  const canRestart =
    (fight.origin === 'setup' || fight.origin === 'import') && fight.initial !== null;
  // Pre-rendered display names by actor id: functions cannot cross the
  // server/client boundary, so the interactive panel takes these serializable
  // names (the server-rendered result panel below keeps getActorName).
  const names: Record<string, string> = {};
  for (const actor of state.actors) names[actor.id] = nameOf(actor);
  return (
    <main>
      <h1>{catalogue.arena.title}</h1>
      <p>{catalogue.arena.description}</p>
      {fight.origin === 'import' ? (
        <p role="status">{combatText.notices.importUnverified}</p>
      ) : null}
      <CommandPanelInteractive
        state={state}
        language={catalogue.code}
        initialQuery={initialQuery(params)}
        basePath="/arena"
        confirmAction="/arena/confirm"
        surrenderAction="/arena/surrender"
        confirmFields={{ expectedStep: String(fight.step) }}
        names={names}
        notice={notice}
      />
      {canRestart ? (
        <section aria-label={catalogue.arena.restart}>
          <h2>{catalogue.arena.restart}</h2>
          <p className="cp-dim">{catalogue.arena.restartBlurb}</p>
          {confirm === 'restart' ? (
            <p role="status">
              <b>{catalogue.arena.restartConfirmHeading}</b> {catalogue.arena.restartConfirmBody}
            </p>
          ) : null}
          <form method="post" action="/arena/restart">
            <input type="hidden" name="expectedStep" value={String(fight.step)} />
            <label>
              <input type="checkbox" name="confirm" value="1" required /> {catalogue.arena.restartConfirmBody}
            </label>{' '}
            <button type="submit">{catalogue.arena.restart}</button>
          </form>
        </section>
      ) : null}
      {confirm === 'replace' ? (
        <section aria-label={catalogue.arena.replaceHeading}>
          <h2>{catalogue.arena.replaceHeading}</h2>
          <p role="status">{catalogue.arena.replaceBody}</p>
          <p>
            <a href="/arena">{catalogue.arena.keepFighting}</a>
          </p>
        </section>
      ) : null}
      <TransferSection catalogue={catalogue} canExport={true} needsConfirm={true} />
      <SetupSection catalogue={catalogue} needsConfirm={true} />
    </main>
  );
}

function SetupSection({ catalogue, needsConfirm }: { catalogue: Catalogue; needsConfirm: boolean }) {
  return (
    <>
      <section aria-label={catalogue.arena.setupHeading}>
        <h2>{catalogue.arena.setupHeading}</h2>
        <form method="post" action="/arena/start">
          <fieldset>
            <legend>{catalogue.arena.opponentsHeading}</legend>
            <label>
              {catalogue.arena.countLabel}{' '}
              <select name="count" defaultValue="1">
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={String(count)}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            {[0, 1, 2, 3, 4].map((index) => (
              <fieldset key={index}>
                <legend>{catalogue.arena.opponentLegend(index + 1)}</legend>
                <label>
                  {catalogue.arena.profileLabel}{' '}
                  <select name={`opponents[${index}].profile`} defaultValue={index === 0 ? 'brute' : 'raider'}>
                    {ARENA_OPPONENT_PROFILES.map((profile) => (
                      <option key={profile} value={profile}>
                        {catalogue.arena.profiles[profile]}
                      </option>
                    ))}
                  </select>
                </label>{' '}
                <label>
                  {catalogue.arena.groupLabel}{' '}
                  <select name={`opponents[${index}].group`} defaultValue="g0">
                    {['g0', 'g1', 'g2'].map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </label>{' '}
                <label>
                  <input
                    type="checkbox"
                    name={`opponents[${index}].engaged`}
                    defaultChecked={index === 0}
                  />{' '}
                  {catalogue.arena.engagedLabel}
                </label>{' '}
                <label>
                  {catalogue.arena.phaseOffsetLabel}{' '}
                  <input
                    type="number"
                    name={`opponents[${index}].phase`}
                    defaultValue="0"
                    min="0"
                    step="1"
                  />
                </label>{' '}
                <label>
                  {catalogue.arena.powerLabel}{' '}
                  <input
                    type="number"
                    name={`opponents[${index}].power`}
                    defaultValue="0"
                    min="0"
                    max="3"
                    step="1"
                  />
                </label>
              </fieldset>
            ))}
          </fieldset>
          <fieldset>
            <legend>{catalogue.arena.companionHeading}</legend>
            <label>
              <input type="radio" name="companion" value="none" defaultChecked /> {catalogue.arena.companionNone}
            </label>{' '}
            {ARENA_COMPANIONS.map((companion) => (
              <label key={companion}>
                <input type="radio" name="companion" value={companion} />{' '}
                {catalogue.arena.profiles[companion]}
              </label>
            ))}
          </fieldset>
          {needsConfirm ? (
            <p role="status">
              <label>
                <input type="checkbox" name="confirm" value="1" required /> {catalogue.arena.replaceBody}
              </label>
            </p>
          ) : null}
          <button type="submit">{catalogue.arena.startFight}</button>
        </form>
      </section>
      <section aria-label={catalogue.arena.presetsHeading}>
        <h2>{catalogue.arena.presetsHeading}</h2>
        <p className="cp-dim">{catalogue.arena.presetsBlurb}</p>
        <ul>
          {ARENA_PRESET_IDS.map((id: ArenaPresetId) => (
            <li key={id}>
              <form method="post" action="/arena/start">
                <input type="hidden" name="preset" value={id} />
                {needsConfirm ? (
                  <label>
                    <input type="checkbox" name="confirm" value="1" required /> {catalogue.arena.replaceBody}
                  </label>
                ) : null}{' '}
                <button type="submit">{catalogue.arena.presetStart(id)}</button>{' '}
                <span className="cp-dim">{presetComposition(id)}</span>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/**
 * Import and export (handoff A3): the export is a plain link to the download
 * route, and the import is one form with both a file input and a plain
 * `<textarea>` paste, so both work without JavaScript. The file wins when
 * both are submitted; both go through the one strict parse in the import
 * route. Replacing a CHOOSE fight needs the in-page confirmation, like the
 * Setup and preset forms above.
 */
function TransferSection({
  catalogue,
  canExport,
  needsConfirm,
}: {
  catalogue: Catalogue;
  canExport: boolean;
  needsConfirm: boolean;
}) {
  return (
    <>
      {canExport ? (
        <p>
          <a href="/arena/export" download>
            {catalogue.arena.exportFight}
          </a>
        </p>
      ) : null}
      <section aria-label={catalogue.arena.importHeading}>
        <h2>{catalogue.arena.importHeading}</h2>
        <p className="cp-dim">{catalogue.arena.importBlurb}</p>
        <form method="post" action="/arena/import" encType="multipart/form-data">
          <p>
            <label htmlFor="arena-import-file">{catalogue.arena.fileLabel} </label>
            <input id="arena-import-file" type="file" name="file" accept="application/json,.json" />
          </p>
          <p>
            <label htmlFor="arena-import-pasted">{catalogue.arena.pasteLabel}</label>
            <br />
            <textarea id="arena-import-pasted" name="pasted" rows={8} cols={60} />
          </p>
          {needsConfirm ? (
            <p role="status">
              <label>
                <input type="checkbox" name="confirm" value="1" required /> {catalogue.arena.replaceBody}
              </label>
            </p>
          ) : null}
          <button type="submit">{catalogue.arena.importSubmit}</button>
        </form>
      </section>
    </>
  );
}

/** The preset composition in profile codes: no new Interface Text needed. */
function presetComposition(id: ArenaPresetId): string {
  const setup = ARENA_PRESETS[id]!;
  const opponents = setup.opponents.map((opponent) => opponent.profileId).join(', ');
  return setup.companion === undefined ? opponents : `${opponents} + ${setup.companion}`;
}
