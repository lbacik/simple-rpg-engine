import { listScenarios } from '@/content/registry';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const scenarios = listScenarios();
  return (
    <main>
      <h1>Scenarios</h1>
      <p>
        <a href="/playthroughs">My Playthroughs</a>
      </p>
      {scenarios.length === 0 ? (
        <p>No Scenarios are available right now.</p>
      ) : (
        <ul className="cards">
          {scenarios.map((scenario) => (
            <li key={scenario.id} className="card">
              <h2>{scenario.title}</h2>
              <p lang={scenario.language}>{scenario.description}</p>
              <p className="meta">
                {[scenario.author, scenario.language].filter(Boolean).join(' · ')}
              </p>
              <p>
                <a className="button" href={`/scenarios/${scenario.id}`}>
                  New Playthrough
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
