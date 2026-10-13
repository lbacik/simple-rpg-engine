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

/** A raw query/form value with whitespace-only treated as absent. */
export function cleanParam(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Parse `?item=`: the inventory tile selected in the detail pane. */
export function parseSelectedItem(value: string | undefined): string | undefined {
  return cleanParam(value);
}

/** The query parameters the game page preserves across navigation. */
export type PlayQuery = {
  panel?: string | null;
  notice?: string;
  seen?: number;
  showUnknownExits?: boolean;
  /** The selected inventory tile; only meaningful with `panel=inventory`. */
  item?: string | null;
  /**
   * The Combat target picker selection (`?target=`). It is not game state:
   * it names a surviving participant for targeted actions to post.
   */
  target?: string | null;
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
  // The selected tile survives the redirect after an inventory action, so the
  // result is visible in place. It rides only on the inventory panel.
  if (query.panel === 'inventory') {
    const trimmed = cleanParam(query.item);
    if (trimmed !== undefined) params.set('item', trimmed);
  }
  const target = cleanParam(query.target);
  if (target !== undefined) params.set('target', target);
  return params.toString();
}

/** `/play/[id]` with the open panel modal preserved, plus a rejection notice when given. */
export function playHref(
  playthroughId: string,
  panel: string | null | undefined,
  notice?: string,
  seen?: number,
  showUnknownExits?: boolean,
  item?: string | null,
  target?: string | null,
): string {
  const query = playQueryString({ panel, notice, seen, showUnknownExits, item, target });
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
  item?: string | null,
  target?: string | null,
): string {
  return playHref(playthroughId, panel, notice, step, showUnknownExits, item, target);
}

/**
 * Parse `?target=`: the Combat target picker's selection. Whitespace-only is
 * absent; the caller resolves it against the arena's survivors (docs/spec/ui.md,
 * target picker).
 */
export function parseCombatTarget(value: string | undefined): string | undefined {
  return cleanParam(value);
}

/**
 * Resolve the picker selection against the arena's surviving participants, in
 * participant order. A requested id that names no survivor falls back to the
 * first survivor; with no survivors there is no selection. Pure: no state
 * writes, no `step` change, no RNG.
 */
export function selectCombatTarget(
  legalTargets: readonly string[],
  requested: string | undefined,
): string | undefined {
  if (requested !== undefined && legalTargets.includes(requested)) return requested;
  return legalTargets[0];
}

/**
 * A target-picker link: the same game page carrying `?target=` while
 * preserving the open panel modal, the transient notice, the Continue
 * acknowledgement, the "?" map setting and the selected inventory tile.
 */
export function combatTargetHref(
  playthroughId: string,
  query: Omit<PlayQuery, 'target'>,
  targetId: string,
): string {
  const params = playQueryString({ ...query, target: targetId });
  return `/play/${playthroughId}?${params}`;
}
