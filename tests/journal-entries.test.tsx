// The journal entry list (docs/spec/ui.md, journal): server-rendered output
// lists entries newest first with label and step, links older batches for
// no-JavaScript readers, and names the start of the Journal on the last
// batch. Effects never run under react-dom/server, so these tests assert the
// server HTML both readers share.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JournalEntries } from '../src/app/play/[playthroughId]/journal/journal-entries';
import type { RenderedJournalEntry } from '../src/app/lib/journal';

function entry(seq: number): RenderedJournalEntry {
  return {
    seq,
    step: seq - 1,
    label: seq === 1 ? 'Intro' : 'Travel',
    html: `<p>entry ${seq}</p>`,
  };
}

describe('JournalEntries', () => {
  it('renders entries newest first with label and step', () => {
    const html = renderToStaticMarkup(
      <JournalEntries
        playthroughId="pt-1"
        initialEntries={[entry(25), entry(24)]}
        initialNextCursor={24}
      />,
    );
    expect(html.indexOf('entry 25')).toBeLessThan(html.indexOf('entry 24'));
    expect(html).toContain('Travel · step 24');
    expect(html).toContain('<p>entry 25</p>');
  });

  it('links the next older batch for readers without JavaScript', () => {
    const html = renderToStaticMarkup(
      <JournalEntries
        playthroughId="pt-1"
        initialEntries={[entry(25)]}
        initialNextCursor={24}
      />,
    );
    expect(html).toContain('href="/play/pt-1/journal?before=24"');
    expect(html).toContain('Older entries');
    expect(html).not.toContain('Start of the Journal reached.');
  });

  it('names the start of the Journal on the last batch', () => {
    const html = renderToStaticMarkup(
      <JournalEntries playthroughId="pt-1" initialEntries={[entry(1)]} initialNextCursor={null} />,
    );
    expect(html).toContain('Start of the Journal reached.');
    expect(html).not.toContain('Older entries');
  });

  it('says nothing has happened yet for an empty journal', () => {
    const html = renderToStaticMarkup(
      <JournalEntries playthroughId="pt-1" initialEntries={[]} initialNextCursor={null} />,
    );
    expect(html).toContain('Nothing has happened yet.');
  });
});
