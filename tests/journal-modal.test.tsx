// The journal modal (docs/spec/ui.md, journal): "View journal" opens the
// Journal over the game screen instead of navigating away, with an "Open in
// new tab" link to the full page. Effects never run under react-dom/server,
// so these tests assert the server HTML both readers share, plus the pure
// newest-first batch slice the game screen feeds the modal.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { newestJournalBatch } from '../src/app/lib/journal';
import { JournalModalLink } from '../src/app/play/[playthroughId]/journal/journal-modal';

function stored(seq: number) {
  return { seq, step: seq - 1, type: 'travel', payload: { text: `entry ${seq}` } };
}

describe('newestJournalBatch', () => {
  it('takes the newest entries first with a cursor when older ones remain', () => {
    const entries = Array.from({ length: 25 }, (_, index) => stored(index + 1));
    const batch = newestJournalBatch(entries, 20);
    expect(batch.total).toBe(25);
    expect(batch.shown.map((entry) => entry.seq)).toEqual(
      Array.from({ length: 20 }, (_, index) => 25 - index),
    );
    expect(batch.nextCursor).toBe(6);
  });

  it('ends the batch when everything fits', () => {
    const entries = Array.from({ length: 3 }, (_, index) => stored(index + 1));
    const batch = newestJournalBatch(entries, 20);
    expect(batch.total).toBe(3);
    expect(batch.shown.map((entry) => entry.seq)).toEqual([3, 2, 1]);
    expect(batch.nextCursor).toBeNull();
  });

  it('handles an empty journal', () => {
    const batch = newestJournalBatch([], 20);
    expect(batch.total).toBe(0);
    expect(batch.shown).toEqual([]);
    expect(batch.nextCursor).toBeNull();
  });
});

describe('JournalModalLink', () => {
  it('renders a plain journal link with no dialog before it opens', () => {
    const html = renderToStaticMarkup(
      <JournalModalLink playthroughId="pt-1" initialEntries={[]} initialNextCursor={null} total={0} />,
    );
    // Without JavaScript the control degrades to a plain navigation to the
    // full Journal page.
    expect(html).toContain('href="/play/pt-1/journal"');
    expect(html).toContain('View journal');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('Open in new tab');
  });

  it('keeps the trigger styling of the screen it sits on', () => {
    const html = renderToStaticMarkup(
      <JournalModalLink
        playthroughId="pt-1"
        initialEntries={[]}
        initialNextCursor={null}
        total={0}
        className="button secondary"
      />,
    );
    expect(html).toContain('class="button secondary"');
  });
});
