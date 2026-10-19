// Combat MVP 1.0 P5a A1: the Setup form fields parse into the strict Setup.

import { describe, expect, it } from 'vitest';
import { parseSetupFormData } from '../src/app/arena/setup-form-data';

function getter(entries: Record<string, string>): (name: string) => string | null {
  return (name) => entries[name] ?? null;
}

describe('parseSetupFormData', () => {
  it('reads opponents in order with group, engagement, phase and power plus a companion', () => {
    const parsed = parseSetupFormData(
      getter({
        count: '2',
        'opponents[0].profile': 'brute',
        'opponents[0].group': 'g0',
        'opponents[0].engaged': 'on',
        'opponents[0].phase': '1',
        'opponents[0].power': '2',
        'opponents[1].profile': 'archer',
        'opponents[1].group': 'g1',
        'opponents[1].phase': '',
        'opponents[1].power': '',
        companion: 'party-archer',
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.setup.opponents).toEqual([
      { profileId: 'brute', startingGroup: 'g0', engagedWithHero: true, phaseOffset: 1, power: 2 },
      { profileId: 'archer', startingGroup: 'g1', engagedWithHero: false },
    ]);
    expect(parsed.setup.companion).toBe('party-archer');
  });

  it('treats an absent checkbox as not engaged and none as no companion', () => {
    const parsed = parseSetupFormData(
      getter({ count: '1', 'opponents[0].profile': 'raider', 'opponents[0].group': 'g0', companion: 'none' }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.setup.opponents[0]?.engagedWithHero).toBe(false);
    expect(parsed.setup.companion).toBeUndefined();
  });

  it('rejects a bad count and bad numbers with Setup issue codes', () => {
    expect(parseSetupFormData(getter({})).ok).toBe(false);
    const badPhase = parseSetupFormData(
      getter({ count: '1', 'opponents[0].profile': 'raider', 'opponents[0].group': 'g0', 'opponents[0].phase': 'x' }),
    );
    expect(badPhase.ok).toBe(false);
    if (!badPhase.ok) expect(badPhase.issues[0]?.code).toBe('bad_phase_offset');
    const tooMany = parseSetupFormData(getter({ count: '6' }));
    expect(tooMany.ok).toBe(false);
  });
});
