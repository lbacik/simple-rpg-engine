// Character and inventory modals in the illustrated-chronicle game screen
// (docs/spec/ui.md, Character and inventory panel): the existing modal content
// keeps its structure and behaviour; only the shared visual styling adapts to
// the production light palette, typography, borders, spacing, icon treatment,
// focus styles and modal surface established by the selected A layout.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open, close);
}

describe('chronicle modal surface', () => {
  it('renders the modal as a white chronicle card with chronicle spacing', () => {
    const modal = block('.panel-modal {');
    expect(modal).toContain('background: #fff');
    expect(modal).toContain('var(--chronicle-line');
    expect(modal).toContain('border-radius: 0.875rem');
    // Chronicle reading-body spacing, not the old compact modal padding.
    expect(modal).toContain('1.75rem 2.25rem 2rem');
    expect(modal).toContain('Arial');
    expect(modal).toContain('#263c35');
  });

  it('uses the chronicle backdrop and amber focus ring inside the modal', () => {
    const backdrop = block('.panel-modal-backdrop {');
    expect(backdrop).toContain('37 48 41');
    const closeFocus = block('.panel-modal-close:focus-visible {');
    expect(closeFocus).toContain('#ba753d');
    const tileFocus = block('.inv-tile:focus-visible {');
    expect(tileFocus).toContain('#ba753d');
  });

  it('keeps the modal header, title and full-screen phone behaviour', () => {
    const head = block('.panel-modal-head {');
    expect(head).toContain('var(--chronicle-line');
    const title = block('.panel-modal-title {');
    expect(title).toContain('1.5rem');
    // Full-screen on phones is preserved.
    expect(css).toContain('height: 100dvh;');
  });
});

describe('chronicle Character sheet styling', () => {
  it('uses chronicle tokens for rules, muted text, pips and slot icons', () => {
    expect(block('.sheet-attr {')).toContain('var(--chronicle-line');
    expect(block('.sheet-attr-src {')).toContain('var(--chronicle-sub');
    expect(block('.sheet-lede {')).toContain('var(--chronicle-sub');
    const pipBase = block('.pip.base {');
    expect(pipBase).toContain('#284d40');
    const slotIcon = block('.sheet-slot-icon {');
    expect(slotIcon).toContain('#284d40');
    expect(block('.sheet-slots li {')).toContain('var(--chronicle-line');
  });
});

describe('chronicle inventory styling', () => {
  it('uses the chronicle cream doll, green slot tiles and green selected ring', () => {
    expect(block('.inv-doll {')).toContain('var(--chronicle-cream');
    expect(block('.inv-doll {')).toContain('var(--chronicle-line');
    const icon = block('.inv-slot-icon {');
    expect(icon).toContain('#284d40');
    const selected = block('.inv-tile.selected {');
    expect(selected).toContain('#284d40');
    expect(block('.inv-tile {')).toContain('#fff');
    expect(block('.inv-tile:hover {')).toContain('#f3f6ef');
    expect(block('.inv-detail {')).toContain('#284d40');
    expect(block('.inv-ribbon {')).toContain('#284d40');
    expect(block('.magic {')).toContain('#284d40');
  });

  it('keeps the two-column desktop grid with a stacked phone layout', () => {
    expect(block('.inv-grid {')).toContain('15rem minmax(0, 1fr)');
    expect(css).toContain('.inv-grid {');
  });
});
