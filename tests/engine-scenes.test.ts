// Engine unit tests for Scenes, Choices, Outcomes and narration with the
// Whispering Woods Scenario as the fixture (docs/spec/content-semantics.md,
// docs/spec/playthrough-state.md): activation, Conditions, Choices,
// Outcomes, Effects, transitions, the outcome-modal entry types and the {name}
// rendering rule. A small synthetic package covers what the example
// Scenario cannot reach without Tests, Combat or Endings (clear-flag,
// non-lethal and lethal damage, `once` in a repeatable Scene, `next` to a
// fired Scene, `move` to the current Location).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  applyAction,
  effectiveAttributes,
  evaluateCondition,
  onDemandScenes,
  renderNarration,
  OUTCOME_MODAL_ENTRY_TYPES,
  startPlaythrough,
  view,
  visibleChoices,
  type Action,
  type ApplyActionResult,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';

const rng: Rng = () => 1;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadWoods(): Scenario {
  const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
  if (!result.ok) {
    throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function startWoods(name = 'Robin', templateId = 'hunter'): { scenario: Scenario; state: PlaythroughState } {
  const scenario = loadWoods();
  const result = startPlaythrough(scenario, templateId, name, rng);
  if (!result.ok) throw new Error(`start failed: ${result.reason}`);
  return { scenario, state: result.state };
}

function succeed(
  scenario: Scenario,
  state: PlaythroughState,
  action: Action,
): { state: PlaythroughState; journal: Extract<ApplyActionResult, { ok: true }>['journal'] } {
  const result = applyAction(scenario, state, action, rng);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`action failed: ${result.reason}`);
  return result;
}

function choose(scenario: Scenario, state: PlaythroughState, choiceId: string) {
  return succeed(scenario, state, { kind: 'choose', choiceId, expectedStep: state.step });
}

function travel(scenario: Scenario, state: PlaythroughState, target: string) {
  return succeed(scenario, state, {
    kind: 'travel',
    targetLocationId: target,
    expectedStep: state.step,
  });
}

function openScene(scenario: Scenario, state: PlaythroughState, sceneId: string) {
  return succeed(scenario, state, {
    kind: 'open-scene',
    sceneId,
    expectedStep: state.step,
  });
}

function sceneOf(scenario: Scenario, state: PlaythroughState) {
  const gameView = view(scenario, state);
  expect(gameView.kind).toBe('scene');
  if (gameView.kind !== 'scene') throw new Error('expected a Scene view');
  return gameView;
}

function locationOf(scenario: Scenario, state: PlaythroughState) {
  const gameView = view(scenario, state);
  expect(gameView.kind).toBe('location');
  if (gameView.kind !== 'location') throw new Error('expected a Location view');
  return gameView;
}

describe('scene activation', () => {
  it('starts whispering-woods with its opening on-enter Scene, fired at activation', () => {
    const { scenario, state } = startWoods();
    expect(state.currentLocationId).toBe('ashford');
    expect(state.activeSceneId).toBe('arrival');
    expect(state.firedScenes).toEqual(['arrival']);
    const gameView = sceneOf(scenario, state);
    expect(gameView.sceneId).toBe('arrival');
    expect(gameView.title).toBe('The Bell of Ashford');
  });

  it('does not fire the opening Scene again on returning', () => {
    const { scenario, state: started } = startWoods();
    const listened = choose(scenario, started, 'listen').state;
    expect(listened.activeSceneId).toBe('elder-plea');
    expect(listened.firedScenes).toEqual(['arrival', 'elder-plea']);
    const accepted = choose(scenario, listened, 'accept').state;
    expect(accepted.activeSceneId).toBe(null);
    // The cart track opens once the quest is accepted.
    expect(locationOf(scenario, accepted).exits).toEqual([
      { targetLocationId: 'forest-edge', label: 'Take the cart track towards the woods' },
    ]);
    const atEdge = travel(scenario, accepted, 'forest-edge').state;
    expect(atEdge.activeSceneId).toBe('whispers');
    const pressed = choose(scenario, atEdge, 'press-on').state;
    expect(pressed.activeSceneId).toBe(null);
    const back = travel(scenario, pressed, 'ashford');
    // Ashford re-entered: the once-only arrival stays silent, while the
    // village-return Scene (visited forest-edge) fires.
    expect(back.state.activeSceneId).toBe('village-return');
    expect(back.state.firedScenes.filter((id) => id === 'arrival')).toEqual(['arrival']);
    expect(back.journal.map((entry) => entry.type)).toEqual(['travel', 'scene']);
  });

  it('offers on-demand Scenes by title in listed order', () => {
    const { scenario, state: started } = startWoods();
    const seeded: PlaythroughState = {
      ...started,
      currentLocationId: 'ruined-chapel',
      activeSceneId: null,
      visited: [...started.visited, 'ruined-chapel'],
      firedScenes: [...started.firedScenes, 'chapel-threshold'],
      character: { ...started.character, health: 10 },
    };
    // Listed order in ruined-chapel is threshold (on-enter), altar, prayer.
    expect(onDemandScenes(scenario, seeded)).toEqual([
      { sceneId: 'chapel-altar', title: 'The Altar' },
      { sceneId: 'chapel-prayer', title: 'Kneel at the Altar' },
    ]);
    expect(locationOf(scenario, seeded).onDemandScenes).toHaveLength(2);
    // At full Health the prayer is not offered.
    const full: PlaythroughState = {
      ...seeded,
      character: { ...seeded.character, health: 12 },
    };
    expect(onDemandScenes(scenario, full)).toEqual([{ sceneId: 'chapel-altar', title: 'The Altar' }]);
  });

  it('opens an on-demand Scene once, then refuses it as fired', () => {
    const { scenario, state: started } = startWoods();
    const accepted = choose(scenario, choose(scenario, started, 'listen').state, 'accept').state;
    expect(onDemandScenes(scenario, accepted)).toEqual([
      { sceneId: 'well-rumours', title: 'Gossip at the Well' },
    ]);
    const opened = openScene(scenario, accepted, 'well-rumours');
    expect(opened.state.activeSceneId).toBe('well-rumours');
    expect(opened.state.firedScenes).toContain('well-rumours');
    expect(opened.journal.map((entry) => entry.type)).toEqual(['scene']);
    const left = choose(scenario, opened.state, 'leave');
    expect(left.state.activeSceneId).toBe(null);
    // The empty Outcome appends only the Choice taken, then the Location view.
    expect(left.journal.map((entry) => entry.type)).toEqual(['choice']);
    expect(
      applyAction(
        scenario,
        left.state,
        {
          kind: 'open-scene',
          sceneId: 'well-rumours',
          expectedStep: left.state.step,
        },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'illegal-action' });
  });

  it('refires a repeatable on-enter Scene on every entry until its flag is set', () => {
    const { scenario, state: started } = startWoods();
    const seeded: PlaythroughState = {
      ...started,
      currentLocationId: 'ruined-chapel',
      activeSceneId: null,
      visited: [...started.visited, 'ruined-chapel'],
      firedScenes: [...started.firedScenes, 'chapel-threshold'],
    };
    const first = travel(scenario, seeded, 'barrow-mound');
    expect(first.state.activeSceneId).toBe('barrow-door');
    const stepped = choose(scenario, first.state, 'step-away');
    expect(stepped.state.activeSceneId).toBe(null);
    expect(stepped.journal.map((entry) => entry.type)).toEqual(['choice']);
    const backToChapel = travel(scenario, stepped.state, 'ruined-chapel');
    expect(backToChapel.state.activeSceneId).toBe(null);
    const second = travel(scenario, backToChapel.state, 'barrow-mound');
    expect(second.state.activeSceneId).toBe('barrow-door');
    expect(second.journal.map((entry) => entry.type)).toEqual(['travel', 'scene']);
  });

  it('does not re-evaluate on-enter Scenes when play returns to the Location view', () => {
    const { scenario, state: started } = startWoods();
    const seeded: PlaythroughState = {
      ...started,
      currentLocationId: 'ruined-chapel',
      activeSceneId: null,
      visited: [...started.visited, 'ruined-chapel'],
      firedScenes: [...started.firedScenes, 'chapel-threshold'],
    };
    const entered = travel(scenario, seeded, 'barrow-mound').state;
    const left = choose(scenario, entered, 'step-away').state;
    // Viewing again changes nothing: still the Location view, nothing fired.
    expect(view(scenario, left).kind).toBe('location');
    expect(left.activeSceneId).toBe(null);
  });
});

describe('choices', () => {
  function atWhispers(templateId: string): { scenario: Scenario; state: PlaythroughState } {
    const { scenario, state: started } = startWoods('Robin', templateId);
    const listened = choose(scenario, started, 'listen').state;
    const accepted = choose(scenario, listened, 'accept').state;
    return { scenario, state: travel(scenario, accepted, 'forest-edge').state };
  }

  it('gates a Choice by flag only after the Outcome sets it, and hides test-gated almanac without the item', () => {
    const { scenario, state } = atWhispers('hunter');
    expect(state.activeSceneId).toBe('whispers');
    const gameView = sceneOf(scenario, state);
    expect(gameView.choices.map((choice) => choice.id)).toEqual(['listen', 'press-on']);
    // The almanac Choice needs the scholar's starting item.
    const scholar = atWhispers('scholar');
    expect(
      sceneOf(scholar.scenario, scholar.state).choices.map((choice) => choice.id),
    ).toEqual(['listen', 'consult-almanac', 'press-on']);
  });

  it('gates the barrow-door Choices by item and effective attribute', () => {
    const { scenario, state: started } = startWoods();
    const seeded: PlaythroughState = {
      ...started,
      currentLocationId: 'barrow-mound',
      activeSceneId: 'barrow-door',
      visited: [...started.visited, 'barrow-mound'],
      firedScenes: [...started.firedScenes, 'barrow-door'],
    };
    const scene = scenario.scenesById['barrow-door'];
    if (scene === undefined) throw new Error('missing barrow-door');
    // Hunter (Might 1, no key): the key and force Choices stay hidden.
    expect(visibleChoices(scenario, seeded, scene).map((choice) => choice.id)).toEqual([
      'read-runes',
      'step-away',
    ]);
    const keyed: PlaythroughState = {
      ...seeded,
      inventory: { ...seeded.inventory, 'barrow-key': 1 },
    };
    expect(visibleChoices(scenario, keyed, scene).map((choice) => choice.id)).toEqual([
      'use-key',
      'read-runes',
      'step-away',
    ]);
    // Soldier (Might 3) can force the slab.
    const soldier = startWoods('Ash', 'soldier');
    const soldierSeeded: PlaythroughState = { ...seeded, ...{ character: soldier.state.character } };
    expect(visibleChoices(scenario, soldierSeeded, scene).map((choice) => choice.id)).toEqual([
      'read-runes',
      'force-door',
      'step-away',
    ]);
  });

  it('offers a single Continue when no Choice is visible, advancing step with no Journal', () => {
    const { scenario, state: started } = startWoods();
    const listened = choose(scenario, started, 'listen').state;
    const accepted = choose(scenario, listened, 'accept').state;
    const atEdge = travel(scenario, accepted, 'forest-edge').state;
    const pressed = choose(scenario, atEdge, 'press-on').state;
    const returned = travel(scenario, pressed, 'ashford').state;
    expect(returned.activeSceneId).toBe('village-return');
    expect(sceneOf(scenario, returned).choices).toEqual([]);
    const step = returned.step;
    const continued = succeed(scenario, returned, {
      kind: 'continue',
      expectedStep: step,
    });
    expect(continued.state.activeSceneId).toBe(null);
    expect(continued.state.step).toBe(step + 1);
    expect(continued.journal).toEqual([]);
    expect(view(scenario, continued.state).kind).toBe('location');
  });

  it('rejects Continue while a Choice is visible and actions outside their position', () => {
    const { scenario, state: started } = startWoods();
    // Arrival shows Choices: no implicit Continue.
    expect(
      applyAction(scenario, started, { kind: 'continue', expectedStep: started.step }, rng),
    ).toEqual({ ok: false, reason: 'illegal-action' });
    // Choosing and opening belong to the Scene position and Location view.
    expect(
      applyAction(
        scenario,
        started,
        {
          kind: 'open-scene',
          sceneId: 'well-rumours',
          expectedStep: started.step,
        },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'illegal-action' });
    expect(
      applyAction(
        scenario,
        started,
        {
          kind: 'travel',
          targetLocationId: 'forest-edge',
          expectedStep: started.step,
        },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'illegal-action' });
    const accepted = choose(scenario, choose(scenario, started, 'listen').state, 'accept').state;
    expect(
      applyAction(
        scenario,
        accepted,
        {
          kind: 'choose',
          choiceId: 'listen',
          expectedStep: accepted.step,
        },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'illegal-action' });
    expect(
      applyAction(
        scenario,
        accepted,
        {
          kind: 'continue',
          expectedStep: accepted.step,
        },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'illegal-action' });
    // Stale steps are rejected for the new actions too.
    expect(
      applyAction(scenario, started, { kind: 'continue', expectedStep: 99 }, rng),
    ).toEqual({ ok: false, reason: 'stale-step' });
  });

  it('shows no exits while a Scene is active', () => {
    const { scenario, state: started } = startWoods();
    const gameView = view(scenario, started);
    expect(gameView.kind).toBe('scene');
    expect(gameView).not.toHaveProperty('exits');
    expect(gameView).not.toHaveProperty('onDemandScenes');
  });
});

describe('outcomes, effects and transitions', () => {
  it('applies narration, effects in order and no transition on accepting the plea', () => {
    const { scenario, state: started } = startWoods();
    expect(started.inventory).toEqual({
      'hunting-bow': 1,
      'hunters-cloak': 1,
      'healing-herbs': 2,
    });
    const listened = choose(scenario, started, 'listen');
    expect(listened.journal.map((entry) => entry.type)).toEqual(['choice', 'scene']);
    expect(listened.state.activeSceneId).toBe('elder-plea');
    const accepted = choose(scenario, listened.state, 'accept');
    expect(accepted.journal).toEqual([
      {
        type: 'choice',
        lang: 'en',
        sceneId: 'elder-plea',
        choiceId: 'accept',
        text: 'Promise to find Mira.',
      },
      {
        type: 'outcome',
        lang: 'en',
        text: 'Brenna presses a bundle of herbs into your hands. "The cart track\nleads to the forest edge. Go with the saints."\n',
      },
      {
        type: 'state-change',
        lang: 'en',
        change: 'item-received',
        itemId: 'healing-herbs',
        name: 'Healing Herbs',
        amount: 1,
      },
      {
        type: 'state-change',
        lang: 'en',
        change: 'revealed',
        itemId: 'forest-edge',
        name: 'Forest Edge',
      },
    ]);
    expect(accepted.state.flags).toEqual(['quest-accepted']);
    expect(accepted.state.inventory['healing-herbs']).toBe(3);
    expect(accepted.state.revealed).toEqual(['forest-edge']);
    // No transition: back to the Location view without re-firing on-enter.
    expect(accepted.state.activeSceneId).toBe(null);
    expect(accepted.state.currentLocationId).toBe('ashford');
    expect(accepted.state.step).toBe(2);
  });

  it('takes the last copy and moves on turning the bronze key', () => {
    const { scenario, state: started } = startWoods();
    const seeded: PlaythroughState = {
      ...started,
      currentLocationId: 'barrow-mound',
      activeSceneId: 'barrow-door',
      visited: [...started.visited, 'barrow-mound'],
      firedScenes: [...started.firedScenes, 'barrow-door'],
      inventory: { ...started.inventory, 'barrow-key': 1 },
    };
    const turned = choose(scenario, seeded, 'use-key');
    expect(turned.journal.map((entry) => entry.type)).toEqual([
      'choice',
      'outcome',
      'state-change',
      'scene',
    ]);
    expect(turned.journal[2]).toEqual({
      type: 'state-change',
      lang: 'en',
      change: 'item-lost',
      itemId: 'barrow-key',
      name: 'Barrow Key',
      amount: 1,
    });
    expect(turned.state.inventory['barrow-key']).toBeUndefined();
    expect(turned.state.flags).toContain('barrow-open');
    // The move enters the tomb and fires the wight.
    expect(turned.state.currentLocationId).toBe('barrow-tomb');
    expect(turned.state.activeSceneId).toBe('wight-awakens');
  });

  it('moves without narration on withdrawing from the camp', () => {
    const { scenario, state: started } = startWoods();
    const listened = choose(scenario, started, 'listen').state;
    const accepted = choose(scenario, listened, 'accept').state;
    const atEdge = travel(scenario, accepted, 'forest-edge').state;
    const pressed = choose(scenario, atEdge, 'press-on').state;
    const camp = travel(scenario, pressed, 'hunters-camp');
    expect(camp.state.activeSceneId).toBe('camp-standoff');
    expect(camp.journal.map((entry) => entry.type)).toEqual(['travel', 'scene']);
    const withdrawn = choose(scenario, camp.state, 'withdraw');
    expect(withdrawn.journal.map((entry) => entry.type)).toEqual(['choice']);
    expect(withdrawn.state.currentLocationId).toBe('forest-edge');
    expect(withdrawn.state.activeSceneId).toBe(null);
  });

  it('heals up to the cap of 12 at the chapel altar', () => {
    const { scenario, state: started } = startWoods();
    const seeded: PlaythroughState = {
      ...started,
      currentLocationId: 'ruined-chapel',
      activeSceneId: null,
      visited: [...started.visited, 'ruined-chapel'],
      firedScenes: [...started.firedScenes, 'chapel-threshold'],
      character: { ...started.character, health: 10 },
    };
    const opened = openScene(scenario, seeded, 'chapel-prayer');
    const prayed = choose(scenario, opened.state, 'pray');
    expect(prayed.state.character.health).toBe(12);
    expect(prayed.journal.map((entry) => entry.type)).toEqual([
      'choice',
      'outcome',
      'state-change',
    ]);
    expect(prayed.journal[2]).toEqual({
      type: 'state-change',
      lang: 'en',
      change: 'health-gained',
      amount: 2,
    });
  });

  it('gives the charm and reveals the mound at the chapel altar', () => {
    const { scenario, state: started } = startWoods();
    const seeded: PlaythroughState = {
      ...started,
      currentLocationId: 'ruined-chapel',
      activeSceneId: null,
      visited: [...started.visited, 'ruined-chapel'],
      firedScenes: [...started.firedScenes, 'chapel-threshold'],
    };
    const opened = openScene(scenario, seeded, 'chapel-altar');
    const taken = choose(scenario, opened.state, 'take-charm');
    expect(taken.state.inventory['silver-charm']).toBe(1);
    expect(taken.state.revealed).toEqual(['barrow-mound']);
    expect(taken.journal.map((entry) => entry.type)).toEqual([
      'choice',
      'outcome',
      'state-change',
      'state-change',
    ]);
    expect(taken.journal[2]).toEqual({
      type: 'state-change',
      lang: 'en',
      change: 'item-received',
      itemId: 'silver-charm',
      name: 'Silver Charm',
      amount: 1,
    });
    expect(taken.journal[3]).toEqual({
      type: 'state-change',
      lang: 'en',
      change: 'revealed',
      itemId: 'barrow-mound',
      name: 'Barrow Mound',
    });
  });

  it('treats `next` to an already fired non-repeatable Scene as a no-op', () => {
    const { scenario, state: started } = startWoods();
    const listened = choose(scenario, started, 'listen').state;
    const accepted = choose(scenario, listened, 'accept').state;
    // Back in the arrival Scene (as after a reload), `listen` leads next to
    // the already fired elder-plea: Choice only, then the Location view.
    const revisit: PlaythroughState = { ...accepted, activeSceneId: 'arrival' };
    const repeated = choose(scenario, revisit, 'listen');
    expect(repeated.journal.map((entry) => entry.type)).toEqual(['choice']);
    expect(repeated.state.activeSceneId).toBe(null);
    expect(repeated.state.currentLocationId).toBe('ashford');
    expect(repeated.state.firedScenes).toEqual(accepted.firedScenes);
  });

  it('starts Combat, and rejects hidden or taken Choices', () => {
    const { scenario, state: started } = startWoods();
    // Refusing Brenna ends the Playthrough on the walked-away Ending.
    const refused = choose(scenario, started, 'refuse');
    expect(refused.state.status).toBe('ended');
    expect(refused.state.endingId).toBe('walked-away');
    expect(started.step).toBe(0);
    // The whispers Test resolves: hunter Wits 2 with 1 + 1 fails easy 7.
    const listened = choose(scenario, started, 'listen').state;
    const accepted = choose(scenario, listened, 'accept').state;
    const atEdge = travel(scenario, accepted, 'forest-edge').state;
    const heard = applyAction(
      scenario,
      atEdge,
      {
        kind: 'choose',
        choiceId: 'listen',
        expectedStep: atEdge.step,
      },
      rng,
    );
    expect(heard.ok).toBe(true);
    if (!heard.ok) throw new Error(`whispers listen failed: ${heard.reason}`);
    expect(heard.journal.map((entry) => entry.type)).toEqual(['choice', 'test', 'outcome']);
    expect(heard.journal[1]).toMatchObject({ type: 'test', total: 4, success: false });
    expect(heard.state.flags).not.toContain('knows-wight-name');
    const pressed = choose(scenario, atEdge, 'press-on').state;
    const hollow = travel(scenario, pressed, 'wolf-hollow').state;
    expect(hollow.activeSceneId).toBe('wolf-den');
    // S4 (Combat MVP 1.0): the `start-combat` transition no longer enters
    // Combat. Choosing the fight clears the Scene, journals the Choice and
    // leaves the hollow-wolf Encounter undefeated and repeatable until the P6
    // adapter lands.
    const fought = applyAction(
      scenario,
      hollow,
      {
        kind: 'choose',
        choiceId: 'fight',
        expectedStep: hollow.step,
      },
      rng,
    );
    expect(fought.ok).toBe(true);
    if (!fought.ok) throw new Error(`wolf-den fight failed: ${fought.reason}`);
    expect(fought.state.activeSceneId).toBeNull();
    expect(fought.state.encounters['hollow-wolf']).toBeUndefined();
    expect(fought.journal.map((entry) => entry.type)).toEqual(['choice']);
    // A hidden Choice cannot be taken, even by id.
    const keyed: PlaythroughState = { ...hollow };
    expect(
      applyAction(
        scenario,
        keyed,
        {
          kind: 'choose',
          choiceId: 'no-such-choice',
          expectedStep: hollow.step,
        },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'illegal-action' });
    // Retreating moves back to the forest edge without re-firing whispers.
    const retreated = choose(scenario, hollow, 'retreat');
    expect(retreated.state.currentLocationId).toBe('forest-edge');
    expect(retreated.state.activeSceneId).toBe(null);
  });
});

describe('conditions: every fact', () => {
  it('reads flags, visits, fired Scenes and defeated Encounters', () => {
    const { scenario, state: started } = startWoods();
    expect(evaluateCondition(scenario, started, { flag: 'quest-accepted' })).toBe(false);
    expect(evaluateCondition(scenario, started, { visited: 'forest-edge' })).toBe(false);
    expect(evaluateCondition(scenario, started, { fired: 'arrival' })).toBe(true);
    expect(evaluateCondition(scenario, started, { defeated: 'camp-bandit' })).toBe(false);
    const flagged: PlaythroughState = {
      ...started,
      flags: ['quest-accepted'],
      visited: [...started.visited, 'forest-edge'],
      encounters: { 'camp-bandit': { 'bandit-archer': 5 } },
    };
    expect(evaluateCondition(scenario, flagged, { flag: 'quest-accepted' })).toBe(true);
    expect(evaluateCondition(scenario, flagged, { visited: 'forest-edge' })).toBe(true);
    // The bandit archer falls at 6 damage taken; 5 is not defeated.
    expect(evaluateCondition(scenario, flagged, { defeated: 'camp-bandit' })).toBe(false);
    const felled: PlaythroughState = {
      ...flagged,
      encounters: { 'camp-bandit': { 'bandit-archer': 6 } },
    };
    expect(evaluateCondition(scenario, felled, { defeated: 'camp-bandit' })).toBe(true);
    // A defeated bandit (or a gone one) opens the search through `any`.
    expect(
      onDemandScenes(scenario, {
        ...felled,
        currentLocationId: 'hunters-camp',
        activeSceneId: null,
      }).map((scene) => scene.sceneId),
    ).toEqual(['search-camp']);
  });

  it('reads items and effective attributes', () => {
    const hunter = startWoods('Robin', 'hunter');
    const scholar = startWoods('Wren', 'scholar');
    expect(evaluateCondition(hunter.scenario, hunter.state, { has: { item: 'old-almanac' } })).toBe(
      false,
    );
    expect(
      evaluateCondition(scholar.scenario, scholar.state, { has: { item: 'old-almanac' } }),
    ).toBe(true);
    expect(
      evaluateCondition(scholar.scenario, scholar.state, {
        has: { item: 'healing-herbs', atLeast: 3 },
      }),
    ).toBe(false);
    // Effective attributes count Equipment bonuses: the scholar's staff
    // raises Agility from 1 to 2, the hunter's cloak from 3 to 4.
    expect(effectiveAttributes(scholar.scenario, scholar.state)).toMatchObject({
      agility: 2,
      wits: 3,
    });
    expect(effectiveAttributes(hunter.scenario, hunter.state).agility).toBe(4);
    expect(
      evaluateCondition(hunter.scenario, hunter.state, {
        attribute: { name: 'might', atLeast: 2 },
      }),
    ).toBe(false);
    const soldier = startWoods('Ash', 'soldier');
    expect(
      evaluateCondition(soldier.scenario, soldier.state, {
        attribute: { name: 'might', atLeast: 2 },
      }),
    ).toBe(true);
  });

  it('reads health and combines facts with all, any and not', () => {
    const { scenario, state: started } = startWoods();
    expect(evaluateCondition(scenario, started, { health: { atLeast: 12 } })).toBe(true);
    expect(evaluateCondition(scenario, started, { health: { atMost: 11 } })).toBe(false);
    const wounded: PlaythroughState = {
      ...started,
      character: { ...started.character, health: 9 },
    };
    expect(evaluateCondition(scenario, wounded, { health: { atMost: 11 } })).toBe(true);
    expect(evaluateCondition(scenario, started, { not: { flag: 'quest-accepted' } })).toBe(true);
    expect(
      evaluateCondition(scenario, started, {
        all: [{ fired: 'arrival' }, { not: { flag: 'quest-accepted' } }],
      }),
    ).toBe(true);
    expect(
      evaluateCondition(scenario, started, {
        any: [{ flag: 'quest-accepted' }, { visited: 'forest-edge' }],
      }),
    ).toBe(false);
    const flagged: PlaythroughState = {
      ...started,
      flags: ['quest-accepted'],
      visited: [...started.visited, 'forest-edge'],
    };
    expect(
      evaluateCondition(scenario, flagged, {
        all: [{ flag: 'quest-accepted' }, { visited: 'forest-edge' }],
      }),
    ).toBe(true);
    expect(
      evaluateCondition(scenario, flagged, {
        any: [{ flag: 'quest-accepted' }, { visited: 'barrow-tomb' }],
      }),
    ).toBe(true);
  });
});

describe('outcome modal derivation and narration', () => {
  it('derives the modal entries from the latest step entries of the listed types only', () => {
    // S4: the Combat end and Enemy-defeated entries left with the tactical
    // Combat; the P6 adapter re-adds the v3 Combat entries.
    expect([...OUTCOME_MODAL_ENTRY_TYPES].sort()).toEqual(
      ['outcome', 'state-change', 'test'].sort(),
    );
    const { scenario, state: started } = startWoods();
    const listened = choose(scenario, started, 'listen').state;
    const accepted = choose(scenario, listened, 'accept').state;
    // Step 1 produced a Choice and Scene narration: no outcome entries.
    const stepOne = listened.step;
    expect(stepOne).toBe(1);
    // Step 2 produced the Outcome narration and three state changes.
    const outcomeStep = accepted.step;
    expect(
      [
        { step: stepOne, type: 'choice' },
        { step: stepOne, type: 'scene' },
        { step: outcomeStep, type: 'choice' },
        { step: outcomeStep, type: 'outcome' },
        { step: outcomeStep, type: 'state-change' },
      ]
        .filter((entry) => entry.step === outcomeStep && OUTCOME_MODAL_ENTRY_TYPES.has(entry.type))
        .map((entry) => entry.type),
    ).toEqual(['outcome', 'state-change']);
  });

  it('shows a markup-bearing Character name literally in narration', () => {
    const { scenario, state: started } = startWoods('<b>*Ann*</b>');
    const listened = choose(scenario, started, 'listen').state;
    const gameView = sceneOf(scenario, listened);
    expect(gameView.text).toContain('{name}');
    const html = renderNarration(gameView.text, '<b>*Ann*</b>');
    expect(html).toContain('&lt;b&gt;*Ann*&lt;/b&gt;');
    // The name itself contributes no tags or emphasis even though it holds
    // markup characters (the text around it has authored *whispering*
    // emphasis, which correctly renders as <em>).
    expect(html).not.toContain('<b>');
  });
});

describe('synthetic package: remaining effects and transitions', () => {
  function loadSynthetic(): Scenario {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-scenes-'));
    const scenarioDir = path.join(dir, 'synth');
    const write = (relative: string, content: string): void => {
      const full = path.join(scenarioDir, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    };
    write(
      'scenario.yaml',
      [
        'schemaVersion: 1',
        'id: synth',
        'title: Synth',
        'description: A synthetic package for Scene tests.',
        'version: "1.0.0"',
        'language: en',
        'startLocation: hall',
        'deathEnding: death',
        'flags: [f, m]',
        'locations:',
        '  - locations/hall.yaml',
        'scenes:',
        '  - scenes/echo.yaml',
        '  - scenes/follow.yaml',
        '  - scenes/counter.yaml',
        'templates:',
        '  - templates.yaml',
        'endings:',
        '  - endings.yaml',
        'items:',
        '  - items.yaml',
        '',
      ].join('\n'),
    );
    write('locations/hall.yaml', 'id: hall\nname: Hall\ndescription: A bare hall.\nscenes: [echo, counter]\n');
    write(
      'scenes/echo.yaml',
      [
        'id: echo',
        'title: Echo',
        'trigger: on-enter',
        'text: An echo answers.',
        'choices:',
        '  - id: stay',
        '    text: Pace in circles.',
        '    outcome:',
        '      text: You pace.',
        '      move: hall',
        '  - id: again',
        '    text: Call again.',
        '    outcome:',
        '      next: follow',
        '  - id: done',
        '    text: Fall silent.',
        '',
      ].join('\n'),
    );
    write(
      'scenes/follow.yaml',
      [
        'id: follow',
        'title: Follow',
        'text: It follows.',
        'choices:',
        '  - id: repeat',
        '    text: Call yet again.',
        '    outcome:',
        '      next: follow',
        '  - id: back',
        '    text: Head back.',
        '    outcome:',
        '      move: hall',
        '  - id: leave',
        '    text: Let it fade.',
        '',
      ].join('\n'),
    );
    write(
      'scenes/counter.yaml',
      [
        'id: counter',
        'title: Counter',
        'trigger: on-demand',
        'repeatable: true',
        'text: A counting room.',
        'choices:',
        '  - id: mark',
        '    text: Mark the wall.',
        '    once: true',
        '    outcome:',
        '      effects:',
        '        - set-flag: m',
        '  - id: setf',
        '    text: Raise the flag.',
        '    outcome:',
        '      effects:',
        '        - set-flag: f',
        '  - id: clearf',
        '    text: Lower the flag.',
        '    outcome:',
        '      effects:',
        '        - clear-flag: f',
        '  - id: hurt',
        '    text: Strike your palm.',
        '    outcome:',
        '      effects:',
        '        - damage: 2',
        '  - id: kill',
        '    text: Fall on your sword.',
        '    outcome:',
        '      effects:',
        '        - damage: 12',
        '  - id: mend',
        '    text: Bind your wounds.',
        '    outcome:',
        '      effects:',
        '        - heal: 3',
        '  - id: take-one',
        '    text: Drop one sword.',
        '    outcome:',
        '      effects:',
        '        - take-item: { item: sword }',
        '  - id: take-all',
        '    text: Drop every sword.',
        '    outcome:',
        '      effects:',
        '        - take-item: { item: sword, quantity: 2 }',
        '  - id: survey',
        '    text: Survey the familiar hall.',
        '    outcome:',
        '      effects:',
        '        - reveal: hall',
        '  - id: gamble',
        '    text: Toss a coin.',
        '    test:',
        '      attribute: wits',
        '      difficulty: ordinary',
        "      success: { text: 'Win.' }",
        "      failure: { text: 'Lose.' }",
        '  - id: out',
        '    text: Step back out.',
        '  - id: finish',
        '    text: Declare victory.',
        '    outcome:',
        '      end: home',
        '',
      ].join('\n'),
    );
    write(
      'items.yaml',
      '- id: sword\n  kind: equipment\n  name: Sword\n  slot: weapon\n  damage: 3\n',
    );
    write(
      'templates.yaml',
      [
        '- id: hero',
        '  name: Hero',
        '  attributes: { might: 2, agility: 2, wits: 1, presence: 1 }',
        '  items:',
        '    - { item: sword, quantity: 2 }',
        '',
      ].join('\n'),
    );
    write(
      'endings.yaml',
      '- id: death\n  kind: defeat\n  title: Gone\n  text: The end.\n- id: home\n  kind: victory\n  title: Home\n  text: You made it.\n',
    );
    const result = loadScenario(scenarioDir);
    if (!result.ok) {
      throw new Error(`synthetic fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
    }
    return result.scenario;
  }

  function startSynthetic(): { scenario: Scenario; state: PlaythroughState } {
    const scenario = loadSynthetic();
    const result = startPlaythrough(scenario, 'hero', 'Alex', rng);
    if (!result.ok) throw new Error(`start failed: ${result.reason}`);
    expect(result.journal).toEqual([
      { type: 'scene', lang: 'en', sceneId: 'echo', text: 'An echo answers.' },
    ]);
    return { scenario, state: result.state };
  }

  function atCounter(): { scenario: Scenario; state: PlaythroughState } {
    const { scenario, state: started } = startSynthetic();
    const silent = choose(scenario, started, 'done').state;
    return { scenario, state: openScene(scenario, silent, 'counter').state };
  }

  it('moves to the current Location, re-entering without refiring', () => {
    const { scenario, state: started } = startSynthetic();
    const paced = choose(scenario, started, 'stay');
    expect(paced.journal).toEqual([
      { type: 'choice', lang: 'en', sceneId: 'echo', choiceId: 'stay', text: 'Pace in circles.' },
      { type: 'outcome', lang: 'en', text: 'You pace.' },
    ]);
    expect(paced.state.currentLocationId).toBe('hall');
    expect(paced.state.activeSceneId).toBe(null);
    expect(paced.state.visited).toEqual(['hall']);
  });

  it('treats `next` to the fired follow-on Scene as a no-op', () => {
    const { scenario, state: started } = startSynthetic();
    const called = choose(scenario, started, 'again');
    expect(called.state.activeSceneId).toBe('follow');
    expect(called.journal.map((entry) => entry.type)).toEqual(['choice', 'scene']);
    const repeated = choose(scenario, called.state, 'repeat');
    expect(repeated.journal.map((entry) => entry.type)).toEqual(['choice']);
    expect(repeated.state.activeSceneId).toBe(null);
    expect(repeated.state.firedScenes).toEqual(called.state.firedScenes);
    // Leaving the follow-on by `move` works the same way.
    const revisit: PlaythroughState = { ...called.state, activeSceneId: 'follow' };
    const headed = choose(scenario, revisit, 'back');
    expect(headed.state.currentLocationId).toBe('hall');
    expect(headed.state.activeSceneId).toBe(null);
  });

  it('hides a `once` Choice after taking it, also in the repeatable Scene', () => {
    const { scenario, state } = atCounter();
    const marked = choose(scenario, state, 'mark');
    // Flag changes are the author's internal memory: the flag is set but no
    // state-change entry is presented.
    expect(marked.journal).toEqual([
      { type: 'choice', lang: 'en', sceneId: 'counter', choiceId: 'mark', text: 'Mark the wall.' },
    ]);
    expect(marked.state.flags).toEqual(['m']);
    expect(
      applyAction(
        scenario,
        marked.state,
        {
          kind: 'choose',
          choiceId: 'mark',
          expectedStep: marked.state.step,
        },
        rng,
      ),
    ).toEqual({ ok: false, reason: 'illegal-action' });
    const counter = scenario.scenesById['counter'];
    if (counter === undefined) throw new Error('missing counter');
    expect(
      visibleChoices(scenario, marked.state, counter).map((choice) => choice.id),
    ).not.toContain('mark');
    // Leaving and reopening the repeatable Scene keeps it hidden.
    // Taking mark closed the Scene (no transition goes back to the Location
    // view), so reopen the repeatable counter before stepping back out.
    const backInside = openScene(scenario, marked.state, 'counter').state;
    const out = choose(scenario, backInside, 'out').state;
    const reopened = openScene(scenario, out, 'counter').state;
    expect(
      visibleChoices(scenario, reopened, counter).map((choice) => choice.id),
    ).not.toContain('mark');
  });

  it('sets and clears flags', () => {
    const { scenario, state } = atCounter();
    const raised = choose(scenario, state, 'setf');
    expect(raised.state.flags).toEqual(['f']);
    // Flag changes are never presented: only the Choice is recorded.
    expect(raised.journal.map((entry) => entry.type)).toEqual(['choice']);
    // Raising the flag closed the Scene (no transition), so reopen the
    // repeatable counter before lowering the flag again.
    const lowered = choose(scenario, openScene(scenario, raised.state, 'counter').state, 'clearf');
    expect(lowered.state.flags).toEqual([]);
    expect(lowered.journal.map((entry) => entry.type)).toEqual(['choice']);
  });

  it('damages without killing, and lethal damage ends on the death Ending', () => {
    const { scenario, state } = atCounter();
    const hurt = choose(scenario, state, 'hurt');
    expect(hurt.state.character.health).toBe(10);
    expect(hurt.journal[1]).toEqual({
      type: 'state-change',
      lang: 'en',
      change: 'health-lost',
      amount: 2,
    });
    // Taking hurt closed the Scene (no transition), so reopen the repeatable
    // counter before the lethal choice.
    const slain = choose(scenario, openScene(scenario, hurt.state, 'counter').state, 'kill');
    expect(slain.state.character.health).toBe(0);
    expect(slain.state.status).toBe('ended');
    expect(slain.state.endingId).toBe('death');
    // Full Health against 12 damage is lethal too.
    const sudden = choose(scenario, state, 'kill');
    expect(sudden.state.character.health).toBe(0);
    expect(sudden.state.status).toBe('ended');
    expect(sudden.state.endingId).toBe('death');
  });

  it('heals capped at 12 and stays silent at full Health', () => {
    const { scenario, state } = atCounter();
    const wounded: PlaythroughState = {
      ...state,
      character: { ...state.character, health: 11 },
    };
    const mended = choose(scenario, wounded, 'mend');
    expect(mended.state.character.health).toBe(12);
    expect(mended.journal[1]).toEqual({
      type: 'state-change',
      lang: 'en',
      change: 'health-gained',
      amount: 1,
    });
    // At full Health the heal is a silent no-op: only the Choice is recorded.
    const silent = choose(scenario, state, 'mend');
    expect(silent.state.character.health).toBe(12);
    expect(silent.journal.map((entry) => entry.type)).toEqual(['choice']);
    expect(silent.state.activeSceneId).toBe(null);
  });

  it('unequips only when the last copy is taken', () => {
    const { scenario, state } = atCounter();
    expect(state.equipment).toEqual({ weapon: 'sword' });
    const dropped = choose(scenario, state, 'take-one');
    expect(dropped.state.inventory).toEqual({ sword: 1 });
    expect(dropped.state.equipment).toEqual({ weapon: 'sword' });
    expect(dropped.journal[1]).toEqual({
      type: 'state-change',
      lang: 'en',
      change: 'item-lost',
      itemId: 'sword',
      name: 'Sword',
      amount: 1,
    });
    const fresh = atCounter();
    const all = choose(fresh.scenario, fresh.state, 'take-all');
    expect(all.state.inventory).toEqual({});
    expect(all.state.equipment).toEqual({});
    expect(all.journal[1]).toEqual({
      type: 'state-change',
      lang: 'en',
      change: 'item-lost',
      itemId: 'sword',
      name: 'Sword',
      amount: 2,
    });
  });

  it('stays silent when take-item holds nothing and reveal targets a visited Location', () => {
    const { scenario, state } = atCounter();
    const emptied = choose(scenario, state, 'take-all');
    expect(emptied.state.inventory).toEqual({});
    // Nothing left to take: no state change, so only the Choice is recorded.
    const empty = choose(scenario, openScene(scenario, emptied.state, 'counter').state, 'take-one');
    expect(empty.state.inventory).toEqual({});
    expect(empty.journal.map((entry) => entry.type)).toEqual(['choice']);
    // The hall is visited from the start: revealing it is a spec no-op.
    const surveyed = choose(scenario, openScene(scenario, empty.state, 'counter').state, 'survey');
    expect(surveyed.state.revealed).toEqual([]);
    expect(surveyed.journal.map((entry) => entry.type)).toEqual(['choice']);
  });

  it('resolves Test choices and ends on Ending transitions', () => {
    const { scenario, state } = atCounter();
    // Hero Wits 1 with 1 + 1 fails ordinary 9: the failure Outcome applies.
    const gambled = applyAction(
      scenario,
      state,
      {
        kind: 'choose',
        choiceId: 'gamble',
        expectedStep: state.step,
      },
      rng,
    );
    expect(gambled.ok).toBe(true);
    if (!gambled.ok) throw new Error(`gamble failed: ${gambled.reason}`);
    expect(gambled.journal.map((entry) => entry.type)).toEqual(['choice', 'test', 'outcome']);
    expect(gambled.journal[1]).toMatchObject({ type: 'test', total: 3, success: false });
    const finished = choose(scenario, state, 'finish');
    expect(finished.state.status).toBe('ended');
    expect(finished.state.endingId).toBe('home');
  });
});
