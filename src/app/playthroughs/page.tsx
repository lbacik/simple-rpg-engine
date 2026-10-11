import { getScenario } from '@/content/registry';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { resolvePlaythrough } from '@/app/lib/playthrough';
import { getSessionHash } from '@/app/lib/session';

export const dynamic = 'force-dynamic';

export default async function PlaythroughsPage() {
  const sessionHash = await getSessionHash();
  const db = getDatabase();
  const stored = sessionHash
    ? await new PlaythroughStore(db).listBySession(sessionHash)
    : [];
  // Incompatibility is derived on read: an incompatible Playthrough is
  // viewable, never resumable. Reads that pass the reference check update the
  // content pin, like every other read.
  const entries = (
    await Promise.all(
      stored.map((playthrough) =>
        resolvePlaythrough(db, (scenarioId) => getScenario(scenarioId), playthrough.id, sessionHash),
      ),
    )
  ).filter((entry) => entry !== null);
  const resumable = entries.filter(
    (entry) => entry.compatible && entry.playthrough.status === 'active',
  );
  const viewable = entries.filter(
    (entry) => !entry.compatible || entry.playthrough.status !== 'active',
  );
  return (
    <main>
      <h1>My Playthroughs</h1>
      {entries.length === 0 ? (
        <p>
          No Playthroughs yet. <a href="/">Choose a Scenario</a> to begin.
        </p>
      ) : (
        <>
          <h2>Active</h2>
          {resumable.length === 0 ? (
            <p>No active Playthroughs.</p>
          ) : (
            <ul className="cards">
              {resumable.map((entry) => (
                <li key={entry.playthrough.id} className="card">
                  <h3>{entry.playthrough.state.character.name}</h3>
                  <p className="meta">
                    {entry.playthrough.scenarioId} · Active
                  </p>
                  <p>
                    <a className="button secondary" href={`/play/${entry.playthrough.id}`}>
                      Resume
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <h2>Ended or read-only</h2>
          {viewable.length === 0 ? (
            <p>No ended or read-only Playthroughs.</p>
          ) : (
            <ul className="cards">
              {viewable.map((entry) => (
                <li key={entry.playthrough.id} className="card">
                  <h3>{entry.playthrough.state.character.name}</h3>
                  <p className="meta">
                    {entry.playthrough.scenarioId} ·{' '}
                    {entry.compatible ? 'Ended' : 'Incompatible'}
                  </p>
                  <p>
                    <a className="button secondary" href={`/play/${entry.playthrough.id}`}>
                      View
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
