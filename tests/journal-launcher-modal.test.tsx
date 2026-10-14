// The main Journal launcher in the illustrated-chronicle game screen
// (docs/spec/ui.md, journal): the side-panel launcher opens the Journal in a
// modal over the current game screen instead of navigating away, reusing the
// newest batch newest first with the sequence cursor for older batches. The
// side panel itself uses `@/` imports with no vitest alias, so this suite
// asserts its wiring as source text (like the chronicle modal surface suite),
// while the trigger rendering is covered through the modal link.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  JournalModalLink,
  type JournalModalText,
} from '../src/app/play/[playthroughId]/journal/journal-modal';
import { journalEntriesText } from '../src/app/lib/journal';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

const sidePanel = readFileSync(
  join(__dirname, '..', 'src', 'app', 'play', '[playthroughId]', 'side-panel.tsx'),
  'utf8',
);
const playPage = readFileSync(
  join(__dirname, '..', 'src', 'app', 'play', '[playthroughId]', 'page.tsx'),
  'utf8',
);
const css = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');

function cssBlock(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open, close);
}

const enLauncherText: JournalModalText = {
  ...journalEntriesText(en),
  viewJournal: en.game.viewJournal,
  title: en.journal.title,
  total: en.journal.total(25),
  openInNewTab: en.journal.openInNewTab,
  close: en.journal.close,
};

