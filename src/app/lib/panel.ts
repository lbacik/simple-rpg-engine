// Query helpers for the Character/Inventory/Map panel tab and the transient
// rejection notice, shared by the play page and the inventory server actions
// so both build the same URLs.

export type PanelTab = 'character' | 'inventory' | 'map';

export function parsePanelTab(value: string | undefined): PanelTab {
  return value === 'inventory' || value === 'map' ? value : 'character';
}

/** `/play/[id]` with the panel tab preserved, plus a rejection notice when given. */
export function playHref(
  playthroughId: string,
  tab: string | undefined,
  notice?: string,
): string {
  const params = new URLSearchParams();
  if (tab === 'inventory' || tab === 'map') params.set('tab', tab);
  if (notice === 'stale' || notice === 'unavailable') params.set('notice', notice);
  const query = params.toString();
  return query === '' ? `/play/${playthroughId}` : `/play/${playthroughId}?${query}`;
}
