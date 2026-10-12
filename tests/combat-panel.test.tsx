// The Combat panel (docs/spec/ui.md, Combat panel): variant C, "Arena,
// compact". Header kicker, one-line Range arena, four action columns in
// order, and the log newest first with a "Last round" callout.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CombatPanel,
  formatCombatRoll,
  healthPercent,
  type CombatView,
} from '../src/app/play/[playthroughId]/combat-panel';
import type { CombatAvailability, CombatRoundView } from '../src/engine/index';

function actions(): CombatAvailability[] {
  return [
    {
      id: 'advance',
      group: 'Position',
      label: 'Advance',
      enabled: false,
      reason: 'Already at Near Range.',
    },
    { id: 'fall-back', group: 'Position', label: 'Fall back', enabled: true },
    {
      id: 'attack',
      group: 'Fight',
      label: 'Attack with Hunting Knife',
      enabled: true,
    },
    { id: 'defend', group: 'Fight', label: 'Defend', enabled: true },
    {
      id: 'use-item',
      group: 'Items',
      label: 'Use Berry Poultice',
      enabled: true,
      itemId: 'poultice',
    },
    { id: 'escape', group: 'Leave', label: 'Escape', enabled: true },
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

function rounds(): CombatRoundView[] {
  return [
    {
      round: 1,
      action: 'attack',
      rangeBefore: 'far',
      rangeAfter: 'near',
      guard: false,
      text: 'Robin closes in and strikes.',
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
      text: 'Robin falls back out of reach.',
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
      {...extra}
    />,
  );
}

describe('combat panel header', () => {
  it('shows the kicker, the Encounter name and the opening narration', () => {
    const markup = render(combat());
    expect(markup).toContain('Combat · Whispering Woods · Round 3');
    expect(markup).toContain('<h1>The Grey Wolf</h1>');
    expect(markup).toContain('A wolf blocks the path.');
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
    expect(markup).toContain('NEAR');
  });

  it('moves the medallions to opposite edges at Far with a middle marker', () => {
    const markup = render(combat({ range: 'far' }));
    expect(markup).toContain('aria-label="Range: Far"');
    expect(markup).toContain('combat-arena far');
    expect(markup).toContain('combat-far');
    expect(markup).toContain('FAR');
    expect(markup).not.toContain('combat-clash');
  });

  it('shows Health, weapon lines and the guard badge on the Character ring', () => {
    const markup = render(combat(), { guardUp: true, rounds: [], consumables: [] });
    expect(markup).toContain('Robin');
    expect(markup).toContain('Grey Wolf');
    expect(markup).toContain('9/12');
    expect(markup).toContain('5/8');
    expect(markup).toContain('Hunting Knife · Reach melee · Damage 3');
    expect(markup).toContain('Reach melee · Damage 2');
    expect(markup).toContain('Guard up');
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

  it('disables unavailable actions with the reason below the button', () => {
    const markup = render(combat());
    expect(markup).toContain('Already at Near Range.');
    expect(markup).toContain('disabled');
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
    expect(markup).toContain('aria-label="Combat log"');
    expect(markup).toContain('Last round · 2');
    const latest = markup.indexOf('Last round');
    const older = markup.indexOf('Robin closes in and strikes.');
    expect(latest).toBeGreaterThanOrEqual(0);
    expect(older).toBeGreaterThan(latest);
    expect(markup.indexOf('Robin falls back out of reach.')).toBeLessThan(older);
  });

  it('reads a hit without Damage as success', () => {
    const markup = render(combat());
    expect(markup).toContain('Robin: 4+3+2 = 9 vs 8 — hit, 3 Damage');
    expect(markup).toContain('Grey Wolf: 1+2+1 = 4 vs 8 — miss');
    expect(markup).toContain('Robin: 2+2+1 = 5 vs 4 — success');
    expect(markup).not.toContain('hit, 0 Damage');
  });

  it('explains an empty log', () => {
    const markup = render(combat(), { rounds: [], consumables: [] });
    expect(markup).toContain('No rolls yet.');
  });
});

describe('formatCombatRoll', () => {
  it('formats hits, non-damaging successes and misses', () => {
    expect(
      formatCombatRoll(
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
        'Robin',
        'Grey Wolf',
      ),
    ).toBe('Robin: 4+3+2 = 9 vs 8 — hit, 3 Damage');
    expect(
      formatCombatRoll(
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
        'Robin',
        'Grey Wolf',
      ),
    ).toBe('Robin: 2+2+1 = 5 vs 4 — success');
    expect(
      formatCombatRoll(
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
        'Robin',
        'Grey Wolf',
      ),
    ).toBe('Grey Wolf: 1+2+1 = 4 vs 8 — miss');
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
