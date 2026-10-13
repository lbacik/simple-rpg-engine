// Interface Text rendering of the Journal's structured event kinds
// (docs/spec/architecture.md, testing strategy; ADR 0004): one example of
// every structured event kind the engine emits, rendered with both
// catalogues. Each result is non-empty and contains no `undefined`, `NaN` or
// `{`. Later tickets add their kinds to this table as more engine entries
// move to structured events. There are no snapshots of whole texts; wording
// is reviewed by a person against the term table (docs/spec/ui.md,
// polish terms).

import { describe, expect, it } from 'vitest';
import { renderJournalEntry, type JournalEntryView } from '../src/app/lib/journal';
import type {
  CombatRoll,
  TacticalActionEvent,
  TacticalActor,
} from '../src/engine/index';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

const catalogues = { en, pl };

// One example of every structured event kind the engine emits today: intro,
// Scene narration, Choice taken, Outcome narration, travel, Ending, Test,
// state changes, inventory actions, and the Combat entries (start, round, end
// and the Enemy-defeated notice).
const STRUCTURED_CASES: ReadonlyArray<{ kind: string; entry: JournalEntryView }> = [
  {
    kind: 'intro',
    entry: { type: 'intro', lang: 'en', payload: { text: 'You wake in the **grass**.' } },
  },
  {
    kind: 'scene',
    entry: {
      type: 'scene',
      lang: 'pl',
      payload: { sceneId: 'arrival', text: 'Dzwon *bije*.' },
    },
  },
  {
    kind: 'choice',
    entry: {
      type: 'choice',
      lang: 'en',
      payload: { sceneId: 'arrival', choiceId: 'listen', text: 'Listen at the door.' },
    },
  },
  {
    kind: 'outcome',
    entry: { type: 'outcome', lang: 'pl', payload: { text: 'Otwierasz **drzwi**.' } },
  },
  {
    kind: 'travel',
    entry: { type: 'travel', lang: 'en', payload: { to: 'grove', name: 'Dark Grove' } },
  },
  {
    kind: 'ending',
    entry: {
      type: 'ending',
      lang: 'en',
      payload: {
        endingId: 'dawn',
        kind: 'victory',
        title: 'Dawn Breaks',
        text: 'The **sun** rises.',
      },
    },
  },
  {
    kind: 'test',
    entry: {
      type: 'test',
      lang: 'en',
      payload: {
        attribute: 'might',
        difficulty: 'very-hard',
        target: 13,
        die1: 4,
        die2: 5,
        modifier: 4,
        total: 13,
        success: true,
      },
    },
  },
  {
    kind: 'item-received',
    entry: {
      type: 'state-change',
      lang: 'en',
      payload: { change: 'item-received', itemId: 'rope', name: 'Rope', amount: 2 },
    },
  },
  {
    kind: 'item-lost',
    entry: {
      type: 'state-change',
      lang: 'pl',
      payload: { change: 'item-lost', itemId: 'sword', name: 'Miecz', amount: 1 },
    },
  },
  {
    kind: 'health-gained',
    entry: {
      type: 'state-change',
      lang: 'en',
      payload: { change: 'health-gained', amount: 2 },
    },
  },
  {
    kind: 'health-lost',
    entry: {
      type: 'state-change',
      lang: 'pl',
      payload: { change: 'health-lost', amount: 3 },
    },
  },
  {
    kind: 'revealed',
    entry: {
      type: 'state-change',
      lang: 'en',
      payload: { change: 'revealed', itemId: 'grove', name: 'Dark Grove' },
    },
  },
  {
    kind: 'equipped',
    entry: {
      type: 'inventory',
      lang: 'en',
      payload: { action: 'equipped', itemId: 'cloak', name: 'Hunter’s Cloak' },
    },
  },
  {
    kind: 'unequipped',
    entry: {
      type: 'inventory',
      lang: 'pl',
      payload: { action: 'unequipped', itemId: 'cloak', name: 'Płaszcz' },
    },
  },
  {
    kind: 'used',
    entry: {
      type: 'inventory',
      lang: 'en',
      payload: { action: 'used', itemId: 'herbs', name: 'Herbs', healed: 3 },
    },
  },
  {
    kind: 'combat-start',
    entry: {
      type: 'combat-start',
      lang: 'en',
      payload: {
        encounterId: 'wolf',
        enemyName: 'Grey Wolf',
        text: 'A wolf **lunges** from the mist.',
      },
    },
  },
  {
    kind: 'combat-round',
    entry: {
      type: 'combat-round',
      lang: 'en',
      payload: {
        encounterId: 'wolf',
        round: 1,
        action: 'attack',
        rangeBefore: 'far',
        rangeAfter: 'near',
        guard: false,
        enemyName: 'Grey Wolf',
        weaponName: 'Hunting Knife',
        rolls: [
          {
            side: 'character',
            die1: 4,
            die2: 3,
            modifier: 2,
            total: 9,
            target: 8,
            hit: true,
            damage: 3,
          },
          {
            side: 'enemy',
            die1: 1,
            die2: 2,
            modifier: 1,
            total: 4,
            target: 8,
            hit: false,
            damage: 0,
          },
        ],
      },
    },
  },
  {
    kind: 'combat-end',
    entry: {
      type: 'combat-end',
      lang: 'en',
      payload: { encounterId: 'wolf', enemyName: 'Grey Wolf', howEnded: 'victory' },
    },
  },
  {
    kind: 'enemy-defeated',
    entry: {
      type: 'enemy-defeated',
      lang: 'en',
      payload: { encounterId: 'wolf', enemyName: 'Grey Wolf' },
    },
  },
];

