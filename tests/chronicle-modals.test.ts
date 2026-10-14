// Character and inventory modals in the illustrated-chronicle game screen
// (docs/spec/ui.md, Character and inventory panel): the existing modal content
// keeps its structure and behaviour; only the shared visual styling adapts to
// the production light palette, typography, borders, spacing, icon treatment,
// focus styles and modal surface established by the selected A layout.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');

/** The declaration block of the first rule matching the selector. */
function cssBlock(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open, close);
}

describe('chronicle modal surface', () => {
  it('renders the modal as a white chronicle card with chronicle spacing', () => {
    const modal = cssBlock('.panel-modal {');
    expect(modal).toContain('background: #fff');
    expect(modal).toContain('var(--chronicle-line');
    expect(modal).toContain('border-radius: 0.875rem');
    // Chronicle reading-body spacing, not the old compact modal padding.
    expect(modal).toContain('1.75rem 2.25rem 2rem');
    expect(modal).toContain('Arial');
    expect(modal).toContain('#263c35');
  });

  it('uses the chronicle backdrop and a single shared amber focus ring', () => {
    const backdrop = cssBlock('.panel-modal-backdrop {');
    expect(backdrop).toContain('37 48 41');
    // One grouped rule covers the modal focusables with the game screen's
    // amber ring (`.game button/a/summary:focus-visible`).
    const focusRule = css.slice(css.indexOf('.panel-modal button:focus-visible,'));
    expect(focusRule).toContain('.inv-tile:focus-visible {');
    expect(cssBlock('.panel-modal-close:focus-visible,')).toContain('#ba753d');
  });

  it('keeps the modal header, title and full-screen phone behaviour', () => {
    const head = cssBlock('.panel-modal-head {');
    expect(head).toContain('var(--chronicle-line');
    const title = cssBlock('.panel-modal-title {');
    expect(title).toContain('1.5rem');
    // Full-screen on phones is preserved.
    expect(css).toContain('height: 100dvh;');
  });
});

describe('chronicle Character sheet styling', () => {
  it('uses chronicle tokens for rules, muted text, pips and slot icons', () => {
    expect(cssBlock('.sheet-attr {')).toContain('var(--chronicle-line');
    expect(cssBlock('.sheet-attr-src {')).toContain('var(--chronicle-sub');
    expect(cssBlock('.sheet-lede {')).toContain('var(--chronicle-sub');
    const pipBase = cssBlock('.pip.base {');
    expect(pipBase).toContain('var(--chronicle-green');
    const slotIcon = cssBlock('.sheet-slot-icon {');
    expect(slotIcon).toContain('var(--chronicle-green');
    expect(cssBlock('.sheet-slots li {')).toContain('var(--chronicle-line');
  });
});

describe('chronicle inventory styling', () => {
  it('uses the chronicle cream doll, green slot tiles and green selected ring', () => {
    const doll = cssBlock('.inv-doll {');
    expect(doll).toContain('var(--chronicle-cream');
    expect(doll).toContain('var(--chronicle-line');
    const icon = cssBlock('.inv-slot-icon {');
    expect(icon).toContain('var(--chronicle-green');
    const selected = cssBlock('.inv-tile.selected {');
    expect(selected).toContain('var(--chronicle-green');
    expect(cssBlock('.inv-tile {')).toContain('#fff');
    expect(cssBlock('.inv-tile:hover {')).toContain('#f3f6ef');
    expect(cssBlock('.inv-detail {')).toContain('var(--chronicle-green');
    expect(cssBlock('.inv-ribbon {')).toContain('var(--chronicle-green');
    expect(cssBlock('.magic {')).toContain('var(--chronicle-green');
  });

  it('keeps the two-column desktop grid and the stacked phone rules', () => {
    // Desktop: the equipped doll beside the carried tiles.
    expect(cssBlock('.inv-grid {')).toContain('15rem minmax(0, 1fr)');
    // Phone: the tiles stack below the doll and the modal goes full-screen.
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(css).toContain('height: 100dvh;');
  });
});
