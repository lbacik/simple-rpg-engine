// Query helpers for the side-panel modal (`?panel=`), the transient
// rejection notice, the app-level "?" map setting and the client-side Continue
// acknowledgement, shared by the play page and the inventory server actions
// so both build the same URLs.
//
// The Continue after a result panel is client-side only
// (docs/spec/playthrough-state.md, two kinds of Continue): a plain link to the
// same game page carrying `?seen=<step>`. When it equals the Playthrough's
// current `step` the server skips the result panel and renders the position; a
// value that does not match is ignored and the result panel is shown again.

/**
 * The side-panel modal open on the game screen: the Character sheet, the
 * inventory, or (on phones) the Location map. Anything else renders no modal.
 */
export type PanelId = 'character' | 'inventory' | 'map';

export function parsePanel(value: string | undefined): PanelId | null {
  return value === 'character' || value === 'inventory' || value === 'map'
    ? value
    : null;
}

/**
 * Parse `?seen=`. Anything missing or invalid becomes undefined, which the
 * game screen treats like no acknowledgement: the result panel is shown.
 */
export function parseSeenStep(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed)) return undefined;
  return parsed;
}

/**
 * Whether the reading column shows only the result panel (with Continue)
 * instead of the current position: the latest step produced result-panel
 * entries and `?seen=` does not equal the current `step`.
 */
export function shouldShowResultPanel(
  hasResultEntries: boolean,
  currentStep: number,
  seenStep: number | undefined,
): boolean {
  if (!hasResultEntries) return false;
  return seenStep !== currentStep;
}

/** The query parameters the game page preserves across navigation. */
export type PlayQuery = {
  panel?: string | null;
  notice?: string;
  seen?: number;
  showUnknownExits?: boolean;
};

function playQueryString(query: PlayQuery): string {
  const params = new URLSearchParams();
  if (query.panel === 'character' || query.panel === 'inventory' || query.panel === 'map') {
    params.set('panel', query.panel);
  }
  if (query.notice === 'stale' || query.notice === 'unavailable') params.set('notice', query.notice);
  if (query.showUnknownExits === true) params.set('unknown', '1');
  if (query.seen !== undefined && Number.isInteger(query.seen) && query.seen >= 0) {
    params.set('seen', String(query.seen));
  }
  return params.toString();
}

/** `/play/[id]` with the open panel modal preserved, plus a rejection notice when given. */
export function playHref(
  playthroughId: string,
  panel: string | null | undefined,
  notice?: string,
  seen?: number,
  showUnknownExits?: boolean,
): string {
  const query = playQueryString({ panel, notice, seen, showUnknownExits });
  return query === '' ? `/play/${playthroughId}` : `/play/${playthroughId}?${query}`;
}

/**
 * The Continue link after a result panel: the same game page carrying the
 * current `step` as `?seen=`, preserving the open panel modal, the transient
 * notice and the "?" map setting. Following it changes no game state and does
 * not advance `step`; the Outcome was already applied when the Choice was made.
 */
export function continueHref(
  playthroughId: string,
  step: number,
  panel?: string | null,
  notice?: string,
  showUnknownExits?: boolean,
): string {
  return playHref(playthroughId, panel, notice, step, showUnknownExits);
}
