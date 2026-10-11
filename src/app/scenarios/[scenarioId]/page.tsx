import { notFound } from 'next/navigation';
import { getScenario } from '@/content/registry';
import StartForm from './start-form';

export const dynamic = 'force-dynamic';

function templateItems(scenario: NonNullable<ReturnType<typeof getScenario>>, templateId: string): string[] {
  const template = scenario.templatesById[templateId];
  if (!template) return [];
  return template.items.map((entry) => {
    const item = entry.item;
    const base = `${item.name} × ${entry.quantity}`;
    if (item.kind === 'equipment') return `${base} (${item.slot})`;
    return base;
  });
}

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const scenario = getScenario(scenarioId);
  if (!scenario) notFound();
  return (
    <main>
      <h1>{scenario.title}</h1>
      <p lang={scenario.language}>{scenario.description}</p>
      <p className="meta">{[scenario.author, scenario.language].filter(Boolean).join(' · ')}</p>
      <h2>Character Templates</h2>
      {scenario.templates.map((template) => (
        <section key={template.id} className="card" aria-label={template.name}>
          <h3>{template.name}</h3>
          {template.description ? <p lang={scenario.language}>{template.description}</p> : null}
          <p>
            Might {template.attributes.might} · Agility {template.attributes.agility} · Wits{' '}
            {template.attributes.wits} · Presence {template.attributes.presence} · Health 12
          </p>
          {template.items.length > 0 ? (
            <ul>
              {templateItems(scenario, template.id).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <h2>Begin</h2>
      <StartForm
        scenarioId={scenario.id}
        templates={scenario.templates.map((t) => ({ id: t.id, name: t.name }))}
      />
    </main>
  );
}
