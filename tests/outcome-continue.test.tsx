// The client-side Continue after an Outcome presentation
// (docs/spec/playthrough-state.md, two kinds of Continue; docs/spec/ui.md,
// tests and results): the Outcome shows in a modal over the Location until
// `?seen=` equals the current `step`, and Continue carries that step without
// changing game state.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  continueHref,
  parsePanel,
  parseSeenStep,
  playHref,
  shouldShowOutcomeModal,
} from '../src/app/lib/panel';
import { OUTCOME_MODAL_ENTRY_TYPES } from '../src/engine/index';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

// Imported after the router mock so the client modal picks it up.
const { OutcomeModal } = await import('../src/app/play/[playthroughId]/outcome-modal');

describe('parseSeenStep', () => {
  it('parses the current step', () => {
    expect(parseSeenStep('3')).toBe(3);
    expect(parseSeenStep('0')).toBe(0);
  });

  it('treats missing or invalid values as no acknowledgement', () => {
    expect(parseSeenStep(undefined)).toBeUndefined();
    expect(parseSeenStep('')).toBeUndefined();
    expect(parseSeenStep('nope')).toBeUndefined();
    expect(parseSeenStep('-1')).toBeUndefined();
    expect(parseSeenStep('3abc')).toBeUndefined();
    expect(parseSeenStep('3.5')).toBeUndefined();
  });
});

describe('parsePanel', () => {
  it('opens the Character, Inventory and map modals from the URL', () => {
    expect(parsePanel('character')).toBe('character');
    expect(parsePanel('inventory')).toBe('inventory');
    expect(parsePanel('map')).toBe('map');
  });

  it('renders no modal without the parameter or with an unknown value', () => {
    expect(parsePanel(undefined)).toBeNull();
    expect(parsePanel('')).toBeNull();
    expect(parsePanel('journal')).toBeNull();
  });
});

describe('panel hrefs', () => {
  it('reflects the open modal in the URL', () => {
    expect(playHref('pt-1', 'character')).toBe('/play/pt-1?panel=character');
    expect(playHref('pt-1', 'inventory')).toBe('/play/pt-1?panel=inventory');
    expect(playHref('pt-1', null)).toBe('/play/pt-1');
    expect(playHref('pt-1', undefined)).toBe('/play/pt-1');
    // Unknown values render no modal and leave the URL clean.
    expect(playHref('pt-1', 'journal')).toBe('/play/pt-1');
  });
});

describe('shouldShowOutcomeModal', () => {
  it('shows the outcome modal until Continue', () => {
    // No `?seen=`: the outcome modal over the Location.
    expect(shouldShowOutcomeModal(true, 4, undefined)).toBe(true);
  });

  it('shows the position after Continue', () => {
    expect(shouldShowOutcomeModal(true, 4, 4)).toBe(false);
  });

  it('ignores a step parameter that does not match the current step', () => {
    expect(shouldShowOutcomeModal(true, 4, 3)).toBe(true);
    expect(shouldShowOutcomeModal(true, 4, 5)).toBe(true);
  });

  it('shows the position directly when the step produced no outcome entries', () => {
    expect(shouldShowOutcomeModal(false, 4, undefined)).toBe(false);
    expect(shouldShowOutcomeModal(false, 4, 4)).toBe(false);
    expect(shouldShowOutcomeModal(false, 4, 3)).toBe(false);
  });
});

describe('outcome-modal entry types', () => {
  it('gates every Outcome presentation behind Continue: Test, Outcome and state changes', () => {
    // S4 deleted the tactical Combat end and Enemy-defeated entries with the
    // old rules; the P6 adapter re-adds the v3 Combat end frame (G3/G6).
    for (const type of ['test', 'outcome', 'state-change', 'combat-end']) {
      expect(OUTCOME_MODAL_ENTRY_TYPES.has(type)).toBe(true);
    }
  });

  it('leaves positions, the intro and the Ending out of the modal', () => {
    // The intro shows in a modal over the starting Location instead of an
    // outcome modal (docs/spec/playthrough-state.md, outcome modal).
    for (const type of [
      'intro',
      'scene',
      'choice',
      'travel',
      'combat-start',
      'combat-round',
      'enemy-defeated',
      'inventory',
      'ending',
    ]) {
      expect(OUTCOME_MODAL_ENTRY_TYPES.has(type)).toBe(false);
    }
  });
});

describe('Continue href', () => {
  it('carries the current step', () => {
    expect(continueHref('pt-1', 4)).toBe('/play/pt-1?seen=4');
  });

  it('preserves the open panel modal, notice and "?" map setting', () => {
    expect(continueHref('pt-1', 4, 'inventory', undefined, false)).toBe(
      '/play/pt-1?panel=inventory&seen=4',
    );
    expect(continueHref('pt-1', 4, 'map', 'stale', true)).toBe(
      '/play/pt-1?panel=map&notice=stale&unknown=1&seen=4',
    );
  });

  it('keeps the acknowledgement on panel and map-toggle links after Continue', () => {
    expect(playHref('pt-1', 'inventory', undefined, 4, false)).toContain('seen=4');
    expect(playHref('pt-1', 'inventory', undefined, 4, true)).toContain('seen=4');
    expect(playHref('pt-1', 'inventory', undefined, 4, true)).toContain('unknown=1');
    // Without acknowledgement there is no `seen` parameter to preserve.
    expect(playHref('pt-1', 'inventory')).not.toContain('seen=');
  });
});

describe('OutcomeModal', () => {
  it('renders the entries in a dialog with a Continue link carrying the step', () => {
    const html = renderToStaticMarkup(
      <OutcomeModal
        entries={['<p>Outcome narration.</p>']}
        acknowledgeHref="/play/pt-1?seen=4"
        continueLabel={en.game.continue}
        label={en.game.latestEvents}
        closeLabel="Close Latest events"
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Outcome narration.');
    expect(html).toContain('href="/play/pt-1?seen=4"');
    expect(html).toContain('Continue');
    expect(html).toContain('aria-label="Latest events"');
    // Continue is a plain link, not a form: following it changes no game
    // state and does not advance `step`.
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
  });

  it('renders nothing without entries', () => {
    const html = renderToStaticMarkup(
      <OutcomeModal
        entries={[]}
        acknowledgeHref="/play/pt-1?seen=4"
        continueLabel={en.game.continue}
        label={en.game.latestEvents}
        closeLabel="Close Latest events"
      />,
    );
    expect(html).toBe('');
  });

  it('renders the Continue control in Polish', () => {
    const html = renderToStaticMarkup(
      <OutcomeModal
        entries={['<p>Narracja wyniku.</p>']}
        acknowledgeHref="/play/pt-1?seen=4"
        continueLabel={pl.game.continue}
        label={pl.game.latestEvents}
        closeLabel="Zamknij Ostatnie wydarzenia"
      />,
    );
    expect(html).toContain('Kontynuuj');
    expect(html).toContain('aria-label="Ostatnie wydarzenia"');
  });
});
