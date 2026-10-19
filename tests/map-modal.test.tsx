// Expanded map modal and the "Show unseen exits" control (issue #159,
// docs/spec/ui.md, location map): the compact map and the modal share the
// LocationMap, both expose a button-style toggle with a clear current state
// and a state-following eye icon, the compact map adds a secondary-style
// Expand button with an enlarge icon, and map travel posts the real travel
// action only when legal.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  deriveMap,
  MAP_ASPECT_RATIO,
  startPlaythrough,
  type MapView,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';
import { mapToggleHref } from '../src/app/lib/panel';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';
import { LocationMap } from '../src/app/play/[playthroughId]/map';

const rng: Rng = () => 1;

function write(scenarioDir: string, relative: string, content: string): void {
  const full = path.join(scenarioDir, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/**
 * Two Locations: home -> tower is one-way and hidden behind the gate-open
 * flag, so the toggle can never disclose it while the Condition is unmet.
 */
function loadFixture(): Scenario {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-map-modal-'));
  const scenarioDir = path.join(dir, 'gatedworld');
  write(
    scenarioDir,
    'scenario.yaml',
    [
      'schemaVersion: 2',
      'id: gatedworld',
      'title: Gatedworld',
      'description: A world for map modal tests.',
      'version: "1.0.0"',
      'language: en',
      'startLocation: home',
      'deathEnding: death',
      'flags: [gate-open]',
      'locations:',
      '  - locations/home.yaml',
      '  - locations/tower.yaml',
      'scenes:',
      '  - scenes/path.yaml',
      'templates:',
      '  - templates.yaml',
      'endings:',
      '  - endings.yaml',
      'items:',
      '  - items.yaml',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/home.yaml',
    [
      'id: home',
      'name: Home',
      'description: Where the hearth is.',
      'map: { x: 10, y: 20 }',
      'scenes: [path]',
      'connections:',
      '  - to: tower',
      '    label: Climb the tower',
      '    when: { flag: gate-open }',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'scenes/path.yaml',
    [
      'id: path',
      'title: Path',
      'trigger: on-demand',
      'text: A path leads home.',
      'choices:',
      '  - id: go',
      '    text: Go home.',
      '    outcome:',
      '      end: home',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'locations/tower.yaml',
    [
      'id: tower',
      'name: Tower',
      'description: A tall tower.',
      'map: { x: 70, y: 80 }',
      '',
    ].join('\n'),
  );
  write(
    scenarioDir,
    'items.yaml',
    '- id: sword\n  kind: equipment\n  name: Sword\n  slot: weapon\n',
  );
  write(
    scenarioDir,
    'templates.yaml',
    '- id: hunter\n  name: Hunter\n  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }\n  items:\n    - { item: sword }\n',
  );
  write(
    scenarioDir,
    'endings.yaml',
    '- id: death\n  kind: defeat\n  title: Gone\n  text: The end.\n- id: home\n  kind: victory\n  title: Home\n  text: You made it.\n',
  );
  const result = loadScenario(scenarioDir);
  if (!result.ok) {
    throw new Error(`fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function startAt(
  scenario: Scenario,
  overrides: Partial<PlaythroughState> = {},
): PlaythroughState {
  const result = startPlaythrough(scenario, 'hunter', 'Robin', rng);
  if (!result.ok) throw new Error('fixture start failed');
  return { ...result.state, ...overrides };
}

function render(
  map: MapView,
  extra: {
    canTravel?: boolean;
    showUnknownExits?: boolean;
    toggleHref?: string;
    expandHref?: string;
    hideHeading?: boolean;
    catalogue?: typeof en;
  } = {},
): string {
  return renderToStaticMarkup(
    <LocationMap
      map={map}
      playthroughId="play-1"
      step={3}
      canTravel={extra.canTravel ?? true}
      travelAction="#travel"
      showUnknownExits={extra.showUnknownExits ?? false}
      toggleHref={extra.toggleHref ?? '/play/play-1?unknown=1'}
      expandHref={extra.expandHref}
      hideHeading={extra.hideHeading}
      markerId="map-arrow-test"
      catalogue={extra.catalogue ?? en}
      lang="en"
    />,
  );
}

/** The map as the engine derives it for the given flags and toggle. */
function derived(
  scenario: Scenario,
  flags: string[],
  includeUnknownExits: boolean,
  revealed: string[] = [],
): MapView {
  return deriveMap(
    scenario,
    startAt(scenario, { visited: ['home'], flags, revealed }),
    { includeUnknownExits },
  );
}

describe('unseen-exits catalogue labels', () => {
  it('uses the agreed labels in both Interface Languages', () => {
    expect(en.map.showUnknown).toBe('Show unseen exits');
    expect(en.map.hideUnknown).toBe('Hide unseen exits');
    expect(pl.map.showUnknown).toBe('Pokaż niewidoczne wyjścia');
    expect(pl.map.hideUnknown).toBe('Ukryj niewidoczne wyjścia');
  });
});

describe('LocationMap toggle', () => {
  it('is a button-style link with a clear off state', () => {
    const html = render(derived(loadFixture(), ['gate-open'], false));
    expect(html).toContain('Show unseen exits');
    expect(html).not.toContain('Hide unseen exits');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('class="button secondary');
    expect(html).toContain('href="/play/play-1?unknown=1"');
  });

  it('is a button-style link with a clear on state', () => {
    const html = render(derived(loadFixture(), ['gate-open'], true), {
      showUnknownExits: true,
      toggleHref: '/play/play-1',
    });
    expect(html).toContain('Hide unseen exits');
    expect(html).not.toContain('Show unseen exits');
    expect(html).toContain('aria-pressed="true"');
  });

  it('renders the Polish labels from the catalogue', () => {
    const html = render(derived(loadFixture(), ['gate-open'], false), {
      catalogue: pl,
    });
    expect(html).toContain('Pokaż niewidoczne wyjścia');
    const on = render(derived(loadFixture(), ['gate-open'], true), {
      catalogue: pl,
      showUnknownExits: true,
      toggleHref: '/play/play-1',
    });
    expect(on).toContain('Ukryj niewidoczne wyjścia');
  });

  it('keeps the plain surface, fixed aspect ratio and discovery rendering', () => {
    const html = render(derived(loadFixture(), ['gate-open'], true), {
      showUnknownExits: true,
      toggleHref: '/play/play-1',
      expandHref: '/play/play-1?panel=map',
    });
    // Fixed aspect ratio from the engine, one-way Connection as an arrow.
    expect(html).toContain(`aspect-ratio:${MAP_ASPECT_RATIO}`);
    expect(html).toContain('marker-end="url(#map-arrow-test)"');
    // Current-Location marker and the unseen exit as "?".
    expect(html).toContain('You are here');
    expect(html).toContain('>?<');
    expect(html).toContain('Expand map');
  });

  it('keeps its own heading and Expand control in the compact side-panel map', () => {
    const html = render(derived(loadFixture(), ['gate-open'], false), {
      expandHref: '/play/play-1?panel=map',
    });
    expect(html).toContain('<h2>Map</h2>');
    expect(html).toContain('Expand map');
    expect(html).toContain('aria-label="Location map"');
  });

  it('omits the duplicated heading in the enlarged map modal but keeps the accessible label', () => {
    const html = render(derived(loadFixture(), ['gate-open'], false), {
      hideHeading: true,
    });
    // The modal header already carries the Map title, so the section drops
    // its own heading (and the empty head row with it).
    expect(html).not.toContain('<h2>');
    expect(html).not.toContain('map-head');
    expect(html).toContain('aria-label="Location map"');
    expect(html).toContain('class="map map--modal"');
    // The map and its toggle still render.
    expect(html).toContain('map-area');
    expect(html).toContain('Show unseen exits');
  });
});

describe('map control buttons and icons', () => {
  it('renders Expand as a secondary-style button with an enlarge icon', () => {
    const html = render(derived(loadFixture(), ['gate-open'], false), {
      expandHref: '/play/play-1?panel=map',
    });
    expect(html).toContain('class="map-expand button secondary"');
    expect(html).toContain('href="/play/play-1?panel=map"');
    expect(html).toContain('Expand map');
    // Enlarge icon: outward-pointing diagonal arrows, decorative only.
    expect(html).toContain('map-control-icon');
    expect(html).toContain('M21 3l-7 7');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders no Expand control without an expand href', () => {
    const html = render(derived(loadFixture(), ['gate-open'], false));
    expect(html).not.toContain('map-expand');
  });

  it('shows the eye icon while the action is "show" and eye-off while "hide"', () => {
    const off = render(derived(loadFixture(), ['gate-open'], false));
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('M2 12s3.5-6');
    expect(off).not.toContain('M2 2l20 20');
    const on = render(derived(loadFixture(), ['gate-open'], true), {
      showUnknownExits: true,
      toggleHref: '/play/play-1',
    });
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('M2 2l20 20');
  });

  it('keeps the control icons decorative so accessible names do not change', () => {
    const html = render(derived(loadFixture(), ['gate-open'], false), {
      expandHref: '/play/play-1?panel=map',
    });
    // Every control icon hides itself from assistive tech; neither control
    // takes an aria-label, so the visible text stays the accessible name.
    for (const match of html.matchAll(/<svg[^>]*map-control-icon[^>]*>/g)) {
      expect(match[0]).toContain('aria-hidden="true"');
    }
    expect(html).not.toContain('aria-label="Expand map"');
    expect(html).not.toContain('aria-label="Show unseen exits"');
  });
});

describe('unseen exits on and off', () => {
  it('omits the unvisited target while the setting is off', () => {
    const html = render(derived(loadFixture(), ['gate-open'], false));
    expect(html).not.toContain('>?<');
    expect(html).not.toContain('Travel to Tower');
  });

  it('draws the unvisited target of a visible Connection as "?" when on', () => {
    const html = render(derived(loadFixture(), ['gate-open'], true), {
      showUnknownExits: true,
      toggleHref: '/play/play-1',
    });
    expect(html).toContain('>?<');
    // The "?" node travels through the real travel action.
    expect(html).toContain('<form');
    expect(html).toContain('name="target" value="tower"');
    expect(html).toContain('Travel to Tower');
  });

  it('still shows a revealed Location while the setting is off', () => {
    const scenario = loadFixture();
    const html = render(derived(scenario, [], false, ['tower']));
    // Heard of through `reveal`, not through the toggle: no line to it.
    expect(html).toContain('Tower (heard of)');
    expect(html).not.toContain('>?<');
  });

  it('never discloses a Connection hidden by an unmet Condition', () => {
    const scenario = loadFixture();
    const withToggle = derived(scenario, [], true);
    expect(withToggle.nodes.map((node) => node.id)).toEqual(['home']);
    const html = render(withToggle, {
      showUnknownExits: true,
      toggleHref: '/play/play-1',
    });
    expect(html).not.toContain('Tower');
    expect(html).not.toContain('>?<');
    expect(html).not.toContain('name="target" value="tower"');
  });
});

describe('map travel availability', () => {
  it('posts the travel action for a legal adjacent target', () => {
    const html = render(derived(loadFixture(), ['gate-open'], true), {
      showUnknownExits: true,
      toggleHref: '/play/play-1',
    });
    expect(html).toContain('action="#travel"');
    expect(html).toContain('name="playthroughId" value="play-1"');
    expect(html).toContain('name="expectedStep" value="3"');
  });

  it('offers no travel while a Scene, Combat, Ending or read-only view blocks it', () => {
    const html = render(derived(loadFixture(), ['gate-open'], true), {
      canTravel: false,
      showUnknownExits: true,
      toggleHref: '/play/play-1',
    });
    expect(html).not.toContain('<form');
    expect(html).not.toContain('Travel to Tower');
    // The map itself still renders with its toggle.
    expect(html).toContain('Hide unseen exits');
  });
});

describe('map toggle href', () => {
  it('flips the setting while preserving the open modal, notice and acknowledgement', () => {
    expect(
      mapToggleHref('play-1', {
        panel: 'map',
        notice: 'stale',
        seen: 7,
        showUnknownExits: false,
      }),
    ).toBe('/play/play-1?panel=map&notice=stale&unknown=1&seen=7');
    expect(
      mapToggleHref('play-1', {
        panel: 'map',
        notice: 'stale',
        seen: 7,
        showUnknownExits: true,
      }),
    ).toBe('/play/play-1?panel=map&notice=stale&seen=7');
  });

  it('keeps the selected inventory tile only on its own modal', () => {
    expect(
      mapToggleHref('play-1', {
        panel: 'inventory',
        showUnknownExits: false,
        item: 'healing-herbs',
      }),
    ).toBe('/play/play-1?panel=inventory&unknown=1&item=healing-herbs');
    // The toggle never changes Playthrough state: no step advance, no extras.
    expect(
      mapToggleHref('play-1', { panel: 'character', showUnknownExits: false }),
    ).toBe('/play/play-1?panel=character&unknown=1');
  });
});

describe('map launcher and modal chrome', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');

  it('shows the Map launcher on desktop and phones', () => {
    // Four launchers share one row on desktop; no rule hides one of them.
    expect(css).toContain('repeat(4, minmax(0, 1fr))');
    expect(css).not.toContain('map-only');
  });

  it('styles the toggle as a button and gives the map modal a reusable larger size', () => {
    expect(css).toContain('.map-toggle .button');
    expect(css).toContain('.panel-modal--large');
  });

  it('fits the enlarged map into the viewport without scrolling the modal', () => {
    // The modal map scales to the available viewport space, constrained by
    // both width and height while keeping its aspect ratio.
    expect(css).toContain('.panel-modal--large .map--modal .map-area');
    expect(css).toContain('100dvh');
  });

  it('styles Expand as a secondary button with a leading icon that cannot wrap', () => {
    expect(css).toContain('.map-head .map-expand');
    expect(css).toContain('.map-control-icon');
  });
});
