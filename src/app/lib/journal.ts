// Journal rendering (docs/spec/playthrough-state.md, journal; docs/spec/ui.md,
// journal; ADR 0004): a read-only, text-only list of the entries, newest
// first, with infinite scroll towards the first entry.
//
// One renderer serves the Journal page, the modal batches and the result
// panel. Entry type labels and the wording of structured engine events come
// from the catalogue of the Interface Language current when the Journal is
// read, so rendering needs only the entry and the catalogue, never the
// Scenario content. Scenario text (narration, Choice wording, Ending titles
// and names inside engine messages) is shown as presented, each element
// carrying the entry's recorded `lang`. Rows stored before Interface
// Languages existed hold English text and no event: they are shown verbatim,
// with only their type label from the catalogue.

import { escapeHtml, renderStoredText } from '../../engine/narration';
import type { Catalogue } from '../../i18n/index';

/** Entries per journal batch. */
export const JOURNAL_BATCH_SIZE = 20 as const;

/** Journal entry types the engine produces today. */
const NARRATION_ENTRY_TYPES: ReadonlySet<string> = new Set([
  'intro',
  'scene',
  'outcome',
  'combat-start',
]);

/** A Journal entry as the renderer reads it: stored rows and new engine entries alike. */
export type JournalEntryView = {
  type: string;
  lang?: unknown;
  payload: unknown;
};

/** The entry's recorded language, defaulting to English for legacy rows. */
function entryLang(lang: unknown): string {
  return typeof lang === 'string' && lang !== '' ? lang : 'en';
}

