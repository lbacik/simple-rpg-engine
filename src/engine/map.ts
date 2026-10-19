// The Location map derivation (docs/spec/ui.md, location-map;
// docs/spec/content-semantics.md, discovery).
//
// `deriveMap` projects the stored `visited`/`revealed` sets and the current
// visible Connections into nodes, lines and highlighted travel targets. The
// UI scales the 0-100 positions into its map area and submits travel through
// the normal Travel action, so a map click and an exit button are equivalent.

import type { Scenario } from '../content/index';
import { evaluateCondition } from './conditions';
import type { PlaythroughState } from './state';

/**
 * Fixed aspect ratio of the map area, as a CSS `aspect-ratio` value. The map
 * area is square, so author `map` coordinates (0-100, origin top left, y
 * down) scale linearly into it in both axes.
 */
export const MAP_ASPECT_RATIO = '1 / 1' as const;

/** The centre of the map area, used when nothing else places a Location. */
export const MAP_CENTRE = { x: 50, y: 50 } as const;

export type MapNodeStatus =
  /** Entered at least once. */
  | 'visited'
  /** Put on the map by `reveal` but not yet entered ("heard of"). */
  | 'revealed'
  /** Unvisited target of a visible exit, drawn as "?" when enabled. */
  | 'unknown';

export type MapNode = {
  id: string;
  name: string;
  /** Author `map` coordinates, or the fallback placement, in 0-100. */
  x: number;
  y: number;
  status: MapNodeStatus;
  isCurrent: boolean;
  /** On the map and a visible exit of the current Location. */
  isTravelTarget: boolean;
  /** False when the position is the fallback (the Location has no `map`). */
  hasAuthorCoordinates: boolean;
};

export type MapEdge = {
  from: string;
  to: string;
  /** A pair of opposite Connections is one plain line; otherwise an arrow. */
  twoWay: boolean;
};

export type MapView = {
  nodes: MapNode[];
  edges: MapEdge[];
  currentLocationId: string;
  /**
   * Targets of the visible Connections from the current Location: the
   * highlighted, clickable travel targets. Empty while a Scene or Combat is
   * active, or after the end. Targets that are not on the map (unvisited,
   * unrevealed, "?" disabled) have no node to click; their exit buttons stay
   * the way to travel.
   */
  travelTargetIds: string[];
};

export type MapOptions = {
  /**
   * App-level setting, off by default: draw unvisited targets of visible
   * exits as "?" nodes. It is not a Scenario field.
   */
  includeUnknownExits?: boolean;
};

/** Visible Connections from a Location, in authored order. */
function visibleConnectionsFrom(
  scenario: Scenario,
  state: PlaythroughState,
  locationId: string,
): import('../content/model').CompiledConnection[] {
  const location = scenario.locationsById[locationId];
  if (location === undefined) return [];
  return location.connections.filter(
    (connection) =>
      connection.when === undefined || evaluateCondition(scenario, state, connection.when),
  );
}

/**
 * Where every Location sits in 0-100 space: author `map` coordinates, or the
 * fallback — near the average position of the Locations it connects with in
 * either direction (declared Connections, regardless of visibility), or the
 * centre when none of those has coordinates.
 */
export function resolveMapPositions(
  scenario: Scenario,
): Record<string, { x: number; y: number; hasAuthorCoordinates: boolean }> {
  const positions: Record<string, { x: number; y: number; hasAuthorCoordinates: boolean }> = {};
  for (const location of scenario.locations) {
    if (location.map !== undefined) {
      positions[location.id] = {
        x: location.map.x,
        y: location.map.y,
        hasAuthorCoordinates: true,
      };
    }
  }
  // Only author coordinates feed other fallbacks: a Location whose neighbours
  // all lack coordinates lands in the centre.
  const neighboursWithCoordinates = (locationId: string): { x: number; y: number }[] => {
    const location = scenario.locationsById[locationId];
    if (location === undefined) return [];
    const neighbourIds = new Set<string>();
    for (const connection of location.connections) {
      neighbourIds.add(connection.to.id);
    }
    for (const other of scenario.locations) {
      if (other.connections.some((connection) => connection.to.id === locationId)) {
        neighbourIds.add(other.id);
      }
    }
    const coords: { x: number; y: number }[] = [];
    for (const id of neighbourIds) {
      const position = positions[id];
      if (position !== undefined && position.hasAuthorCoordinates) {
        coords.push({ x: position.x, y: position.y });
      }
    }
    return coords;
  };
  for (const location of scenario.locations) {
    if (positions[location.id] !== undefined) continue;
    const neighbours = neighboursWithCoordinates(location.id);
    if (neighbours.length === 0) {
      positions[location.id] = { ...MAP_CENTRE, hasAuthorCoordinates: false };
    } else {
      positions[location.id] = {
        x: neighbours.reduce((sum, neighbour) => sum + neighbour.x, 0) / neighbours.length,
        y: neighbours.reduce((sum, neighbour) => sum + neighbour.y, 0) / neighbours.length,
        hasAuthorCoordinates: false,
      };
    }
  }
  return positions;
}

