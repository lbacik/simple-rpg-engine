// The client-side Continue after a result panel
// (docs/spec/playthrough-state.md, two kinds of Continue; docs/spec/ui.md,
// tests and results): the reading column shows only the result panel until
// `?seen=` equals the current `step`, and Continue carries that step without
// changing game state.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  continueHref,
  parseSeenStep,
  playHref,
  shouldShowResultPanel,
} from '../src/app/lib/panel';
import { ResultPanel } from '../src/app/play/[playthroughId]/result-panel';

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

describe('shouldShowResultPanel', () => {
  it('shows only the result panel until Continue', () => {
    // No `?seen=`: the result panel alone.
    expect(shouldShowResultPanel(true, 4, undefined)).toBe(true);
  });

  it('shows the position after Continue', () => {
    expect(shouldShowResultPanel(true, 4, 4)).toBe(false);
  });

  it('ignores a step parameter that does not match the current step', () => {
    expect(shouldShowResultPanel(true, 4, 3)).toBe(true);
    expect(shouldShowResultPanel(true, 4, 5)).toBe(true);
  });

  it('shows the position directly when the step produced no result entries', () => {
    expect(shouldShowResultPanel(false, 4, undefined)).toBe(false);
    expect(shouldShowResultPanel(false, 4, 4)).toBe(false);
    expect(shouldShowResultPanel(false, 4, 3)).toBe(false);
  });
});

describe('Continue href', () => {
  it('carries the current step', () => {
    expect(continueHref('pt-1', 4)).toBe('/play/pt-1?seen=4');
  });

  it('preserves the panel tab, notice and "?" map setting', () => {
    expect(continueHref('pt-1', 4, 'inventory', undefined, false)).toBe(
      '/play/pt-1?tab=inventory&seen=4',
    );
    expect(continueHref('pt-1', 4, 'map', 'stale', true)).toBe(
      '/play/pt-1?tab=map&notice=stale&unknown=1&seen=4',
    );
  });

  it('keeps the acknowledgement on tab and map-toggle links after Continue', () => {
    expect(playHref('pt-1', 'inventory', undefined, 4, false)).toContain('seen=4');
    expect(playHref('pt-1', 'inventory', undefined, 4, true)).toContain('seen=4');
    expect(playHref('pt-1', 'inventory', undefined, 4, true)).toContain('unknown=1');
    // Without acknowledgement there is no `seen` parameter to preserve.
    expect(playHref('pt-1', 'inventory')).not.toContain('seen=');
  });
});

describe('ResultPanel', () => {
  it('renders the entries with a Continue link carrying the step', () => {
    const html = renderToStaticMarkup(
      <ResultPanel entries={['<p>Outcome narration.</p>']} continueHref="/play/pt-1?seen=4" />,
    );
    expect(html).toContain('Outcome narration.');
    expect(html).toContain('href="/play/pt-1?seen=4"');
    expect(html).toContain('Continue');
    // Continue is a plain link, not a form: following it changes no game
    // state and does not advance `step`.
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
  });

  it('renders nothing without entries', () => {
    const html = renderToStaticMarkup(<ResultPanel entries={[]} continueHref="/play/pt-1?seen=4" />);
    expect(html).toBe('');
  });
});
