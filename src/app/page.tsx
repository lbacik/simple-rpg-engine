import type { Metadata } from 'next';
import { listScenarios, localizeScenario } from '@/content/index';
import { getCatalogue, type Catalogue, type InterfaceLanguage } from '@/i18n/index';
import { ScenarioLanguageFlags } from './flag';
import { getInterfaceLanguage } from './lib/language';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return {
    title: catalogue.collection.title,
    description: catalogue.collection.description,
  };
}

function ScenarioCard({
  scenarioId,
  title,
  description,
  author,
  shownLanguage,
  baseLanguage,
  languages,
  catalogue,
  newPlaythrough,
}: {
  scenarioId: string;
  title: string;
  description: string;
  author: string | undefined;
  shownLanguage: string;
  baseLanguage: string;
  languages: string[];
  catalogue: Catalogue;
  newPlaythrough: string;
}) {
  return (
    <li className="card">
      <h2 lang={shownLanguage}>{title}</h2>
      <p lang={shownLanguage}>{description}</p>
      <p className="meta">
        {author ? <>{author} · </> : null}
        <ScenarioLanguageFlags
          languages={languages}
          shownLanguage={shownLanguage}
          baseLanguage={baseLanguage}
          catalogue={catalogue}
        />
      </p>
      <p>
        <a className="button" href={`/scenarios/${scenarioId}`}>
          {newPlaythrough}
        </a>
      </p>
    </li>
  );
}

export default async function HomePage() {
  const language: InterfaceLanguage = await getInterfaceLanguage();
  const catalogue = getCatalogue(language);
  const scenarios = listScenarios().map((scenario) => ({
    base: scenario,
    ...localizeScenario(scenario, language),
  }));
  if (scenarios.length === 0) {
    return (
      <main>
        <h1>{catalogue.collection.title}</h1>
        <p>
          <a href="/playthroughs">{catalogue.nav.playthroughs}</a>
        </p>
        <p>{catalogue.collection.empty}</p>
      </main>
    );
  }
  // Two groups, each keeping the collection order; an empty group is omitted
  // with its heading. Switching the Interface Language may move a Scenario
  // between the groups.
  const here = scenarios.filter((entry) => !entry.fallback);
  const other = scenarios.filter((entry) => entry.fallback);
  const card = (entry: (typeof scenarios)[number]) => (
    <ScenarioCard
      key={entry.base.id}
      scenarioId={entry.base.id}
      title={entry.scenario.title}
      description={entry.scenario.description}
      author={entry.base.author}
      shownLanguage={entry.shownLanguage}
      baseLanguage={entry.base.language}
      languages={entry.languages}
      catalogue={catalogue}
      newPlaythrough={catalogue.collection.newPlaythrough}
    />
  );
  return (
    <main>
      <h1>{catalogue.collection.title}</h1>
      <p>
        <a href="/playthroughs">{catalogue.nav.playthroughs}</a>
      </p>
      {here.length > 0 ? (
        <section aria-label={catalogue.scenarioLanguage.inInterfaceLanguage(language)}>
          <h2>{catalogue.scenarioLanguage.inInterfaceLanguage(language)}</h2>
          <ul className="cards">{here.map(card)}</ul>
        </section>
      ) : null}
      {other.length > 0 ? (
        <section aria-label={catalogue.scenarioLanguage.otherLanguages}>
          <h2>{catalogue.scenarioLanguage.otherLanguages}</h2>
          <p className="group-note">{catalogue.scenarioLanguage.otherLanguagesNote(language)}</p>
          <ul className="cards">{other.map(card)}</ul>
        </section>
      ) : null}
    </main>
  );
}
