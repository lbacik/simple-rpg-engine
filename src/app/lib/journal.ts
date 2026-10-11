// Journal rendering (docs/spec/playthrough-state.md, journal; docs/spec/ui.md,
// journal): a paginated, read-only, text-only list of the entries in order.
// Narration entries reuse the game screen's Markdown subset on the stored text
// as presented, never re-read from content. Every other entry is plain text.

import { escapeHtml, renderStoredText } from '../../engine/narration';

/** Entries per journal page. */
export const JOURNAL_PAGE_SIZE = 20 as const;

/** Journal entry types the engine produces today. */
const NARRATION_ENTRY_TYPES: ReadonlySet<string> = new Set([
  'intro',
  'scene',
  'outcome',
  'combat-start',
]);

/** Human labels per entry type, shown beside the step that produced the entry. */
const ENTRY_LABELS: Record<string, string> = {
  intro: 'Intro',
  scene: 'Scene',
  choice: 'Choice taken',
  test: 'Test',
  outcome: 'Outcome',
  'state-change': 'State change',
  travel: 'Travel',
  'combat-start': 'Combat start',
  'combat-round': 'Combat round',
  'combat-end': 'Combat end',
  'enemy-defeated': 'Enemy defeated',
  inventory: 'Inventory',
  ending: 'Ending',
};

export function journalEntryLabel(type: string): string {
  return ENTRY_LABELS[type] ?? type;
}

/** Parse `?page=` (1-based). Anything missing or invalid becomes page 1. */
export function parseJournalPage(value: string | undefined): number {
  if (value === undefined) return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

/** Journal page URL with the page preserved only when past the first. */
export function journalHref(playthroughId: string, page: number): string {
  if (page <= 1) return `/play/${playthroughId}/journal`;
  return `/play/${playthroughId}/journal?page=${page}`;
}

/**
 * Render one journal entry to HTML. Narration entries (intro, Scene, Outcome,
 * Combat opening) render with the stored-text Markdown subset; the Ending
 * renders its kind, title and closing narration the same way. Everything else
 * is escaped plain text: the Choice wording, the Test as presented (Attribute,
 * Difficulty, both dice, modifier, total, result), state changes, travel,
 * Combat rounds/end, the Enemy-defeated notice and inventory actions.
 */
export function renderJournalEntry(
  type: string,
  payload: unknown,
  characterName: string,
): { label: string; html: string } {
  const label = journalEntryLabel(type);
  const record = (payload ?? {}) as Record<string, unknown>;
  const text = String(record.text ?? '');
  if (NARRATION_ENTRY_TYPES.has(type)) {
    return { label, html: renderStoredText(text, characterName) };
  }
  if (type === 'ending') {
    const kind = record.kind === 'victory' ? 'Victory' : 'Defeat';
    const title = String(record.title ?? '');
    return {
      label,
      html: `<p class="meta">${escapeHtml(kind)}</p><h3>${escapeHtml(title)}</h3>${renderStoredText(text, characterName)}`,
    };
  }
  if (type === 'test') {
    return { label, html: `<p>${escapeHtml(testText(record, text))}</p>` };
  }
  if (type === 'choice') {
    return { label, html: `<p>Chose: ${escapeHtml(text)}</p>` };
  }
  return { label, html: `<p>${escapeHtml(text)}</p>` };
}

export type JournalEnding = {
  endingId: string;
  kind: 'victory' | 'defeat';
  title: string;
  text: string;
};

/**
 * The Ending as recorded when the Playthrough ended: kind, title and closing
 * narration, stored as presented. Used when the Scenario is gone (or its
 * Ending with it) and only the Journal remains.
 */
export function latestJournalEnding(
  entries: ReadonlyArray<{ type: string; payload: unknown }>,
): JournalEnding | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== 'ending') continue;
    const record = (entry.payload ?? {}) as Record<string, unknown>;
    return {
      endingId: String(record.endingId ?? ''),
      kind: record.kind === 'victory' ? 'victory' : 'defeat',
      title: String(record.title ?? ''),
      text: String(record.text ?? ''),
    };
  }
  return undefined;
}

function testText(record: Record<string, unknown>, fallback: string): string {
  if (fallback !== '') return fallback;
  const attribute = String(record.attribute ?? '');
  const difficulty = String(record.difficulty ?? '');
  const die1 = String(record.die1 ?? '');
  const die2 = String(record.die2 ?? '');
  const modifier = String(record.modifier ?? '');
  const total = String(record.total ?? '');
  const result = record.success === true ? 'success' : record.success === false ? 'failure' : '';
  const parts = [attribute, difficulty, `rolled ${die1} and ${die2}`, `modifier ${modifier}`, `total ${total}`, result]
    .filter((part) => part !== '' && part !== 'rolled  and ')
    .join(', ');
  return parts === '' ? 'Test.' : `${parts}.`;
}
