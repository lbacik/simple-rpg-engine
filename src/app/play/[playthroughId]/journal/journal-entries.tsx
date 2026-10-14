// The journal entry list (docs/spec/ui.md, journal): entries newest first,
// older batches appended below as the reader scrolls, until the first entry
// is reached, with a sticky position indicator naming the topmost entry and
// its progress against the total. A client component that works in any scroll
// container (the journal page today, the journal modal later): an
// IntersectionObserver on a sentinel loads the next older batch through the
// sequence cursor, so entries appended during play never shift or duplicate
// what is on screen. Without JavaScript the server-rendered "Older entries"
// link walks the same batches.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly with react-dom/server.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  journalHref,
  type JournalBatchResponse,
  type JournalEntriesText,
  type RenderedJournalEntry,
} from '../../../lib/journal';
import { LanguageFlag } from '../../../flag';

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

/** Entry at the top of the viewport the position indicator names. */
export type JournalPosition = { seq: number; step: number };

/**
 * Position of `topmost` against `total` as a scrolled fraction: 0 at the
 * newest entry, 1 at the first entry. Counts from the newest entry, so the
 * bar fills as the reader scrolls towards older entries, against the total
 * entry count rather than the number loaded so far.
 */
export function journalProgress(topmost: JournalPosition, total: number): number {
  if (total <= 0) return 0;
  const position = total - topmost.seq + 1;
  return Math.min(1, Math.max(0, position / total));
}

/**
 * Fill the `{step}`, `{seq}` and `{total}` placeholders of a catalogue Journal
 * template ("Step {step} · entry {seq} of {total}"). Unknown placeholders stay
 * as they are, so a catalogue typo never eats a number.
 */
export function formatJournalText(
  template: string,
  values: { step: number; seq: number; total: number },
): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    if (key === 'step') return String(values.step);
    if (key === 'seq') return String(values.seq);
    if (key === 'total') return String(values.total);
    return placeholder;
  });
}

/** Read the entry position back off a list item. */
function positionOf(item: Element): JournalPosition {
  return {
    seq: Number(item.getAttribute('data-seq')),
    step: Number(item.getAttribute('data-step')),
  };
}

export function JournalEntries({
  playthroughId,
  initialEntries,
  initialNextCursor,
  total,
  text,
}: {
  playthroughId: string;
  initialEntries: RenderedJournalEntry[];
  initialNextCursor: number | null;
  /** Total entry count at open; the progress bar reads against this, not the loaded count. */
  total: number;
  /** Interface Text, rendered by the server through the catalogue. */
  text: JournalEntriesText;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const positionRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const first = initialEntries[0];
  const [topmost, setTopmost] = useState<JournalPosition | null>(
    first ? { seq: first.seq, step: first.step } : null,
  );

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

  // The position indicator names the entry at the top of the viewport. It
  // listens on whatever scroll container hosts the list (the window on the
  // journal page, the modal element later), throttled to one update per
  // frame, and re-reads the DOM so appended older batches stay correct.
  useEffect(() => {
    const position = positionRef.current;
    const list = listRef.current;
    if (!position || !list) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const threshold = position.getBoundingClientRect().bottom;
      const items = list.querySelectorAll('li[data-seq]');
      let current: JournalPosition | null = null;
      for (const item of items) {
        if (item.getBoundingClientRect().bottom > threshold + 1) {
          current = positionOf(item);
          break;
        }
      }
      // Past the last entry (or nothing measured yet): name the oldest entry.
      if (!current) {
        const last = items[items.length - 1];
        if (last) {
          current = positionOf(last);
        }
      }
      if (current && Number.isFinite(current.seq)) {
        setTopmost((previous) =>
          previous && previous.seq === current.seq ? previous : current,
        );
      }
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    const scroller = scrollContainerOf(position);
    const target: Element | Window = scroller ?? window;
    update();
    target.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      target.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [entries.length, enhanced]);

  if (entries.length === 0) {
    return <p>{text.empty}</p>;
  }
  const done = nextCursor === null;
  const namedEntry = topmost ?? { seq: entries[0]!.seq, step: entries[0]!.step };
  const progress = journalProgress(namedEntry, total);
  return (
    <>
      <div ref={positionRef} className="journal-position" aria-live="off">
        <p className="meta journal-position-text">
          {formatJournalText(text.position, {
            step: namedEntry.step,
            seq: namedEntry.seq,
            total,
          })}
        </p>
        <div className="journal-progress" aria-hidden="true">
          <div
            className="journal-progress-bar"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
      <ol ref={listRef}>
        {entries.map((entry) => (
          <li key={entry.seq} data-seq={entry.seq} data-step={entry.step}>
            <p className="meta">
              {entry.label}
              {entry.flag !== null ? (
                <>
                  {' '}
                  <LanguageFlag language={entry.flag} label={entry.flagLabel ?? undefined} />
                </>
              ) : null}
              {formatJournalText(text.stepNote, {
                step: entry.step,
                seq: entry.seq,
                total,
              })}
            </p>
            <div dangerouslySetInnerHTML={{ __html: entry.html }} />
          </li>
        ))}
      </ol>
      <div ref={sentinelRef} aria-hidden="true" />
      <p className="meta" aria-live="polite">
        {loading ? text.loadingOlder : null}
        {!loading && failed && !done ? text.loadFailed : null}
        {!loading && !failed && done ? text.startReached : null}
      </p>
      {!enhanced && !done ? (
        <p>
          <a href={journalHref(playthroughId, nextCursor)}>{text.olderEntries}</a>
        </p>
      ) : null}
      {failed && !done ? (
        <p>
          <button
            className="button secondary"
            type="button"
            onClick={() => void loadOlder(nextCursor as number)}
          >
            {text.retryOlder}
          </button>
        </p>
      ) : null}
    </>
  );
}