describe('structured journal entries in both catalogues', () => {
  for (const catalogueEntry of Object.entries(catalogues)) {
    const [language, catalogue] = catalogueEntry as ['en' | 'pl', typeof en];
    for (const { kind, entry } of STRUCTURED_CASES) {
      it(`renders ${kind} in ${language} without placeholders`, () => {
        const rendered = renderJournalEntry(entry, catalogue, 'Robin');
        expect(rendered.label.length).toBeGreaterThan(0);
        expect(rendered.html.length).toBeGreaterThan(0);
        for (const result of [rendered.label, rendered.html]) {
          expect(result).not.toContain('undefined');
          expect(result).not.toContain('NaN');
          expect(result).not.toContain('{');
        }
        // Scenario text carries the entry's language: every name inside an
        // engine message is wrapped in its own element with the entry's
        // `lang`. Entries with no Scenario text inside (Test, Health
        // gained/lost) carry Interface Text only and no `lang` element.
        const payload = (entry.payload ?? {}) as Record<string, unknown>;
        if (typeof payload.name === 'string' || typeof payload.text === 'string') {
          expect(rendered.html).toContain(`lang="${String(entry.lang)}"`);
        }
      });
    }
  }

  it('renders Interface Text in the catalogue language, not the entry language', () => {
    const english = renderJournalEntry(STRUCTURED_CASES[4]?.entry as JournalEntryView, en, 'Robin');
    const polish = renderJournalEntry(STRUCTURED_CASES[4]?.entry as JournalEntryView, pl, 'Robin');
    expect(english.html).not.toEqual(polish.html);
    expect(polish.label).toBe('Podróż');
  });

  it('labels Combat entries in Polish with the Scenario names marked', () => {
    const start = renderJournalEntry(
      {
        type: 'combat-start',
        lang: 'pl',
        payload: { encounterId: 'wilk', enemyName: 'Szary Wilk', text: 'Wilk **atakuje**.' },
      },
      pl,
      'Robin',
    );
    expect(start.label).toBe('Początek walki');
    expect(start.html).toContain('Przeciwnik: <span lang="pl">Szary Wilk</span>.');

    const end = renderJournalEntry(
      {
        type: 'combat-end',
        lang: 'pl',
        payload: { encounterId: 'wilk', enemyName: 'Szary Wilk', howEnded: 'victory' },
      },
      pl,
      'Robin',
    );
    expect(end.label).toBe('Koniec walki');
    expect(end.html).toContain('Pokonano: <span lang="pl">Szary Wilk</span>.');

    const defeated = renderJournalEntry(
      {
        type: 'enemy-defeated',
        lang: 'pl',
        payload: { encounterId: 'wilk', enemyName: 'Szary Wilk' },
      },
      pl,
      'Robin',
    );
    expect(defeated.label).toBe('Pokonany przeciwnik');
    expect(defeated.html).toContain('Pokonany: <span lang="pl">Szary Wilk</span>.');
  });

  it('keeps a Polish Combat round label-shaped with untransformed names', () => {
    const rendered = renderJournalEntry(
      {
        type: 'combat-round',
        lang: 'pl',
        payload: {
          encounterId: 'wilk',
          round: 1,
          action: 'attack',
          rangeBefore: 'near',
          rangeAfter: 'near',
          guard: false,
          enemyName: 'Szary Wilk',
          weaponName: 'Miecz',
          rolls: [
            {
              side: 'character',
              die1: 4,
              die2: 3,
              modifier: 1,
              total: 8,
              target: 7,
              hit: true,
              damage: 3,
            },
          ],
        },
      },
      pl,
      'Robin',
    );
    expect(rendered.label).toBe('Runda walki');
    // Label-shaped: the weapon name as presented, never case-transformed.
    expect(rendered.html).toContain(
      'Atak: <span lang="pl">Miecz</span> (4+3+1=8 vs 7) — trafienie, 3 obrażenia.',
    );
    expect(rendered.html).not.toContain('miecz');
  });

  it('uses Polish plural forms for Damage in Combat rounds', () => {
    const roundWith = (damage: number): JournalEntryView => ({
      type: 'combat-round',
      lang: 'pl',
      payload: {
        encounterId: 'wilk',
        round: 1,
        action: 'attack',
        rangeBefore: 'near',
        rangeAfter: 'near',
        guard: false,
        enemyName: 'Szary Wilk',
        weaponName: 'Miecz',
        rolls: [
          { side: 'enemy', die1: 6, die2: 6, modifier: 2, total: 14, target: 8, hit: true, damage },
        ],
      },
    });
    expect(renderJournalEntry(roundWith(1), pl, 'Robin').html).toContain('1 obrażenie');
    expect(renderJournalEntry(roundWith(3), pl, 'Robin').html).toContain('3 obrażenia');
    expect(renderJournalEntry(roundWith(5), pl, 'Robin').html).toContain('5 obrażeń');
  });
});

