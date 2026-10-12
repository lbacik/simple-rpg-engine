// Journal rendering (docs/spec/playthrough-state.md, journal; docs/spec/ui.md,
// journal): a read-only, text-only list of the entries, newest first, with
// infinite scroll towards the first entry. Narration entries reuse the game
// screen's Markdown subset on the stored text as presented, never re-read
// from content. Every other entry is plain text.

import { escapeHtml, renderStoredText } from '../../engine/narration';

/** Entries per journal batch. */
export const JOURNAL_BATCH_SIZE = 20 as const;

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

/**
 * Parse `?before=`: the sequence cursor for "entries older than X". Missing
 * or invalid values read the newest batch.
 */
export function parseJournalCursor(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/**
 * Journal URL starting at the cursor, for the no-JavaScript "Older entries"
 * link. Without a cursor it opens the newest batch.
 */
export function journalHref(playthroughId: string, beforeSeq?: number | null): string {
  if (beforeSeq === undefined || beforeSeq === null) return `/play/${playthroughId}/journal`;
  return `/play/${playthroughId}/journal?before=${beforeSeq}`;
}

/** One journal entry rendered to HTML, ready to append to the list. */
export type RenderedJournalEntry = {
  seq: number;
  step: number;
  label: string;
  html: string;
};

/**
 * One batch over the wire: server-rendered entries plus the cursor for the
 * next older batch (`null` when the start of the Journal has been reached).
 */
export type JournalBatchResponse = {
  entries: RenderedJournalEntry[];
  nextCursor: number | null;
};

/**
 * Render a batch of journal entries (newest first) to HTML. The client only
 * appends what this returns, on first paint and for every older batch.
 */
export function renderJournalEntries(
  entries: ReadonlyArray<{ seq: number; step: number; type: string; payload: unknown }>,
  characterName: string,
): RenderedJournalEntry[] {
  return entries.map((entry) => {
    const rendered = renderJournalEntry(entry.type, entry.payload, characterName);
    return { seq: entry.seq, step: entry.step, label: rendered.label, html: rendered.html };
  });
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
