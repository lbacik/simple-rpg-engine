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
import { arenaCombatAction, resetArenaAction, startArenaAction } from './actions';
import { BESTIARY, DEFAULT_ARENA_CHARACTER } from './bestiary';
import { arenaCombatView, arenaFoeName, arenaTacticalRounds } from './combat-view';

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

  // No run: the Arena Setup. The first entry is pre-selected, so Start works
  // without JavaScript and without touching the picker.
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
        <form action={startArenaAction}>
          <fieldset>
            <legend>{catalogue.arena.bestiaryHeading}</legend>
            <ul className="cards">
              {BESTIARY.map((entry, index) => (
                <li key={entry.id} className="card">
                  <label>
                    <input
                      type="radio"
                      name="enemy"
                      value={entry.id}
                      defaultChecked={index === 0}
                    />{' '}
                    <strong>{language === 'pl' ? entry.name.pl : entry.name.en}</strong>
                  </label>
                  <p>{language === 'pl' ? entry.description.pl : entry.description.en}</p>
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
          </fieldset>
          <p>
            <button className="button" type="submit">
              {catalogue.arena.start}
            </button>
          </p>
        </form>
        <section aria-label={catalogue.arena.characterHeading}>
          <h2>{catalogue.arena.characterHeading}</h2>
          <p>
            {catalogue.arena.characterLine(
              character.attributes.might,
              character.attributes.agility,
              character.attributes.wits,
              character.attributes.presence,
              character.health,
            )}
          </p>
        </section>
      </main>
    );
  }

  // The fight ended in victory, death or escape: the result screen with a way
  // back to the setup.
  if (run.state.status !== 'active') {
    const result = arenaResult(run.state);
    const foe = arenaFoeName(run.state, language);
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