// One example of every tactical (v2) Combat round outcome: each Character
// action and Enemy Intent kind, each status (executed, cancelled per reason,
// dropped, not reached), the nested counterattack, defeats and each stop
// reason. Rendered with both catalogues like the structured table above.
const tacticalHero: TacticalActor = { kind: 'character' };
const tacticalWolfA: TacticalActor = {
  kind: 'participant',
  participantId: 'w1',
  enemyId: 'wolf',
  name: 'Grey Wolf',
  ordinal: 1,
};
const tacticalWolfB: TacticalActor = {
  kind: 'participant',
  participantId: 'w2',
  enemyId: 'wolf',
  name: 'Grey Wolf',
  ordinal: 2,
};

function tacticalRoll(overrides: Partial<CombatRoll> = {}): CombatRoll {
  return {
    side: 'character',
    die1: 4,
    die2: 3,
    modifier: 2,
    total: 9,
    target: 8,
    hit: true,
    damage: 3,
    ...overrides,
  };
}

function tacticalEntry(
  kind: string,
  actions: TacticalActionEvent[],
  extra: Record<string, unknown> = {},
): { kind: string; entry: JournalEntryView } {
  return {
    kind,
    entry: {
      type: 'combat-round',
      lang: 'en',
      payload: { encounterId: 'wolf', round: 3, version: 2, actions, ...extra },
    },
  };
}

