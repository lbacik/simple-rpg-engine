// PROTOTYPE (issue #83): Characters at effective Attributes with starting Equipment, and Enemies from shipped content.

export const CHARS = {
  hunter:   { name: 'Hunter',         M: 1, A: 4, W: 2, dmg: 3, reach: 'ranged', heal: 3, items: 2 },
  soldier:  { name: 'Soldier',        M: 4, A: 1, W: 0, dmg: 3, reach: 'melee',  heal: 3, items: 1 },
  scholar:  { name: 'Scholar',        M: 0, A: 2, W: 3, dmg: 2, reach: 'melee',  heal: 3, items: 2 },
  warden:   { name: 'Harbour Warden', M: 5, A: 1, W: 0, dmg: 3, reach: 'melee',  heal: 4, items: 2 },
  runner:   { name: 'Canal Runner',   M: 1, A: 4, W: 2, dmg: 3, reach: 'ranged', heal: 4, items: 2 },
  engineer: { name: 'Tide Engineer',  M: 1, A: 1, W: 4, dmg: 2, reach: 'melee',  heal: 4, items: 2 },
  advocate: { name: 'Crew Advocate',  M: 1, A: 0, W: 2, dmg: 3, reach: 'melee',  heal: 4, items: 2 },
};

export const ENEMIES = {
  'grey-wolf':        { name: 'Grey Wolf',         M: 2, A: 2, W: 1, maxHp: 8,  dmg: 2, reach: 'melee',  behaviour: 'steady' },
  'bandit-archer':    { name: 'Bandit Archer',     M: 1, A: 2, W: 1, maxHp: 6,  dmg: 2, reach: 'ranged', behaviour: 'heavy' },
  'barrow-wight':     { name: 'Barrow Wight',      M: 3, A: 1, W: 2, maxHp: 14, dmg: 3, reach: 'melee',  behaviour: 'heavy' },
  'drowned-porter':   { name: 'Drowned Porter',    M: 1, A: 1, W: 1, maxHp: 6,  dmg: 1, reach: 'melee',  behaviour: 'steady' },
  'iron-foreman':     { name: 'Iron Foreman',      M: 2, A: 0, W: 1, maxHp: 9,  dmg: 2, reach: 'melee',  behaviour: 'heavy' },
  'channel-watchman': { name: 'Channel Watchman',  M: 1, A: 2, W: 1, maxHp: 7,  dmg: 2, reach: 'ranged', behaviour: 'heavy' },
  'brass-auditor':    { name: 'Brass Auditor',     M: 2, A: 1, W: 2, maxHp: 10, dmg: 2, reach: 'melee',  behaviour: 'steady' },
};

export const ENCOUNTERS = {
  'hollow-wolf':  { scenario: 'ww', parts: ['grey-wolf'], startRange: 'far' },
  'camp-bandit':  { scenario: 'ww', parts: ['bandit-archer'], startRange: 'far' },
  'wight-fight':  { scenario: 'ww', parts: ['barrow-wight'], startRange: 'near' },
  'porter-fight': { scenario: 'dl', parts: ['drowned-porter'], startRange: 'near' },
  'foundry-fight':{ scenario: 'dl', parts: ['iron-foreman'], startRange: 'near' },
  'tower-fight':  { scenario: 'dl', parts: ['channel-watchman'], startRange: 'far' },
  'auditor-fight':{ scenario: 'dl', parts: ['brass-auditor'], startRange: 'near' },
  'ref-wolf-archer': { scenario: 'ref', parts: ['grey-wolf', 'bandit-archer'], startRange: 'far' },
  'ref-two-wolves':  { scenario: 'ref', parts: ['grey-wolf', 'grey-wolf'], startRange: 'far' },
};

export const SCENARIO_CHARS = { ww: ['hunter', 'soldier', 'scholar'], dl: ['warden', 'runner', 'engineer', 'advocate'] };

export function fixture(charId, encId, overrides = {}) {
  const enc = ENCOUNTERS[encId];
  const counts = {};
  return {
    char: { ...CHARS[charId], ...(overrides.char || {}) , maxHp: overrides.maxHp ?? 12 },
    startRange: enc.startRange,
    enemies: enc.parts.map((k) => {
      counts[k] = (counts[k] || 0) + 1;
      const id = enc.parts.filter((x) => x === k).length > 1 ? `${k}-${'ab'[counts[k] - 1]}` : k;
      return { ...ENEMIES[k], ...(overrides.enemies?.[k] || {}), id, kind: k };
    }),
  };
}
