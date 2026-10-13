// The journal entry list (docs/spec/ui.md, journal): server-rendered output
// lists entries newest first with label and step, links older batches for
// no-JavaScript readers, and names the start of the Journal on the last
// batch. Effects never run under react-dom/server, so these tests assert the
// server HTML both readers share.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  JournalEntries,
  journalPositionText,
  journalProgress,
} from '../src/app/play/[playthroughId]/journal/journal-entries';
import type { RenderedJournalEntry } from '../src/app/lib/journal';

function entry(seq: number): RenderedJournalEntry {
  return {
    seq,
    step: seq - 1,
    label: seq === 1 ? 'Intro' : 'Travel',
    html: `<p>entry ${seq}</p>`,
    flag: null,
    flagLabel: null,
  };
}

function flaggedEntry(seq: number): RenderedJournalEntry {
  return {
    seq,
    step: seq - 1,
    label: 'Wstęp',
    html: '<div lang="en"><p>entry</p></div>',
    flag: 'en',
    flagLabel: 'Angielski',
  };
}

describe('JournalEntries', () => {
  it('renders entries newest first with label and step', () => {
    const html = renderToStaticMarkup(
      <JournalEntries
        playthroughId="pt-1"
        initialEntries={[entry(25), entry(24)]}
        initialNextCursor={24}
        total={25}
      />,
    );
    expect(html.indexOf('entry 25')).toBeLessThan(html.indexOf('entry 24'));
    expect(html).toContain('Travel · step 24');
    expect(html).toContain('<p>entry 25</p>');
  });

  it('marks entries shown in another language with a flag after the type label', () => {
    const html = renderToStaticMarkup(
      <JournalEntries
        playthroughId="pt-1"
        initialEntries={[flaggedEntry(2), entry(1)]}
        initialNextCursor={null}
        total={2}
      />,
    );
    // The flag follows the type label, ahead of the step.
    expect(html.indexOf('Wstęp')).toBeLessThan(html.indexOf('aria-label="Angielski"'));
    expect(html.indexOf('aria-label="Angielski"')).toBeLessThan(html.indexOf('step 1'));
    expect(html).toContain('role="img"');
  });

  it('carries no flag on entries shown in the Interface Language', () => {
    const html = renderToStaticMarkup(
      <JournalEntries
        playthroughId="pt-1"
        initialEntries={[entry(25)]}
        initialNextCursor={null}
        total={25}
      />,
    );
    expect(html).toContain('Travel · step 24');
    expect(html).not.toContain('role="img"');
  });

  it('links the next older batch for readers without JavaScript', () => {
    const html = renderToStaticMarkup(
      <JournalEntries
        playthroughId="pt-1"
        initialEntries={[entry(25)]}
        initialNextCursor={24}
        total={25}
      />,
    );
    expect(html).toContain('href="/play/pt-1/journal?before=24"');
    expect(html).toContain('Older entries');
    expect(html).not.toContain('Start of the Journal reached.');
  });

  it('names the start of the Journal on the last batch', () => {
    const html = renderToStaticMarkup(
      <JournalEntries
        playthroughId="pt-1"
        initialEntries={[entry(1)]}
        initialNextCursor={null}
        total={25}
      />,
    );
    expect(html).toContain('Start of the Journal reached.');
    expect(html).not.toContain('Older entries');
  });

  it('says nothing has happened yet for an empty journal', () => {
    const html = renderToStaticMarkup(
      <JournalEntries playthroughId="pt-1" initialEntries={[]} initialNextCursor={null} total={0} />,
    );
    expect(html).toContain('Nothing has happened yet.');
  });

  it('shows the position indicator against the total, not the loaded count', () => {
    const html = renderToStaticMarkup(
      <JournalEntries
        playthroughId="pt-1"
        initialEntries={[entry(25), entry(24)]}
        initialNextCursor={24}
        total={134}
      />,
    );
    // Newest entry on screen: seq 25, step 24.
    expect(html).toContain('Step 24 · entry 25 of 134');
    expect(html).toContain('journal-position');
    expect(html).toContain('journal-progress');
    // Entries carry the cursor the scroll tracker reads.
    expect(html).toContain('data-seq="25"');
  });

  it('hides the indicator for an empty journal', () => {
    const html = renderToStaticMarkup(
      <JournalEntries
        playthroughId="pt-1"
        initialEntries={[]}
        initialNextCursor={null}
        total={0}
      />,
    );
    expect(html).toContain('Nothing has happened yet.');
    expect(html).not.toContain('journal-position');
  });

  it('keeps scroll updates out of the live region and decorates the bar', () => {
    const html = renderToStaticMarkup(
      <JournalEntries
        playthroughId="pt-1"
        initialEntries={[entry(25)]}
        initialNextCursor={24}
        total={134}
      />,
    );
    expect(html).toContain('aria-live="off"');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe('journalPositionText and journalProgress', () => {
  it('names the step and sequence position out of the total', () => {
    expect(journalPositionText({ seq: 37, step: 12 }, 134)).toBe(
      'Step 12 · entry 37 of 134',
    );
  });

  it('fills the bar as the reader scrolls towards the first entry', () => {
    expect(journalProgress({ seq: 134, step: 60 }, 134)).toBeCloseTo(1 / 134);
    expect(journalProgress({ seq: 1, step: 0 }, 134)).toBe(1);
    expect(journalProgress({ seq: 37, step: 12 }, 134)).toBeCloseTo(98 / 134);
  });

  it('clamps invalid totals and positions', () => {
    expect(journalProgress({ seq: 1, step: 0 }, 0)).toBe(0);
    expect(journalProgress({ seq: 200, step: 90 }, 134)).toBeLessThanOrEqual(1);
  });
});