const TACTICAL_ROUND_CASES: ReadonlyArray<{ kind: string; entry: JournalEntryView }> = [
  tacticalEntry('tactical-attack-hit', [
    {
      actor: tacticalHero,
      kind: 'attack',
      speed: 'normal',
      order: 1,
      target: tacticalWolfA,
      status: 'executed',
      roll: tacticalRoll(),
      damage: 3,
      weaponName: 'Hunting Knife',
      defeatedParticipants: ['w1'],
    },
  ]),
  tacticalEntry('tactical-attack-miss', [
    {
      actor: tacticalHero,
      kind: 'attack',
      speed: 'normal',
      order: 1,
      target: tacticalWolfA,
      status: 'executed',
      roll: tacticalRoll({ die1: 1, die2: 2, modifier: 2, total: 5, hit: false, damage: 0 }),
      damage: 0,
      weaponName: 'Hunting Knife',
    },
  ]),
  tacticalEntry('tactical-defend', [
    { actor: tacticalHero, kind: 'defend', speed: 'fast', order: 1, status: 'executed', guarded: true },
  ]),
  tacticalEntry('tactical-distract-success', [
    {
      actor: tacticalHero,
      kind: 'distract',
      speed: 'fast',
      order: 1,
      target: tacticalWolfA,
      status: 'executed',
      roll: tacticalRoll({ modifier: 1, total: 8, target: 8, damage: 0 }),
      damage: 0,
      waryUntilRound: 4,
    },
  ]),
  tacticalEntry('tactical-distract-failure', [
    {
      actor: tacticalHero,
      kind: 'distract',
      speed: 'fast',
      order: 1,
      target: tacticalWolfA,
      status: 'executed',
      roll: tacticalRoll({ die1: 1, die2: 1, modifier: 1, total: 3, target: 8, hit: false, damage: 0 }),
      damage: 0,
    },
  ]),
  tacticalEntry('tactical-advance', [
    {
      actor: tacticalHero,
      kind: 'advance',
      speed: 'normal',
      order: 1,
      target: tacticalWolfA,
      status: 'executed',
      rangeBefore: 'far',
      rangeAfter: 'near',
    },
  ]),
  tacticalEntry('tactical-advance-cancelled', [
    {
      actor: tacticalHero,
      kind: 'advance',
      speed: 'normal',
      order: 1,
      target: tacticalWolfA,
      status: 'cancelled',
      cancelReason: 'already-near',
    },
  ]),
  tacticalEntry('tactical-fall-back', [
    {
      actor: tacticalHero,
      kind: 'fall-back',
      speed: 'normal',
      order: 1,
      status: 'executed',
      roll: tacticalRoll({ die1: 2, die2: 2, modifier: 1, total: 5, target: 4, damage: 0 }),
      rangeBefore: 'near',
      rangeAfter: 'far',
    },
  ]),
  tacticalEntry('tactical-fall-back-failure', [
    {
      actor: tacticalHero,
      kind: 'fall-back',
      speed: 'normal',
      order: 1,
      status: 'executed',
      roll: tacticalRoll({ die1: 1, die2: 1, modifier: 1, total: 3, target: 8, hit: false, damage: 0 }),
      rangeBefore: 'near',
      rangeAfter: 'near',
    },
  ]),
  tacticalEntry(
    'tactical-escape',
    [
      {
        actor: tacticalHero,
        kind: 'escape',
        speed: 'normal',
        order: 1,
        status: 'executed',
        roll: tacticalRoll({ die1: 5, die2: 4, modifier: 1, total: 10, target: 9, damage: 0 }),
      },
    ],
    { stop: 'escape' },
  ),
  tacticalEntry('tactical-use-item', [
    {
      actor: tacticalHero,
      kind: 'use-item',
      speed: 'fast',
      order: 1,
      status: 'executed',
      itemId: 'poultice',
      itemName: 'Berry Poultice',
      healed: 3,
    },
  ]),
  tacticalEntry('tactical-strike-hit', [
    {
      actor: tacticalWolfA,
      kind: 'strike',
      speed: 'normal',
      order: 1,
      target: tacticalHero,
      status: 'executed',
      roll: tacticalRoll({ side: 'enemy', die1: 5, die2: 4, modifier: 1, total: 10, damage: 2 }),
      damage: 2,
    },
  ]),
  tacticalEntry('tactical-strike-miss-guarded', [
    { actor: tacticalHero, kind: 'defend', speed: 'fast', order: 1, status: 'executed', guarded: true },
    {
      actor: tacticalWolfA,
      kind: 'strike',
      speed: 'normal',
      order: 2,
      target: tacticalHero,
      status: 'executed',
      roll: tacticalRoll({ side: 'enemy', die1: 1, die2: 2, modifier: 1, total: 4, hit: false, damage: 0 }),
      damage: 0,
      counter: {
        roll: tacticalRoll({ die1: 4, die2: 3, modifier: 2, total: 9, damage: 1 }),
        damage: 1,
      },
    },
  ]),
  tacticalEntry('tactical-strike-hit-guarded', [
    { actor: tacticalHero, kind: 'defend', speed: 'fast', order: 1, status: 'executed', guarded: true },
    {
      actor: tacticalWolfA,
      kind: 'strike',
      speed: 'normal',
      order: 2,
      target: tacticalHero,
      status: 'executed',
      roll: tacticalRoll({ side: 'enemy', die1: 5, die2: 4, modifier: 1, total: 10, damage: 2 }),
      damage: 2,
    },
  ]),
  tacticalEntry('tactical-close-in', [
    {
      actor: tacticalWolfB,
      kind: 'close-in',
      speed: 'slow',
      order: 1,
      target: tacticalHero,
      status: 'executed',
      rangeBefore: 'far',
      rangeAfter: 'near',
    },
  ]),
  tacticalEntry('tactical-close-in-cancelled', [
    {
      actor: tacticalWolfB,
      kind: 'close-in',
      speed: 'slow',
      order: 1,
      target: tacticalHero,
      status: 'cancelled',
      cancelReason: 'already-near',
    },
  ]),
  tacticalEntry('tactical-prepare', [
    {
      actor: tacticalWolfB,
      kind: 'prepare',
      speed: 'slow',
      order: 1,
      target: tacticalHero,
      status: 'executed',
      prepared: true,
    },
  ]),
  tacticalEntry('tactical-heavy-attack', [
    {
      actor: tacticalWolfB,
      kind: 'heavy-attack',
      speed: 'slow',
      order: 1,
      target: tacticalHero,
      status: 'executed',
      roll: tacticalRoll({ side: 'enemy', die1: 6, die2: 5, modifier: 1, total: 12, damage: 5 }),
      damage: 5,
      prepared: false,
    },
  ]),
  tacticalEntry('tactical-cancel-interrupted', [
    {
      actor: tacticalWolfA,
      kind: 'heavy-attack',
      speed: 'slow',
      order: 1,
      target: tacticalHero,
      status: 'cancelled',
      cancelReason: 'interrupted',
      prepared: false,
    },
  ]),
  tacticalEntry('tactical-cancel-target-defeated', [
    {
      actor: tacticalHero,
      kind: 'attack',
      speed: 'normal',
      order: 1,
      target: tacticalWolfA,
      status: 'cancelled',
      cancelReason: 'target-defeated',
      weaponName: 'Hunting Knife',
    },
  ]),
  tacticalEntry('tactical-cancel-out-of-reach', [
    {
      actor: tacticalHero,
      kind: 'attack',
      speed: 'normal',
      order: 1,
      target: tacticalWolfA,
      status: 'cancelled',
      cancelReason: 'out-of-reach',
      weaponName: 'Hunting Knife',
    },
  ]),
  tacticalEntry('tactical-cancel-none-near', [
    {
      actor: tacticalHero,
      kind: 'fall-back',
      speed: 'normal',
      order: 1,
      status: 'cancelled',
      cancelReason: 'none-near',
    },
  ]),
  tacticalEntry('tactical-dropped', [
    {
      actor: tacticalWolfA,
      kind: 'strike',
      speed: 'normal',
      order: 1,
      target: tacticalHero,
      status: 'dropped',
    },
  ]),
  tacticalEntry('tactical-not-reached', [
    {
      actor: tacticalWolfB,
      kind: 'prepare',
      speed: 'slow',
      order: 1,
      target: tacticalHero,
      status: 'not-reached',
    },
  ]),
  tacticalEntry(
    'tactical-stop-victory',
    [
      {
        actor: tacticalHero,
        kind: 'attack',
        speed: 'normal',
        order: 1,
        target: tacticalWolfB,
        status: 'executed',
        roll: tacticalRoll(),
        damage: 3,
        weaponName: 'Hunting Knife',
        defeatedParticipants: ['w2'],
      },
      {
        actor: tacticalWolfB,
        kind: 'strike',
        speed: 'normal',
        order: 2,
        target: tacticalHero,
        status: 'not-reached',
      },
    ],
    { stop: 'victory' },
  ),
  tacticalEntry(
    'tactical-stop-death',
    [
      {
        actor: tacticalWolfA,
        kind: 'strike',
        speed: 'normal',
        order: 1,
        target: tacticalHero,
        status: 'executed',
        roll: tacticalRoll({ side: 'enemy', die1: 6, die2: 6, modifier: 1, total: 13, damage: 9 }),
        damage: 9,
        characterDefeated: true,
      },
    ],
    { stop: 'death' },
  ),
];

