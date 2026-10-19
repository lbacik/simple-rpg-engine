// The production command panel (P4, U2/U3/U4/U8): the shared UI C component
// both modes render. The player sees enemy Intents as the target list, picks
// stance, card and target with every disabled reason visible, and reads a
// forecast computed by the core's previewRound — identically with JavaScript
// (browser) and without it (server render of the same component, where every
// choice is a link and Confirm/Surrender are plain POSTs).

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { startCombat, submitRound } from '../src/engine/combat/index';
import type { CombatState } from '../src/engine/combat/index';
import { CommandPanel } from '../src/app/combat/command-panel';
import { parseSelection } from '../src/app/combat/selection';
import { duelChooseState, scenarioInitial } from './combat-core-fixtures';

function t1Choose(): CombatState {
  const started = startCombat(scenarioInitial('T1'));
  if (!started.ok) throw new Error('T1 must start');
  return started.state;
}

function t6Choose(): CombatState {
  const started = startCombat(scenarioInitial('T6'));
  if (!started.ok) throw new Error('T6 must start');
  return started.state;
}

function render(state: CombatState, query: Record<string, string> = {}, language: 'en' | 'pl' = 'en') {
  return renderToStaticMarkup(
    <CommandPanel
      state={state}
      language={language}
      selection={parseSelection(query, state)}
      basePath="/arena"
      confirmAction="/arena/confirm"
      surrenderAction="/arena/surrender"
    />,
  );
}

describe('CommandPanel layout (U2)', () => {
  it('renders three columns with the hero, the intents and the decision panel', () => {
    const markup = render(t1Choose());
    expect(markup).toContain('Your character');
    expect(markup).toContain('Open intents');
    expect(markup).toContain('Stance');
    expect(markup).toContain('Card or action');
    expect(markup).toContain('Round forecast');
    // Hero status: HP, stamina, stance, engagements.
    expect(markup).toContain('HP 40 / 40');
    expect(markup).toContain('10 / 10 stamina');
    expect(markup).toContain('Engaged with: e01');
    // The T1 brute holds the only attack slot.
    expect(markup).toContain('1/2 attack slots');
    expect(markup).toContain('Attack slot');
    // Range from the hero's perspective, as text and icon.
    expect(markup).toContain('Melee');
  });

  it('turns intents into the target list with a text and icon legality line', () => {
    const markup = render(t1Choose(), { stance: 'balanced', action: 'strike' });
    expect(markup).toContain('/arena?stance=balanced&amp;action=strike&amp;target=e01');
    expect(markup).toContain('✓');
    expect(markup).toContain('Legal target');
  });

  it('shows ranges from the companion perspective when selected', () => {
    const heroView = render(t6Choose(), { stance: 'balanced', action: 'strike' });
    const companionView = render(t6Choose(), { stance: 'balanced', action: 'strike', perspective: 'c01' });
    // e01 is engaged with the hero (Melee) but only shares the group with the
    // companion (Near): the perspective switch changes the range line.
    expect(heroView).toContain('Melee');
    expect(companionView).toContain('Near');
    expect(companionView).toContain('perspective=c01');
  });

  it('marks a waiting slot with guard and the frozen wait action', () => {
    const markup = render(t6Choose());
    expect(markup).toContain('Waiting · guard 3 · would Wait');
  });
});

describe('CommandPanel disabled reasons and stance carry-over (U3)', () => {
  it('shows every disabled reason on each card', () => {
    const markup = render(t1Choose());
    // The hero cannot shoot: the ability reason sits on the card itself.
    expect(markup).toContain('The hero cannot shoot.');
  });

  it('keeps the previous round stance selected', () => {
    const afterCounter = submitRound(t1Choose(), {
      round: 1,
      stance: 'defensive',
      actionId: 'counter',
      targetId: 'h01',
    });
    if (!afterCounter.ok) throw new Error('counter must commit');
    const next = afterCounter.state;
    expect(next.actors.find((a) => a.id === 'h01')!.stance).toBe('defensive');
    const markup = render(next, {});
    expect(markup).toContain('aria-current="true" href="/arena?stance=defensive"');
  });

  it('blocks an illegal combination with its reasons and a disabled confirm', () => {
    const markup = render(t1Choose(), { stance: 'defensive', action: 'heavy', target: 'e01' });
    expect(markup).toContain('This choice cannot be confirmed.');
    expect(markup).toContain('This stance disallows that action.');
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Play round<\/button>/);
  });
});

