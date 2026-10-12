// The Combat panel (docs/spec/ui.md, Combat panel): variant C, "Arena,
// compact". Header kicker, one-line Range arena, four action columns in
// order, and the log newest first with a "Last round" callout.
//
// Every line comes from the engine's structured events through the Interface
// Language catalogue: action labels and disabled reasons render from the
// engine's codes, and round history renders from events. Legacy rows (stored
// English text, no event) are shown verbatim.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { combatRollLine } from '../src/app/lib/combat-text';
import {
  CombatPanel,
  healthPercent,
  type CombatView,
} from '../src/app/play/[playthroughId]/combat-panel';
import type {
  CombatAvailability,
  CombatRoll,
  CombatRoundView,
} from '../src/engine/index';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

function actions(): CombatAvailability[] {
  return [
    { id: 'advance', group: 'position', enabled: false, reason: 'already-near' },
    { id: 'fall-back', group: 'position', enabled: true },
    {
      id: 'attack',
      group: 'fight',
      enabled: true,
      weaponId: 'knife',
      weaponName: 'Hunting Knife',
    },
    { id: 'defend', group: 'fight', enabled: true },
    {
      id: 'use-item',
      group: 'items',
      enabled: true,
      itemId: 'poultice',
      itemName: 'Berry Poultice',
    },
    { id: 'escape', group: 'leave', enabled: true },
  ];
}

function combat(overrides: Partial<CombatView> = {}): CombatView {
  return {
    kind: 'combat',
    locationId: 'clearing',
    locationName: 'Whispering Woods',
    encounterId: 'wolf',
    encounterName: 'The Grey Wolf',
    text: 'A wolf blocks the path.',
    characterName: 'Robin',
    range: 'near',
    round: 3,
    character: {
      health: 9,
      maxHealth: 12,
      weaponName: 'Hunting Knife',
      reach: 'melee',
      damage: 3,
    },
    enemy: {
      name: 'Grey Wolf',
      health: 5,
      maxHealth: 8,
      damage: 2,
      reach: 'melee',
    },
    actions: actions(),
    map: {} as CombatView['map'],
    ...overrides,
  };
}

/** New-shape rounds: structured events with the names as presented. */
function rounds(): CombatRoundView[] {
  return [
    {
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
    {
      round: 2,
      action: 'fall-back',
      rangeBefore: 'near',
      rangeAfter: 'far',
      guard: false,
      enemyName: 'Grey Wolf',
      rolls: [
        {
          side: 'character',
          die1: 2,
          die2: 2,
          modifier: 1,
          total: 5,
          target: 4,
          hit: true,
          damage: 0,
        },
      ],
    },
  ];
}

function render(view: CombatView, extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    <CombatPanel
      combat={view}
      playthroughId="play-1"
      step={7}
      guardUp={false}
      rounds={rounds()}
      consumables={[{ itemId: 'poultice', name: 'Berry Poultice' }]}
      formAction="#combat"
      catalogue={en}
      lang="en"
      {...extra}
    />,
  );
}

describe('combat panel header', () => {
  it('shows the kicker, the Encounter name and the opening narration', () => {
    const markup = render(combat());
    expect(markup).toContain('Combat · <span lang="en">Whispering Woods</span> · Round 3');
    expect(markup).toContain('<h1><span lang="en">The Grey Wolf</span></h1>');
    expect(markup).toContain('A wolf blocks the path.');
  });

  it('shows no badge without one, and the badge after the Encounter name with one', () => {
    expect(render(combat())).not.toContain('lang-chip');
    const markup = render(combat(), { badge: <span className="lang-chip">Text: Polish</span> });
    expect(markup).toContain(
      '<h1><span lang="en">The Grey Wolf</span> <span class="lang-chip">Text: Polish</span></h1>',
    );
  });

  it('marks the Enemy name with the Scenario language, never the Character name', () => {
    const markup = render(combat());
    expect(markup).toContain('<p class="combat-name" lang="en">The Grey Wolf</p>');
    expect(markup).toContain('<p class="combat-name">Robin</p>');
  });
});

