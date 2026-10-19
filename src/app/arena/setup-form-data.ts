// Arena Setup form parsing (Combat MVP 1.0, P5 A1): the Setup form posts
// plain fields, so play works without JavaScript. This module turns those
// fields into the strict Arena Setup; invalid fields read as the Setup
// issue codes the page renders from the catalogue.
//
// Framework-free and client-safe: no Next.js, no persistence, no text.

import { parseArenaSetup } from '../../engine/combat/index';
import type { ArenaSetupResult } from '../../engine/combat/index';

/** The form fields one opponent row posts. */
function opponentField(get: (name: string) => string | null, index: number, field: string): string | null {
  return get(`opponents[${index}].${field}`);
}

function optionalInt(raw: string | null): number | undefined {
  if (raw === null || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

/**
 * Parse the Setup form: `count` (1–5), per-opponent `profile`, `group`,
 * `engaged`, `phase` and `power` rows, and `companion` (`none` or a party
 * profile). Structural validation stays in the core's parseArenaSetup.
 */
export function parseSetupFormData(get: (name: string) => string | null): ArenaSetupResult {
  const countRaw = get('count');
  const count = countRaw === null ? Number.NaN : Number(countRaw);
  if (!Number.isInteger(count)) {
    return { ok: false, issues: [{ code: 'bad_opponent_count' }] };
  }
  const opponents: Record<string, unknown>[] = [];
  for (let index = 0; index < count; index += 1) {
    opponents.push({
      profileId: opponentField(get, index, 'profile'),
      startingGroup: opponentField(get, index, 'group') ?? 'g0',
      engagedWithHero: opponentField(get, index, 'engaged') === 'on',
      phaseOffset: optionalInt(opponentField(get, index, 'phase')),
      power: optionalInt(opponentField(get, index, 'power')),
    });
  }
  const companionRaw = get('companion');
  const companion = companionRaw === null || companionRaw === 'none' ? undefined : companionRaw;
  return parseArenaSetup({ opponents, companion });
}
