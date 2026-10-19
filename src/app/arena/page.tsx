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
  type CombatActor,
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
 * Render a rejected reason with its catalogue line: listOptions reason
 * codes, Setup issue codes and import-envelope codes each have one, so a
 * `?notice=rejected&reason=` URL always explains itself. Unknown codes
 * fall back to the raw value, never to a crash.
 */
function rejectedText(
  catalogue: Catalogue,
  reason: string,
  params: SearchParams,
): string {
  const combatText = getCombatCatalogue(catalogue.code);
  const reasons = combatText.reasons as Record<string, string | ((...args: never[]) => string)>;
  const setupErrors = catalogue.arena.setupErrors as Record<string, string>;
  const importIssues = combatText.importIssues as Record<string, string>;
  if (reason in reasons) {
    const missing = Number(first(params, 'missing') ?? '');
    const availableRound = Number(first(params, 'availableRound') ?? '');
    switch (reason) {
      case 'insufficient_stamina':
        return combatText.reasons.insufficient_stamina(Number.isInteger(missing) ? missing : 0);
      case 'on_cooldown':
        return combatText.reasons.on_cooldown(Number.isInteger(availableRound) ? availableRound : 0);
      default:
        return String(reasons[reason]);
    }
  }
  if (reason in setupErrors) return setupErrors[reason]!;
  if (reason in importIssues) return importIssues[reason]!;
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
        {remembered.ok ? null : (
          <>
            <p role="status">{catalogue.arena.noRememberedSetup}</p>
            <SetupSection catalogue={catalogue} needsConfirm={false} />
          </>
        )}
      </main>
    );
  }

  const canRestart = fight.origin === 'setup' && fight.initial !== null;
  return (
    <main>
      <h1>{catalogue.arena.title}</h1>
      <p>{catalogue.arena.description}</p>
      <CommandPanelInteractive
        state={state}
        language={catalogue.code}
        initialQuery={initialQuery(params)}
        basePath="/arena"
        confirmAction="/arena/confirm"
        surrenderAction="/arena/surrender"
        confirmFields={{ expectedStep: String(fight.step) }}
        getActorName={nameOf}
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

/** The preset composition in profile codes: no new Interface Text needed. */
function presetComposition(id: ArenaPresetId): string {
  const setup = ARENA_PRESETS[id]!;
  const opponents = setup.opponents.map((opponent) => opponent.profileId).join(', ');
  return setup.companion === undefined ? opponents : `${opponents} + ${setup.companion}`;
}