/** Human labels per entry type from the catalogue, shown beside the step. */
export function journalEntryLabel(type: string, catalogue: Catalogue): string {
  switch (type) {
    case 'intro':
      return catalogue.journal.types.intro;
    case 'scene':
      return catalogue.journal.types.scene;
    case 'choice':
      return catalogue.journal.types.choice;
    case 'test':
      return catalogue.journal.types.test;
    case 'outcome':
      return catalogue.journal.types.outcome;
    case 'state-change':
      return catalogue.journal.types.stateChange;
    case 'travel':
      return catalogue.journal.types.travel;
    case 'combat-start':
      return catalogue.journal.types.combatStart;
    case 'combat-round':
      return catalogue.journal.types.combatRound;
    case 'combat-end':
      return catalogue.journal.types.combatEnd;
    case 'enemy-defeated':
      return catalogue.journal.types.enemyDefeated;
    case 'inventory':
      return catalogue.journal.types.inventory;
    case 'ending':
      return catalogue.journal.types.ending;
    default:
      return type;
  }
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

/**
 * The newest journal batch for the modal over the game screen: the game page
 * already holds the whole Journal (oldest first) for the result panel, so the
 * modal reuses it instead of a second store read. The slice is newest first
 * with the same sequence cursor the batch route uses (`null` when the start
 * of the Journal is reached), so entries appended during play never shift or
 * duplicate what is on screen.
 */
export function newestJournalBatch<T extends { seq: number }>(
  entries: ReadonlyArray<T>,
  limit: number,
): { shown: T[]; nextCursor: number | null; total: number } {
  const total = entries.length;
  const shown = [...entries].reverse().slice(0, limit);
  const nextCursor = total > limit ? (shown[shown.length - 1]?.seq ?? null) : null;
  return { shown, nextCursor, total };
}

/**
 * The newest journal batch for the modal over the game screen, rendered to
 * HTML in one step: the game page already holds the whole Journal (oldest
 * first) for the result panel, so the modal reuses it instead of a second
 * store read. Shared by the game, Ending and incompatible-with-Scenario
 * screens, which all open the same modal.
 */
export function modalJournalBatch(
  entries: ReadonlyArray<{ seq: number; step: number; type: string; lang?: unknown; payload: unknown }>,
  catalogue: Catalogue,
  characterName: string,
): { entries: RenderedJournalEntry[]; nextCursor: number | null; total: number } {
  const batch = newestJournalBatch(entries, JOURNAL_BATCH_SIZE);
  return {
    entries: renderJournalEntries(batch.shown, catalogue, characterName),
    nextCursor: batch.nextCursor,
    total: batch.total,
  };
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
  entries: ReadonlyArray<{
    seq: number;
    step: number;
    type: string;
    lang?: unknown;
    payload: unknown;
  }>,
  catalogue: Catalogue,
  characterName: string,
): RenderedJournalEntry[] {
  return entries.map((entry) => {
    const rendered = renderJournalEntry(entry, catalogue, characterName);
    return { seq: entry.seq, step: entry.step, label: rendered.label, html: rendered.html };
  });
}

/**
 * Render one journal entry to HTML through the catalogue of the Interface
 * Language current when the Journal is read. Structured entries of this
 * batch (intro, Scene narration, Choice taken, Outcome narration, travel,
 * Ending) render their event data with the catalogue and their Scenario text
 * as presented, each element carrying the entry's `lang`. Every other kind
 * still stores English text and is shown verbatim, with only its type label
 * from the catalogue; later tickets move those kinds to structured events.
 */
export function renderJournalEntry(
  entry: JournalEntryView,
  catalogue: Catalogue,
  characterName: string,
): { label: string; html: string } {
  const label = journalEntryLabel(entry.type, catalogue);
  const lang = entryLang(entry.lang);
  const record = (entry.payload ?? {}) as Record<string, unknown>;
  const text = String(record.text ?? '');
  if (NARRATION_ENTRY_TYPES.has(entry.type)) {
    return { label, html: `<div lang="${escapeHtml(lang)}">${renderStoredText(text, characterName)}</div>` };
  }
  if (entry.type === 'choice') {
    return { label, html: `<div lang="${escapeHtml(lang)}"><p>${escapeHtml(text)}</p></div>` };
  }
  if (entry.type === 'travel') {
    return { label, html: renderTravelEntry(record, catalogue, lang) };
  }
  if (entry.type === 'ending') {
    const kind =
      record.kind === 'victory' ? catalogue.journal.victory : catalogue.journal.defeat;
    const title = String(record.title ?? '');
    return {
      label,
      html: `<p class="meta">${escapeHtml(kind)}</p><h3 lang="${escapeHtml(lang)}">${escapeHtml(title)}</h3><div lang="${escapeHtml(lang)}">${renderStoredText(text, characterName)}</div>`,
    };
  }
  if (entry.type === 'test') {
    return {
      label,
      html: `<p lang="${escapeHtml(lang)}">${escapeHtml(testText(record, text))}</p>`,
    };
  }
  return { label, html: `<p lang="${escapeHtml(lang)}">${escapeHtml(text)}</p>` };
}

/**
 * A travel entry: new rows carry the target Location's name and id as event
 * data and render the catalogue's travel wording around the name (in its own
 * `lang` element, since a name inside an engine message is Scenario text);
 * legacy rows carry the English sentence and are shown verbatim.
 */
function renderTravelEntry(
  record: Record<string, unknown>,
  catalogue: Catalogue,
  lang: string,
): string {
  const name = typeof record.name === 'string' ? record.name : undefined;
  if (name === undefined) {
    return `<p lang="${escapeHtml(lang)}">${escapeHtml(String(record.text ?? ''))}</p>`;
  }
  const message = catalogue.journal.travel(name);
  if (name === '') return `<p>${escapeHtml(message)}</p>`;
  const at = message.lastIndexOf(name);
  if (at === -1) return `<p>${escapeHtml(message)}</p>`;
  const before = escapeHtml(message.slice(0, at));
  const after = escapeHtml(message.slice(at + name.length));
  return `<p>${before}<span lang="${escapeHtml(lang)}">${escapeHtml(name)}</span>${after}</p>`;
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
