import { notFound } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { resolvePlaythrough, safeCharacterName } from '@/app/lib/playthrough';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { getSessionHash } from '@/app/lib/session';
import {
  JOURNAL_BATCH_SIZE,
  parseJournalCursor,
  renderJournalEntries,
} from '@/app/lib/journal';
import { getCatalogue } from '@/i18n/index';
import { getInterfaceLanguage } from '@/app/lib/language';
import { JournalEntries } from './journal-entries';

export const dynamic = 'force-dynamic';

export default async function JournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ playthroughId: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const { playthroughId } = await params;
  const { before: beforeParam } = await searchParams;
  const sessionHash = await getSessionHash();
  const store = new PlaythroughStore(getDatabase());
  // The Journal always renders completely, during play, after the end and
  // when the Playthrough is incompatible: it stores the text as presented.
  // The read updates the content pin when a reference check passes.
  const resolved = await resolvePlaythrough(
    getDatabase(),
    getScenario,
    playthroughId,
    sessionHash,
  );
  if (!resolved) {
    notFound();
  }
  const playthrough = resolved.playthrough;

  // Newest first, addressed by the sequence cursor: entries appended after
  // the Journal was opened never shift or duplicate what is on screen.
  const before = parseJournalCursor(beforeParam);
  const total = await store.countJournal(playthrough.id);
  const batch = await store.listJournalBatch(playthrough.id, {
    limit: JOURNAL_BATCH_SIZE,
    beforeSeq: before,
  });
  // The Journal renders even for missing Scenarios and invalid documents:
  // it stores the text as presented and needs only a display name, never a
  // validated position. Invalid state is never rewritten here.
  const characterName = safeCharacterName(playthrough.state, playthrough.scenarioId);
  const catalogue = getCatalogue(await getInterfaceLanguage());
  const rendered = renderJournalEntries(batch.entries, catalogue, characterName);

  return (
    <main className="journal-page">
      <article className="reading-card">
        <div className="reading-body">
          <p>
            <a className="button secondary" href={`/play/${playthrough.id}`}>
              Back to the game
            </a>
          </p>
          <h1>Journal</h1>
          {total === 0 ? (
            <p className="meta">Nothing has happened yet.</p>
          ) : (
            <>
              <p className="meta">{total === 1 ? '1 entry.' : `${total} entries.`}</p>
              <JournalEntries
                playthroughId={playthrough.id}
                initialEntries={rendered}
                initialNextCursor={batch.nextCursor ?? null}
                total={total}
              />
            </>
          )}
        </div>
      </article>
    </main>
  );
}
