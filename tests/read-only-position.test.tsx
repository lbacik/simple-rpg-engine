// Read-only position of an incompatible Playthrough
// (docs/spec/ui.md, read-only Playthroughs): content whose id is gone from
// the Scenario is left out with a short notice instead of the fallback
// `view()` supplies for compatible play.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '../src/content/model';
import type { GameView } from '../src/engine/index';
import type { PlaythroughState } from '../src/engine/state';
import { ReadOnlyPosition } from '../src/app/play/[playthroughId]/read-only-position';
import { pl } from '../src/i18n/pl';

function stubScenario(): Scenario {
  return {
    id: 'test',
    startLocation: { id: 'start', name: 'Startville', description: 'Startville description.' },
    deathEnding: { id: 'death', kind: 'defeat', title: 'Deathly End', text: 'Gone.' },
    locationsById: {
      start: { id: 'start', name: 'Startville', description: 'Startville description.' },
    },
    endingsById: {
      death: { id: 'death', kind: 'defeat', title: 'Deathly End', text: 'Gone.' },
    },
  } as unknown as Scenario;
}

function baseState(): PlaythroughState {
  return {
    stateVersion: 2,
    scenarioId: 'test',
    scenarioVersion: '1.0.0',
    contentHash: 'abc',
    status: 'active',
    step: 0,
    character: {
      templateId: 'hunter',
      name: 'Robin',
      baseAttributes: { might: 1, agility: 3, wits: 2, presence: 0 },
      health: 12,
    },
    inventory: {},
    equipment: {},
    currentLocationId: 'start',
    activeSceneId: null,
    visited: ['start'],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounters: {},
  };
}

function locationView(): GameView {
  return {
    kind: 'location',
    locationId: 'start',
    name: 'Startville',
    description: 'Startville description.',
    exits: [],
    onDemandScenes: [],
    map: { nodes: [], edges: [] },
  } as unknown as GameView;
}

describe('ReadOnlyPosition', () => {
  it('omits the start Location when the current Location id is gone', () => {
    const html = renderToStaticMarkup(
      <ReadOnlyPosition
        scenario={stubScenario()}
        state={{ ...baseState(), currentLocationId: 'renamed' }}
        gameView={locationView()}
        characterName="Robin"
        recordedEnding={undefined}
        lang="en"
      />,
    );
    expect(html).toContain('no longer part of this Scenario');
    expect(html).not.toContain('Startville');
  });

  it('shows the Location when its id still exists', () => {
    const html = renderToStaticMarkup(
      <ReadOnlyPosition
        scenario={stubScenario()}
        state={baseState()}
        gameView={locationView()}
        characterName="Robin"
        recordedEnding={undefined}
        lang="en"
      />,
    );
    expect(html).toContain('Startville');
  });

  it('reads a gone Ending from its Journal entry', () => {
    const gameView = {
      kind: 'ended',
      endingId: 'death',
      endingKind: 'defeat',
      title: 'Deathly End',
      text: 'Gone.',
      map: { nodes: [], edges: [] },
    } as unknown as GameView;
    const html = renderToStaticMarkup(
      <ReadOnlyPosition
        scenario={stubScenario()}
        state={{ ...baseState(), status: 'ended', endingId: 'gone' }}
        gameView={gameView}
        characterName="Robin"
        recordedEnding={{ endingId: 'w', kind: 'victory', title: 'Recorded Triumph', text: 'Won.', lang: 'en' }}
        lang="en"
      />,
    );
    expect(html).toContain('Recorded Triumph');
    expect(html).not.toContain('Deathly End');
  });

  it('renders the gap notices and the Ending kind in Polish', () => {
    const gap = renderToStaticMarkup(
      <ReadOnlyPosition
        scenario={stubScenario()}
        state={{ ...baseState(), currentLocationId: 'renamed' }}
        gameView={locationView()}
        characterName="Robin"
        recordedEnding={undefined}
        catalogue={pl}
        lang="en"
      />,
    );
    expect(gap).toContain('nie jest już częścią tego scenariusza');
    const ended = renderToStaticMarkup(
      <ReadOnlyPosition
        scenario={stubScenario()}
        state={{ ...baseState(), status: 'ended', endingId: 'death' }}
        gameView={{
          kind: 'ended',
          endingId: 'death',
          endingKind: 'defeat',
          title: 'Deathly End',
          text: 'Gone.',
          map: { nodes: [], edges: [] },
        } as unknown as GameView}
        characterName="Robin"
        recordedEnding={undefined}
        catalogue={pl}
        lang="en"
      />,
    );
    expect(ended).toContain('Porażka');
    expect(ended).not.toContain('Defeat');
  });

  it('omits a gone Ending with no Journal entry instead of the death Ending', () => {
    const gameView = {
      kind: 'ended',
      endingId: 'death',
      endingKind: 'defeat',
      title: 'Deathly End',
      text: 'Gone.',
      map: { nodes: [], edges: [] },
    } as unknown as GameView;
    const html = renderToStaticMarkup(
      <ReadOnlyPosition
        scenario={stubScenario()}
        state={{ ...baseState(), status: 'ended', endingId: 'gone' }}
        gameView={gameView}
        characterName="Robin"
        recordedEnding={undefined}
        lang="en"
      />,
    );
    expect(html).toContain('no longer part of this Scenario');
    expect(html).not.toContain('Deathly End');
  });
});
