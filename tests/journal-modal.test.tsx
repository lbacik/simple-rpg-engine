// The journal modal (docs/spec/ui.md, journal): "View journal" opens the
// Journal over the game screen instead of navigating away, with an "Open in
// new tab" link to the full page. Effects never run under react-dom/server,
// so these tests assert the server HTML both readers share, plus the pure
// newest-first batch slice the game screen feeds the modal.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  journalEntriesText,
  modalJournalBatch,
  newestJournalBatch,
} from '../src/app/lib/journal';
import {
  JournalModalLink,
  type JournalModalText,
} from '../src/app/play/[playthroughId]/journal/journal-modal';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

const enText: JournalModalText = {
  ...journalEntriesText(en),
  viewJournal: en.game.viewJournal,
  title: en.journal.title,
  total: en.journal.total(0),
  openInNewTab: en.journal.openInNewTab,
  close: en.journal.close,
};

function stored(seq: number) {
  return { seq, step: seq - 1, type: 'travel', lang: 'en', payload: { text: `entry ${seq}` } };
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

describe('modalJournalBatch', () => {
  it('renders the newest batch in one step for the modal', () => {
    const entries = Array.from({ length: 25 }, (_, index) => stored(index + 1));
    const batch = modalJournalBatch(entries, en, 'Modal');
    expect(batch.total).toBe(25);
    expect(batch.entries.map((entry) => entry.seq)).toEqual(
      Array.from({ length: 20 }, (_, index) => 25 - index),
    );
    expect(batch.nextCursor).toBe(6);
  });

  it('ends the batch when everything fits', () => {
    const batch = modalJournalBatch([stored(1)], en, 'Modal');
    expect(batch.total).toBe(1);
    expect(batch.entries.map((entry) => entry.seq)).toEqual([1]);
    expect(batch.nextCursor).toBeNull();
  });
});

describe('JournalModalLink', () => {
  it('renders a plain journal link with no dialog before it opens', () => {
    const html = renderToStaticMarkup(
      <JournalModalLink
        playthroughId="pt-1"
        initialEntries={[]}
        initialNextCursor={null}
        total={0}
        text={enText}
      />,
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
        text={enText}
      />,
    );
    expect(html).toContain('class="button secondary"');
  });

  it('renders the trigger in Polish', () => {
    const html = renderToStaticMarkup(
      <JournalModalLink
        playthroughId="pt-1"
        initialEntries={[]}
        initialNextCursor={null}
        total={0}
        text={{
          ...journalEntriesText(pl),
          viewJournal: pl.game.viewJournal,
          title: pl.journal.title,
          total: pl.journal.total(0),
          openInNewTab: pl.journal.openInNewTab,
          close: pl.journal.close,
        }}
      />,
    );
    expect(html).toContain('Zobacz dziennik');
    expect(html).not.toContain('View journal');
  });

  it('renders the side-panel launcher trigger with its id, accessible name and sublabel', () => {
    const html = renderToStaticMarkup(
      <JournalModalLink
        playthroughId="pt-1"
        initialEntries={[]}
        initialNextCursor={null}
        total={34}
        id="launcher-journal"
        className="launcher"
        ariaLabel="Journal, 34 entries"
        text={enText}
      >
        <span className="launcher-label">Journal</span>
        <span className="launcher-sub">34 entries</span>
      </JournalModalLink>,
    );
    // The launcher keeps its id for focus restoration, its accessible name and
    // its plain link to the standalone page for readers without JavaScript.
    expect(html).toContain('id="launcher-journal"');
    expect(html).toContain('aria-label="Journal, 34 entries"');
    expect(html).toContain('href="/play/pt-1/journal"');
    expect(html).toContain('class="launcher"');
    expect(html).toContain('34 entries');
    expect(html).not.toContain('role="dialog"');
  });

  it('opens over the game screen without navigating: the trigger stays a plain link', () => {
    const html = renderToStaticMarkup(
      <JournalModalLink
        playthroughId="pt-1"
        initialEntries={[]}
        initialNextCursor={null}
        total={0}
        id="launcher-journal"
        className="launcher"
        ariaLabel="Journal, 0 entries"
        text={enText}
      >
        <span className="launcher-label">Journal</span>
      </JournalModalLink>,
    );
    // No dialog on first paint: opening is client state that never reloads the
    // game screen, so the result panel, Combat target and scroll survive it.
    expect(html).toContain('<a ');
    expect(html).not.toContain('role="dialog"');
  });
});
