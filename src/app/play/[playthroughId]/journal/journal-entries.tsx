// The journal entry list (docs/spec/ui.md, journal): entries newest first,
// older batches appended below as the reader scrolls, until the first entry
// is reached. A client component that works in any scroll container (the
// journal page today, the journal modal later): an IntersectionObserver on a
// sentinel loads the next older batch through the sequence cursor, so entries
// appended during play never shift or duplicate what is on screen. Without
// JavaScript the server-rendered "Older entries" link walks the same batches.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly with react-dom/server.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  journalHref,
  type JournalBatchResponse,
  type RenderedJournalEntry,
} from '../../../lib/journal';

/** The nearest scrolling ancestor, or null for the viewport (the window). */
function scrollContainerOf(element: HTMLElement): Element | null {
  let node: HTMLElement | null = element.parentElement;
  while (node !== null) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

export function JournalEntries({
  playthroughId,
  initialEntries,
  initialNextCursor,
}: {
  playthroughId: string;
  initialEntries: RenderedJournalEntry[];
  initialNextCursor: number | null;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const loadOlder = useCallback(
    async (cursor: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/play/${playthroughId}/journal/batch?before=${cursor}`);
        if (!response.ok) throw new Error(`journal batch ${response.status}`);
        const batch = (await response.json()) as JournalBatchResponse;
        setEntries((current) => {
          const seen = new Set(current.map((entry) => entry.seq));
          return [...current, ...batch.entries.filter((entry) => !seen.has(entry.seq))];
        });
        setNextCursor(batch.nextCursor);
      } catch {
        setFailed(true);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [playthroughId],
  );

  useEffect(() => {
    if (typeof IntersectionObserver !== 'undefined') setEnhanced(true);
  }, []);

  useEffect(() => {
    if (!enhanced || nextCursor === null) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed.some((entry) => entry.isIntersecting)) {
          void loadOlder(nextCursor);
        }
      },
      { root: scrollContainerOf(sentinel), rootMargin: '240px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enhanced, nextCursor, loadOlder]);

  if (entries.length === 0) {
    return <p>Nothing has happened yet.</p>;
  }
  const done = nextCursor === null;
  return (
    <>
      <ol>
        {entries.map((entry) => (
          <li key={entry.seq}>
            <p className="meta">
              {entry.label} · step {entry.step}
            </p>
            <div dangerouslySetInnerHTML={{ __html: entry.html }} />
          </li>
        ))}
      </ol>
      <div ref={sentinelRef} aria-hidden="true" />
      <p className="meta" aria-live="polite">
        {loading ? 'Loading older entries…' : null}
        {!loading && failed && !done ? 'Could not load older entries.' : null}
        {!loading && !failed && done ? 'Start of the Journal reached.' : null}
      </p>
      {!enhanced && !done ? (
        <p>
          <a href={journalHref(playthroughId, nextCursor)}>Older entries</a>
        </p>
      ) : null}
      {failed && !done ? (
        <p>
          <button
            className="button secondary"
            type="button"
            onClick={() => void loadOlder(nextCursor as number)}
          >
            Retry loading older entries
          </button>
        </p>
      ) : null}
    </>
  );
}