describe('combat arena', () => {
  it('labels the Range region and marks Near with side-by-side medallions', () => {
    const markup = render(combat({ range: 'near' }));
    expect(markup).toContain('aria-label="Range: Near"');
    expect(markup).toContain('combat-arena near');
    expect(markup).toContain('combat-medallion char');
    expect(markup).toContain('combat-medallion enemy');
    expect(markup).toContain('combat-clash');
    // The Range word comes from the catalogue; the uppercase is CSS.
    expect(markup).toContain('>Near</div>');
  });

  it('moves the medallions to opposite edges at Far with a middle marker', () => {
    const markup = render(combat({ range: 'far' }));
    expect(markup).toContain('aria-label="Range: Far"');
    expect(markup).toContain('combat-arena far');
    expect(markup).toContain('combat-far');
    expect(markup).toContain('>Far</div>');
    expect(markup).not.toContain('combat-clash');
  });

  it('shows Health, weapon lines and the guard badge on the Character ring', () => {
    const markup = render(combat(), { guardUp: true, rounds: [], consumables: [] });
    expect(markup).toContain('Robin');
    expect(markup).toContain('Grey Wolf');
    expect(markup).toContain('9/12');
    expect(markup).toContain('5/8');
    expect(markup).toContain('Hunting Knife · Damage 3 · Reach melee');
    expect(markup).toContain('Damage 2 · Reach melee');
    expect(markup).toContain('Guard up');
  });

  it('names an unarmed Character from the catalogue', () => {
    const unarmed = combat();
    unarmed.character = { ...unarmed.character, weaponName: undefined };
    const markup = render(unarmed, { rounds: [], consumables: [] });
    expect(markup).toContain('Bare hands');
  });
});

