import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { getSessionHash } from '@/app/lib/session';

export const dynamic = 'force-dynamic';

export default async function PlaythroughsPage() {
  const sessionHash = await getSessionHash();
  const playthroughs = sessionHash
    ? await new PlaythroughStore(getDatabase()).listBySession(sessionHash)
    : [];
  const active = playthroughs.filter((playthrough) => playthrough.status === 'active');
  const ended = playthroughs.filter((playthrough) => playthrough.status !== 'active');
  return (
    <main>
      <h1>My Playthroughs</h1>
      {playthroughs.length === 0 ? (
        <p>
          No Playthroughs yet. <a href="/">Choose a Scenario</a> to begin.
        </p>
      ) : (
        <>
          <h2>Active</h2>
          {active.length === 0 ? (
            <p>No active Playthroughs.</p>
          ) : (
            <ul className="cards">
              {active.map((playthrough) => (
                <li key={playthrough.id} className="card">
                  <h3>{playthrough.state.character.name}</h3>
                  <p className="meta">
                    {playthrough.scenarioId} · Active
                  </p>
                  <p>
                    <a className="button secondary" href={`/play/${playthrough.id}`}>
                      Resume
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <h2>Ended</h2>
          {ended.length === 0 ? (
            <p>No ended Playthroughs.</p>
          ) : (
            <ul className="cards">
              {ended.map((playthrough) => (
                <li key={playthrough.id} className="card">
                  <h3>{playthrough.state.character.name}</h3>
                  <p className="meta">
                    {playthrough.scenarioId} · Ended
                  </p>
                  <p>
                    <a className="button secondary" href={`/play/${playthrough.id}`}>
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
