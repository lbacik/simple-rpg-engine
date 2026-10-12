import { notFound } from 'next/navigation';
import { getScenario } from '@/content/registry';
import type { CompiledItem } from '@/content/model';
import {
  combatGuardUp,
  combatRounds,
  effectiveAttributes,
  escapeHtml,
  renderNarration,
  renderStoredText,
  RESULT_PANEL_ENTRY_TYPES,
  view,
  type GameView,
} from '@/engine/index';
import { equipmentBonusSources, EQUIPMENT_SLOTS } from '@/engine/inventory';
import { MAX_HEALTH, type PlaythroughState } from '@/engine/state';
import type { Scenario } from '@/content/index';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { equipAction, unequipAction, useItemAction } from '@/app/lib/inventory';
import {
  JOURNAL_BATCH_SIZE,
  latestJournalEnding,
  renderJournalEntries,
} from '@/app/lib/journal';
import { JournalEntries } from './journal/journal-entries';
import {
  continueHref,
  parsePanelTab,
  parseSeenStep,
  playHref,
  shouldShowResultPanel,
  type PanelTab,
} from '@/app/lib/panel';
import { resolvePlaythrough } from '@/app/lib/playthrough';
import { LocationMap } from './map';
import { CombatPanel } from './combat-panel';
import { SceneIllustration } from './scene-illustration';
import { EndingBlock, ReadOnlyPosition } from './read-only-position';
import { getSessionHash } from '@/app/lib/session';
import { chooseAction, continueAction, openSceneAction } from '@/app/lib/scenes';
import { combatAction } from '@/app/lib/combat';
import { travelAction } from '@/app/lib/travel';
import { ResultPanel } from './result-panel';

export const dynamic = 'force-dynamic';

const NOTICES: Record<string, string> = {
  stale: 'The game was advanced in another tab; this is its current state.',
  unavailable: 'That action is no longer available.',
};

const ATTRIBUTE_LABELS = {
  might: 'Might',
  agility: 'Agility',
  wits: 'Wits',
  presence: 'Presence',
} as const;

type AttributeName = keyof typeof ATTRIBUTE_LABELS;

function itemName(scenario: Scenario, itemId: string): string {
  return scenario.itemsById[itemId]?.name ?? itemId;
}

