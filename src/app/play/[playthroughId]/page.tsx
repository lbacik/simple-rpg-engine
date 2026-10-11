import { notFound } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { view } from '@/engine/index';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { getSessionHash } from '@/app/lib/session';

export const dynamic = 'force-dynamic';

/** Journal types that make up the result panel (playthrough-state.md). */
const RESULT_TYPES = new Set([
  'intro',
  'test',
  'outcome',
  'state-change',
  'combat-end',
  'enemy-defeated',
]);

export default async function PlayPage({
  params,
}: {
  params: Promise<{ playthroughId: string }>;
}) {
  const { playthroughId } = await params;
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

  const gameView = view(scenario, playthrough.state);
  const journal = await store.listJournal(playthrough.id);
  const resultPanel = journal.filter(
    (entry) => entry.step === playthrough.step && RESULT_TYPES.has(entry.type),
  );
  const template = scenario.templatesById[playthrough.state.character.templateId];
  const heldItems = Object.entries(playthrough.state.inventory);

  return (
    <main>
      <div className="game">
        <article className="reading" lang={scenario.language}>
          {gameView.kind === 'location' ? (
            <>
              {resultPanel.map((entry) => (
                <section key={entry.seq} className="result" aria-label="Latest events">
                  <p>{String((entry.payload as { text?: unknown }).text ?? '')}</p>
                </section>
              ))}
              <h1>{gameView.name}</h1>
              <p>{gameView.description}</p>
            </>
          ) : (
            <>
              <h1>{gameView.title}</h1>
              <p>{gameView.text}</p>
            </>
          )}
        </article>
        <aside className="side" aria-label="Character and inventory">
          <section className="compact-summary" aria-label="Summary">
            <strong>{playthrough.state.character.name}</strong> · Health{' '}
            {playthrough.state.character.health}/12 · {gameView.kind === 'location' ? gameView.name : 'Ended'}
          </section>
          <div className="full">
            <h2>Character</h2>
            <p>
              <strong>{playthrough.state.character.name}</strong>
              {template ? ` · ${template.name}` : null}
            </p>
            <p>Health {playthrough.state.character.health}/12</p>
            <p>
              Might {playthrough.state.character.baseAttributes.might} · Agility{' '}
              {playthrough.state.character.baseAttributes.agility} · Wits{' '}
              {playthrough.state.character.baseAttributes.wits} · Presence{' '}
              {playthrough.state.character.baseAttributes.presence}
            </p>
            <h2>Inventory</h2>
            {heldItems.length === 0 ? (
              <p>Empty.</p>
            ) : (
              <ul>
                {heldItems.map(([itemId, quantity]) => (
                  <li key={itemId}>
                    {scenario.itemsById[itemId]?.name ?? itemId} × {quantity}
                  </li>
                ))}
              </ul>
            )}
            <h2>Map</h2>
            <p>
              {gameView.kind === 'location'
                ? `You are in ${gameView.name}.`
                : 'This Playthrough has ended.'}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
