import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { getSessionHash } from '@/app/lib/session';

export const dynamic = 'force-dynamic';

export default async function PlaythroughsPage() {
  const sessionHash = await getSessionHash();
  const playthroughs = sessionHash
    ? await new PlaythroughStore(getDatabase()).listBySession(sessionHash)
    : [];
  return (
    <main>
      <h1>My Playthroughs</h1>
      {playthroughs.length === 0 ? (
        <p>
          No Playthroughs yet. <a href="/">Choose a Scenario</a> to begin.
        </p>
      ) : (
        <ul className="cards">
          {playthroughs.map((playthrough) => (
            <li key={playthrough.id} className="card">
              <h2>{playthrough.state.character.name}</h2>
              <p className="meta">
                {playthrough.scenarioId} · {playthrough.status}
              </p>
              <p>
                <a className="button secondary" href={`/play/${playthrough.id}`}>
                  {playthrough.status === 'active' ? 'Resume' : 'View'}
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
