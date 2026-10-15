// The Arena page (issue #166): the Bestiary setup, the running fight through
// the existing Combat panel, and the result screen. One run per Session,
// stored outside the Playthrough stores, so reloading mid-fight resumes the
// same Combat without ever listing the fight among the Session's Playthroughs.

import type { Metadata } from 'next';
import { arenaResult } from '@/engine/index';
import { getCatalogue, type Catalogue } from '@/i18n/index';
import { getInterfaceLanguage } from '@/app/lib/language';
import { getSessionHash } from '@/app/lib/session';
import { ArenaStore, getDatabase } from '@/persistence/index';
import { CombatPanel } from '../play/[playthroughId]/combat-panel';
import { arenaCombatAction, resetArenaAction } from './actions';
import { BESTIARY, DEFAULT_ARENA_CHARACTER, bestiaryDescription, bestiaryName } from './bestiary';
import { arenaCombatView, arenaFoeName, arenaTacticalRounds } from './combat-view';
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
  const run =
    sessionHash === undefined
      ? null
      : await new ArenaStore(getDatabase()).findBySession(sessionHash);

  // No run: the Arena Setup. The first entry is pre-selected and the controls
  // carry the default Character, so Start works without JavaScript and without
  // touching anything; with JavaScript a preset fills the controls, which stay
  // editable.
  if (run === null) {
    const character = DEFAULT_ARENA_CHARACTER;
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
          }))}
          presets={getArenaPresets(language)}
          defaults={{
            attributes: { ...character.attributes },
            health: character.health,
          }}
          strings={{
            bestiaryLegend: catalogue.arena.bestiaryHeading,
            characterLegend: catalogue.arena.characterHeading,
            presetLabel: catalogue.arena.presetLabel,
            presetCustom: catalogue.arena.presetCustom,
            presetHelp: catalogue.arena.presetHelp,
            attributesHelp: catalogue.arena.attributesHelp,
            healthLabel: catalogue.arena.healthLabel,
            start: catalogue.arena.start,
            attributeLabels: {
              might: catalogue.attributes.might,
              agility: catalogue.attributes.agility,
              wits: catalogue.attributes.wits,
              presence: catalogue.attributes.presence,
            },
          }}
        />
      </main>
    );
  }

  // The fight ended in victory, death or escape: the result screen with a way
  // back to the setup.
  if (run.state.status !== 'active') {
    const result = arenaResult(run.state);
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
        {result ? <p className="meta">{catalogue.arena.rounds(result.rounds)}</p> : null}
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