function TabNav({
  playthroughId,
  tab,
  notice,
  tabs,
  seen,
  showUnknownExits,
}: {
  playthroughId: string;
  tab: PanelTab;
  notice: string | undefined;
  tabs: PanelTab[];
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  return (
    <nav aria-label="Character and inventory tabs" className="tabs">
      {tabs.map((candidate) => (
        <a
          key={candidate}
          href={playHref(playthroughId, candidate, notice, seen, showUnknownExits)}
          aria-current={candidate === tab ? 'page' : undefined}
          className={candidate === tab ? 'tab active' : 'tab'}
        >
          {candidate === 'character' ? 'Character' : candidate === 'inventory' ? 'Inventory' : 'Map'}
        </a>
      ))}
    </nav>
  );
}

function AttributeLine({
  label,
  base,
  effective,
  counted,
  ignored,
}: {
  label: string;
  base: number;
  effective: number;
  /** Bonus sources that add to the total (at most two: the bonus cap). */
  counted: string[];
  /** Bonus sources beyond the +2 cap, adding nothing. */
  ignored: string[];
}) {
  if (counted.length === 0 && ignored.length === 0) {
    return (
      <li>
        {label} {effective}
      </li>
    );
  }
  return (
    <li>
      {label} {effective} ({[String(base), ...counted.map((name) => `1 ${name}`)].join(' + ')}
      {ignored.length > 0
        ? `; ${ignored.map((name) => `1 ${name}`).join(' + ')} ignored: bonus capped at +2`
        : ''}
      )
    </li>
  );
}

function CharacterTab({
  scenario,
  state,
}: {
  scenario: Scenario;
  state: PlaythroughState;
}) {
  const template = scenario.templatesById[state.character.templateId];
  const effective = effectiveAttributes(scenario, state);
  const sources = equipmentBonusSources(scenario, state);
  return (
    <section aria-label="Character">
      <h2>Character</h2>
      <p>
        <strong>{state.character.name}</strong>
        {template ? ` · ${template.name}` : null}
      </p>
      <p>
        Health {state.character.health}/{MAX_HEALTH}
      </p>
      <ul>
        {(Object.keys(ATTRIBUTE_LABELS) as AttributeName[]).map((name) => {
          const ids = sources[name];
          return (
            <AttributeLine
              key={name}
              label={ATTRIBUTE_LABELS[name]}
              base={state.character.baseAttributes[name]}
              effective={effective[name]}
              counted={ids.slice(0, 2).map((id) => itemName(scenario, id))}
              ignored={ids.slice(2).map((id) => itemName(scenario, id))}
            />
          );
        })}
      </ul>
    </section>
  );
}

function itemDetails(item: CompiledItem): string[] {
  if (item.kind === 'equipment') {
    const details = [`Equipment · ${item.slot}`];
    if (item.bonus !== undefined) {
      details.push(`+1 ${ATTRIBUTE_LABELS[item.bonus]}`);
    }
    if (item.slot === 'weapon') {
      if (item.damage !== undefined) {
        details.push(`Damage ${item.damage} · Reach ${item.reach}`);
      } else {
        details.push(`Reach ${item.reach}`);
      }
    }
    return details;
  }
  if (item.kind === 'consumable') {
    return [`Consumable · restores ${item.heal} Health`];
  }
  return ['Key item'];
}

/**
 * The game-page query the inventory forms carry along: the panel tab, the
 * Continue acknowledgement (`?seen=`) and the "?" map setting, so the
 * redirect after the turn lands back on the same view instead of bouncing to
 * the result panel or losing the map setting.
 */
function PreservedQueryInputs({
  tab,
  seen,
  showUnknownExits,
}: {
  tab: PanelTab;
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  return (
    <>
      <input type="hidden" name="tab" value={tab} />
      {seen !== undefined ? <input type="hidden" name="seen" value={seen} /> : null}
      {showUnknownExits ? <input type="hidden" name="unknown" value="1" /> : null}
    </>
  );
}

function InventoryTab({
  scenario,
  state,
  playthroughId,
  step,
  tab,
  forceReadOnly,
  seen,
  showUnknownExits,
}: {
  scenario: Scenario;
  state: PlaythroughState;
  playthroughId: string;
  step: number;
  tab: PanelTab;
  /** Set for incompatible Playthroughs: no actions, whatever the status. */
  forceReadOnly?: boolean;
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  const readOnly = forceReadOnly === true || state.status !== 'active';
  const inCombat = state.activeCombat != null;
  // Best effort: anything whose id is gone from the content is left out.
  const heldItems = Object.entries(state.inventory).filter(
    ([itemId]) => scenario.itemsById[itemId] !== undefined,
  );
  return (
    <section aria-label="Inventory">
      <h2>Inventory</h2>
      {inCombat ? <p className="meta">Inventory actions are unavailable during Combat.</p> : null}
      {EQUIPMENT_SLOTS.map((slot) => {
        const equippedId = state.equipment[slot];
        // Best effort: an equipped id that is gone from the content reads as empty.
        if (equippedId === undefined || scenario.itemsById[equippedId] === undefined) {
          return (
            <p key={slot}>
              The {slot} slot is empty.{' '}
              {readOnly ? null : (
                <>
                  <button className="button secondary" type="button" disabled>
                    Unequip
                  </button>{' '}
                  <span className="reason">Slot is empty.</span>
                </>
              )}
            </p>
          );
        }
        const disabled = readOnly || inCombat;
        return (
          <p key={slot}>
            {itemName(scenario, equippedId)} is equipped in the {slot} slot.{' '}
            {readOnly ? null : (
              <form action={unequipAction} className="inline">
                <input type="hidden" name="playthroughId" value={playthroughId} />
                <input type="hidden" name="expectedStep" value={step} />
                <input type="hidden" name="slot" value={slot} />
                <PreservedQueryInputs tab={tab} seen={seen} showUnknownExits={showUnknownExits} />
                <button className="button secondary" type="submit" disabled={disabled}>
                  Unequip
                </button>{' '}
                {disabled && !readOnly ? (
                  <span className="reason">Cannot change equipment during Combat.</span>
                ) : null}
              </form>
            )}
          </p>
        );
      })}
      {heldItems.length === 0 ? (
        <p>Empty.</p>
      ) : (
        <ul className="items">
          {heldItems.map(([itemId, quantity]) => {
            const item = scenario.itemsById[itemId];
            if (item === undefined) {
              return (
                <li key={itemId}>
                  {itemId} × {quantity}
                </li>
              );
            }
            const equippedSlot =
              item.kind === 'equipment' && state.equipment[item.slot] === itemId
                ? item.slot
                : undefined;
            return (
              <li key={itemId} className="item">
                <p>
                  <strong>{item.name}</strong> × {quantity}{' '}
                  {item.magic ? (
                    <span className="magic" title="Magic item">
                      ✨ magic
                    </span>
                  ) : null}{' '}
                  {equippedSlot !== undefined ? (
                    <span className="meta">(equipped in {equippedSlot})</span>
                  ) : null}
                </p>
                {item.description ? <p className="meta">{item.description}</p> : null}
                <p className="meta">{itemDetails(item).join(' · ')}</p>
                {readOnly ? null : (
                  <ItemActions
                    item={item}
                    itemId={itemId}
                    equipped={equippedSlot !== undefined}
                    fullHealth={state.character.health >= MAX_HEALTH}
                    inCombat={inCombat}
                    playthroughId={playthroughId}
                    step={step}
                    tab={tab}
                    seen={seen}
                    showUnknownExits={showUnknownExits}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ItemActions({
  item,
  itemId,
  equipped,
  fullHealth,
  inCombat,
  playthroughId,
  step,
  tab,
  seen,
  showUnknownExits,
}: {
  item: CompiledItem;
  itemId: string;
  equipped: boolean;
  fullHealth: boolean;
  inCombat: boolean;
  playthroughId: string;
  step: number;
  tab: PanelTab;
  seen: number | undefined;
  showUnknownExits: boolean;
}) {
  if (item.kind === 'equipment') {
    if (inCombat) {
      return (
        <p>
          <button className="button secondary" type="button" disabled>
            Equip
          </button>{' '}
          <span className="reason">Cannot change equipment during Combat.</span>
        </p>
      );
    }
    if (equipped) {
      return (
        <p>
          <button className="button secondary" type="button" disabled>
            Equip
          </button>{' '}
          <span className="reason">Already equipped.</span>
        </p>
      );
    }
    return (
      <form action={equipAction} className="inline">
        <input type="hidden" name="playthroughId" value={playthroughId} />
        <input type="hidden" name="expectedStep" value={step} />
        <input type="hidden" name="itemId" value={itemId} />
        <PreservedQueryInputs tab={tab} seen={seen} showUnknownExits={showUnknownExits} />
        <p>
          <button className="button secondary" type="submit">
            Equip
          </button>
        </p>
      </form>
    );
  }
  if (item.kind === 'consumable') {
    if (inCombat) {
      return (
        <p>
          <button className="button secondary" type="button" disabled>
            Use
          </button>{' '}
          <span className="reason">Cannot use items here during Combat.</span>
        </p>
      );
    }
    if (fullHealth) {
      return (
        <p>
          <button className="button secondary" type="button" disabled>
            Use
          </button>{' '}
          <span className="reason">Already at full Health.</span>
        </p>
      );
    }
    return (
      <form action={useItemAction} className="inline">
        <input type="hidden" name="playthroughId" value={playthroughId} />
        <input type="hidden" name="expectedStep" value={step} />
        <input type="hidden" name="itemId" value={itemId} />
        <PreservedQueryInputs tab={tab} seen={seen} showUnknownExits={showUnknownExits} />
        <p>
          <button className="button secondary" type="submit">
            Use
          </button>
        </p>
      </form>
    );
  }
  return null;
}

/** Query helpers shared by the compatible and incompatible game screens. */
function mapToggleHrefFor(
  playthroughId: string,
  tab: PanelTab,
  notice: string | undefined,
  showUnknownExits: boolean,
  seen?: number,
): string {
  return playHref(
    playthroughId,
    tab,
    notice,
    seen,
    // The toggle flips the setting, so it carries the opposite value.
    !showUnknownExits,
  );
}

function desktopTabFor(tab: PanelTab): 'character' | 'inventory' {
  return tab === 'inventory' ? 'inventory' : 'character';
}

/**
 * The Character and inventory side panel, shared by the compatible and
 * incompatible game screens. Incompatible Playthroughs render it without any
 * actions (`forceReadOnly`) and without map travel (`canTravel` false).
 */
function SidePanel({
  scenario,
  state,
  playthroughId,
  step,
  tab,
  notice,
  gameView,
  showUnknownExits,
  toggleHref,
  desktopTab,
  canTravel,
  forceReadOnly,
  detailsOpen,
  summarySuffix,
  seen,
}: {
  scenario: Scenario;
  state: PlaythroughState;
  playthroughId: string;
  step: number;
  tab: PanelTab;
  notice: string | undefined;
  gameView: GameView;
  showUnknownExits: boolean;
  toggleHref: string;
  desktopTab: 'character' | 'inventory';
  canTravel: boolean;
  forceReadOnly?: boolean;
  detailsOpen?: boolean;
  summarySuffix?: string;
  seen?: number;
}) {
  return (
    <aside className="side" aria-label="Character and inventory">
      <details className="compact-summary" open={detailsOpen || undefined}>
        <summary>
          <strong>{state.character.name}</strong> · Health {state.character.health}/{MAX_HEALTH}
          {summarySuffix ? ` · ${summarySuffix}` : null}
        </summary>
        <TabNav
          playthroughId={playthroughId}
          tab={tab}
          notice={notice}
          tabs={['character', 'inventory', 'map']}
          seen={seen}
          showUnknownExits={showUnknownExits}
        />
        {tab === 'inventory' ? (
          <InventoryTab
            scenario={scenario}
            state={state}
            playthroughId={playthroughId}
            step={step}
            tab={tab}
            forceReadOnly={forceReadOnly}
            seen={seen}
            showUnknownExits={showUnknownExits}
          />
        ) : tab === 'map' ? (
          <LocationMap
            map={gameView.map}
            playthroughId={playthroughId}
            step={step}
            canTravel={canTravel}
            showUnknownExits={showUnknownExits}
            toggleHref={toggleHref}
            markerId="map-arrow-phone"
          />
        ) : (
          <CharacterTab scenario={scenario} state={state} />
        )}
      </details>
      <div className="full">
        <LocationMap
          map={gameView.map}
          playthroughId={playthroughId}
          step={step}
          canTravel={canTravel}
          showUnknownExits={showUnknownExits}
          toggleHref={toggleHref}
          markerId="map-arrow-desktop"
        />
        <TabNav
          playthroughId={playthroughId}
          tab={desktopTab}
          notice={notice}
          tabs={['character', 'inventory']}
          seen={seen}
          showUnknownExits={showUnknownExits}
        />
        {desktopTab === 'inventory' ? (
          <InventoryTab
            scenario={scenario}
            state={state}
            playthroughId={playthroughId}
            step={step}
            tab={tab}
            forceReadOnly={forceReadOnly}
            seen={seen}
            showUnknownExits={showUnknownExits}
          />
        ) : (
          <CharacterTab scenario={scenario} state={state} />
        )}
      </div>
    </aside>
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
  searchParams: Promise<{ notice?: string; tab?: string; unknown?: string; seen?: string }>;
}) {
  const { playthroughId } = await params;
  const { notice, tab: tabParam, unknown, seen: seenParam } = await searchParams;
  const tab = parsePanelTab(tabParam);
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
            <p>
              <a href={`/play/${resolved.playthrough.id}/journal`}>View journal</a>
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
            tab={tab}
            notice={notice}
            gameView={incompatibleView}
            showUnknownExits={showUnknownExits}
            toggleHref={mapToggleHrefFor(resolved.playthrough.id, tab, notice, showUnknownExits)}
            desktopTab={desktopTabFor(tab)}
            canTravel={false}
            forceReadOnly
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
  // Once acknowledged, the tab and "?" links keep `?seen=` so the position
  // stays visible instead of bouncing back to the result panel.
  const preservedSeen = seenStep === playthrough.step ? seenStep : undefined;
  const continueTo = continueHref(playthrough.id, playthrough.step, tabParam, notice, showUnknownExits);
  // The desktop panel shows the map above the Character/Inventory tabs; the
  // phone panel holds all three tabs behind the compact summary.
  const mapToggleHref = mapToggleHrefFor(
    playthrough.id,
    tab,
    notice,
    showUnknownExits,
    preservedSeen,
  );
  const desktopTab = desktopTabFor(tab);
  const panelOpen = tab !== 'character' || noticeText !== undefined;

  // While the result panel is shown, the reading column holds only the panel
  // (with Continue) and the transient notice: the Location view, Scene,
  // Combat panel and the "View journal" link wait for Continue. The side
  // panel (map, Character, Inventory) stays visible throughout.
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
            tab={tab}
            notice={notice}
            gameView={gameView}
            showUnknownExits={showUnknownExits}
            toggleHref={mapToggleHref}
            desktopTab={desktopTab}
            canTravel={canTravel}
            detailsOpen={panelOpen}
            summarySuffix={
              gameView.kind === 'location'
                ? gameView.name
                : gameView.kind === 'scene' || gameView.kind === 'combat'
                  ? gameView.locationName
                  : 'Ended'
            }
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
          <p>
            <a href={`/play/${playthrough.id}/journal`}>View journal</a>
          </p>
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
                  <a className="button secondary" href={`/play/${playthrough.id}/journal`}>
                    View journal
                  </a>
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
          tab={tab}
          notice={notice}
          gameView={gameView}
          showUnknownExits={showUnknownExits}
          toggleHref={mapToggleHref}
          desktopTab={desktopTab}
          canTravel={canTravel}
          detailsOpen={panelOpen}
          summarySuffix={
            gameView.kind === 'location'
              ? gameView.name
              : gameView.kind === 'scene' || gameView.kind === 'combat'
                ? gameView.locationName
                : 'Ended'
          }
          seen={preservedSeen}
        />
      </div>
    </main>
  );
}