describe('tactical journal rounds in both catalogues', () => {
  for (const catalogueEntry of Object.entries(catalogues)) {
    const [language, catalogue] = catalogueEntry as ['en' | 'pl', typeof en];
    for (const { kind, entry } of TACTICAL_ROUND_CASES) {
      it(`renders ${kind} in ${language} without placeholders`, () => {
        const rendered = renderJournalEntry(entry, catalogue, 'Robin');
        expect(rendered.label.length).toBeGreaterThan(0);
        expect(rendered.html.length).toBeGreaterThan(0);
        for (const result of [rendered.label, rendered.html]) {
          expect(result).not.toContain('undefined');
          expect(result).not.toContain('NaN');
          expect(result).not.toContain('{');
        }
        // Scenario names inside the round keep the entry's language.
        expect(rendered.html).toContain('lang="en"');
      });
    }
  }

  it('reads the full round in English: order, rolls, counter, falls and stop', () => {
    const byKind = new Map(TACTICAL_ROUND_CASES.map(({ kind, entry }) => [kind, entry]));
    const hit = renderJournalEntry(byKind.get('tactical-attack-hit') as JournalEntryView, en, 'Robin');
    expect(hit.html).toContain('1. <span lang="en">Robin</span>: Attack: <span lang="en">Hunting Knife</span> → <span lang="en">Grey Wolf A</span> [Normal]');
    expect(hit.html).toContain('4+3+2=9 vs 8 — hit, 3 Damage');
    expect(hit.html).toContain('— <span lang="en">Grey Wolf A</span> falls.');

    const distract = renderJournalEntry(byKind.get('tactical-distract-success') as JournalEntryView, en, 'Robin');
    expect(distract.html).toContain("success — <span lang=\"en\">Grey Wolf A</span>'s action is interrupted;");
    expect(distract.html).toContain('Wary until the end of round 4');

    const guarded = renderJournalEntry(byKind.get('tactical-strike-miss-guarded') as JournalEntryView, en, 'Robin');
    expect(guarded.html).toContain('(your guard held)');
    expect(guarded.html).toContain('↳ Counterattack:');

    const through = renderJournalEntry(byKind.get('tactical-strike-hit-guarded') as JournalEntryView, en, 'Robin');
    expect(through.html).toContain('(through your guard)');

    const victory = renderJournalEntry(byKind.get('tactical-stop-victory') as JournalEntryView, en, 'Robin');
    expect(victory.html).toContain('Every enemy has fallen.');

    const death = renderJournalEntry(byKind.get('tactical-stop-death') as JournalEntryView, en, 'Robin');
    expect(death.html).toContain('You fell.');
  });

  it('reads the full round in Polish with the implementer wording', () => {
    const byKind = new Map(TACTICAL_ROUND_CASES.map(({ kind, entry }) => [kind, entry]));
    const hit = renderJournalEntry(byKind.get('tactical-attack-hit') as JournalEntryView, pl, 'Robin');
    expect(hit.label).toBe('Runda walki');
    expect(hit.html).toContain('trafienie, 3 obrażenia');
    expect(hit.html).toContain('pada.');

    const distract = renderJournalEntry(byKind.get('tactical-distract-success') as JournalEntryView, pl, 'Robin');
    expect(distract.html).toContain('przerwana');
    expect(distract.html).toContain('Czujny do końca rundy 4');

    const guarded = renderJournalEntry(byKind.get('tactical-strike-miss-guarded') as JournalEntryView, pl, 'Robin');
    expect(guarded.html).toContain('(garda wytrzymała)');
    expect(guarded.html).toContain('↳ Kontratak:');

    const escape = renderJournalEntry(byKind.get('tactical-escape') as JournalEntryView, pl, 'Robin');
    expect(escape.html).toContain('Uciekasz.');
  });

  it('never leaks an author-internal participant id the round cannot resolve', () => {
    const entry = tacticalEntry('tactical-unknown-defeat', [
      {
        actor: tacticalHero,
        kind: 'attack',
        speed: 'normal',
        order: 1,
        target: tacticalWolfA,
        status: 'executed',
        roll: tacticalRoll(),
        damage: 3,
        defeatedParticipants: ['author-internal-id'],
      },
    ]).entry;
    for (const catalogue of [en, pl]) {
      const rendered = renderJournalEntry(entry, catalogue, 'Robin');
      expect(rendered.html).not.toContain('author-internal-id');
    }
  });

  it('leaves legacy combat rows verbatim and never reinterprets them', () => {
    const legacy: JournalEntryView = {
      type: 'combat-round',
      lang: 'en',
      payload: { encounterId: 'wolf', text: 'Robin guards against the Grey Wolf.' },
    };
    for (const catalogue of [en, pl]) {
      const rendered = renderJournalEntry(legacy, catalogue, 'Robin');
      expect(rendered.html).toContain('Robin guards against the Grey Wolf.');
      expect(rendered.html).not.toContain('tactical-round');
    }
  });
});
