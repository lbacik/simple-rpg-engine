// The Location map (docs/spec/ui.md, location-map): nodes placed by author
// `map` coordinates (or the engine fallback) on a plain surface with a fixed
// aspect ratio, lines for the currently visible Connections, and the current
// Location marked. Travel targets post the same Travel action as the exit
// buttons, so a map click and an exit button are exactly equivalent. There is
// no fast travel: only adjacent Locations are ever clickable, and nothing is
// clickable while a Scene or Combat is active.

import { MAP_ASPECT_RATIO, type MapNode, type MapView } from '@/engine/index';
import { travelAction } from '@/app/lib/travel';

/** Trim a line end by `gap` map units so the endpoint sits outside the node. */
function trimmed(
  from: { x: number; y: number },
  to: { x: number; y: number },
  gap: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  }
  const step = Math.min(gap, length / 2);
  const ux = dx / length;
  const uy = dy / length;
  return {
    x1: from.x + ux * step,
    y1: from.y + uy * step,
    x2: to.x - ux * step,
    y2: to.y - uy * step,
  };
}

function NodeLabel({ node }: { node: MapNode }) {
  return (
    <>
      <span className="dot" aria-hidden="true">
        {node.isCurrent ? <span className="ring" aria-hidden="true" /> : null}
        {node.status === 'unknown' ? '?' : null}
      </span>
      <span className="label">
        {node.name}
        {node.status === 'revealed' ? ' (heard of)' : null}
      </span>
    </>
  );
}

function PlacedNode({
  node,
  playthroughId,
  step,
  canTravel,
}: {
  node: MapNode;
  playthroughId: string;
  step: number;
  canTravel: boolean;
}) {
  const position = { left: `${node.x}%`, top: `${node.y}%` };
  const classes = [
    'map-node',
    node.status === 'revealed'
      ? 'is-revealed'
      : node.status === 'unknown'
        ? 'is-unknown'
        : 'is-visited',
    node.isCurrent ? 'is-current' : null,
    node.isTravelTarget && canTravel ? 'is-travel' : null,
  ]
    .filter((candidate) => candidate !== null)
    .join(' ');
  if (node.isCurrent) {
    return (
      <div className={classes} style={position}>
        <span className="here">You are here</span>
        <NodeLabel node={node} />
      </div>
    );
  }
  if (node.isTravelTarget && canTravel) {
    return (
      <form className={classes} style={position} action={travelAction}>
        <input type="hidden" name="playthroughId" value={playthroughId} />
        <input type="hidden" name="expectedStep" value={step} />
        <input type="hidden" name="target" value={node.id} />
        <button className="map-travel" type="submit" aria-label={`Travel to ${node.name}`}>
          <NodeLabel node={node} />
        </button>
      </form>
    );
  }
  return (
    <div className={classes} style={position}>
      <NodeLabel node={node} />
    </div>
  );
}

export function LocationMap({
  map,
  playthroughId,
  step,
  canTravel,
  showUnknownExits,
  toggleHref,
  markerId,
}: {
  map: MapView;
  playthroughId: string;
  step: number;
  /** False while a Scene or Combat is active, or after the end. */
  canTravel: boolean;
  showUnknownExits: boolean;
  /** Href flipping the app-level "?" setting, preserving tab and notice. */
  toggleHref: string;
  /** Unique SVG marker id: the map renders twice on the page (phone, desktop). */
  markerId: string;
}) {
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  return (
    <section aria-label="Location map">
      <h2>Map</h2>
      <div className="map-area" style={{ aspectRatio: MAP_ASPECT_RATIO }} role="img">
        <svg
          className="map-lines"
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {map.edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (from === undefined || to === undefined) return null;
            const line = trimmed(from, to, 5);
            return (
              <line
                key={`${edge.from}>${edge.to}`}
                className="edge"
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                markerEnd={edge.twoWay ? undefined : `url(#${markerId})`}
              />
            );
          })}
        </svg>
        {map.nodes.map((node) => (
          <PlacedNode
            key={node.id}
            node={node}
            playthroughId={playthroughId}
            step={step}
            canTravel={canTravel}
          />
        ))}
      </div>
      <p className="map-toggle">
        {showUnknownExits ? (
          <a href={toggleHref}>Hide unvisited exits</a>
        ) : (
          <a href={toggleHref}>Show unvisited exits as “?”</a>
        )}
      </p>
    </section>
  );
}
