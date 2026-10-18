// The Location map (docs/spec/ui.md, location-map): nodes placed by author
// `map` coordinates (or the engine fallback) on a plain surface with a fixed
// aspect ratio, lines for the currently visible Connections, and the current
// Location marked. Travel targets post the same Travel action as the exit
// buttons, so a map click and an exit button are exactly equivalent. There is
// no fast travel: only adjacent Locations are ever clickable, and nothing is
// clickable while a Scene or Combat is active.
//
// The compact map and the expanded modal share this module with the same
// toggle: a button-style link flipping the app-level "?" setting, and (compact
// only) a secondary-style Expand button opening the enlarged map modal. Both
// controls carry small leading icons. The Travel
// server action is injected (page.tsx passes it through the side panel) and
// the imports are relative, so tests can drive this module directly with
// react-dom/server.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly with react-dom/server.

import type { ComponentProps } from 'react';
import { MAP_ASPECT_RATIO, type MapNode, type MapView } from '../../../engine/index';
import type { Catalogue } from '../../../i18n/index';

/** A form target: the Travel server action in production, a URL in tests. */
export type MapTravelAction = ComponentProps<'form'>['action'];

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

function NodeLabel({
  node,
  catalogue,
  lang,
}: {
  node: MapNode;
  catalogue: Catalogue;
  /** The language of the Location names shown. */
  lang: string;
}) {
  return (
    <>
      <span className="dot" aria-hidden="true">
        {node.isCurrent ? <span className="ring" aria-hidden="true" /> : null}
        {node.status === 'unknown' ? '?' : null}
      </span>
      {node.status === 'revealed' ? (
        // Interface Text around the name: the name itself cannot be split out
        // of the catalogue message, so no `lang` here.
        <span className="label">{catalogue.map.heardOf(node.name)}</span>
      ) : (
        <span className="label" lang={lang}>
          {node.name}
        </span>
      )}
    </>
  );
}

function PlacedNode({
  node,
  playthroughId,
  step,
  canTravel,
  travelAction,
  catalogue,
  lang,
}: {
  node: MapNode;
  playthroughId: string;
  step: number;
  canTravel: boolean;
  travelAction: MapTravelAction;
  catalogue: Catalogue;
  /** The language of the Location names shown. */
  lang: string;
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
        <span className="here">{catalogue.map.youAreHere}</span>
        <NodeLabel node={node} catalogue={catalogue} lang={lang} />
      </div>
    );
  }
  if (node.isTravelTarget && canTravel) {
    return (
      <form className={classes} style={position} action={travelAction}>
        <input type="hidden" name="playthroughId" value={playthroughId} />
        <input type="hidden" name="expectedStep" value={step} />
        <input type="hidden" name="target" value={node.id} />
        <button className="map-travel" type="submit" aria-label={catalogue.map.travelTo(node.name)}>
          <NodeLabel node={node} catalogue={catalogue} lang={lang} />
        </button>
      </form>
    );
  }
  return (
    <div className={classes} style={position}>
      <NodeLabel node={node} catalogue={catalogue} lang={lang} />
    </div>
  );
}

/**
 * A small leading icon for the compact-map controls (expand, show/hide
 * unknown exits). Stroke-based `currentColor` SVGs in the same visual
 * language as the side-panel launcher icons; decorative only, so hidden
 * from assistive tech and never part of the control's accessible name.
 */
function MapControlIcon({ name }: { name: 'expand' | 'eye' | 'eye-off' }) {
  const paths =
    name === 'expand' ? (
      <>
        <path d="M15 3h6v6" />
        <path d="M9 21H3v-6" />
        <path d="M21 3l-7 7" />
        <path d="M3 21l7-7" />
      </>
    ) : name === 'eye' ? (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <path d="M2 2l20 20" />
      </>
    );
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="map-control-icon"
    >
      {paths}
    </svg>
  );
}

export function LocationMap({
  map,
  playthroughId,
  step,
  canTravel,
  travelAction,
  showUnknownExits,
  toggleHref,
  expandHref,
  hideHeading,
  markerId,
  catalogue,
  lang,
}: {
  map: MapView;
  playthroughId: string;
  step: number;
  /** False while a Scene or Combat is active, or after the end. */
  canTravel: boolean;
  travelAction: MapTravelAction;
  showUnknownExits: boolean;
  /** Href flipping the app-level "?" setting, preserving tab and notice. */
  toggleHref: string;
  /** When set, an Expand link opens the enlarged map modal (desktop access). */
  expandHref?: string;
  /**
   * Set for the enlarged map modal: the modal header already carries the Map
   * title, so the section's own heading is omitted (the accessible
   * `aria-label` stays). The compact side-panel map leaves this unset and
   * keeps its heading with the Expand control.
   */
  hideHeading?: boolean;
  /** Unique SVG marker id: the map renders twice on the page (phone, desktop). */
  markerId: string;
  /** Interface Text: the game screen passes the current catalogue. */
  catalogue: Catalogue;
  /** The language of the Location names shown. */
  lang: string;
}) {
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const showHead = hideHeading !== true || expandHref !== undefined;
  return (
    <section
      aria-label={catalogue.map.label}
      className={hideHeading === true ? 'map map--modal' : 'map'}
    >
      {showHead ? (
        <div className="map-head">
          {hideHeading === true ? null : <h2>{catalogue.map.title}</h2>}
          {expandHref === undefined ? null : (
            <a className="map-expand button secondary" href={expandHref}>
              <MapControlIcon name="expand" />
              {catalogue.map.expand}
            </a>
          )}
        </div>
      ) : null}
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
            travelAction={travelAction}
            catalogue={catalogue}
            lang={lang}
          />
        ))}
      </div>
      <p className="map-toggle">
        {showUnknownExits ? (
          <a className="button secondary" aria-pressed="true" href={toggleHref}>
            <MapControlIcon name="eye-off" />
            {catalogue.map.hideUnknown}
          </a>
        ) : (
          <a className="button secondary" aria-pressed="false" href={toggleHref}>
            <MapControlIcon name="eye" />
            {catalogue.map.showUnknown}
          </a>
        )}
      </p>
    </section>
  );
}
