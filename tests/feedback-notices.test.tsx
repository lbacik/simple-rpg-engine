// Received-item and discovery feedback notices
// (implement ticket: icons + distinct styling in the Outcome modal and Journal).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { renderJournalEntry } from '../src/app/lib/journal';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

import { OutcomeModal } from '../src/app/play/[playthroughId]/outcome-modal';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

describe('received-item feedback', () => {
  it('marks structured item-received with icon and treatment in English', () => {
    const rendered = renderJournalEntry(
      {
        type: 'state-change',
        lang: 'en',
        payload: { change: 'item-received', itemId: 'rope', name: 'Rope', amount: 1 },
      },
      en,
      'Robin',
    );
    expect(rendered.html).toContain('feedback--received');
    expect(rendered.html).toContain('aria-hidden="true"');
    expect(rendered.html).toContain('Received:');
    expect(rendered.html).toContain('<span lang="en">Rope</span>');
  });

  it('keeps quantity readable and uses the same treatment in Polish', () => {
    const rendered = renderJournalEntry(
      {
        type: 'state-change',
        lang: 'pl',
        payload: { change: 'item-received', itemId: 'rope', name: 'Lina', amount: 3 },
      },
      pl,
      'Robin',
    );
    expect(rendered.html).toContain('feedback--received');
    expect(rendered.html).toContain('aria-hidden="true"');
    expect(rendered.html).toContain('Otrzymano:');
    expect(rendered.html).toContain('<span lang="pl">Lina</span>');
    expect(rendered.html).toContain('×3');
  });
});

describe('discovery feedback', () => {
  it('marks structured revealed with a distinct icon and treatment in English', () => {
    const rendered = renderJournalEntry(
      {
        type: 'state-change',
        lang: 'en',
        payload: { change: 'revealed', name: 'Dark Grove' },
      },
      en,
      'Robin',
    );
    expect(rendered.html).toContain('feedback--revealed');
    expect(rendered.html).toContain('aria-hidden="true"');
    expect(rendered.html).toContain('Revealed:');
    expect(rendered.html).toContain('<span lang="en">Dark Grove</span>');
    expect(rendered.html).not.toContain('feedback--received');
  });

  it('uses the same distinct treatment in Polish', () => {
    const rendered = renderJournalEntry(
      {
        type: 'state-change',
        lang: 'pl',
        payload: { change: 'revealed', name: 'Mroczny Gaj' },
      },
      pl,
      'Robin',
    );
    expect(rendered.html).toContain('feedback--revealed');
    expect(rendered.html).toContain('Odkryto:');
    expect(rendered.html).toContain('<span lang="pl">Mroczny Gaj</span>');
  });
});

describe('feedback equivalence', () => {
  it('carries the shared treatment through the Outcome modal', () => {
    const received = renderJournalEntry(
      {
        type: 'state-change',
        lang: 'en',
        payload: { change: 'item-received', itemId: 'rope', name: 'Rope', amount: 2 },
      },
      en,
      'Robin',
    ).html;
    const revealed = renderJournalEntry(
      {
        type: 'state-change',
        lang: 'en',
        payload: { change: 'revealed', name: 'Dark Grove' },
      },
      en,
      'Robin',
    ).html;
    const markup = renderToStaticMarkup(
      <OutcomeModal
        entries={[received, revealed]}
        acknowledgeHref="/play/pt-1?seen=3"
        continueLabel={en.game.continue}
        label={en.game.latestEvents}
        closeLabel={en.closePanel(en.game.latestEvents)}
      />,
    );
    expect(markup).toContain('feedback--received');
    expect(markup).toContain('feedback--revealed');
    expect(markup).toContain('Rope');
    expect(markup).toContain('Dark Grove');
  });

  it('keeps decorative icons out of the accessible name', () => {
    for (const payload of [
      { change: 'item-received', itemId: 'rope', name: 'Rope', amount: 1 },
      { change: 'revealed', name: 'Dark Grove' },
    ]) {
      const rendered = renderJournalEntry(
        { type: 'state-change', lang: 'en', payload },
        en,
        'Robin',
      );
      // No aria-label/role on the decorative icon; text carries the meaning.
      expect(rendered.html).not.toContain('aria-label');
      expect(rendered.html).not.toContain('role="img"');
    }
  });

  it('stays readable with long names and stacked notices', () => {
    const longName = 'The Very Long-Named Ancient Grove of Whispering Birches Beyond the Fen';
    const received = renderJournalEntry(
      {
        type: 'state-change',
        lang: 'en',
        payload: { change: 'item-received', itemId: 'rope', name: longName, amount: 12 },
      },
      en,
      'Robin',
    ).html;
    const revealed = renderJournalEntry(
      { type: 'state-change', lang: 'en', payload: { change: 'revealed', name: longName } },
      en,
      'Robin',
    ).html;
    for (const html of [received, revealed]) {
      expect(html).toContain('feedback-text');
      expect(html).toContain(`<span lang="en">${longName}</span>`);
    }
    expect(received).toContain('×12');
    const markup = renderToStaticMarkup(
      <OutcomeModal
        entries={[received, revealed]}
        acknowledgeHref="/play/pt-1?seen=3"
        continueLabel={en.game.continue}
        label={en.game.latestEvents}
        closeLabel={en.closePanel(en.game.latestEvents)}
      />,
    );
    expect(markup.match(/class="feedback feedback--/g)).toHaveLength(2);
  });
});