describe('CommandPanel forecast (U4)', () => {
  it('renders movement, blow arithmetic, after-round state and regeneration from the preview', () => {
    const markup = render(t1Choose(), { stance: 'balanced', action: 'strike', target: 'e01' });
    // Movement section.
    expect(markup).toContain('Movement');
    // Blow order with expandable arithmetic (attack vs defense, raw, armor, loss).
    // The hero's strike meets the aggressive brute's lowered defense (4 vs 0);
    // the brute's heavy answers at 5 vs 4.
    expect(markup).toContain('Blow order');
    expect(markup).toContain('<details>');
    expect(markup).toContain('4 vs 0');
    expect(markup).toContain('5 vs 4');
    expect(markup).toContain('raw 8');
    expect(markup).toContain('raw 12');
    // After-round HP/stamina and engagements.
    expect(markup).toContain('After the round');
    expect(markup).toContain('HP');
    expect(markup).toContain('stamina');
    expect(markup).toContain('Engagements after:');
    // Regeneration as an end-of-round effect.
    expect(markup).toContain('Regeneration');
    expect(markup).toContain('Regenerated: h01');
    // Confirm is enabled for a legal command.
    expect(markup).toMatch(/<button[^>]*>Play round<\/button>/);
    expect(markup).not.toMatch(/<button[^>]*disabled[^>]*>Play round<\/button>/);
  });

  it('shows the terminal cutoff with the unacted blows and no regeneration', () => {
    const wounded = t1Choose();
    const state = {
      ...wounded,
      actors: wounded.actors.map((a) => (a.id === 'e01' ? { ...a, hp: 1 } : a)),
    };
    const markup = render(state, { stance: 'balanced', action: 'strike', target: 'e01' });
    expect(markup).toContain('The fight ends here — these blows do not happen: e01.');
    expect(markup).toContain('No regeneration in a terminal round.');
    expect(markup).toContain('Victory');
  });

  it('renders cancellations with their reasons', () => {
    const started = startCombat(scenarioInitial('T6'));
    if (!started.ok) throw new Error('T6 must start');
    const base = started.state;
    const state = { ...base, actors: base.actors.map((a) => (a.id === 'e01' ? { ...a, hp: 1 } : a)) };
    const markup = render(state, { stance: 'balanced', action: 'feint', target: 'e01' });
    expect(markup).toContain('Cancelled: e01');
  });

  it('never mutates the input state while rendering', () => {
    const state = t1Choose();
    const before = JSON.stringify(state);
    render(state, { stance: 'balanced', action: 'strike', target: 'e01' });
    render(state, { stance: 'defensive', action: 'heavy', target: 'e01' });
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('CommandPanel without JavaScript (U8)', () => {
  it('offers stance, card and target choices as links that carry no step', () => {
    const markup = render(t1Choose());
    expect(markup).toContain('href="/arena?stance=aggressive"');
    expect(markup).toContain('href="/arena?stance=balanced&amp;action=heavy"');
    // Selection links are anchors, never state-changing forms; no step value
    // travels in the query.
    expect(markup).not.toContain('step=');
    expect(markup).not.toContain('<form method="get"');
  });

  it('confirms and surrenders through plain POSTs carrying the command', () => {
    const markup = render(t1Choose(), { stance: 'balanced', action: 'strike', target: 'e01' });
    expect(markup).toContain('<form action="/arena/confirm" method="post">');
    expect(markup).toContain('name="round"');
    expect(markup).toContain('name="stance"');
    expect(markup).toContain('name="action"');
    expect(markup).toContain('name="target"');
    expect(markup).toContain('<form action="/arena/surrender" method="post">');
  });

  it('renders the finished result instead of the forecast', () => {
    const wounded = t1Choose();
    const state = {
      ...wounded,
      actors: wounded.actors.map((a) => (a.id === 'e01' ? { ...a, hp: 1 } : a)),
    };
    const done = submitRound(state, { round: 1, stance: 'balanced', actionId: 'strike', targetId: 'e01' });
    if (!done.ok) throw new Error('must finish');
    expect(done.state.phase).toBe('FINISHED');
    const markup = render(done.state, {});
    expect(markup).toContain('Fight over');
    expect(markup).toContain('Victory');
    expect(markup).not.toContain('action="/arena/confirm"');
  });
});

describe('CommandPanel in Polish', () => {
  it('renders headings, badges and buttons in Polish', () => {
    const markup = render(t6Choose(), { action: 'strike' }, 'pl');
    expect(markup).toContain('Jawne zamiary');
    expect(markup).toContain('Czeka · ochrona 3');
    expect(markup).toContain('Rozegraj rundę');
    expect(markup).toContain('Poddaj walkę');
    expect(markup).toContain('Legalny cel');
  });
});

describe('CommandPanel duel fixture', () => {
  it('covers the T1-like duel with frozen intent, priority and cooldowns', () => {
    const markup = render(duelChooseState(), { stance: 'aggressive', action: 'strike', target: 'e01' });
    expect(markup).toContain('Strike → h01');
    expect(markup).toContain('priority 20');
    expect(markup).toContain('All cards ready');
  });
});
