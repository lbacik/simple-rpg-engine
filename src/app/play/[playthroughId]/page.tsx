import { notFound } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { localizeScenario } from '@/content/index';
import {
  combatRounds,
  renderNarration,
  renderStoredText,
  RESULT_PANEL_ENTRY_TYPES,
  tacticalCombatRounds,
  view,
} from '@/engine/index';
import { getCatalogue, type Catalogue } from '@/i18n/index';
import { ScenarioFallbackBadge } from '@/app/flag';
import { getInterfaceLanguage } from '@/app/lib/language';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import {
  JOURNAL_BATCH_SIZE,
  latestJournalEnding,
  modalJournalBatch,
  renderJournalEntries,
  renderJournalEntry,
} from '@/app/lib/journal';
import { JournalEntries } from './journal/journal-entries';
import { JournalModalLink } from './journal/journal-modal';
import {
  combatTargetHref,
  continueHref,
  parseCombatTarget,
  parsePanel,
  parseSeenStep,
  parseSelectedItem,
  playHref,
  selectCombatTarget,
  shouldShowResultPanel,
} from '@/app/lib/panel';
import { resolvePlaythrough, safeCharacterName } from '@/app/lib/playthrough';
import { CombatPanel } from './combat-panel';
import { SceneIllustration } from './scene-illustration';
import { EndingBlock, ReadOnlyPosition } from './read-only-position';
import { getSessionHash } from '@/app/lib/session';
import { chooseAction, continueAction, openSceneAction } from '@/app/lib/scenes';
import { combatAction } from '@/app/lib/combat';
import { travelAction } from '@/app/lib/travel';
import { ResultPanel } from './result-panel';
import { SidePanel } from './side-panel';

export const dynamic = 'force-dynamic';

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

/** Query helpers shared by the compatible and incompatible game screens. */
function mapToggleHrefFor(
  playthroughId: string,
  panel: string | null | undefined,
  notice: string | undefined,
  showUnknownExits: boolean,
  seen?: number,
  selectedItem?: string,
  target?: string,
): string {
  return playHref(
    playthroughId,
    panel,
    notice,
    seen,
    // The toggle flips the setting, so it carries the opposite value.
    !showUnknownExits,
    // The selected inventory tile rides along while its modal is open.
    panel === 'inventory' ? selectedItem : undefined,
    // The Combat target selection survives the map toggle.
    target,
  );
}


