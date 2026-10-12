import type { Metadata } from 'next';
import { listScenarios } from '@/content/registry';
import { getCatalogue } from '@/i18n/index';
import { getInterfaceLanguage } from './lib/language';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return {
    title: catalogue.collection.title,
    description: catalogue.collection.description,
  };
}

export default async function HomePage() {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  const scenarios = listScenarios();
  return (
    <main>
      <h1>{catalogue.collection.title}</h1>
      <p>
        <a href="/playthroughs">{catalogue.nav.playthroughs}</a>
      </p>
      {scenarios.length === 0 ? (
        <p>{catalogue.collection.empty}</p>
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
                  {catalogue.collection.newPlaythrough}
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
