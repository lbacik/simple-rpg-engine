import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { MAX_HEALTH } from '@/engine/state';
import { getCatalogue, type Catalogue } from '@/i18n/index';
import { getInterfaceLanguage } from '@/app/lib/language';
import StartForm from './start-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}): Promise<Metadata> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  const { scenarioId } = await params;
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    return { title: catalogue.notFound.title, description: catalogue.notFound.body };
  }
  return {
    title: catalogue.scenario.metaTitle(scenario.title),
    description: catalogue.scenario.description,
  };
}

function templateItems(
  scenario: NonNullable<ReturnType<typeof getScenario>>,
  catalogue: Catalogue,
  templateId: string,
): string[] {
  const template = scenario.templatesById[templateId];
  if (!template) return [];
  return template.items.map((entry) => {
    const item = entry.item;
    if (item.kind === 'equipment') {
      return catalogue.scenario.templateItem(
        item.name,
        entry.quantity,
        catalogue.scenario.slots[item.slot],
      );
    }
    return catalogue.scenario.templateItem(item.name, entry.quantity, null);
  });
}

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const catalogue = getCatalogue(await getInterfaceLanguage());
  const scenario = getScenario(scenarioId);
  if (!scenario) notFound();
  return (
    <main>
      <h1>{scenario.title}</h1>
      <p lang={scenario.language}>{scenario.description}</p>
      <p className="meta">{[scenario.author, scenario.language].filter(Boolean).join(' · ')}</p>
      <h2>{catalogue.scenario.templatesHeading}</h2>
      {scenario.templates.map((template) => (
        <section key={template.id} className="card" aria-label={template.name}>
          <h3>{template.name}</h3>
          {template.description ? <p lang={scenario.language}>{template.description}</p> : null}
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
            <ul>
              {templateItems(scenario, catalogue, template.id).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
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
