// Target-picker query helpers (docs/spec/ui.md, target picker): `?target=`
// selects a survivor without state writes. Missing or unknown ids fall back
// to the first survivor; the picker links preserve the surrounding query.

import { describe, expect, it } from 'vitest';
import { combatTargetHref, selectCombatTarget } from '../src/app/lib/panel';

describe('selectCombatTarget', () => {
  it('selects the requested survivor', () => {
    expect(selectCombatTarget(['wolf-a', 'wolf-b'], 'wolf-b')).toBe('wolf-b');
  });

  it('falls back to the first survivor when missing or unknown', () => {
    expect(selectCombatTarget(['wolf-a', 'wolf-b'], undefined)).toBe('wolf-a');
    expect(selectCombatTarget(['wolf-a', 'wolf-b'], '')).toBe('wolf-a');
    expect(selectCombatTarget(['wolf-a', 'wolf-b'], 'grey-wolf')).toBe('wolf-a');
  });

  it('is undefined with no survivors', () => {
    expect(selectCombatTarget([], undefined)).toBeUndefined();
  });
});

describe('combatTargetHref', () => {
  it('sets ?target= while preserving the panel, notice and seen query', () => {
    expect(
      combatTargetHref(
        'play-1',
        { panel: 'map', notice: 'stale', seen: 7, showUnknownExits: true },
        'wolf-b',
      ),
    ).toBe('/play/play-1?panel=map&notice=stale&unknown=1&seen=7&target=wolf-b');
  });

  it('builds a bare target link with no surrounding query', () => {
    expect(combatTargetHref('play-1', {}, 'wolf-a')).toBe('/play/play-1?target=wolf-a');
  });
});
