// The Arena page (issue #166): the Bestiary setup, the running fight through
// the existing Combat panel, and the result screen. One run per Session,
// stored outside the Playthrough stores, so reloading mid-fight resumes the
// same Combat without ever listing the fight among the Session's Playthroughs.
// The last setup is remembered per Session apart from the run (issue #171),
// so reopening the Arena restores it and Fight again restarts it fresh.

import type { Metadata } from 'next';
import { arenaResult, arenaSummary } from '@/engine/index';
import { getCatalogue, type Catalogue } from '@/i18n/index';
import { getInterfaceLanguage } from '@/app/lib/language';
import { getSessionHash } from '@/app/lib/session';
import { ArenaSetupStore, ArenaStore, getDatabase } from '@/persistence/index';
import { CombatPanel } from '../play/[playthroughId]/combat-panel';
import { arenaCombatAction, rematchArenaAction, resetArenaAction } from './actions';
import { BESTIARY, DEFAULT_ARENA_CHARACTER, bestiaryDescription, bestiaryName } from './bestiary';
import { arenaCombatView, arenaFoeName, arenaTacticalRounds } from './combat-view';
import {
  arenaSetupFromRemembered,
  parseRememberedSetup,
  rememberedFormDefaults,
} from './last-setup';
import {
  ARENA_CONSUMABLE,
  OUTFITS,
  TALISMANS,
  WEAPON_OPTIONS,
  equipmentDescription,
  equipmentName,
} from './equipment';
import { getArenaPresets } from './presets';
import ArenaSetupForm from './setup-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return {
    title: catalogue.arena.title,
    description: catalogue.arena.description,
  };
}

/**
 * The transient rejection notice, rendered from its code on the page the
 * action redirects to, in the language current at that moment. Anything else
 * (a forged `notice` value) renders no notice.
 */
function noticeTextFor(catalogue: Catalogue, notice: string | undefined): string | undefined {
  if (notice === 'stale') return catalogue.notices.stale;
  if (notice === 'unavailable') return catalogue.notices.unavailable;
  return undefined;
}

