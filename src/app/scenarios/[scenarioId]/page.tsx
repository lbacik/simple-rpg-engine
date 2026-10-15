import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getScenario, localizeScenario } from '@/content/index';
import type { Scenario } from '@/content/index';
import { MAX_HEALTH } from '@/engine/state';
import { getCatalogue, type Catalogue, type InterfaceLanguage } from '@/i18n/index';
import { ARENA_SCENARIO_ID } from '@/app/lib/arena';
import { getInterfaceLanguage } from '@/app/lib/language';
import { ScenarioLanguageFlags } from '@/app/flag';
import StartForm from './start-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}): Promise<Metadata> {
  const language: InterfaceLanguage = await getInterfaceLanguage();
  const catalogue = getCatalogue(language);
  const { scenarioId } = await params;
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    return { title: catalogue.notFound.title, description: catalogue.notFound.body };
  }
  const localized = localizeScenario(scenario, language);
  return {
    title: catalogue.scenario.metaTitle(localized.scenario.title),
    description: catalogue.scenario.description,
  };
}

function templateItems(
  scenario: Scenario,
  shownLanguage: string,
  catalogue: Catalogue,
  templateId: string,
): React.ReactNode[] {
  const template = scenario.templatesById[templateId];
  if (!template) return [];
  return template.items.map((entry) => {
    const item = entry.item;
    const slotName = item.kind === 'equipment' ? catalogue.scenario.slots[item.slot] : null;
    // The item name is Scenario text in the shown language; the quantity and
    // the slot name are Interface Text around it.
    return (
      <li key={`${item.id}-${entry.quantity}`}>
        <span lang={shownLanguage}>{item.name}</span>
        {catalogue.scenario.templateItemSuffix(entry.quantity, slotName)}
      </li>
    );
  });
}

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  // The Arena is entered through the top navigation (`/arena`): its fights
  // start from a picked Bestiary enemy, not from the Character creation form.
  if (scenarioId === ARENA_SCENARIO_ID) redirect('/arena');
  const language: InterfaceLanguage = await getInterfaceLanguage();
  const catalogue = getCatalogue(language);
  const base = getScenario(scenarioId);
  if (!base) notFound();
  const localized = localizeScenario(base, language);
  const scenario = localized.scenario;
  return (
    <main>
      <h1 lang={localized.shownLanguage}>{scenario.title}</h1>
      <p className="meta">
        {base.author ? <>{base.author} · </> : null}
        <ScenarioLanguageFlags
          languages={localized.languages}
          shownLanguage={localized.shownLanguage}
          baseLanguage={base.language}
          catalogue={catalogue}
        />
        {localized.fallback ? (
          <> · {catalogue.scenarioLanguage.notTranslated(localized.shownLanguage, language)}</>
        ) : null}
      </p>
      <p lang={localized.shownLanguage}>{scenario.description}</p>
      <h2>{catalogue.scenario.templatesHeading}</h2>
      {scenario.templates.map((template) => (
        <section key={template.id} className="card" aria-label={template.name}>
          <h3 lang={localized.shownLanguage}>{template.name}</h3>
          {template.description ? (
            <p lang={localized.shownLanguage}>{template.description}</p>
          ) : null}
          <p>
            {catalogue.scenario.attributesLine(
              template.attributes.might,
              template.attributes.agility,
              template.attributes.wits,
              template.attributes.presence,
              MAX_HEALTH,
            )}
          </p>
          {template.items.length > 0 ? (
            <ul>{templateItems(scenario, localized.shownLanguage, catalogue, template.id)}</ul>
          ) : null}
        </section>
      ))}
      <h2>{catalogue.scenario.beginHeading}</h2>
      <StartForm
        scenarioId={scenario.id}
        templates={scenario.templates.map((t) => ({ id: t.id, name: t.name }))}
        strings={{
          legend: catalogue.startForm.templateLegend,
          nameLabel: catalogue.startForm.nameLabel,
          submit: catalogue.startForm.submit,
          starting: catalogue.startForm.starting,
        }}
      />
    </main>
  );
}
