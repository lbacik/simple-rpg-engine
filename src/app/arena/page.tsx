// The Arena page: setup, fight and result on one route (`/arena`).
//
// Without `?fight=` the page shows the setup: the Bestiary to pick an enemy
// from and the default fighter, with a Start button. Starting creates a real
// Playthrough of the Arena Scenario driven straight into the picked enemy's
// Combat (see `./actions`), then lands back here at `?fight=<id>`, where the
// existing Combat panel fights the Combat. Reloading re-reads the same
// Playthrough row, so a reload mid-fight resumes the same Combat. When the
// Combat ends the page shows a result screen — the triumph or fall Ending,
// or the escape report — with a way back to the setup.
//
// The Arena Scenario is entered through the top navigation only: the
// collection hides it and `/scenarios/arena` redirects here, so its fights
// always start from a picked Bestiary enemy.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getScenario, localizeScenario } from '@/content/index';
import {
  combatRounds,
  renderNarration,
  RESULT_PANEL_ENTRY_TYPES,
  tacticalCombatRounds,
  view,
} from '@/engine/index';
import { MAX_HEALTH } from '@/engine/state';
import { getCatalogue, type Catalogue } from '@/i18n/index';
import { ScenarioFallbackBadge } from '@/app/flag';
import {
  ARENA_SCENARIO_ID,
  ARENA_TEMPLATE_ID,
  arenaBestiary,
  arenaOutcomeKind,
  arenaTargetHref,
} from '@/app/lib/arena';
import { getInterfaceLanguage } from '@/app/lib/language';
import { renderJournalEntry } from '@/app/lib/journal';
import { parseCombatTarget, selectCombatTarget } from '@/app/lib/panel';
import { resolvePlaythrough } from '@/app/lib/playthrough';
import { getSessionHash } from '@/app/lib/session';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { arenaCombatAction } from './actions';
import ArenaStartForm, {
  type ArenaEnemyOption,
  type ArenaFighterFacts,
} from './start-form';
import { CombatPanel } from '../play/[playthroughId]/combat-panel';
import { EndingBlock } from '../play/[playthroughId]/read-only-position';
import { ResultPanel } from '../play/[playthroughId]/result-panel';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return { title: catalogue.arena.title, description: catalogue.arena.description };
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
  searchParams: Promise<{ fight?: string; target?: string; notice?: string }>;
}) {
  const { fight, target: targetParam, notice } = await searchParams;
  const language = await getInterfaceLanguage();
  const catalogue = getCatalogue(language);
  const noticeText = noticeTextFor(catalogue, notice);

  const base = getScenario(ARENA_SCENARIO_ID);
  if (!base) notFound();
  const localized = localizeScenario(base, language);
  const shownScenario = localized.scenario;
  const shown = localized.shownLanguage;
  const badge = localized.fallback ? (
    <ScenarioFallbackBadge baseLanguage={base.language} catalogue={catalogue} />
  ) : undefined;

  // No fight: the setup. The Bestiary lists every Arena enemy with its fight
  // stats; the fighter below is kept as is (no template or name is asked).
  if (fight === undefined || fight === '') {
    const template = shownScenario.templatesById[ARENA_TEMPLATE_ID];
    if (!template) notFound();
    const enemies: ArenaEnemyOption[] = arenaBestiary(shownScenario).map((enemy) => ({
      id: enemy.id,
      name: enemy.name,
      description: enemy.description,
      stats:
        `${catalogue.scenario.attributesLine(enemy.might, enemy.agility, enemy.wits, enemy.presence, enemy.health)} · ` +
        catalogue.inventory.weaponStats(enemy.damage, catalogue.reach[enemy.reach]),
    }));
    const fighter: ArenaFighterFacts = {
      name: template.name,
      description: template.description,
      stats: catalogue.scenario.attributesLine(
        template.attributes.might,
        template.attributes.agility,
        template.attributes.wits,
        template.attributes.presence,
        MAX_HEALTH,
      ),
      items: template.items.map((entry) =>
        catalogue.scenario.templateItem(
          entry.item.name,
          entry.quantity,
          entry.item.kind === 'equipment' ? catalogue.scenario.slots[entry.item.slot] : null,
        ),
      ),
    };
    return (
      <main>
        <h1 lang={shown}>{catalogue.arena.title}</h1>
        <p>
          {catalogue.arena.description}
          {badge === undefined ? null : <> {badge}</>}
        </p>
        <h2>{catalogue.arena.bestiary}</h2>
        <ArenaStartForm
          enemies={enemies}
          fighter={fighter}
          lang={shown}
          strings={{
            chooseOpponent: catalogue.arena.chooseOpponent,
            fighter: catalogue.arena.fighter,
            start: catalogue.arena.start,
            starting: catalogue.arena.starting,
          }}
        />
      </main>
    );
  }

  const sessionHash = await getSessionHash();
  const resolved = await resolvePlaythrough(getDatabase(), getScenario, fight, sessionHash);
  if (!resolved) {
    notFound();
  }
  // A fight that stopped matching its content (or one that never was an
  // Arena fight) offers a fresh setup instead of a dead end.
  if (!resolved.compatible || resolved.scenario.id !== ARENA_SCENARIO_ID) {
    return (
      <main>
        <h1 lang={shown}>{catalogue.arena.title}</h1>
        <p>{catalogue.arena.description}</p>
        <p>
          <a className="button" href="/arena">
            {catalogue.arena.backToArena}
          </a>
        </p>
      </main>
    );
  }

  const fightLocalized = localizeScenario(resolved.scenario, language);
  const scenario = fightLocalized.scenario;
  const fightShown = fightLocalized.shownLanguage;
  const fightBadge = fightLocalized.fallback ? (
    <ScenarioFallbackBadge baseLanguage={resolved.scenario.language} catalogue={catalogue} />
  ) : undefined;
  const playthrough = resolved.playthrough;
  const state = playthrough.state;
  const characterName = state.character.name;
  const gameView = view(scenario, state);

  // An active Combat fights through the existing Combat panel. The roll log
  // is read from the Journal, never from stored state, so the log survives a
  // reload; the arena (lanes, Intents, targets, order) comes from the
  // engine's projection over state and current content.
  if (gameView.kind === 'combat') {
    const store = new PlaythroughStore(getDatabase());
    const journal = await store.listJournal(playthrough.id);
    const combatRows = journal.map((entry) => ({
      type: entry.type,
      payload: entry.payload as { encounterId?: unknown; guard?: unknown },
    }));
    const combatLog = combatRounds(combatRows, gameView.encounterId);
    const tacticalLog = tacticalCombatRounds(combatRows, gameView.encounterId);
    // The target picker's selection (`?target=`): the survivor the targeted
    // forms post, defaulting to the first survivor. Resolving it here writes
    // nothing: no state change, no `step` change, no RNG.
    const selectedTarget = selectCombatTarget(
      gameView.arena.legalTargets,
      parseCombatTarget(targetParam),
    );
    return (
      <main>
        {noticeText ? (
          <p className="notice" role="status">
            {noticeText}
          </p>
        ) : null}
        <article className="reading-card">
          <div className="reading-body">
            <CombatPanel
              combat={gameView}
              playthroughId={playthrough.id}
              step={playthrough.step}
              rounds={combatLog}
              tacticalRounds={tacticalLog}
              formAction={arenaCombatAction}
              catalogue={catalogue}
              lang={fightShown}
              badge={fightBadge}
              selectedTargetId={selectedTarget}
              targetHrefFor={(participantId) =>
                arenaTargetHref(playthrough.id, participantId, { notice })
              }
            />
          </div>
        </article>
      </main>
    );
  }

  // The Combat ended: the result screen with a way back to the setup.
  // Victory and death ended the Playthrough, so the reached Ending is the
  // outcome; an escape left the fight at the pit, so the decisive round with
  // the Combat end and the Outcome is the outcome, like the game screen's
  // result panel.
  if (gameView.kind === 'ended') {
    return (
      <main>
        <article className="reading-card">
          <div className="reading-body">
            <EndingBlock
              kindLabel={catalogue.ending[gameView.endingKind]}
              title={gameView.title}
              html={renderNarration(gameView.text, characterName)}
              lang={fightShown}
              badge={fightBadge}
            />
            <p>
              <a className="button" href="/arena">
                {catalogue.arena.backToArena}
              </a>
            </p>
          </div>
        </article>
      </main>
    );
  }
  const store = new PlaythroughStore(getDatabase());
  const journal = await store.listJournal(playthrough.id);
  const kind = arenaOutcomeKind(state, scenario, journal);
  const resultEntries = journal
    .filter(
      (entry) =>
        entry.step === playthrough.step &&
        (RESULT_PANEL_ENTRY_TYPES.has(entry.type) || entry.type === 'combat-round'),
    )
    .map((entry) => renderJournalEntry(entry, catalogue, characterName).html);
  return (
    <main>
      <h1>{kind === 'victory' ? catalogue.ending.victory : catalogue.combat.escape}</h1>
      <ResultPanel
        entries={resultEntries}
        continueHref="/arena"
        continueLabel={catalogue.arena.backToArena}
        label={catalogue.game.latestEvents}
      />
    </main>
  );
}
