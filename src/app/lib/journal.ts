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

/** A stored Journal row as the batch renderers read it: the entry plus its sequence position. */
export type StoredJournalEntry = JournalEntryView & {
  seq: number;
  step: number;
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
  entries: ReadonlyArray<StoredJournalEntry>,
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
  entries: ReadonlyArray<StoredJournalEntry>,
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
 * Language current when the Journal is read. Structured entries (intro, Scene
 * narration, Choice taken, Outcome narration, travel, Ending, Test,
 * state changes, inventory actions) render their event data with the catalogue
 * and their Scenario text as presented, each name carrying the entry's `lang`.
 * Rows stored before structured events hold English text and are shown
 * verbatim, with only their type label from the catalogue.
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
    return { label, html: renderTestEntry(record, catalogue, lang, text) };
  }
  if (entry.type === 'state-change') {
    return { label, html: renderStateChangeEntry(record, catalogue, lang, text) };
  }
  if (entry.type === 'inventory') {
    return { label, html: renderInventoryEntry(record, catalogue, lang, text) };
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

/**
 * A catalogue message with a Scenario name inside: the name keeps the entry's
 * `lang`, the Interface Text around it does not.
 */
function messageWithName(message: string, name: string, lang: string): string {
  if (name === '') return `<p>${escapeHtml(message)}</p>`;
  const at = message.lastIndexOf(name);
  if (at === -1) return `<p>${escapeHtml(message)}</p>`;
  const before = escapeHtml(message.slice(0, at));
  const after = escapeHtml(message.slice(at + name.length));
  return `<p>${before}<span lang="${escapeHtml(lang)}">${escapeHtml(name)}</span>${after}</p>`;
}

function isAttributeId(value: unknown): value is keyof Catalogue['attributes'] {
  return value === 'might' || value === 'agility' || value === 'wits' || value === 'presence';
}

function isDifficultyId(value: unknown): value is keyof Catalogue['difficulty'] {
  return value === 'easy' || value === 'ordinary' || value === 'hard' || value === 'very-hard';
}

function toCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * A Test entry: legacy rows carry the English sentence and are shown verbatim;
 * new rows carry the structured roll and render through the catalogue of the
 * current Interface Language.
 */
function renderTestEntry(
  record: Record<string, unknown>,
  catalogue: Catalogue,
  lang: string,
  text: string,
): string {
  if (text !== '') {
    return `<p lang="${escapeHtml(lang)}">${escapeHtml(text)}</p>`;
  }
  if (!isAttributeId(record.attribute) || !isDifficultyId(record.difficulty)) {
    return `<p>${escapeHtml(catalogue.journal.types.test)}</p>`;
  }
  const die1 = toCount(record.die1);
  const die2 = toCount(record.die2);
  const modifier = toCount(record.modifier);
  const total = toCount(record.total);
  const target = toCount(record.target);
  if (
    die1 === undefined ||
    die2 === undefined ||
    modifier === undefined ||
    total === undefined ||
    target === undefined
  ) {
    return `<p>${escapeHtml(catalogue.journal.types.test)}</p>`;
  }
  const success = record.success === true;
  const message = catalogue.journal.test(
    catalogue.attributes[record.attribute],
    catalogue.difficulty[record.difficulty],
    target,
    die1,
    die2,
    modifier,
    total,
    success,
  );
  return `<p>${escapeHtml(message)}</p>`;
}

/**
 * A state-change entry: legacy rows carry the English sentence and are shown
 * verbatim; new rows carry the structured change and render through the
 * catalogue. Names inside messages carry the entry's `lang`.
 */
function renderStateChangeEntry(
  record: Record<string, unknown>,
  catalogue: Catalogue,
  lang: string,
  text: string,
): string {
  if (text !== '') {
    return `<p lang="${escapeHtml(lang)}">${escapeHtml(text)}</p>`;
  }
  const change = record.change;
  if (change === 'item-received' || change === 'item-lost') {
    const name = typeof record.name === 'string' ? record.name : undefined;
    const amount = toCount(record.amount) ?? 1;
    if (name === undefined) return `<p>${escapeHtml(catalogue.journal.types.stateChange)}</p>`;
    const message =
      change === 'item-received'
        ? catalogue.journal.itemReceived(name, amount)
        : catalogue.journal.itemLost(name, amount);
    return messageWithName(message, name, lang);
  }
  if (change === 'health-gained') {
    const amount = toCount(record.amount);
    if (amount === undefined) return `<p>${escapeHtml(catalogue.journal.types.stateChange)}</p>`;
    return `<p>${escapeHtml(catalogue.journal.healthGained(amount))}</p>`;
  }
  if (change === 'health-lost') {
    const amount = toCount(record.amount);
    if (amount === undefined) return `<p>${escapeHtml(catalogue.journal.types.stateChange)}</p>`;
    return `<p>${escapeHtml(catalogue.journal.healthLost(amount))}</p>`;
  }
  if (change === 'revealed') {
    const name = typeof record.name === 'string' ? record.name : undefined;
    if (name === undefined) return `<p>${escapeHtml(catalogue.journal.types.stateChange)}</p>`;
    return messageWithName(catalogue.journal.revealed(name), name, lang);
  }
  return `<p>${escapeHtml(catalogue.journal.types.stateChange)}</p>`;
}

/**
 * An inventory-action entry: legacy rows carry the English sentence and are
 * shown verbatim; new rows carry the structured action and render through the
 * catalogue. The item name carries the entry's `lang`.
 */
function renderInventoryEntry(
  record: Record<string, unknown>,
  catalogue: Catalogue,
  lang: string,
  text: string,
): string {
  if (text !== '') {
    return `<p lang="${escapeHtml(lang)}">${escapeHtml(text)}</p>`;
  }
  const action = record.action;
  const name = typeof record.name === 'string' ? record.name : undefined;
  if (name === undefined) return `<p>${escapeHtml(catalogue.journal.types.inventory)}</p>`;
  if (action === 'equipped') {
    return messageWithName(catalogue.journal.equipped(name), name, lang);
  }
  if (action === 'unequipped') {
    return messageWithName(catalogue.journal.unequipped(name), name, lang);
  }
  if (action === 'used') {
    const healed = toCount(record.healed) ?? 0;
    return messageWithName(catalogue.journal.used(name, healed), name, lang);
  }
  return `<p>${escapeHtml(catalogue.journal.types.inventory)}</p>`;
}
