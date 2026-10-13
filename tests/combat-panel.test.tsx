// The tactical Combat panel (docs/spec/ui.md, Combat panel; variant A):
// lanes, Intent bubbles, badges, the Character summary, the order strip, the
// target picker and the action buttons, all from the engine's arena
// projection. Cases reuse the shared arena examples from the engine
// projection ticket (tests/fixtures/tactical.ts): one participant, a
// same-kind pair, wolf + archer, and a pair with one defeated. The projection
// itself is covered there, so these tests assert presentation — lanes,
// letters, thresholds, picker links, button text and forms — never mechanics.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { combatRollLine } from '../src/app/lib/combat-text';
import {
  CombatPanel,
  healthPercent,
  type CombatView,
} from '../src/app/play/[playthroughId]/combat-panel';
import type { Scenario } from '../src/content/index';
import type { CompiledItem } from '../src/content/model';
import {
  applyAction,
  startPlaythrough,
  view,
  type Action,
  type CombatRoll,
  type CombatRoundView,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';
import { en } from '../src/i18n/en';
import type { Catalogue } from '../src/i18n/index';
import { pl } from '../src/i18n/pl';
import {
  loadArenaExample,
  loadTacticalFixture,
  type ArenaExampleKind,
} from './fixtures/tactical';

function render(
  combat: CombatView,
  step: number,
  extra: {
    selectedTargetId?: string;
    catalogue?: Catalogue;
    rounds?: CombatRoundView[];
  } = {},
): string {
  return renderToStaticMarkup(
    <CombatPanel
      combat={combat}
      playthroughId="play-1"
      step={step}
      rounds={extra.rounds ?? []}
      formAction="#combat"
      catalogue={extra.catalogue ?? en}
      lang="en"
      selectedTargetId={extra.selectedTargetId}
      targetHrefFor={(participantId) => `/play/play-1?target=${participantId}`}
    />,
  );
}

function example(kind: ArenaExampleKind): { combat: CombatView; step: number } {
  const loaded = loadArenaExample(kind);
  const gameView = view(loaded.scenario, loaded.state);
  if (gameView.kind !== 'combat') throw new Error(`example ${kind} has no combat`);
  return { combat: gameView, step: loaded.state.step };
}

/** The wolves pair holding Healing Herbs, fresh or wounded. */
function herbs(wounded: boolean): { combat: CombatView; step: number } {
  const loaded = loadArenaExample('wolves');
  // The loaded Scenario is frozen; derive an items case with a cloned lookup.
  // The arena still comes from the engine projection, never hand-built.
  const scenario: Scenario = {
    ...loaded.scenario,
    itemsById: {
      ...loaded.scenario.itemsById,
      'healing-herbs': {
        id: 'healing-herbs',
        kind: 'consumable',
        name: 'Healing Herbs',
        description: 'Bitter herbs.',
        heal: 3,
        magic: false,
      } as CompiledItem,
    },
  };
  const state: PlaythroughState = {
    ...loaded.state,
    character: {
      ...loaded.state.character,
      health: wounded ? loaded.state.character.health - 3 : loaded.state.character.health,
    },
    inventory: { ...loaded.state.inventory, 'healing-herbs': 1 },
  };
  const gameView = view(scenario, state);
  if (gameView.kind !== 'combat') throw new Error('herbs example has no combat');
  return { combat: gameView, step: state.step };
}

function silentRng(): Rng {
  return () => {
    throw new Error('no dice expected');
  };
}

function diceRng(dice: number[]): Rng {
  let index = 0;
  return (min: number, max: number) => {
    const die = dice[index];
    if (die === undefined || die < min || die >= max) {
      throw new Error(`die ${String(die)} outside [${min}, ${max})`);
    }
    index += 1;
    return die;
  };
}

/**
 * Wolf + archer after Robin advances on the wolf: the wolf is Near with a
 * Strike, the archer stays Far preparing its aimed shot, and both survive,
 * so Advance is legal overall but not against the wolf.
 */
function advancedMixed(): { combat: CombatView; step: number } {
  const { scenario } = loadTacticalFixture('pair-defaulted');
  const started = startPlaythrough(scenario, 'hunter', 'Robin', silentRng());
  if (!started.ok) throw new Error('advance example failed to start');
  let state = started.state;
  const submit = (action: Action, rng: Rng): void => {
    const result = applyAction(scenario, state, action, rng);
    if (!result.ok) throw new Error('advance example action failed');
    state = result.state;
  };
  submit({ kind: 'open-scene', sceneId: 'ambush', expectedStep: state.step }, silentRng());
  submit({ kind: 'choose', choiceId: 'confront', expectedStep: state.step }, diceRng([1]));
  submit(
    {
      kind: 'combat',
      combatAction: 'advance',
      targetParticipantId: 'grey-wolf',
      expectedStep: state.step,
    },
    diceRng([]),
  );
  const gameView = view(scenario, state);
  if (gameView.kind !== 'combat') throw new Error('advance example has no combat');
  return { combat: gameView, step: state.step };
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

describe('combat panel header', () => {
  it('shows the kicker, the Encounter name and the opening narration', () => {
    const solo = example('solo');
    const markup = render(solo.combat, solo.step);
    expect(markup).toContain('Combat · <span lang="en">Glade</span> · Round 1');
    expect(markup).toContain('<h1><span lang="en">Grey Wolf</span></h1>');
    expect(markup).toContain('Teeth and arrows in the dark.');
  });

  it('shows no badge without one, and the badge after the Encounter name with one', () => {
    const solo = example('solo');
    expect(render(solo.combat, solo.step)).not.toContain('lang-chip');
    const markup = renderToStaticMarkup(
      <CombatPanel
        combat={solo.combat}
        playthroughId="play-1"
        step={solo.step}
        rounds={[]}
        formAction="#combat"
        catalogue={en}
        lang="en"
        selectedTargetId={undefined}
        targetHrefFor={(participantId) => `/play/play-1?target=${participantId}`}
        badge={<span className="lang-chip">Text: Polish</span>}
      />,
    );
    expect(markup).toContain(
      '<h1><span lang="en">Grey Wolf</span> <span class="lang-chip">Text: Polish</span></h1>',
    );
  });

  it('marks participant names with the Scenario language, never the Character name', () => {
    const wolves = example('wolves');
    const markup = render(wolves.combat, wolves.step, { selectedTargetId: 'wolf-a' });
    expect(markup).toContain('<span lang="en">Grey Wolf A</span>');
    expect(markup).toContain('<p class="combat-name">Robin</p>');
  });
});

describe('lanes, bubbles and badges (U1)', () => {
  it('renders one lane with its Intent bubble for a lone participant', () => {
    const solo = example('solo');
    const markup = render(solo.combat, solo.step);
    expect(markup.match(/tactical-lane-visual/g)?.length).toBe(1);
    expect(markup).toContain('aria-label="Combat arena"');
    // The Close in bubble: first among the Intents, normal Speed, no
    // threshold on a movement Intent.
    expect(markup).toContain('data-bubble-order="1"');
    expect(markup).toContain('Normal');
    expect(markup).toContain('Close in');
    // A unique kind carries no letter.
    expect(markup).not.toContain('combat-letter');
    // The Character summary: name, Health and weapon line.
    expect(markup).toContain('<p class="combat-name">Robin</p>');
    expect(markup).toContain('12/12');
    expect(markup).toContain('Sword · Damage 3 · Reach melee');
  });

  it('distinguishes same-kind participants with A/B letters, never author ids', () => {
    const wolves = example('wolves');
    const markup = render(wolves.combat, wolves.step, { selectedTargetId: 'wolf-a' });
    expect(markup.match(/tactical-lane-visual/g)?.length).toBe(2);
    expect(markup).toContain('Grey Wolf A');
    expect(markup).toContain('Grey Wolf B');
    expect(markup).toContain('combat-letter">A<');
    expect(markup).toContain('combat-letter">B<');
    // Author ids travel in picker hrefs and posted forms, never as names.
    expect(markup).not.toContain('>wolf-a<');
    expect(markup).not.toContain('>wolf-b<');
    // Both wolves closed in at Far: the order strip lists both Intents.
    expect(markup).toContain('Grey Wolf A</span>: Close in');
    expect(markup).toContain('Grey Wolf B</span>: Close in');
  });

  it('shows preparation and the Heavy attack it builds towards', () => {
    const mixed = example('mixed');
    const markup = render(mixed.combat, mixed.step, { selectedTargetId: 'grey-wolf' });
    // The archer takes aim: dashed Prepare bubble and the next round's aimed
    // shot for base Damage +3. The Aiming badge appears only while prepared,
    // after Take aim resolves (see below).
    expect(markup).toContain('Take aim');
    expect(markup).toContain('tactical-intent is-prepare');
    expect(markup).toContain('next round: Aimed shot, slow, 5 Damage');
    expect(markup).toContain('Close in');
  });

  it('shows the prepared badge once Take aim resolves', () => {
    const advanced = advancedMixed();
    const markup = render(advanced.combat, advanced.step, {
      selectedTargetId: 'bandit-archer',
    });
    // The archer is prepared: Aiming badge, slow aimed-shot bubble with its
    // thresholds, still building towards the same Heavy attack.
    expect(markup).toContain('Aiming');
    expect(markup).toContain('Aimed shot');
    expect(markup).toContain('2 Damage · hits you on 10+, 12+ if you Defend');
    expect(markup).toContain('next round: Aimed shot, slow, 5 Damage');
  });

  it('shows the attack Damage with its 2d6 thresholds', () => {
    const fallen = example('defeated');
    const markup = render(fallen.combat, fallen.step);
    // The surviving wolf's Strike hits Robin (Agility 3) on 10+, 12+ guarded.
    expect(markup).toContain('2 Damage · hits you on 10+, 12+ if you Defend');
  });

  it('keeps a grey defeated lane without a bubble or Range label', () => {
    const fallen = example('defeated');
    const markup = render(fallen.combat, fallen.step);
    expect(markup).toContain('Grey Wolf A');
    expect(markup).toContain('Defeated');
    expect(markup).toContain('combat-face is-defeated');
    // Only the survivor keeps an Intent bubble and a Range label.
    expect(markup.match(/data-bubble-order/g)?.length).toBe(1);
    expect(markup.match(/tactical-range/g)?.length).toBe(1);
    // The lane drawing is decorative; the summary carries the same text.
    expect(markup).toContain('Grey Wolf B</span>: Near, Health');
    // One survivor means no picker and a single order chip plus the hint.
    expect(markup).not.toContain('aria-label="Target"');
    expect(markup).toContain('Grey Wolf B</span>: Strike');
    expect(markup).not.toContain('Grey Wolf A</span>: Strike');
  });

  it('orders lanes by content while the strip keeps the saved tie order', () => {
    const wolves = example('wolves');
    const reordered: CombatView = {
      ...wolves.combat,
      arena: {
        ...wolves.combat.arena,
        participants: [...wolves.combat.arena.participants].reverse(),
      },
    };
    const markup = render(reordered, wolves.step, { selectedTargetId: 'wolf-b' });
    // Lane order follows content: wolf-b's medallion comes first.
    expect(markup.indexOf('combat-name">Grey Wolf B')).toBeLessThan(
      markup.indexOf('combat-name">Grey Wolf A'),
    );
    // The strip still announces the saved order: wolf-a first.
    const strip = markup.indexOf('combat-order-list');
    expect(markup.indexOf('Grey Wolf A</span>: Close in', strip)).toBeLessThan(
      markup.indexOf('Grey Wolf B</span>: Close in', strip),
    );
  });
});

describe('target picker (U2)', () => {
  it('links both survivors and marks the selected one', () => {
    const wolves = example('wolves');
    const markup = render(wolves.combat, wolves.step, { selectedTargetId: 'wolf-b' });
    expect(markup).toContain('aria-label="Target"');
    expect(markup).toContain('href="/play/play-1?target=wolf-a"');
    expect(markup).toContain('href="/play/play-1?target=wolf-b" aria-current="true"');
    expect(markup).toContain('Used by Attack, Distract and Advance.');
    // The picker is an ordered list of links, one per survivor.
    expect(markup.match(/\/play\/play-1\?target=/g)?.length).toBe(2);
  });

  it('falls back to the first survivor when the parameter is missing or invalid', () => {
    const wolves = example('wolves');
    for (const selectedTargetId of [undefined, 'grey-wolf']) {
      const markup = render(wolves.combat, wolves.step, { selectedTargetId });
      // The first link carries the mark, and targeted forms post wolf-a.
      expect(markup).toContain('href="/play/play-1?target=wolf-a" aria-current="true"');
      expect(markup).toContain('name="target" value="wolf-a"');
    }
  });

  it('hides the picker with one survivor and posts that survivor', () => {
    const solo = example('solo');
    const markup = render(solo.combat, solo.step);
    expect(markup).not.toContain('aria-label="Target"');
    expect(markup).not.toContain('?target=');
    expect(markup).toContain('name="target" value="wolf-solo"');
  });

  it('renders identically twice: selecting a target writes nothing', () => {
    const wolves = example('wolves');
    const first = render(wolves.combat, wolves.step, { selectedTargetId: 'wolf-b' });
    const second = render(wolves.combat, wolves.step, { selectedTargetId: 'wolf-b' });
    expect(first).toBe(second);
  });

  it('disables Advance against the Near wolf while the Far archer stays open', () => {
    const advanced = advancedMixed();
    const nearWolf = render(advanced.combat, advanced.step, {
      selectedTargetId: 'grey-wolf',
    });
    expect(nearWolf).toContain('You are already Near <span lang="en">Grey Wolf</span>.');
    expect(nearWolf).toContain('name="target" value="grey-wolf"');
    const farArcher = render(advanced.combat, advanced.step, {
      selectedTargetId: 'bandit-archer',
    });
    expect(farArcher).not.toContain('You are already Near');
    expect(farArcher).toContain('name="target" value="bandit-archer"');
  });

  it('names the out-of-Reach target on a disabled Attack', () => {
    const advanced = advancedMixed();
    const markup = render(advanced.combat, advanced.step, {
      selectedTargetId: 'bandit-archer',
    });
    expect(markup).toContain(
      'Your <span lang="en">Sword</span> needs Near Range; <span lang="en">Bandit Archer</span> is Far.',
    );
  });
});

describe('action buttons (U3)', () => {
  it('shows Speed, predicted order, threshold and target on every button', () => {
    const wolves = example('wolves');
    const markup = render(wolves.combat, wolves.step, { selectedTargetId: 'wolf-b' });
    // Robin (Agility 3) acts first with a normal action: 1st of 3.
    expect(markup).toContain('Normal · acts 1st of 3 · needs 9+ · → <span lang="en">Grey Wolf B</span>');
    // Defend is fast and unrolled; Fall back is slow and, with nothing Near,
    // unrolled too.
    expect(markup).toContain('Fast · acts 1st of 3');
    expect(markup).toContain('Slow · acts 3rd of 3');
    // Escape keeps its committed +2 while every lane is Far.
    expect(markup).toContain('needs 9+ · includes +2 committed bonus');
  });

  it('posts plain forms with the step, the selected target and the Consumable id', () => {
    const wounded = herbs(true);
    const markup = render(wounded.combat, wounded.step, { selectedTargetId: 'wolf-a' });
    expect(markup).toContain('name="playthroughId" value="play-1"');
    expect(markup).toContain(`name="expectedStep" value="${wounded.step}"`);
    // Targeted actions post the picker selection; untargeted ones post none.
    expect(markup).toContain('name="combat" value="attack"');
    // Attack, Distract and Advance post the picker selection; Defend,
    // Escape and the Consumable post no target.
    expect(markup.match(/name="target" value="wolf-a"/g)?.length).toBe(3);
    const defendForm = markup.slice(markup.indexOf('name="combat" value="defend"'));
    expect(defendForm.slice(0, defendForm.indexOf('</form>'))).not.toContain('name="target"');
    // The Consumable posts its id on an untargeted form.
    expect(markup).toContain('name="combat" value="use-item"');
    expect(markup).toContain('name="item" value="healing-herbs"');
    expect(markup).toContain('Use: <span lang="en">Healing Herbs</span>');
  });

  it('disables the Consumable at full Health with the engine reason', () => {
    const fresh = herbs(false);
    const markup = render(fresh.combat, fresh.step, { selectedTargetId: 'wolf-a' });
    expect(markup).toContain('Already at full Health.');
    expect(markup).not.toContain('name="item" value="healing-herbs"');
  });

  it('explains an empty Items group', () => {
    const wolves = example('wolves');
    const markup = render(wolves.combat, wolves.step, { selectedTargetId: 'wolf-a' });
    expect(markup).toContain('No Consumables held.');
  });

  it('exposes the server-given positions for the focus/hover preview', () => {
    const wolves = example('wolves');
    const markup = render(wolves.combat, wolves.step, { selectedTargetId: 'wolf-a' });
    expect(markup).toContain('data-preview-order="1"');
    expect(markup).toContain('data-preview-text="#1 Defend (preview)"');
    expect(markup).toContain('data-bubble-disc');
    expect(markup).toContain('data-strip-hint');
  });
});

describe('tactical accessibility (U6)', () => {
  it('keeps ordered-list semantics, marked targets and per-lane summaries', () => {
    const wolves = example('wolves');
    const markup = render(wolves.combat, wolves.step, { selectedTargetId: 'wolf-a' });
    expect(markup).toContain('<ol class="combat-order-list">');
    expect(markup).toContain('aria-current="true"');
    // One screen-reader summary per lane; the drawings are decorative.
    expect(markup.match(/class="visually-hidden"/g)?.length).toBe(2);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('Grey Wolf A</span>: Far, Health 8/8. Close in, Normal.');
  });

  it('points disabled buttons at their reason', () => {
    const wolves = example('wolves');
    const markup = render(wolves.combat, wolves.step, { selectedTargetId: 'wolf-a' });
    // Attack is disabled at Far with a melee weapon; the button names its
    // reason, which names no target the sword cannot reach past.
    expect(markup).toContain('aria-describedby="combat-reason-attack"');
    expect(markup).toContain('id="combat-reason-attack"');
    expect(markup).toContain('Your <span lang="en">Sword</span> needs Near Range.');
  });

  it('keeps the phone, motion and focus rules in the stylesheet', () => {
    const cssPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'app',
      'globals.css',
    );
    const css = fs.readFileSync(cssPath, 'utf8');
    // The four action groups collapse to a 2x2 grid on phone widths.
    expect(css).toContain('repeat(2, minmax(0, 1fr))');
    // Lanes wrap instead of overflowing the page.
    expect(css).toContain('.tactical-arena');
    expect(css).toContain('flex-wrap: wrap');
    // Reduced motion disables lane transitions.
    expect(css).toContain('prefers-reduced-motion: reduce');
    // Keyboard focus stays visible on buttons and picker links.
    expect(css).toContain(':focus-visible');
    // Decorative drawings read through visually-hidden summaries.
    expect(css).toContain('.visually-hidden');
  });
});

describe('combat panel in Polish', () => {
  function renderPl(kind: ArenaExampleKind, selectedTargetId?: string): string {
    const loaded = loadArenaExample(kind);
    const gameView = view(loaded.scenario, loaded.state);
    if (gameView.kind !== 'combat') throw new Error(`example ${kind} has no combat`);
    return render(gameView, loaded.state.step, { selectedTargetId, catalogue: pl });
  }

  it('shows the arena, strip, picker and buttons in Polish with English names', () => {
    const markup = renderPl('wolves', 'wolf-b');
    expect(markup).toContain('Walka · <span lang="en">Glade</span> · Runda 1');
    expect(markup).toContain('aria-label="Arena walki"');
    expect(markup).toContain('Ta runda');
    expect(markup).toContain('aria-label="Cel"');
    // Scenario names stay as presented: English, lettered, never inflected.
    expect(markup).toContain('<span lang="en">Grey Wolf B</span>');
    expect(markup).toContain('Zbliżenie');
    expect(markup).toContain('Zwykła · działa 1. z 3 · wymaga 9+ · → <span lang="en">Grey Wolf B</span>');
    expect(markup).toContain('Cel Ataku, Rozproszenia i Podejścia.');
  });

  it('keeps the defeated lane and preparation badges readable in Polish', () => {
    expect(renderPl('defeated')).toContain('Pokonany');
    const mixed = renderPl('mixed', 'grey-wolf');
    expect(mixed).toContain('Celowanie');
    expect(mixed).toContain('następna runda: Wycelowany strzał, Wolna, 5 obrażeń');
    const advanced = advancedMixed();
    const prepared = render(advanced.combat, advanced.step, {
      selectedTargetId: 'bandit-archer',
      catalogue: pl,
    });
    expect(prepared).toContain('Celuje');
    expect(prepared).toContain('Wycelowany strzał');
  });
});

describe('combat log', () => {
  function renderWithLog(extra: { catalogue?: Catalogue } = {}): string {
    const solo = example('solo');
    return render(solo.combat, solo.step, { ...extra, rounds: rounds() });
  }

  it('leads with a Last round callout, older rounds after, newest first', () => {
    const markup = renderWithLog();
    expect(markup).toContain('aria-label="Log"');
    expect(markup).toContain('Last round · 2');
    const latest = markup.indexOf('Last round');
    // The parenthesised roll score only appears in the log's round lines, not
    // in the action buttons.
    const older = markup.indexOf('Attack: <span lang="en">Hunting Knife</span> (4+3+2=9 vs 8)');
    expect(latest).toBeGreaterThanOrEqual(0);
    expect(older).toBeGreaterThan(latest);
    expect(markup.indexOf('Fall back (2+2+1=5 vs 4): success')).toBeLessThan(older);
  });

  it('derives round lines and roll chips from events, not stored text', () => {
    const markup = renderWithLog();
    expect(markup).toContain(
      'Attack: <span lang="en">Hunting Knife</span> (4+3+2=9 vs 8) — hit, 3 Damage.',
    );
    expect(markup).toContain('<span lang="en">Robin</span>: 4+3+2=9 vs 8 — hit, 3 Damage');
    expect(markup).toContain('<span lang="en">Grey Wolf</span>: 1+2+1=4 vs 8 — miss');
    expect(markup).toContain('<span lang="en">Robin</span>: 2+2+1=5 vs 4 — success');
    expect(markup).not.toContain('hit, 0 Damage');
  });

  it('wraps every Scenario name in the log with the Scenario language', () => {
    const markup = renderWithLog();
    // The Interface Text around the names carries no lang of its own.
    expect(markup).toContain('Last round · 2');
    expect(markup).not.toContain('lang="en">Fall back (2+2+1=5 vs 4): success');
  });

  it('shows legacy rows verbatim, one line per round, with no roll chips', () => {
    const solo = example('solo');
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
    const markup = render(solo.combat, solo.step, { rounds: legacy });
    expect(markup).toContain('<p lang="en">Robin closes in and strikes.</p>');
    // Chips would resolve the Enemy's name from the live Scenario instead of
    // the entry, so legacy rows show their stored text only.
    expect(markup).not.toContain('combat-roll');
    expect(markup).not.toContain('Grey Wolf: 1+2+1=4 vs 8 — miss');
  });

  it('explains an empty log', () => {
    const solo = example('solo');
    const markup = render(solo.combat, solo.step);
    expect(markup).toContain('No rolls yet.');
  });

  it('shows the kicker, groups and reasons in Polish', () => {
    const markup = renderWithLog({ catalogue: pl });
    expect(markup).toContain('Walka · <span lang="en">Glade</span> · Runda 1');
    for (const group of ['Pozycja', 'Walka', 'Przedmioty', 'Ucieczka']) {
      expect(markup).toContain(`aria-label="${group}"`);
    }
    expect(markup).toContain('Ostatnia runda · 2');
  });

  it('keeps the label shape with untransformed names and plural Damage', () => {
    const markup = renderWithLog({ catalogue: pl });
    // Label-shaped with the weapon name as presented, never case-transformed.
    expect(markup).toContain(
      'Atak: <span lang="en">Hunting Knife</span> (4+3+2=9 vs 8) — trafienie, 3 obrażenia.',
    );
    expect(markup).not.toContain('hunting knife');
    expect(markup).not.toContain('HUNTING KNIFE');
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

describe('healthPercent', () => {
  it('clamps the Health percentage to 0–100', () => {
    expect(healthPercent(9, 12)).toBe(75);
    expect(healthPercent(0, 12)).toBe(0);
    expect(healthPercent(20, 12)).toBe(100);
    expect(healthPercent(-3, 12)).toBe(0);
    expect(healthPercent(5, 0)).toBe(0);
  });
});