export default async function ArenaPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const language = await getInterfaceLanguage();
  const catalogue = getCatalogue(language);
  const noticeText = noticeTextFor(catalogue, notice);
  const sessionHash = await getSessionHash();
  const database = getDatabase();
  const run =
    sessionHash === undefined ? null : await new ArenaStore(database).findBySession(sessionHash);
  // The Session's remembered setup, validated on read: an unknown id (a
  // Bestiary entry removed since) restores per-field fallbacks on the form
  // and hides Fight again, so the page always opens.
  const rememberedRaw =
    sessionHash === undefined ? null : await new ArenaSetupStore(database).findRaw(sessionHash);
  const remembered = rememberedRaw === null ? undefined : parseRememberedSetup(rememberedRaw);
  const rememberedDefaults = remembered === undefined ? undefined : rememberedFormDefaults(remembered);
  const rematchable =
    remembered === undefined
      ? undefined
      : arenaSetupFromRemembered(remembered, language);

  // No run: the Arena Setup. Two opponent slots, each with its own starting
  // Range; the second slot defaults to none. Only these two slots exist, so a
  // third opponent is impossible in the UI; the server validates the count and
  // the Range values independently. The controls restore the Session's
  // remembered setup when one was remembered, else the first entry is
  // pre-selected with the default Character, so Start works without JavaScript
  // and without touching anything; with JavaScript a preset fills the
  // Character controls, which stay editable. The form key remounts it when
  // the restored setup changes, so Back to setup always shows what was fought.
  if (run === null) {
    const character = DEFAULT_ARENA_CHARACTER;
    const setupDefaults = {
      opponent1: rememberedDefaults?.opponent1 ?? {
        enemy: BESTIARY[0]?.id ?? 'grey-wolf',
        range: BESTIARY[0]?.range ?? 'near',
      },
      opponent2: rememberedDefaults?.opponent2 ?? null,
      attributes: rememberedDefaults?.attributes ?? { ...character.attributes },
      health: rememberedDefaults?.health ?? character.health,
      weapon: rememberedDefaults?.weapon ?? 'unarmed',
      outfit: rememberedDefaults?.outfit ?? 'none',
      talisman: rememberedDefaults?.talisman ?? 'none',
      consumables: rememberedDefaults?.consumables ?? 1,
    };
    // Equipment options as plain localized props: the setup form posts raw ids
    // back, and the Start action re-validates every one, so the fight never
    // trusts the browser. Weapon meta is Damage · Reach; bonus meta is +1
    // Attribute, empty on the empty slots.
    const weapons = WEAPON_OPTIONS.map((option) => ({
      id: option.id,
      name: equipmentName(option, language),
      description: equipmentDescription(option, language),
      meta: catalogue.inventory.weaponStats(option.damage, catalogue.reach[option.reach]),
    }));
    const bonusMeta = (bonus: 'might' | 'agility' | 'wits' | 'presence' | undefined): string =>
      bonus === undefined ? '' : catalogue.inventory.bonusStat(catalogue.attributes[bonus]);
    const outfits = OUTFITS.map((option) => ({
      id: option.id,
      name: equipmentName(option, language),
      description: equipmentDescription(option, language),
      meta: bonusMeta(option.bonus),
    }));
    const talismans = TALISMANS.map((option) => ({
      id: option.id,
      name: equipmentName(option, language),
      description: equipmentDescription(option, language),
      meta: bonusMeta(option.bonus),
    }));
    return (
      <main>
        <h1>{catalogue.arena.title}</h1>
        <p>{catalogue.arena.description}</p>
        {noticeText ? (
          <p className="notice" role="status">
            {noticeText}
          </p>
        ) : null}
        <ArenaSetupForm
          key={JSON.stringify(setupDefaults)}
          enemies={BESTIARY.map((entry) => ({
            id: entry.id,
            name: bestiaryName(entry, language),
            description: bestiaryDescription(entry, language),
            meta: catalogue.arena.enemyLine(
              entry.enemy.attributes.might,
              entry.enemy.attributes.agility,
              entry.enemy.attributes.wits,
              entry.enemy.attributes.presence,
              entry.enemy.health,
              entry.enemy.damage,
              catalogue.reach[entry.enemy.reach],
              catalogue.arena.behaviour[entry.enemy.behaviour],
            ),
            range: entry.range,
          }))}
          presets={getArenaPresets(language)}
          defaults={setupDefaults}
          weapons={weapons}
          outfits={outfits}
          talismans={talismans}
          consumablesMax={ARENA_CONSUMABLE.maxQuantity}
          strings={{
            bestiaryLegend: catalogue.arena.bestiaryHeading,
            opponentOne: catalogue.arena.opponentOne,
            opponentTwo: catalogue.arena.opponentTwo,
            noSecondOpponent: catalogue.arena.noSecondOpponent,
            startingRange: catalogue.arena.startingRange,
            rangeLabels: { near: catalogue.range.near, far: catalogue.range.far },
            characterLegend: catalogue.arena.characterHeading,
            presetLabel: catalogue.arena.presetLabel,
            presetCustom: catalogue.arena.presetCustom,
            presetHelp: catalogue.arena.presetHelp,
            attributesHelp: catalogue.arena.attributesHelp,
            healthLabel: catalogue.arena.healthLabel,
            equipmentHeading: catalogue.arena.equipmentHeading,
            weaponLabel: catalogue.arena.weaponLabel,
            outfitLabel: catalogue.arena.outfitLabel,
            talismanLabel: catalogue.arena.talismanLabel,
            consumablesLabel: catalogue.arena.consumablesLabel,
            consumablesHelp: catalogue.arena.consumablesHelp(ARENA_CONSUMABLE.heal),
            start: catalogue.arena.start,
            attributeLabels: {
              might: catalogue.attributes.might,
              agility: catalogue.attributes.agility,
              wits: catalogue.attributes.wits,
              presence: catalogue.attributes.presence,
            },
          }}
        />
        <section aria-label={catalogue.arena.bestiaryHeading}>
          <h2>{catalogue.arena.bestiaryHeading}</h2>
          <ul className="cards">
            {BESTIARY.map((entry) => (
              <li key={entry.id} className="card">
                <strong>{bestiaryName(entry, language)}</strong>
                <p>{bestiaryDescription(entry, language)}</p>
                <p className="meta">
                  {catalogue.arena.enemyLine(
                    entry.enemy.attributes.might,
                    entry.enemy.attributes.agility,
                    entry.enemy.attributes.wits,
                    entry.enemy.attributes.presence,
                    entry.enemy.health,
                    entry.enemy.damage,
                    catalogue.reach[entry.enemy.reach],
                    catalogue.arena.behaviour[entry.enemy.behaviour],
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    );
  }

  // The fight ended in victory, death or escape: the result screen with the
  // fight summary, Fight again with the identical setup, and a way back to
  // the setup to change it.
  if (run.state.status !== 'active') {
    const result = arenaResult(run.state);
    const summary = arenaSummary(run.state, run.journal);
    const foe = arenaFoeName(run.state);
    const title =
      result?.outcome === 'victory'
        ? catalogue.ending.victory
        : result?.outcome === 'escape'
          ? catalogue.combat.escape
          : catalogue.ending.defeat;
    const body =
      result?.outcome === 'victory'
        ? catalogue.combat.combatEndVictory(foe)
        : result?.outcome === 'escape'
          ? catalogue.combat.combatEndEscape(foe)
          : catalogue.combat.tactical.stopDeath;
    return (
      <main>
        <h1>
          {catalogue.arena.title} · {title}
        </h1>
        <p>{body}</p>
        {summary ? (
          <section aria-label={catalogue.arena.summaryHeading}>
            <h2>{catalogue.arena.summaryHeading}</h2>
            <ul>
              <li>
                {catalogue.arena.summaryOutcome}: {title}
              </li>
              <li>
                {catalogue.arena.summaryRounds}: {catalogue.arena.rounds(summary.rounds)}
              </li>
              <li>
                {catalogue.arena.summaryHealth}:
                <ul>
                  <li>
                    {catalogue.arena.you}:{' '}
                    {catalogue.character.short(
                      summary.characterHealth,
                      summary.characterMaxHealth,
                    )}
                  </li>
                  {summary.opponents.map((opponent) => (
                    <li key={opponent.name}>
                      {opponent.name}:{' '}
                      {catalogue.character.short(opponent.health, opponent.maxHealth)}
                    </li>
                  ))}
                </ul>
              </li>
              <li>
                {catalogue.arena.you}:{' '}
                {catalogue.arena.summaryHits(summary.characterHits, summary.characterMisses)}
              </li>
              <li>
                {foe}: {catalogue.arena.summaryHits(summary.foeHits, summary.foeMisses)}
              </li>
            </ul>
          </section>
        ) : null}
        {rematchable !== undefined ? (
          <form action={rematchArenaAction}>
            <p>
              <button className="button" type="submit">
                {catalogue.arena.fightAgain}
              </button>
            </p>
          </form>
        ) : null}
        <form action={resetArenaAction}>
          <p>
            <button className="button" type="submit">
              {catalogue.arena.backToSetup}
            </button>
          </p>
        </form>
      </main>
    );
  }

  // The running fight, through the existing Combat presentation and actions.
  // The log reads the stored journal, so a reload resumes the same Combat.
  const combat = arenaCombatView(run.state, language);
  if (combat === undefined) {
    return (
      <main>
        <h1>{catalogue.arena.title}</h1>
        {noticeText ? (
          <p className="notice" role="status">
            {noticeText}
          </p>
        ) : null}
      </main>
    );
  }
  return (
    <main>
      {noticeText ? (
        <p className="notice" role="status">
          {noticeText}
        </p>
      ) : null}
      <CombatPanel
        combat={combat}
        playthroughId="arena"
        step={run.state.step}
        rounds={[]}
        tacticalRounds={arenaTacticalRounds(run.journal)}
        formAction={arenaCombatAction}
        catalogue={catalogue}
        lang={language}
        selectedTargetId={undefined}
        targetHrefFor={() => '/arena'}
      />
    </main>
  );
}
