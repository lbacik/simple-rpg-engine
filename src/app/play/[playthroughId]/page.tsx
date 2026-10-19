import { notFound } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { localizeScenario } from '@/content/index';
import {
  onDemandScenes,
  renderNarration,
  renderStoredText,
  isV3State,
  OUTCOME_MODAL_ENTRY_TYPES,
  illustrationView,
  view,
  visibleExits,
} from '@/engine/index';
import { getCombatCatalogue } from '@/i18n/combat';
import { getCatalogue, type Catalogue } from '@/i18n/index';
import { CommandPanel, type CommandPanelNotice } from '@/app/combat/command-panel';
import { CommandPanelInteractive } from '@/app/combat/command-panel-interactive';
import { parseSelection } from '@/app/combat/selection';
import { ScenarioFallbackBadge } from '@/app/flag';
import { getInterfaceLanguage } from '@/app/lib/language';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import {
  JOURNAL_BATCH_SIZE,
  journalEntriesText,
  latestJournalEnding,
  modalJournalBatch,
  renderJournalEntries,
  renderJournalEntry,
} from '@/app/lib/journal';
import { JournalEntries } from './journal/journal-entries';
import { JournalModalLink } from './journal/journal-modal';
import {
  continueHref,
  mapToggleHref,
  parsePanel,
  parseSeenStep,
  parseSelectedItem,
  shouldShowIntroModal,
  shouldShowOutcomeModal,
} from '@/app/lib/panel';
import { resolvePlaythrough, safeCharacterName } from '@/app/lib/playthrough';
import { Illustration } from './illustration';
import { EndingBlock, ReadOnlyPosition } from './read-only-position';
import { getSessionHash } from '@/app/lib/session';
import { chooseAction, continueAction, openSceneAction } from '@/app/lib/scenes';
import { travelAction } from '@/app/lib/travel';
import { IntroModal } from './intro-modal';
import { OutcomeModal } from './outcome-modal';
import { SidePanel } from './side-panel';

export const dynamic = 'force-dynamic';

/**
 * The transient rejection notice, rendered from its code on the page the
 * action redirects to, in the language current at that moment. Anything else
 * (a forged `notice` value) renders no notice.
 */
function noticeTextFor(
  catalogue: Catalogue,
  notice: string | undefined,
  reason: string | undefined,
): string | undefined {
  if (notice === 'stale') return catalogue.notices.stale;
  if (notice === 'unavailable') return catalogue.notices.unavailable;
  // Combat rejections carry the engine's reason code on the URL, as in the
  // Arena: a forged code reads back raw, never crashing.
  if (notice === 'rejected') return getCombatCatalogue(catalogue.code).notices.rejected(reason ?? '');
  return undefined;
}

/** Query helpers shared by the compatible and incompatible game screens. */

/** The selection links the command panel navigates by: never game state. */
function initialCombatQuery(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined) query[key] = single;
  }
  return query;
}