/**
 * Derive the map from the stored `visited`/`revealed` sets and the currently
 * visible Connections.
 *
 * Nodes are visited Locations plus Locations revealed by `reveal` (drawn as
 * "heard of" while unvisited); unvisited Connection targets are not drawn
 * unless `includeUnknownExits` is set. Lines run one per currently visible
 * Connection from a visited Location to a Location on the map, with opposite
 * pairs merged into a single plain line. Hidden Connections are not drawn,
 * and a "heard of" node gets no line until a known Connection leads there.
 */
export function deriveMap(
  scenario: Scenario,
  state: PlaythroughState,
  options: MapOptions = {},
): MapView {
  const visited = new Set(
    state.visited.filter((id) => scenario.locationsById[id] !== undefined),
  );
  const revealed = new Set(
    state.revealed.filter(
      (id) => scenario.locationsById[id] !== undefined && !visited.has(id),
    ),
  );
  const currentLocationId =
    scenario.locationsById[state.currentLocationId]?.id ?? scenario.startLocation.id;

  const onMap = new Set<string>([...visited, ...revealed]);
  if (options.includeUnknownExits === true) {
    for (const visitedId of visited) {
      for (const connection of visibleConnectionsFrom(scenario, state, visitedId)) {
        if (!onMap.has(connection.to.id)) {
          onMap.add(connection.to.id);
        }
      }
    }
  }

  const directed: { from: string; to: string }[] = [];
  for (const visitedId of visited) {
    for (const connection of visibleConnectionsFrom(scenario, state, visitedId)) {
      if (onMap.has(connection.to.id)) {
        directed.push({ from: visitedId, to: connection.to.id });
      }
    }
  }
  const edges: MapEdge[] = [];
  const merged = new Set<string>();
  for (const line of directed) {
    const key = `${line.from}>${line.to}`;
    if (merged.has(key)) continue;
    merged.add(key);
    const hasReturn = directed.some(
      (other) => other.from === line.to && other.to === line.from,
    );
    if (hasReturn) {
      merged.add(`${line.to}>${line.from}`);
    }
    edges.push({ from: line.from, to: line.to, twoWay: hasReturn });
  }

  // No travel while a Scene is active, and none after the end.
  const canTravel = state.status === 'active' && state.activeSceneId == null;
  const travelTargetIds = canTravel
    ? visibleConnectionsFrom(scenario, state, currentLocationId).map(
        (connection) => connection.to.id,
      )
    : [];

  const positions = resolveMapPositions(scenario);
  const nodes: MapNode[] = scenario.locations
    .filter((location) => onMap.has(location.id))
    .map((location) => {
      const position = positions[location.id] ?? {
        ...MAP_CENTRE,
        hasAuthorCoordinates: false,
      };
      const status: MapNodeStatus = visited.has(location.id)
        ? 'visited'
        : revealed.has(location.id)
          ? 'revealed'
          : 'unknown';
      return {
        id: location.id,
        name: location.name,
        x: position.x,
        y: position.y,
        status,
        isCurrent: location.id === currentLocationId,
        isTravelTarget: travelTargetIds.includes(location.id),
        hasAuthorCoordinates: position.hasAuthorCoordinates,
      };
    });

  return { nodes, edges, currentLocationId, travelTargetIds };
}
