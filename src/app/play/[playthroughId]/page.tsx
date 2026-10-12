import { notFound } from 'next/navigation';
import { getScenario } from '@/content/registry';
import {
  combatGuardUp,
  combatRounds,
  escapeHtml,
  renderNarration,
  renderStoredText,
  RESULT_PANEL_ENTRY_TYPES,
  view,
} from '@/engine/index';
import type { Scenario } from '@/content/index';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import {
  JOURNAL_BATCH_SIZE,
  latestJournalEnding,
  modalJournalBatch,
  renderJournalEntries,
} from '@/app/lib/journal';
import { JournalEntries } from './journal/journal-entries';
import { JournalModalLink } from './journal/journal-modal';
import {
  continueHref,
  parsePanel,
  parseSeenStep,
  playHref,
  shouldShowResultPanel,
} from '@/app/lib/panel';
import { resolvePlaythrough } from '@/app/lib/playthrough';
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

const NOTICES: Record<string, string> = {
  stale: 'The game was advanced in another tab; this is its current state.',
  unavailable: 'That action is no longer available.',
};

function itemName(scenario: Scenario, itemId: string): string {
  return scenario.itemsById[itemId]?.name ?? itemId;
}

/** Query helpers shared by the compatible and incompatible game screens. */
function mapToggleHrefFor(
  playthroughId: string,
  panel: string | null | undefined,
  notice: string | undefined,
  showUnknownExits: boolean,
  seen?: number,
): string {
  return playHref(
    playthroughId,
    panel,
    notice,
    seen,
    // The toggle flips the setting, so it carries the opposite value.
    !showUnknownExits,
  );
}