/** The transient Combat rejection notice, rendered from its code like the Arena's. */
function combatPanelNotice(
  notice: string | undefined,
  reason: string | undefined,
  catalogue: Catalogue,
): CommandPanelNotice | null {
  if (notice === 'stale') return { kind: 'stale' };
  if (notice === 'rejected') {
    return {
      kind: 'rejected',
      text: getCombatCatalogue(catalogue.code).notices.rejected(reason ?? ''),
    };
  }
  return null;
}

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ playthroughId: string }>;
  searchParams: Promise<{
    notice?: string;
    reason?: string;
    panel?: string;
    tab?: string;
    unknown?: string;
    seen?: string;
    item?: string;
    stance?: string;
    action?: string;
    target?: string;
    perspective?: string;
  }>;
}) {
  const { playthroughId } = await params;
  const query = await searchParams;
  const {
    notice,
    reason,
    panel: panelParam,
    tab: legacyTab,
    unknown,
    seen: seenParam,
    item: itemParam,
  } = query;
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
  const noticeText = noticeTextFor(catalogue, notice, reason);
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
            <JournalModalLink
              playthroughId={resolved.playthrough.id}
              initialEntries={rendered}
              initialNextCursor={batch.nextCursor ?? null}
              total={journalTotal}
              className="button secondary"
              text={{
                ...journalEntriesText(catalogue),
                viewJournal: catalogue.game.viewJournal,
                title: catalogue.journal.title,
                total: catalogue.journal.total(journalTotal),
                openInNewTab: catalogue.journal.openInNewTab,
                close: catalogue.journal.close,
              }}
            />
          </p>
          <section aria-label={catalogue.journal.title}>
            <JournalEntries
              playthroughId={resolved.playthrough.id}
              initialEntries={rendered}
              initialNextCursor={batch.nextCursor ?? null}
              total={journalTotal}
              text={journalEntriesText(catalogue)}
            />
          </section>
        </main>
      );
    }
    const journal = await store.listJournal(resolved.playthrough.id);
    const recordedEnding = latestJournalEnding(journal);
    // The Journal launcher opens the same modal as during play, reusing the
    // newest batch newest first with the sequence cursor for older batches.
    const readOnlyModalJournal = modalJournalBatch(journal, catalogue, incompatibleName);
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
    const incompatibleLocation =
      incompatibleView.kind === 'location'
        ? incompatibleView.name
        : incompatibleView.kind === 'scene'
          ? incompatibleView.locationName
          : (incompatibleScenario.locationsById[incompatibleState.currentLocationId]?.name ??
            incompatibleState.currentLocationId);
    return (
      <main>
        <header className="chronicle-head">
          <div className="chronicle-brand">
            <div>
              <p className="eyebrow">{catalogue.game.adventure}</p>
              <strong lang={incompatibleShown}>{incompatibleScenario.title}</strong>
            </div>
          </div>
          <span className="location-badge">
            <span aria-hidden="true" />
            <span lang={incompatibleShown}>{incompatibleLocation}</span>
          </span>
        </header>
        <div className="game">
          <article className="reading-card">
            <div className="reading-body">
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
            </div>
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
            toggleHref={mapToggleHref(resolved.playthrough.id, {
              panel: rawPanel,
              notice,
              showUnknownExits,
              item: selectedItem,
            })}
            canTravel={false}
            forceReadOnly
            journalTotal={readOnlyModalJournal.total}
            journalEntries={readOnlyModalJournal.entries}
            journalNextCursor={readOnlyModalJournal.nextCursor}
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
  // The Outcome presentation after a Choice or Test (the result panel entry
  // types): the Test, the Outcome narration and the state changes of the
  // latest step, rendered with the same entry renderer as the Journal.
  // A step that ended the Playthrough keeps its entries: the modal shows them
  // over the Location, and acknowledgement reveals the Ending screen through
  // the existing engine sequence.
  const outcomeEntries = journal
    .filter((entry) => entry.step === playthrough.step && OUTCOME_MODAL_ENTRY_TYPES.has(entry.type))
    .map((entry) => renderJournalEntry(entry, catalogue, characterName).html);
  // Map travel is available only in the Location view of an active Playthrough
  // with no Scene running: the same legality as the Travel action.
  const canTravel =
    gameView.kind === 'location' && state.status === 'active' && state.activeSceneId == null;
  // The Continue acknowledgement: `?seen=` equal to the current `step` skips
  // the outcome modal and renders the position. Any other value is ignored, so
  // the outcome modal of the actual latest step is shown again. Following
  // Continue changes no game state and does not advance `step`.
  const seenStep = parseSeenStep(seenParam);
  const showOutcome = shouldShowOutcomeModal(
    outcomeEntries.length > 0,
    playthrough.step,
    seenStep,
  );
  // The Scenario intro shows in its own modal over the starting Location: the
  // Journal already holds the intro text as
  // presented (Scenario narration formatting, Character name substituted, in
  // the Translation the Interface Language selects or the Base Language), so
  // the modal renders the same entry HTML as the Journal. The acknowledgement
  // is the same client-side `?seen=<step>` as Continue: it changes no game
  // state, repeats no Effects and appends no Journal entries.
  const introAtStep = journal.filter(
    (entry) => entry.step === playthrough.step && entry.type === 'intro',
  );
  const introRendered = introAtStep.map((entry) =>
    renderJournalEntry(entry, catalogue, characterName),
  );
  const introHtml = introRendered.map((rendered) => rendered.html).join('');
  // Rows stored before Interface Languages hold English text and no language:
  // they are tagged `en`, like the Journal renderer tags them.
  const introLang =
    typeof introAtStep[0]?.lang === 'string' && introAtStep[0]?.lang !== ''
      ? String(introAtStep[0]?.lang)
      : 'en';
  const showIntro = shouldShowIntroModal(
    introRendered.length > 0,
    playthrough.step,
    seenStep,
  );
  // Once acknowledged, the panel and "?" links keep `?seen=` so the position
  // stays visible instead of bouncing back to the outcome modal.
  const preservedSeen = seenStep === playthrough.step ? seenStep : undefined;
  const continueTo = continueHref(
    playthrough.id,
    playthrough.step,
    rawPanel,
    notice,
    showUnknownExits,
    rawPanel === 'inventory' ? selectedItem : undefined,
  );
  const mapToggle = mapToggleHref(playthrough.id, {
    panel: rawPanel,
    notice,
    seen: preservedSeen,
    showUnknownExits,
    item: selectedItem,
  });

  // The chronicle header names the Scenario (Interface Text eyebrow) and the
  // current Location, matching variant A; the reading card below holds the
  // title, Illustration, narration and actions.
  const chronicleLocation =
    gameView.kind === 'location'
      ? gameView.name
      : gameView.kind === 'scene'
        ? gameView.locationName
        : (scenario.locationsById[state.currentLocationId]?.name ?? state.currentLocationId);
  const chronicleHead = (
    <header className="chronicle-head">
      <div className="chronicle-brand">
        <svg
          width={30}
          height={30}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="m15 9-2 4-4 2 2-4Z" />
        </svg>
        <div>
          <p className="eyebrow">{catalogue.game.adventure}</p>
          <strong lang={shown}>{scenario.title}</strong>
        </div>
      </div>
      <span className="location-badge">
        <span aria-hidden="true" />
        <span lang={shown}>{chronicleLocation}</span>
      </span>
    </header>
  );

  // A running Combat replaces the reading column with the command panel
  // (Combat MVP 1.0, P6 G1): the hero fights Round by Round from the authored
  // arrangement, while the side panel stays visible with map travel disabled
  // and the inventory locked to `in-combat` (G5). Selection links never touch
  // game state; Confirm and Surrender post to the Combat routes. There is no
  // restart in a Playthrough (G5), so the panel renders without a footer. A
  // FINISHED Combat never persists (the engine clears it when the fight ends),
  // but reads defensively through the server panel if one ever does.
  if (isV3State(state) && state.activeCombat !== null) {
    const combat = state.activeCombat.combat;
    const combatBase = `/play/${playthrough.id}`;
    const encounter = scenario.encountersById[state.activeCombat.encounterId];
    const participantNames = new Map(
      (encounter?.participants ?? []).map((participant) => [
        participant.id,
        participant.enemy.name,
      ]),
    );
    // Serializable display names by actor id: the Character's name for the
    // hero, the Scenario participant name by `ref` for enemies, the actor id
    // when content is gone. Functions cannot cross the server/client boundary,
    // so the interactive panel takes these names.
    const combatNames: Record<string, string> = {};
    for (const actor of combat.actors) {
      combatNames[actor.id] =
        actor.role === 'hero'
          ? state.character.name
          : (participantNames.get(actor.ref ?? '') ?? actor.id);
    }
    const combatSelection = parseSelection(query, combat);
    const combatNotice = combatPanelNotice(notice, reason, catalogue);
    return (
      <main>
        {chronicleHead}
        <div className="game">
          <article className="reading-card">
            {noticeText ? (
              <p className="notice" role="status">
                {noticeText}
              </p>
            ) : null}
            {combat.phase === 'FINISHED' ? (
              <CommandPanel
                state={combat}
                language={language}
                selection={combatSelection}
                basePath={combatBase}
                confirmAction={`${combatBase}/combat/confirm`}
                surrenderAction={`${combatBase}/combat/surrender`}
                getActorName={(actor) => combatNames[actor.id] ?? actor.id}
                notice={combatNotice}
              />
            ) : (
              <CommandPanelInteractive
                state={combat}
                language={language}
                initialQuery={initialCombatQuery(query)}
                basePath={combatBase}
                confirmAction={`${combatBase}/combat/confirm`}
                surrenderAction={`${combatBase}/combat/surrender`}
                confirmFields={{ expectedStep: String(playthrough.step) }}
                names={combatNames}
                notice={combatNotice}
              />
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
            toggleHref={mapToggle}
            canTravel={false}
            journalTotal={modalJournal.total}
            journalEntries={modalJournal.entries}
            journalNextCursor={modalJournal.nextCursor}
            seen={preservedSeen}
            selectedItem={selectedItem}
            catalogue={catalogue}
            language={language}
          />
        </div>
      </main>
    );
  }

  // The intro modal over the starting Location: the base view stays the
  // Scenario's starting Location (name, description, Illustration) with no
  // actionable forms, so Location actions cannot be submitted through the
  // background with or without JavaScript. The modal's Continue (and any
  // dismissal: Escape, backdrop) acknowledges with the same `?seen=<step>`
  // as the outcome modal's Continue: no state change, no repeated Effects, no duplicated
  // Journal entries. A pending on-enter Scene stays in state and renders
  // after acknowledgement through the existing engine sequence. Without an
  // intro there is no modal and play opens directly in the normal position.
  if (showIntro) {
    const baseLocation =
      scenario.locationsById[state.currentLocationId] ?? scenario.startLocation;
    const baseIllustration = illustrationView(
      scenario.id,
      baseLocation.illustration,
      `location:${baseLocation.id}`,
    );
    const baseExits = visibleExits(scenario, state);
    const baseOnDemand = onDemandScenes(scenario, state);
    const introBaseView = {
      kind: 'location' as const,
      locationId: baseLocation.id,
      name: baseLocation.name,
      description: baseLocation.description,
      ...(baseIllustration === undefined ? {} : { illustration: baseIllustration }),
      exits: baseExits,
      onDemandScenes: baseOnDemand,
      map: gameView.map,
    };
    const introHead = (
      <header className="chronicle-head">
        <div className="chronicle-brand">
          <svg
            width={30}
            height={30}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m15 9-2 4-4 2 2-4Z" />
          </svg>
          <div>
            <p className="eyebrow">{catalogue.game.adventure}</p>
            <strong lang={shown}>{scenario.title}</strong>
          </div>
        </div>
        <span className="location-badge">
          <span aria-hidden="true" />
          <span lang={shown}>{baseLocation.name}</span>
        </span>
      </header>
    );
    return (
      <main>
        {introHead}
        <div className="game">
          <article className="reading-card" aria-hidden={false}>
            {noticeText ? (
              <p className="notice" role="status">
                {noticeText}
              </p>
            ) : null}
            <div className="reading-title">
              <p className="eyebrow">{catalogue.game.currentLocation}</p>
              <h1>
                <span lang={shown}>{baseLocation.name}</span>
                {badge === undefined ? null : <> {badge}</>}
              </h1>
            </div>
            {baseIllustration ? (
              <figure className="reading-art">
                <Illustration
                  src={baseIllustration.src}
                  width={baseIllustration.width}
                  height={baseIllustration.height}
                  alt={baseIllustration.alt}
                  layers={baseIllustration.layers}
                  camera={baseIllustration.camera}
                  showingKey={baseIllustration.showingKey}
                  pauseAnimationLabel={catalogue.illustration.pauseAnimation}
                  playAnimationLabel={catalogue.illustration.playAnimation}
                />
              </figure>
            ) : null}
            <div className="reading-body">
              <div
                className="narration"
                lang={shown}
                dangerouslySetInnerHTML={{
                  __html: renderNarration(baseLocation.description, characterName),
                }}
              />
              {baseOnDemand.length > 0 || baseExits.length > 0 ? (
                <section aria-label={catalogue.game.decide} className="decisions">
                  <p className="eyebrow">{catalogue.game.decide}</p>
                  {baseOnDemand.map((scene, index) => (
                    <p key={scene.sceneId}>
                      <button className="choice" type="button" disabled aria-disabled="true">
                        <span className="choice-number" aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span lang={shown}>{scene.title}</span>
                        <span aria-hidden="true">↗</span>
                      </button>
                    </p>
                  ))}
                  {baseExits.map((exit, index) => (
                    <p key={exit.targetLocationId}>
                      <button className="choice" type="button" disabled aria-disabled="true">
                        <span className="choice-number" aria-hidden="true">
                          {String(baseOnDemand.length + index + 1).padStart(2, '0')}
                        </span>
                        <span lang={shown}>{exit.label}</span>
                        <span aria-hidden="true">↗</span>
                      </button>
                    </p>
                  ))}
                </section>
              ) : null}
            </div>
          </article>
          <SidePanel
            scenario={scenario}
            state={state}
            playthroughId={playthrough.id}
            step={playthrough.step}
            panel={panel}
            notice={notice}
            noticeText={noticeText}
            gameView={introBaseView}
            showUnknownExits={showUnknownExits}
            toggleHref={mapToggle}
            canTravel={false}
            journalTotal={modalJournal.total}
            journalEntries={modalJournal.entries}
            journalNextCursor={modalJournal.nextCursor}
            seen={preservedSeen}
            selectedItem={selectedItem}
            catalogue={catalogue}
            language={language}
          />
        </div>
        <IntroModal
          continueHref={continueTo}
          continueLabel={catalogue.game.continue}
          title={catalogue.journal.types.intro}
          introHtml={introHtml}
          lang={introLang}
        />
      </main>
    );
  }

  // While the Outcome presentation is unacknowledged, it appears in a modal
  // over the Playthrough's current Location: the reading column holds the
  // destination Location (after a `move`, the new Location; otherwise the
  // current one) with its actions inert, and Continue reveals the next
  // playable state through the existing engine sequence (the Location view,
  // the following Scene or Ending screen). The side panel stays
  // visible throughout, with map travel disabled so no Location action can be
  // invoked through the background.
  if (showOutcome) {
    const backgroundLocation =
      scenario.locationsById[state.currentLocationId] ?? scenario.startLocation;
    const backgroundIllustration = illustrationView(
      scenario.id,
      backgroundLocation.illustration,
      `location:${backgroundLocation.id}`,
    );
    const backgroundExits = visibleExits(scenario, state);
    const backgroundOnDemand = onDemandScenes(scenario, state);
    return (
      <main>
        {chronicleHead}
        <div className="game">
          <article className="reading-card" inert>
            {noticeText ? (
              <p className="notice" role="status">
                {noticeText}
              </p>
            ) : null}
            <div className="reading-title">
              <p className="eyebrow">{catalogue.game.currentLocation}</p>
              <h1>
                <span lang={shown}>{backgroundLocation.name}</span>
                {badge === undefined ? null : <> {badge}</>}
              </h1>
            </div>
            {backgroundIllustration ? (
              <figure className="reading-art">
                <Illustration
                  src={backgroundIllustration.src}
                  width={backgroundIllustration.width}
                  height={backgroundIllustration.height}
                  alt={backgroundIllustration.alt}
                  layers={backgroundIllustration.layers}
                  camera={backgroundIllustration.camera}
                  showingKey={backgroundIllustration.showingKey}
                  pauseAnimationLabel={catalogue.illustration.pauseAnimation}
                  playAnimationLabel={catalogue.illustration.playAnimation}
                />
              </figure>
            ) : null}
            <div className="reading-body">
              <div
                className="narration"
                lang={shown}
                dangerouslySetInnerHTML={{
                  __html: renderNarration(backgroundLocation.description, characterName),
                }}
              />
              {backgroundOnDemand.length > 0 ? (
                <section aria-label={catalogue.game.scenes} className="decisions">
                  <p className="eyebrow">{catalogue.game.decide}</p>
                  {backgroundOnDemand.map((scene, index) => (
                    <form key={scene.sceneId} action={openSceneAction}>
                      <input type="hidden" name="playthroughId" value={playthrough.id} />
                      <input type="hidden" name="expectedStep" value={playthrough.step} />
                      <input type="hidden" name="scene" value={scene.sceneId} />
                      <p>
                        <button className="choice" type="submit">
                          <span className="choice-number" aria-hidden="true">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span lang={shown}>{scene.title}</span>
                          <span aria-hidden="true">↗</span>
                        </button>
                      </p>
                    </form>
                  ))}
                </section>
              ) : null}
              {backgroundExits.length > 0 ? (
                <section aria-label={catalogue.game.exits} className="decisions">
                  {backgroundOnDemand.length > 0 ? null : (
                    <p className="eyebrow">{catalogue.game.decide}</p>
                  )}
                  {backgroundExits.map((exit, index) => (
                    <form key={exit.targetLocationId} action={travelAction}>
                      <input type="hidden" name="playthroughId" value={playthrough.id} />
                      <input type="hidden" name="expectedStep" value={playthrough.step} />
                      <input type="hidden" name="target" value={exit.targetLocationId} />
                      <p>
                        <button className="choice" type="submit">
                          <span className="choice-number" aria-hidden="true">
                            {String(backgroundOnDemand.length + index + 1).padStart(2, '0')}
                          </span>
                          <span lang={shown}>{exit.label}</span>
                          <span aria-hidden="true">↗</span>
                        </button>
                      </p>
                    </form>
                  ))}
                </section>
              ) : null}
            </div>
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
            toggleHref={mapToggle}
            canTravel={false}
            journalTotal={modalJournal.total}
            journalEntries={modalJournal.entries}
            journalNextCursor={modalJournal.nextCursor}
            seen={preservedSeen}
            selectedItem={selectedItem}
            catalogue={catalogue}
            language={language}
          />
        </div>
        <OutcomeModal
          label={catalogue.game.latestEvents}
          closeLabel={catalogue.closePanel(catalogue.game.latestEvents)}
          acknowledgeHref={continueTo}
          continueLabel={catalogue.game.continue}
          entries={outcomeEntries}
        />
      </main>
    );
  }

  return (
    <main>
      {chronicleHead}
      <div className="game">
        <article className="reading-card">
          {noticeText ? (
            <p className="notice" role="status">
              {noticeText}
            </p>
          ) : null}
          {gameView.kind === 'location' ? (
            <>
              <div className="reading-title">
                <p className="eyebrow">{catalogue.game.currentLocation}</p>
                <h1>
                  <span lang={shown}>{gameView.name}</span>
                  {badge === undefined ? null : <> {badge}</>}
                </h1>
              </div>
              {gameView.illustration ? (
                <figure className="reading-art">
                  <Illustration
                    src={gameView.illustration.src}
                    width={gameView.illustration.width}
                    height={gameView.illustration.height}
                    alt={gameView.illustration.alt}
                    layers={gameView.illustration.layers}
                    camera={gameView.illustration.camera}
                    showingKey={gameView.illustration.showingKey}
                    pauseAnimationLabel={catalogue.illustration.pauseAnimation}
                    playAnimationLabel={catalogue.illustration.playAnimation}
                  />
                </figure>
              ) : null}
              <div className="reading-body">
                {/* Location description: rendered narration subset. */}
                <div
                  className="narration"
                  lang={shown}
                  dangerouslySetInnerHTML={{
                    __html: renderNarration(gameView.description, characterName),
                  }}
                />
                {gameView.onDemandScenes.length > 0 ? (
                  <section aria-label={catalogue.game.scenes} className="decisions">
                    <p className="eyebrow">{catalogue.game.decide}</p>
                    {gameView.onDemandScenes.map((scene, index) => (
                      <form key={scene.sceneId} action={openSceneAction}>
                        <input type="hidden" name="playthroughId" value={playthrough.id} />
                        <input type="hidden" name="expectedStep" value={playthrough.step} />
                        <input type="hidden" name="scene" value={scene.sceneId} />
                        <p>
                          <button className="choice" type="submit">
                            <span className="choice-number" aria-hidden="true">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span lang={shown}>{scene.title}</span>
                            <span aria-hidden="true">↗</span>
                          </button>
                        </p>
                      </form>
                    ))}
                  </section>
                ) : null}
                {gameView.exits.length > 0 ? (
                <section aria-label={catalogue.game.exits} className="decisions">
                  {gameView.onDemandScenes.length > 0 ? null : (
                    <p className="eyebrow">{catalogue.game.decide}</p>
                  )}
                  {gameView.exits.map((exit, index) => (
                    <form key={exit.targetLocationId} action={travelAction}>
                      <input type="hidden" name="playthroughId" value={playthrough.id} />
                      <input type="hidden" name="expectedStep" value={playthrough.step} />
                      <input type="hidden" name="target" value={exit.targetLocationId} />
                      <p>
                        <button className="choice" type="submit">
                          <span className="choice-number" aria-hidden="true">
                            {String(gameView.onDemandScenes.length + index + 1).padStart(2, '0')}
                          </span>
                          <span lang={shown}>{exit.label}</span>
                          <span aria-hidden="true">↗</span>
                        </button>
                      </p>
                    </form>
                  ))}
                </section>
                ) : null}
              </div>
            </>
          ) : gameView.kind === 'scene' ? (
            <>
              <div className="reading-title">
                <p className="eyebrow">{catalogue.game.currentScene}</p>
                <h1>
                  <span lang={shown}>{gameView.title}</span>
                  {badge === undefined ? null : <> {badge}</>}
                </h1>
              </div>
              {gameView.illustration ? (
                <figure className="reading-art">
                  <Illustration
                    src={gameView.illustration.src}
                    width={gameView.illustration.width}
                    height={gameView.illustration.height}
                    alt={gameView.illustration.alt}
                    layers={gameView.illustration.layers}
                    camera={gameView.illustration.camera}
                    showingKey={gameView.illustration.showingKey}
                    pauseAnimationLabel={catalogue.illustration.pauseAnimation}
                    playAnimationLabel={catalogue.illustration.playAnimation}
                  />
                </figure>
              ) : null}
              <div className="reading-body">
                <div
                  className="narration"
                  lang={shown}
                  dangerouslySetInnerHTML={{
                    __html: renderNarration(gameView.text, gameView.characterName),
                  }}
                />
                {gameView.choices.length > 0 ? (
                  <section aria-label={catalogue.game.choices} className="decisions">
                    <p className="eyebrow">{catalogue.game.decide}</p>
                    {gameView.choices.map((choice, index) => (
                      <form key={choice.id} action={chooseAction}>
                        <input type="hidden" name="playthroughId" value={playthrough.id} />
                        <input type="hidden" name="expectedStep" value={playthrough.step} />
                        <input type="hidden" name="choice" value={choice.id} />
                        <p>
                          <button className="choice" type="submit">
                            <span className="choice-number" aria-hidden="true">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span lang={shown}>
                              {choice.text}
                              {choice.test ? (
                                <small className="meta">
                                  {' '}
                                  (
                                  {catalogue.game.testLabel(
                                    catalogue.attributes[choice.test.attribute],
                                    catalogue.difficulty[choice.test.difficulty],
                                    choice.test.target,
                                  )}
                                  )
                                </small>
                              ) : null}
                            </span>
                            <span aria-hidden="true">↗</span>
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
              </div>
            </>
          ) : (
            <>
              <div className="reading-title">
                <p className="eyebrow">{catalogue.ending.title}</p>
              </div>
              <div className="reading-body">
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
                      ...journalEntriesText(catalogue),
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
              </div>
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
          toggleHref={mapToggle}
          canTravel={canTravel}
          journalTotal={modalJournal.total}
          journalEntries={modalJournal.entries}
          journalNextCursor={modalJournal.nextCursor}
          seen={preservedSeen}
          selectedItem={selectedItem}
          catalogue={catalogue}
          language={language}
        />
      </div>
    </main>
  );
}
