import { notFound } from 'next/navigation';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { getSessionHash } from '@/app/lib/session';
import {
  JOURNAL_PAGE_SIZE,
  journalHref,
  parseJournalPage,
  renderJournalEntry,
} from '@/app/lib/journal';

export const dynamic = 'force-dynamic';

export default async function JournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ playthroughId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { playthroughId } = await params;
  const { page: pageParam } = await searchParams;
  const sessionHash = await getSessionHash();
  const store = new PlaythroughStore(getDatabase());
  const playthrough = await store.findById(playthroughId);
  if (!playthrough || !sessionHash || playthrough.sessionId !== sessionHash) {
    notFound();
  }

  const total = await store.countJournal(playthrough.id);
  const totalPages = Math.max(1, Math.ceil(total / JOURNAL_PAGE_SIZE));
  const requested = parseJournalPage(pageParam);
  const page = Math.min(requested, totalPages);
  const entries = await store.listJournalPage(playthrough.id, {
    limit: JOURNAL_PAGE_SIZE,
    offset: (page - 1) * JOURNAL_PAGE_SIZE,
  });
  const characterName = playthrough.state.character.name;

  return (
    <main>
      <p>
        <a href={`/play/${playthrough.id}`}>Back to the game</a>
      </p>
      <h1>Journal</h1>
      <p className="meta">
        {total === 0
          ? 'Nothing has happened yet.'
          : total === 1
            ? '1 entry.'
            : `${total} entries.`}{' '}
        Page {page} of {totalPages}.
      </p>
      {entries.length === 0 ? null : (
        <ol>
          {entries.map((entry) => {
            const rendered = renderJournalEntry(entry.type, entry.payload, characterName);
            return (
              <li key={entry.seq}>
                <p className="meta">
                  {rendered.label} · step {entry.step}
                </p>
                <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
              </li>
            );
          })}
        </ol>
      )}
      {totalPages > 1 ? (
        <nav aria-label="Journal pages">
          {page > 1 ? <a href={journalHref(playthrough.id, page - 1)}>Previous page</a> : null}{' '}
          {page < totalPages ? <a href={journalHref(playthrough.id, page + 1)}>Next page</a> : null}
          <p className="meta">
            Page {page} of {totalPages}
          </p>
        </nav>
      ) : null}
    </main>
  );
}
