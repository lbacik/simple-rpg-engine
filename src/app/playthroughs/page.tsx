import type { Metadata } from 'next';
import { getScenario } from '@/content/registry';
import { getCatalogue } from '@/i18n/index';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { getInterfaceLanguage } from '@/app/lib/language';
import { resolvePlaythrough } from '@/app/lib/playthrough';
import { getSessionHash } from '@/app/lib/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return {
    title: catalogue.playthroughs.title,
    description: catalogue.playthroughs.description,
  };
}

export default async function PlaythroughsPage() {
  const catalogue = getCatalogue(await getInterfaceLanguage());
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
        resolvePlaythrough(db, getScenario, playthrough.id, sessionHash),
      ),
    )
  ).filter((entry) => entry !== null);
  const resumable = entries.filter(
    (entry) => entry.compatible && entry.playthrough.status === 'active',
  );
  const viewable = entries.filter(
    (entry) => !entry.compatible || entry.playthrough.status !== 'active',
  );
  const statusOf = (entry: (typeof entries)[number]): string => {
    if (!entry.compatible) return catalogue.playthroughs.statusIncompatible;
    return entry.playthrough.status === 'active'
      ? catalogue.playthroughs.statusActive
      : catalogue.playthroughs.statusEnded;
  };
  return (
    <main>
      <h1>{catalogue.playthroughs.title}</h1>
      {entries.length === 0 ? (
        <p>
          {catalogue.playthroughs.empty}{' '}
          <a href="/">{catalogue.playthroughs.emptyLink}</a>
          {catalogue.playthroughs.emptySuffix}
        </p>
      ) : (
        <>
          <h2>{catalogue.playthroughs.activeHeading}</h2>
          {resumable.length === 0 ? (
            <p>{catalogue.playthroughs.noActive}</p>
          ) : (
            <ul className="cards">
              {resumable.map((entry) => (
                <li key={entry.playthrough.id} className="card">
                  <h3>{entry.playthrough.state.character.name}</h3>
                  <p className="meta">
                    {entry.playthrough.scenarioId} · {statusOf(entry)}
                  </p>
                  <p>
                    <a className="button secondary" href={`/play/${entry.playthrough.id}`}>
                      {catalogue.playthroughs.resume}
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <h2>{catalogue.playthroughs.endedHeading}</h2>
          {viewable.length === 0 ? (
            <p>{catalogue.playthroughs.noEnded}</p>
          ) : (
            <ul className="cards">
              {viewable.map((entry) => (
                <li key={entry.playthrough.id} className="card">
                  <h3>{entry.playthrough.state.character.name}</h3>
                  <p className="meta">
                    {entry.playthrough.scenarioId} · {statusOf(entry)}
                  </p>
                  <p>
                    <a className="button secondary" href={`/play/${entry.playthrough.id}`}>
                      {catalogue.playthroughs.view}
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