/** Render one result-panel entry to HTML. Narration entries keep the name literal. */
function renderResultEntry(type: string, payload: unknown, characterName: string): string {
  const text = String((payload as { text?: unknown }).text ?? '');
  if (type === 'intro' || type === 'outcome') {
    return renderStoredText(text, characterName);
  }
  return `<p>${escapeHtml(text)}</p>`;
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
  }>;
}) {
  const { playthroughId } = await params;
  const { notice, panel: panelParam, tab: legacyTab, unknown, seen: seenParam } = await searchParams;
  // The open side-panel modal. `?tab=` is the previous name of this parameter
  // and is still honoured so older links land on the same panel.
  const panel = parsePanel(panelParam ?? legacyTab);
  const rawPanel = panelParam ?? legacyTab;
  // App-level display setting, off by default: draw unvisited targets of
  // visible exits as "?" nodes. It is not a Scenario field.
  const showUnknownExits = unknown === '1';
  const noticeText = notice ? NOTICES[notice] : undefined;
  const sessionHash = await getSessionHash();
  const store = new PlaythroughStore(getDatabase());
  const resolved = await resolvePlaythrough(getDatabase(), getScenario, playthroughId, sessionHash);
  if (!resolved) {
    notFound();
  }

  if (!resolved.compatible) {
    // Incompatible Playthroughs are read-only: derived on read, never stored.
    // Every action is rejected by executeTurn, so no forms are rendered here.
    const incompatibleName = resolved.playthrough.state.character.name;
    if (resolved.scenario === undefined) {
      // The Scenario left the collection (or is no longer valid): only the
      // Journal remains, and the Ending is read from its Journal entry. The
      // Journal always renders completely because it stores the text as presented.
      // The Ending is the newest entry, so the first batch always holds it.
      const batch = await store.listJournalBatch(resolved.playthrough.id, {
        limit: JOURNAL_BATCH_SIZE,
      });
      const journalTotal = await store.countJournal(resolved.playthrough.id);
      const recordedEnding = latestJournalEnding(batch.entries);
      const rendered = renderJournalEntries(batch.entries, incompatibleName);
      return (
        <main>
          <h1>{incompatibleName}</h1>
          <p>This Scenario is no longer available, so this Playthrough is read-only.</p>
          {recordedEnding ? (
            <section aria-label="Ending">
              <p className="meta">{recordedEnding.kind === 'victory' ? 'Victory' : 'Defeat'}</p>
              <h2>{recordedEnding.title}</h2>
              <div
                dangerouslySetInnerHTML={{
                  __html: renderStoredText(recordedEnding.text, incompatibleName),
                }}
              />
            </section>
          ) : null}
          <p>
            <a href={`/play/${resolved.playthrough.id}/journal`}>View journal</a>
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
    const incompatibleScenario = resolved.scenario;
    const incompatibleState = resolved.playthrough.state;
    const incompatibleView = view(incompatibleScenario, incompatibleState, {
      includeUnknownExits: showUnknownExits,
    });
    return (
      <main>
        <div className="game">
          <article className="reading" lang={incompatibleScenario.language}>
            <p className="notice" role="status">
              This Scenario has changed since it was played, so this Playthrough is read-only.
            </p>
            <p>
              <a className="button" href={`/scenarios/${incompatibleScenario.id}`}>
                Start a new Playthrough of {incompatibleScenario.title}
              </a>
            </p>
            <ReadOnlyPosition
              scenario={incompatibleScenario}
              state={incompatibleState}
              gameView={incompatibleView}
              characterName={incompatibleName}
              recordedEnding={recordedEnding}
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
            toggleHref={mapToggleHrefFor(resolved.playthrough.id, rawPanel, notice, showUnknownExits)}
            canTravel={false}
            forceReadOnly
            journalTotal={journal.length}
          />
        </div>
      </main>
    );
  }

  const scenario = resolved.scenario;
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
  const modalJournal = modalJournalBatch(journal, characterName);
  // A step that ended the Playthrough shows the Ending screen instead of the
  // result panel (docs/spec/playthrough-state.md, result panel).
  const resultEntries =
    gameView.kind === 'ended'
      ? []
      : journal
          .filter(
            (entry) => entry.step === playthrough.step && RESULT_PANEL_ENTRY_TYPES.has(entry.type),
          )
          .map((entry) => renderResultEntry(entry.type, entry.payload, characterName));
  // The Combat panel reads the guard marker and the roll log from the
  // Journal, never from stored state (the Defend bonus expires within its
  // turn), so the marker survives a reload.
  const combatRows = journal.map((entry) => ({
    type: entry.type,
    payload: entry.payload as { encounterId?: unknown; guard?: unknown },
  }));
  const guardUp =
    gameView.kind === 'combat' ? combatGuardUp(combatRows, gameView.encounterId) : false;
  const combatLog =
    gameView.kind === 'combat' ? combatRounds(combatRows, gameView.encounterId) : [];
  const combatConsumables =
    gameView.kind === 'combat'
      ? Object.keys(state.inventory)
          .filter((itemId) => scenario.itemsById[itemId]?.kind === 'consumable')
          .map((itemId) => ({ itemId, name: itemName(scenario, itemId) }))
      : [];
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
  const continueTo = continueHref(playthrough.id, playthrough.step, rawPanel, notice, showUnknownExits);
  const mapToggleHref = mapToggleHrefFor(
    playthrough.id,
    rawPanel,
    notice,
    showUnknownExits,
    preservedSeen,
  );

  // While the result panel is shown, the reading column holds only the panel
  // (with Continue) and the transient notice: the Location view, Scene and
  // Combat panel wait for Continue. The side panel (map, status card,
  // launchers) stays visible throughout.
  if (showResult) {
    return (
      <main>
        <div className="game">
          <article className="reading" lang={scenario.language}>
            {noticeText ? (
              <p className="notice" role="status">
                {noticeText}
              </p>
            ) : null}
            <ResultPanel entries={resultEntries} continueHref={continueTo} />
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
          />
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="game">
        <article className="reading" lang={scenario.language}>
          {noticeText ? (
            <p className="notice" role="status">
              {noticeText}
            </p>
          ) : null}
          {gameView.kind === 'location' ? (
            <>
              <h1>{gameView.name}</h1>
              {gameView.illustration ? (
                <SceneIllustration
                  src={gameView.illustration.src}
                  width={gameView.illustration.width}
                  height={gameView.illustration.height}
                  alt={gameView.illustration.alt}
                />
              ) : null}
              {/* Location description: rendered narration subset. */}
              <div dangerouslySetInnerHTML={{ __html: renderNarration(gameView.description, characterName) }} />
              {gameView.onDemandScenes.length > 0 ? (
                <section aria-label="Scenes">
                  {gameView.onDemandScenes.map((scene) => (
                    <form key={scene.sceneId} action={openSceneAction}>
                      <input type="hidden" name="playthroughId" value={playthrough.id} />
                      <input type="hidden" name="expectedStep" value={playthrough.step} />
                      <input type="hidden" name="scene" value={scene.sceneId} />
                      <p>
                        <button className="button" type="submit">
                          {scene.title}
                        </button>
                      </p>
                    </form>
                  ))}
                </section>
              ) : null}
              <section aria-label="Exits">
                {gameView.exits.map((exit) => (
                  <form key={exit.targetLocationId} action={travelAction}>
                    <input type="hidden" name="playthroughId" value={playthrough.id} />
                    <input type="hidden" name="expectedStep" value={playthrough.step} />
                    <input type="hidden" name="target" value={exit.targetLocationId} />
                    <p>
                      <button className="button" type="submit">
                        {exit.label}
                      </button>
                    </p>
                  </form>
                ))}
              </section>
            </>
          ) : gameView.kind === 'scene' ? (
            <>
              <h1>{gameView.title}</h1>
              {gameView.illustration ? (
                <SceneIllustration
                  src={gameView.illustration.src}
                  width={gameView.illustration.width}
                  height={gameView.illustration.height}
                  alt={gameView.illustration.alt}
                />
              ) : null}
              <div dangerouslySetInnerHTML={{ __html: renderNarration(gameView.text, gameView.characterName) }} />
              {gameView.choices.length > 0 ? (
                <section aria-label="Choices">
                  {gameView.choices.map((choice) => (
                    <form key={choice.id} action={chooseAction}>
                      <input type="hidden" name="playthroughId" value={playthrough.id} />
                      <input type="hidden" name="expectedStep" value={playthrough.step} />
                      <input type="hidden" name="choice" value={choice.id} />
                      <p>
                        <button className="button" type="submit">
                          {choice.text}
                          {choice.testLabel ? (
                            <span className="meta"> ({choice.testLabel})</span>
                          ) : null}
                        </button>
                      </p>
                    </form>
                  ))}
                </section>
              ) : (
                <section aria-label="Continue">
                  <form action={continueAction}>
                    <input type="hidden" name="playthroughId" value={playthrough.id} />
                    <input type="hidden" name="expectedStep" value={playthrough.step} />
                    <p>
                      <button className="button" type="submit">
                        Continue
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
              guardUp={guardUp}
              rounds={combatLog}
              consumables={combatConsumables}
              formAction={combatAction}
            />
          ) : (
            <>
              <EndingBlock
                kindLabel={gameView.endingKind === 'victory' ? 'Victory' : 'Defeat'}
                title={gameView.title}
                html={renderNarration(gameView.text, characterName)}
              />
              <section aria-label="After the ending">
                <p>
                  <JournalModalLink
                    playthroughId={playthrough.id}
                    initialEntries={modalJournal.entries}
                    initialNextCursor={modalJournal.nextCursor}
                    total={modalJournal.total}
                    className="button secondary"
                  />
                </p>
                <p>
                  <a className="button" href={`/scenarios/${scenario.id}`}>
                    Start a new Playthrough of {scenario.title}
                  </a>
                </p>
                <p>
                  <a className="button secondary" href="/">
                    Return to the collection
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
        />
      </div>
    </main>
  );
}
