import { notFound } from 'next/navigation';
import { getScenario } from '@/content/registry';
import type { CompiledItem } from '@/content/model';
import {
  effectiveAttributes,
  escapeHtml,
  renderNarration,
  renderStoredText,
  RESULT_PANEL_ENTRY_TYPES,
  view,
} from '@/engine/index';
import { equipmentBonusSources, EQUIPMENT_SLOTS } from '@/engine/inventory';
import { MAX_HEALTH, type PlaythroughState } from '@/engine/state';
import type { Scenario } from '@/content/index';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { equipAction, unequipAction, useItemAction } from '@/app/lib/inventory';
import { parsePanelTab, playHref, type PanelTab } from '@/app/lib/panel';
import { LocationMap } from './map';
import { getSessionHash } from '@/app/lib/session';
import { chooseAction, continueAction, openSceneAction } from '@/app/lib/scenes';
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
}: {
  playthroughId: string;
  tab: PanelTab;
  notice: string | undefined;
  tabs: PanelTab[];
}) {
  return (
    <nav aria-label="Character and inventory tabs" className="tabs">
      {tabs.map((candidate) => (
        <a
          key={candidate}
          href={playHref(playthroughId, candidate, notice)}
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

function InventoryTab({
  scenario,
  state,
  playthroughId,
  step,
  tab,
}: {
  scenario: Scenario;
  state: PlaythroughState;
  playthroughId: string;
  step: number;
  tab: PanelTab;
}) {
  const readOnly = state.status !== 'active';
  const inCombat = state.activeCombat != null;
  const heldItems = Object.entries(state.inventory);
  return (
    <section aria-label="Inventory">
      <h2>Inventory</h2>
      {inCombat ? <p className="meta">Inventory actions are unavailable during Combat.</p> : null}
      {EQUIPMENT_SLOTS.map((slot) => {
        const equippedId = state.equipment[slot];
        if (equippedId === undefined) {
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
                <input type="hidden" name="tab" value={tab} />
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
}: {
  item: CompiledItem;
  itemId: string;
  equipped: boolean;
  fullHealth: boolean;
  inCombat: boolean;
  playthroughId: string;
  step: number;
  tab: PanelTab;
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
        <input type="hidden" name="tab" value={tab} />
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
        <input type="hidden" name="tab" value={tab} />
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
  searchParams: Promise<{ notice?: string; tab?: string; unknown?: string }>;
}) {
  const { playthroughId } = await params;
  const { notice, tab: tabParam, unknown } = await searchParams;
  const tab = parsePanelTab(tabParam);
  // App-level display setting, off by default: draw unvisited targets of
  // visible exits as "?" nodes. It is not a Scenario field.
  const showUnknownExits = unknown === '1';
  const noticeText = notice ? NOTICES[notice] : undefined;
  const sessionHash = await getSessionHash();
  const store = new PlaythroughStore(getDatabase());
  const playthrough = await store.findById(playthroughId);
  if (!playthrough || !sessionHash || playthrough.sessionId !== sessionHash) {
    notFound();
  }

  const scenario = getScenario(playthrough.scenarioId);
  if (!scenario) {
    // The Scenario left the collection: Journal only, read-only.
    const journal = await store.listJournal(playthrough.id);
    return (
      <main>
        <h1>{playthrough.state.character.name}</h1>
        <p>This Scenario has changed since it was played (or is no longer available).</p>
        <section aria-label="Journal">
          {journal.map((entry) => (
            <p key={entry.seq}>{JSON.stringify(entry.payload)}</p>
          ))}
        </section>
      </main>
    );
  }

  const gameView = view(scenario, playthrough.state, {
    includeUnknownExits: showUnknownExits,
  });
  const journal = await store.listJournal(playthrough.id);
  const state = playthrough.state;
  const characterName = state.character.name;
  const resultEntries = journal
    .filter((entry) => entry.step === playthrough.step && RESULT_PANEL_ENTRY_TYPES.has(entry.type))
    .map((entry) => renderResultEntry(entry.type, entry.payload, characterName));
  // Map travel is available only in the Location view of an active Playthrough
  // with no Scene or Combat running: the same legality as the Travel action.
  const canTravel =
    gameView.kind === 'location' &&
    state.status === 'active' &&
    state.activeSceneId == null &&
    state.activeCombat == null;
  const toggleParams = new URLSearchParams();
  if (tab === 'inventory' || tab === 'map') toggleParams.set('tab', tab);
  if (notice === 'stale' || notice === 'unavailable') toggleParams.set('notice', notice);
  if (!showUnknownExits) toggleParams.set('unknown', '1');
  const toggleQuery = toggleParams.toString();
  const mapToggleHref =
    toggleQuery === '' ? `/play/${playthrough.id}` : `/play/${playthrough.id}?${toggleQuery}`;
  // The desktop panel shows the map above the Character/Inventory tabs; the
  // phone panel holds all three tabs behind the compact summary.
  const desktopTab = tab === 'inventory' ? 'inventory' : 'character';
  const panelOpen = tab !== 'character' || noticeText !== undefined;

  return (
    <main>
      <div className="game">
        <article className="reading" lang={scenario.language}>
          {noticeText ? (
            <p className="notice" role="status">
              {noticeText}
            </p>
          ) : null}
          <ResultPanel entries={resultEntries} />
          {gameView.kind === 'location' ? (
            <>
              <h1>{gameView.name}</h1>
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
          ) : (
            <>
              <h1>{gameView.title}</h1>
              <p>{gameView.text}</p>
            </>
          )}
        </article>
        <aside className="side" aria-label="Character and inventory">
          <details className="compact-summary" open={panelOpen || undefined}>
            <summary>
              <strong>{state.character.name}</strong> · Health {state.character.health}/
              {MAX_HEALTH} ·{' '}
              {gameView.kind === 'location'
                ? gameView.name
                : gameView.kind === 'scene'
                  ? gameView.locationName
                  : 'Ended'}
            </summary>
            <TabNav
              playthroughId={playthrough.id}
              tab={tab}
              notice={notice}
              tabs={['character', 'inventory', 'map']}
            />
            {tab === 'inventory' ? (
              <InventoryTab
                scenario={scenario}
                state={state}
                playthroughId={playthrough.id}
                step={playthrough.step}
                tab={tab}
              />
            ) : tab === 'map' ? (
              <LocationMap
                map={gameView.map}
                playthroughId={playthrough.id}
                step={playthrough.step}
                canTravel={canTravel}
                showUnknownExits={showUnknownExits}
                toggleHref={mapToggleHref}
                markerId="map-arrow-phone"
              />
            ) : (
              <CharacterTab scenario={scenario} state={state} />
            )}
          </details>
          <div className="full">
            <LocationMap
              map={gameView.map}
              playthroughId={playthrough.id}
              step={playthrough.step}
              canTravel={canTravel}
              showUnknownExits={showUnknownExits}
              toggleHref={mapToggleHref}
              markerId="map-arrow-desktop"
            />
            <TabNav
              playthroughId={playthrough.id}
              tab={desktopTab}
              notice={notice}
              tabs={['character', 'inventory']}
            />
            {desktopTab === 'inventory' ? (
              <InventoryTab
                scenario={scenario}
                state={state}
                playthroughId={playthrough.id}
                step={playthrough.step}
                tab={tab}
              />
            ) : (
              <CharacterTab scenario={scenario} state={state} />
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