describe('side-panel Journal launcher wiring', () => {
  it('opens the modal from the launcher trigger instead of navigating away', () => {
    // The launcher is the modal trigger: it keeps its id for focus
    // restoration, its accessible name and the plain journal href fallback.
    expect(sidePanel).toContain('<JournalModalLink');
    expect(sidePanel).toContain('id="launcher-journal"');
    expect(sidePanel).toContain('className="launcher"');
    expect(sidePanel).toContain('ariaLabel={journalName}');
    // No plain navigation link remains for the Journal launcher.
    expect(sidePanel).not.toMatch(/<Link[^>]*id="launcher-journal"/);
  });

  it('feeds the modal the newest batch newest first with its cursor and total', () => {
    expect(sidePanel).toContain('journalEntries: RenderedJournalEntry[]');
    expect(sidePanel).toContain('journalNextCursor: number | null');
    expect(sidePanel).toContain('total={journalTotal}');
    expect(sidePanel).toContain('initialEntries={journalEntries}');
    expect(sidePanel).toContain('initialNextCursor={journalNextCursor}');
    expect(sidePanel).toContain('catalogue.journal.total(journalTotal)');
    expect(sidePanel).toContain('catalogue.journal.openInNewTab');
    expect(sidePanel).toContain('journalEntriesText(catalogue)');
  });

  it('passes the modal batch on every game screen with a side panel', () => {
    // Compatible play (result panel and position) and the read-only
    // incompatible view with its Scenario still in the collection all render
    // the same side panel, so each passes the newest batch to it.
    const matches = playPage.match(/journalEntries=\{[^}]+entries\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    expect(playPage).toContain('readOnlyModalJournal = modalJournalBatch(');
    expect(playPage).toContain('journalEntries={modalJournal.entries}');
    expect(playPage).toContain('journalEntries={readOnlyModalJournal.entries}');
  });

  it('keeps the Ending modal trigger on its secondary button', () => {
    expect(playPage).toContain('className="button secondary"');
    expect(playPage).toContain('catalogue.journal.openInNewTab');
  });

  it('opens the Scenario-gone Journal through the same modal link', () => {
    // With no Scenario there is no game screen or side panel, so the gone view
    // feeds the modal directly from its first batch; the inline entries stay
    // for readers without JavaScript.
    expect(playPage).toContain('initialEntries={rendered}');
    expect(playPage).toContain('initialNextCursor={batch.nextCursor ?? null}');
    expect(playPage).toContain('total={journalTotal}');
    expect(playPage).toContain('aria-label={catalogue.journal.title}');
  });
});

describe('launcher trigger rendering', () => {
  it('renders the launcher with its id, accessible name and plain journal link', () => {
    const html = renderToStaticMarkup(
      <JournalModalLink
        playthroughId="pt-1"
        initialEntries={[]}
        initialNextCursor={null}
        total={25}
        id="launcher-journal"
        className="launcher"
        ariaLabel="Journal, 25 entries"
        text={enLauncherText}
      >
        <span className="launcher-label">Journal</span>
        <span className="launcher-sub">25 entries</span>
      </JournalModalLink>,
    );
    expect(html).toContain('id="launcher-journal"');
    expect(html).toContain('aria-label="Journal, 25 entries"');
    expect(html).toContain('href="/play/pt-1/journal"');
    expect(html).toContain('class="launcher"');
    expect(html).toContain('25 entries');
    // Closed on first paint: no dialog, so the game screen underneath keeps
    // its result panel, Combat target and scroll position.
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('Open in new tab');
  });

  it('renders the Ending and read-only trigger with its label and journal link', () => {
    // The Ending screen and the Scenario-gone view render the same modal link
    // with its default "View journal" content on a secondary button.
    const html = renderToStaticMarkup(
      <JournalModalLink
        playthroughId="pt-1"
        initialEntries={[]}
        initialNextCursor={null}
        total={7}
        className="button secondary"
        text={{
          ...journalEntriesText(en),
          viewJournal: en.game.viewJournal,
          title: en.journal.title,
          total: en.journal.total(7),
          openInNewTab: en.journal.openInNewTab,
          close: en.journal.close,
        }}
      />,
    );
    expect(html).toContain('View journal');
    expect(html).toContain('href="/play/pt-1/journal"');
    expect(html).toContain('class="button secondary"');
    // Closed on first paint: no dialog, so the Ending underneath stays as it was.
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('Open in new tab');
  });

  it('renders the launcher accessibly in Polish', () => {
    const html = renderToStaticMarkup(
      <JournalModalLink
        playthroughId="pt-1"
        initialEntries={[]}
        initialNextCursor={4}
        total={5}
        id="launcher-journal"
        className="launcher"
        ariaLabel={pl.journal.name(pl.journal.count(5))}
        text={{
          ...journalEntriesText(pl),
          viewJournal: pl.game.viewJournal,
          title: pl.journal.title,
          total: pl.journal.total(5),
          openInNewTab: pl.journal.openInNewTab,
          close: pl.journal.close,
        }}
      >
        <span className="launcher-label">{pl.journal.title}</span>
        <span className="launcher-sub">{pl.journal.count(5)}</span>
      </JournalModalLink>,
    );
    expect(html).toContain('aria-label="Dziennik, 5 wpisów"');
    expect(html).toContain('5 wpisów');
  });
});

describe('chronicle Journal modal surface', () => {
  it('uses the white chronicle card, chronicle tokens and amber focus ring', () => {
    const modal = cssBlock('.journal-modal {');
    expect(modal).toContain('background: #fff');
    expect(modal).toContain('var(--chronicle-line');
    expect(modal).toContain('border-radius: 0.875rem');
    expect(modal).toContain('Arial');
    expect(modal).toContain('#263c35');
    const backdrop = cssBlock('.journal-modal-backdrop {');
    expect(backdrop).toContain('37 48 41');
    expect(css).toContain('.journal-modal button:focus-visible,');
    expect(css).toContain('#ba753d');
  });

  it('keeps the modal header, scroll body and full-screen phone behaviour', () => {
    const head = cssBlock('.journal-modal-header {');
    expect(head).toContain('var(--chronicle-line');
    const body = cssBlock('.journal-modal-body {');
    expect(body).toContain('overflow-y: auto');
    expect(css).toContain('height: 100dvh;');
  });

  it('keeps the standalone fallback readable in the light theme', () => {
    const page = cssBlock('.journal-page {');
    expect(page).toContain('#263c35');
    expect(css).toContain('.journal-page .reading-card');
  });
});