describe('combat actions', () => {
  it('renders the four groups in order: Position, Fight, Items, Leave', () => {
    const markup = render(combat());
    const order = ['aria-label="Position"', 'aria-label="Fight"', 'aria-label="Items"', 'aria-label="Leave"'].map(
      (label) => markup.indexOf(label),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('labels actions from their codes and the names as presented', () => {
    const markup = render(combat());
    expect(markup).toContain('Attack: Hunting Knife');
    expect(markup).toContain('Use: Berry Poultice');
    expect(markup).toContain('Fall back');
  });

  it('disables unavailable actions with the catalogue reason below the button', () => {
    const markup = render(combat());
    expect(markup).toContain('Already at Near Range.');
    expect(markup).toContain('disabled');
  });

  it('renders weapon-Range and full-Health reasons from their codes', () => {
    const view = combat({
      actions: [
        {
          id: 'attack',
          group: 'fight',
          enabled: false,
          reason: 'needs-near',
          weaponId: 'knife',
          weaponName: 'Hunting Knife',
        },
        {
          id: 'use-item',
          group: 'items',
          enabled: false,
          reason: 'full-health',
          itemId: 'poultice',
          itemName: 'Berry Poultice',
        },
      ],
    });
    const markup = render(view);
    expect(markup).toContain('Your Hunting Knife needs Near Range.');
    expect(markup).toContain('Already at full Health.');
  });

  it('posts plain forms with the hidden playthrough, step, combat and item fields', () => {
    const markup = render(combat());
    expect(markup).toContain('name="playthroughId" value="play-1"');
    expect(markup).toContain('name="expectedStep" value="7"');
    expect(markup).toContain('name="combat" value="fall-back"');
    expect(markup).toContain('name="item" value="poultice"');
  });

  it('explains an empty Items column', () => {
    const markup = render(
      { ...combat(), actions: actions().filter((action) => action.id !== 'use-item') },
      { rounds: [], consumables: [] },
    );
    expect(markup).toContain('No Consumables held.');
  });
});

describe('combat log', () => {
  it('leads with a Last round callout, older rounds after, newest first', () => {
    const markup = render(combat());
    expect(markup).toContain('aria-label="Log"');
    expect(markup).toContain('Last round · 2');
    const latest = markup.indexOf('Last round');
    // The parenthesised roll score only appears in the log's round lines, not
    // in the action buttons.
    const older = markup.indexOf('Attack: Hunting Knife (4+3+2=9 vs 8)');
    expect(latest).toBeGreaterThanOrEqual(0);
    expect(older).toBeGreaterThan(latest);
    expect(markup.indexOf('Fall back (2+2+1=5 vs 4): success')).toBeLessThan(older);
  });

  it('derives round lines and roll chips from events, not stored text', () => {
    const markup = render(combat());
    expect(markup).toContain('Attack: Hunting Knife (4+3+2=9 vs 8) — hit, 3 Damage.');
    expect(markup).toContain('Robin: 4+3+2=9 vs 8 — hit, 3 Damage');
    expect(markup).toContain('Grey Wolf: 1+2+1=4 vs 8 — miss');
    expect(markup).toContain('Robin: 2+2+1=5 vs 4 — success');
    expect(markup).not.toContain('hit, 0 Damage');
  });

  it('shows legacy rows verbatim, one line per round, with no roll chips', () => {
    const legacy: CombatRoundView[] = [
      {
        round: 1,
        action: 'attack',
        rangeBefore: 'far',
        rangeAfter: 'near',
        guard: false,
        text: 'Robin closes in and strikes.',
        rolls: [
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
    ];
    const markup = render(combat(), { rounds: legacy });
    expect(markup).toContain('Robin closes in and strikes.');
    // Chips would resolve the Enemy's name from the live Scenario instead of
    // the entry, so legacy rows show their stored text only.
    expect(markup).not.toContain('combat-roll');
    expect(markup).not.toContain('Grey Wolf: 1+2+1=4 vs 8 — miss');
  });

  it('explains an empty log', () => {
    const markup = render(combat(), { rounds: [], consumables: [] });
    expect(markup).toContain('No rolls yet.');
  });
});

describe('combatRollLine', () => {
  function roll(overrides: Partial<CombatRoll>): CombatRoll {
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

  it('formats hits, non-damaging successes and misses', () => {
    expect(combatRollLine(roll({}), en, 'Robin', 'Grey Wolf')).toBe(
      'Robin: 4+3+2=9 vs 8 — hit, 3 Damage',
    );
    expect(combatRollLine(roll({ die1: 2, die2: 2, modifier: 1, total: 5, target: 4, damage: 0 }), en, 'Robin', 'Grey Wolf')).toBe(
      'Robin: 2+2+1=5 vs 4 — success',
    );
    expect(
      combatRollLine(
        roll({ side: 'enemy', die1: 1, die2: 2, modifier: 1, total: 4, target: 8, hit: false, damage: 0 }),
        en,
        'Robin',
        'Grey Wolf',
      ),
    ).toBe('Grey Wolf: 1+2+1=4 vs 8 — miss');
  });

  it('uses Polish plural forms for Damage', () => {
    expect(combatRollLine(roll({ damage: 1 }), pl, 'Robin', 'Szary Wilk')).toBe(
      'Robin: 4+3+2=9 vs 8 — trafienie, 1 obrażenie',
    );
    expect(combatRollLine(roll({}), pl, 'Robin', 'Szary Wilk')).toBe(
      'Robin: 4+3+2=9 vs 8 — trafienie, 3 obrażenia',
    );
    expect(combatRollLine(roll({ damage: 5 }), pl, 'Robin', 'Szary Wilk')).toBe(
      'Robin: 4+3+2=9 vs 8 — trafienie, 5 obrażeń',
    );
  });
});

describe('combat panel in Polish', () => {
  function renderPl(view: CombatView, extra: Record<string, unknown> = {}): string {
    return renderToStaticMarkup(
      <CombatPanel
        combat={view}
        playthroughId="play-1"
        step={7}
        guardUp={false}
        rounds={rounds()}
        consumables={[{ itemId: 'poultice', name: 'Berry Poultice' }]}
        formAction="#combat"
        catalogue={pl}
        lang="en"
        {...extra}
      />,
    );
  }

  it('shows the kicker, groups, arena and reasons in Polish', () => {
    const markup = renderPl(combat());
    expect(markup).toContain('Walka · <span lang="en">Whispering Woods</span> · Runda 3');
    for (const group of ['Pozycja', 'Walka', 'Przedmioty', 'Ucieczka']) {
      expect(markup).toContain(`aria-label="${group}"`);
    }
    expect(markup).toContain('aria-label="Dystans: Blisko"');
    expect(markup).toContain('Już: Blisko.');
    expect(markup).toContain('Atak: Hunting Knife');
    expect(markup).toContain('Ostatnia runda · 2');
  });

  it('keeps the label shape with untransformed names and plural Damage', () => {
    const markup = renderPl(combat());
    // Label-shaped with the weapon name as presented, never case-transformed.
    expect(markup).toContain('Atak: Hunting Knife (4+3+2=9 vs 8) — trafienie, 3 obrażenia.');
    expect(markup).not.toContain('hunting knife');
    expect(markup).not.toContain('HUNTING KNIFE');
  });
});

describe('healthPercent', () => {
  it('clamps the Health percentage to 0–100', () => {
    expect(healthPercent(9, 12)).toBe(75);
    expect(healthPercent(0, 12)).toBe(0);
    expect(healthPercent(20, 12)).toBe(100);
    expect(healthPercent(-3, 12)).toBe(0);
    expect(healthPercent(5, 0)).toBe(0);
  });
});