export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ playthroughId: string }>;
  searchParams: Promise<{
    notice?: string;
    panel?: string;
    tab?: string;
    unknown?: string;
    seen?: string;
    item?: string;
    target?: string;
  }>;
}) {
  const { playthroughId } = await params;
  const {
    notice,
    panel: panelParam,
    tab: legacyTab,
    unknown,
    seen: seenParam,
    item: itemParam,
    target: targetParam,
  } = await searchParams;
  // The open side-panel modal. `?tab=` is the previous name of this parameter
  // and is still honoured so older links land on the same panel.
  const panel = parsePanel(panelParam ?? legacyTab);
  const rawPanel = panelParam ?? legacyTab;
  // The inventory tile the detail pane selects. It survives the redirect
  // after an action, so the result is visible in place.
  const selectedItem = parseSelectedItem(itemParam);
  // App-level display setting, off by default: draw unvisited targets of
  // visible exits as "?" nodes. It is not a Scenario field.
  const showUnknownExits = unknown === '1';
  // The Journal's Interface Text follows the Interface Language current when
  // it is read; Scenario text stays as presented with the entry's own `lang`.
  const language = await getInterfaceLanguage();
  const catalogue = getCatalogue(language);
  const noticeText = noticeTextFor(catalogue, notice);
  const sessionHash = await getSessionHash();
  const store = new PlaythroughStore(getDatabase());
  const resolved = await resolvePlaythrough(getDatabase(), getScenario, playthroughId, sessionHash);
  if (!resolved) {
    notFound();
  }

  if (!resolved.compatible) {
    // Incompatible Playthroughs are read-only: derived on read, never stored.
    // Every action is rejected by executeTurn, so no forms are rendered here.
    // The name never crashes on an invalid document: it falls back to the
    // row's Scenario id.
    const incompatibleName = safeCharacterName(
      resolved.playthrough.state,
      resolved.playthrough.scenarioId,
    );
    if (resolved.scenario === undefined || resolved.parsed === undefined) {
      // The Scenario left the collection (or is no longer valid), or the
      // stored document itself is invalid: only the Journal remains, and the
      // Ending is read from its Journal entry. The Journal always renders
      // completely because it stores the text as presented.
      // The Ending is the newest entry, so the first batch always holds it.
      // Invalid documents are never rewritten here.
      const batch = await store.listJournalBatch(resolved.playthrough.id, {
        limit: JOURNAL_BATCH_SIZE,
      });
      const journalTotal = await store.countJournal(resolved.playthrough.id);
      const recordedEnding = latestJournalEnding(batch.entries);
      const rendered = renderJournalEntries(batch.entries, catalogue, incompatibleName);
      const goneText =
        resolved.scenario === undefined
          ? catalogue.game.scenarioGone
          : catalogue.game.scenarioChanged;
      return (
        <main>
          <h1>{incompatibleName}</h1>
          <p>{goneText}</p>
          {recordedEnding ? (
            <section aria-label={catalogue.ending.title}>
              <p className="meta">{catalogue.ending[recordedEnding.kind]}</p>
              <h2 lang={recordedEnding.lang}>{recordedEnding.title}</h2>
              <div
                lang={recordedEnding.lang}
                dangerouslySetInnerHTML={{
                  __html: renderStoredText(recordedEnding.text, incompatibleName),
                }}
              />
            </section>
          ) : null}
          <p>
            <a href={`/play/${resolved.playthrough.id}/journal`}>{catalogue.game.viewJournal}</a>
          </p>
          <section aria-label="Journal">
            <JournalEntries
              playthroughId={resolved.playthrough.id}
              initialEntries={rendered}
              initialNextCursor={batch.nextCursor ?? null}
              total={journalTotal}
            />
          </section>
        </main>
      );
    }
    const journal = await store.listJournal(resolved.playthrough.id);
    const recordedEnding = latestJournalEnding(journal);
    // The Scenario is still in the collection but its content changed: the
    // Character sheet, inventory and map render best effort from the current
    // content, and a new Playthrough is on offer.
    // Compatibility was checked on the base Scenario by resolvePlaythrough;
    // everything rendered comes from the text the Interface Language selects.
    const incompatibleBase = resolved.scenario;
    const incompatibleLocalized = localizeScenario(incompatibleBase, language);
    const incompatibleScenario = incompatibleLocalized.scenario;
    const incompatibleShown = incompatibleLocalized.shownLanguage;
    const incompatibleBadge = incompatibleLocalized.fallback ? (
      <ScenarioFallbackBadge baseLanguage={incompatibleBase.language} catalogue={catalogue} />
    ) : undefined;
    const incompatibleState = resolved.parsed;
    const incompatibleView = view(incompatibleScenario, incompatibleState, {
      includeUnknownExits: showUnknownExits,
    });
    return (
      <main>
        <div className="game">
          <article className="reading">
            <p className="notice" role="status">
              {catalogue.game.scenarioChanged}
            </p>
            <p>
              <a className="button" href={`/scenarios/${incompatibleScenario.id}`}>
                {catalogue.game.startNew(incompatibleScenario.title)}
              </a>
            </p>
            <ReadOnlyPosition
              scenario={incompatibleScenario}
              state={incompatibleState}
              gameView={incompatibleView}
              characterName={incompatibleName}
              recordedEnding={recordedEnding}
              catalogue={catalogue}
              lang={incompatibleShown}
              badge={incompatibleBadge}
            />
          </article>
          <SidePanel
            scenario={incompatibleScenario}
            state={incompatibleState}
            playthroughId={resolved.playthrough.id}
            step={resolved.playthrough.step}
            panel={panel}
            notice={notice}
            noticeText={noticeText}
            gameView={incompatibleView}
            showUnknownExits={showUnknownExits}
            toggleHref={mapToggleHrefFor(
              resolved.playthrough.id,
              rawPanel,
              notice,
              showUnknownExits,
              undefined,
              selectedItem,
            )}
            canTravel={false}
            forceReadOnly
            journalTotal={journal.length}
            selectedItem={selectedItem}
            catalogue={catalogue}
            language={language}
          />
        </div>
      </main>
    );
  }

  // Compatibility was checked on the base Scenario by resolvePlaythrough; the
  // view, the side panel and every action run on the text the Interface
  // Language selects, so the Journal records the shown language.
  const baseScenario = resolved.scenario;
  const localized = localizeScenario(baseScenario, language);
  const scenario = localized.scenario;
  const shown = localized.shownLanguage;
  const badge = localized.fallback ? (
    <ScenarioFallbackBadge baseLanguage={baseScenario.language} catalogue={catalogue} />
  ) : undefined;
  const playthrough = resolved.playthrough;

  const gameView = view(scenario, playthrough.state, {
    includeUnknownExits: showUnknownExits,
  });
  const journal = await store.listJournal(playthrough.id);
  const state = playthrough.state;
  const characterName = state.character.name;
  // "View journal" opens the Journal in a modal over the game screen instead
  // of navigating away. The modal reuses the Journal already read here: the
  // newest batch, newest first, with the sequence cursor for older batches.
  const modalJournal = modalJournalBatch(journal, catalogue, characterName);
  // A step that ended the Playthrough shows the Ending screen instead of the
  // result panel (docs/spec/playthrough-state.md, result panel). The panel
  // renders its entries with the same entry renderer as the Journal.
  // The Combat round that ended a Combat (victory or escape) is part of the
  // result panel with the Combat end and the Outcome, so the decisive round
  // reads without opening the Journal. Mid-Combat rounds belong to the Combat
  // panel's log instead: while a Combat runs, its latest round never joins
  // the panel.
  const resultEntries =
    gameView.kind === 'ended'
      ? []
      : journal
          .filter(
            (entry) =>
              entry.step === playthrough.step &&
              (RESULT_PANEL_ENTRY_TYPES.has(entry.type) ||
                (entry.type === 'combat-round' && gameView.kind !== 'combat')),
          )
          .map((entry) => renderJournalEntry(entry, catalogue, characterName).html);
  // The Combat panel reads the roll log from the Journal, never from stored
  // state, so the log survives a reload. The arena (lanes, Intents, targets,
  // order) comes from the engine's projection over state and current content.
  const combatRows = journal.map((entry) => ({
    type: entry.type,
    payload: entry.payload as { encounterId?: unknown; guard?: unknown },
  }));
  const combatLog =
    gameView.kind === 'combat' ? combatRounds(combatRows, gameView.encounterId) : [];
  const tacticalLog =
    gameView.kind === 'combat' ? tacticalCombatRounds(combatRows, gameView.encounterId) : [];
  // The target picker's selection (`?target=`): the survivor the targeted
  // forms post, defaulting to the first survivor. Resolving it here writes
  // nothing: no state change, no `step` change, no RNG.
  const requestedTarget = parseCombatTarget(targetParam);
  const selectedTarget =
    gameView.kind === 'combat'
      ? selectCombatTarget(gameView.arena.legalTargets, requestedTarget)
      : undefined;
  // Map travel is available only in the Location view of an active Playthrough
  // with no Scene or Combat running: the same legality as the Travel action.
  const canTravel =
    gameView.kind === 'location' &&
    state.status === 'active' &&
    state.activeSceneId == null &&
    state.activeCombat == null;
  // The Continue acknowledgement: `?seen=` equal to the current `step` skips
  // the result panel and renders the position. Any other value is ignored, so
  // the result panel of the actual latest step is shown again. Following
  // Continue changes no game state and does not advance `step`.
  const seenStep = parseSeenStep(seenParam);
  const showResult = shouldShowResultPanel(
    resultEntries.length > 0,
    playthrough.step,
    seenStep,
  );
  // Once acknowledged, the panel and "?" links keep `?seen=` so the position
  // stays visible instead of bouncing back to the result panel.
  const preservedSeen = seenStep === playthrough.step ? seenStep : undefined;
  const continueTo = continueHref(
    playthrough.id,
    playthrough.step,
    rawPanel,
    notice,
    showUnknownExits,
    rawPanel === 'inventory' ? selectedItem : undefined,
  );
  const mapToggleHref = mapToggleHrefFor(
    playthrough.id,
    rawPanel,
    notice,
    showUnknownExits,
    preservedSeen,
    selectedItem,
    selectedTarget,
  );

  // While the result panel is shown, the reading column holds only the panel
  // (with Continue) and the transient notice: the Location view, Scene and
  // Combat panel wait for Continue. The side panel (map, status card,
  // launchers) stays visible throughout.
  if (showResult) {
    return (
      <main>
        <div className="game">
          <article className="reading">
            {noticeText ? (
              <p className="notice" role="status">
                {noticeText}
              </p>
            ) : null}
            <ResultPanel
              entries={resultEntries}
              continueHref={continueTo}
              continueLabel={catalogue.game.continue}
              label={catalogue.game.latestEvents}
            />
          </article>
          <SidePanel
            scenario={scenario}
            state={state}
            playthroughId={playthrough.id}
            step={playthrough.step}
            panel={panel}
            notice={notice}
            noticeText={noticeText}
            gameView={gameView}
            showUnknownExits={showUnknownExits}
            toggleHref={mapToggleHref}
            canTravel={canTravel}
            journalTotal={journal.length}
            seen={preservedSeen}
            selectedItem={selectedItem}
            catalogue={catalogue}
            language={language}
          />
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="game">
        <article className="reading">
          {noticeText ? (
            <p className="notice" role="status">
              {noticeText}
            </p>
          ) : null}
          {gameView.kind === 'location' ? (
            <>
              <h1>
                <span lang={shown}>{gameView.name}</span>
                {badge === undefined ? null : <> {badge}</>}
              </h1>
              {gameView.illustration ? (
                <SceneIllustration
                  src={gameView.illustration.src}
                  width={gameView.illustration.width}
                  height={gameView.illustration.height}
                  alt={gameView.illustration.alt}
                />
              ) : null}
              {/* Location description: rendered narration subset. */}
              <div
                lang={shown}
                dangerouslySetInnerHTML={{
                  __html: renderNarration(gameView.description, characterName),
                }}
              />
              {gameView.onDemandScenes.length > 0 ? (
                <section aria-label={catalogue.game.scenes}>
                  {gameView.onDemandScenes.map((scene) => (
                    <form key={scene.sceneId} action={openSceneAction}>
                      <input type="hidden" name="playthroughId" value={playthrough.id} />
                      <input type="hidden" name="expectedStep" value={playthrough.step} />
                      <input type="hidden" name="scene" value={scene.sceneId} />
                      <p>
                        <button className="button" type="submit">
                          <span lang={shown}>{scene.title}</span>
                        </button>
                      </p>
                    </form>
                  ))}
                </section>
              ) : null}
              <section aria-label={catalogue.game.exits}>
                {gameView.exits.map((exit) => (
                  <form key={exit.targetLocationId} action={travelAction}>
                    <input type="hidden" name="playthroughId" value={playthrough.id} />
                    <input type="hidden" name="expectedStep" value={playthrough.step} />
                    <input type="hidden" name="target" value={exit.targetLocationId} />
                    <p>
                      <button className="button" type="submit">
                        <span lang={shown}>{exit.label}</span>
                      </button>
                    </p>
                  </form>
                ))}
              </section>
            </>
          ) : gameView.kind === 'scene' ? (
            <>
              <h1>
                <span lang={shown}>{gameView.title}</span>
                {badge === undefined ? null : <> {badge}</>}
              </h1>
              {gameView.illustration ? (
                <SceneIllustration
                  src={gameView.illustration.src}
                  width={gameView.illustration.width}
                  height={gameView.illustration.height}
                  alt={gameView.illustration.alt}
                />
              ) : null}
              <div
                lang={shown}
                dangerouslySetInnerHTML={{
                  __html: renderNarration(gameView.text, gameView.characterName),
                }}
              />
              {gameView.choices.length > 0 ? (
                <section aria-label={catalogue.game.choices}>
                  {gameView.choices.map((choice) => (
                    <form key={choice.id} action={chooseAction}>
                      <input type="hidden" name="playthroughId" value={playthrough.id} />
                      <input type="hidden" name="expectedStep" value={playthrough.step} />
                      <input type="hidden" name="choice" value={choice.id} />
                      <p>
                        <button className="button" type="submit">
                          <span lang={shown}>{choice.text}</span>
                          {choice.test ? (
                            <span className="meta">
                              {' '}
                              ({catalogue.game.testLabel(
                                catalogue.attributes[choice.test.attribute],
                                catalogue.difficulty[choice.test.difficulty],
                                choice.test.target,
                              )})
                            </span>
                          ) : null}
                        </button>
                      </p>
                    </form>
                  ))}
                </section>
              ) : (
                <section aria-label={catalogue.game.continue}>
                  <form action={continueAction}>
                    <input type="hidden" name="playthroughId" value={playthrough.id} />
                    <input type="hidden" name="expectedStep" value={playthrough.step} />
                    <p>
                      <button className="button" type="submit">
                        {catalogue.game.continue}
                      </button>
                    </p>
                  </form>
                </section>
              )}
            </>
          ) : gameView.kind === 'combat' ? (
            <CombatPanel
              combat={gameView}
              playthroughId={playthrough.id}
              step={playthrough.step}
              rounds={combatLog}
              tacticalRounds={tacticalLog}
              formAction={combatAction}
              catalogue={catalogue}
              lang={shown}
              badge={badge}
              selectedTargetId={selectedTarget}
              targetHrefFor={(participantId) =>
                combatTargetHref(
                  playthrough.id,
                  {
                    panel: rawPanel,
                    notice,
                    seen: preservedSeen,
                    showUnknownExits,
                    item: selectedItem,
                  },
                  participantId,
                )
              }
            />
          ) : (
            <>
              <EndingBlock
                kindLabel={catalogue.ending[gameView.endingKind]}
                title={gameView.title}
                html={renderNarration(gameView.text, characterName)}
                lang={shown}
                badge={badge}
              />
              <section aria-label={catalogue.game.afterEnding}>
                <p>
                  <JournalModalLink
                    playthroughId={playthrough.id}
                    initialEntries={modalJournal.entries}
                    initialNextCursor={modalJournal.nextCursor}
                    total={modalJournal.total}
                    className="button secondary"
                    text={{
                      viewJournal: catalogue.game.viewJournal,
                      title: catalogue.journal.title,
                      total: catalogue.journal.total(modalJournal.total),
                      openInNewTab: catalogue.journal.openInNewTab,
                      close: catalogue.journal.close,
                    }}
                  />
                </p>
                <p>
                  <a className="button" href={`/scenarios/${scenario.id}`}>
                    {catalogue.game.startNew(scenario.title)}
                  </a>
                </p>
                <p>
                  <a className="button secondary" href="/">
                    {catalogue.game.returnToCollection}
                  </a>
                </p>
              </section>
            </>
          )}
        </article>
        <SidePanel
          scenario={scenario}
          state={state}
          playthroughId={playthrough.id}
          step={playthrough.step}
          panel={panel}
          notice={notice}
          noticeText={noticeText}
          gameView={gameView}
          showUnknownExits={showUnknownExits}
          toggleHref={mapToggleHref}
          canTravel={canTravel}
          journalTotal={journal.length}
          seen={preservedSeen}
          selectedItem={selectedItem}
          catalogue={catalogue}
          language={language}
        />
      </div>
    </main>
  );
}
