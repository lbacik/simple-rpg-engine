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
import { combatRounds } from '../../engine/index';
import type {
  CombatParticipantRef,
  TacticalActionEvent,
} from '../../engine/index';
import type { Catalogue } from '../../i18n/index';
import { primaryLanguageSubtag } from '../../i18n/languages';
import {
  combatEndLine,
  combatRollLine,
  combatRoundLines,
  combatStartLine,
  enemyDefeatedLine,
  wrapScenarioNames,
} from './combat-text';

/** Entries per journal batch. */
export const JOURNAL_BATCH_SIZE = 20 as const;

/** Journal entry types the engine produces today. */
const NARRATION_ENTRY_TYPES: ReadonlySet<string> = new Set(['intro', 'scene', 'outcome']);

/**
 * Entry types whose primary content is Scenario text (narration, Choice
 * wording, the Ending's title and closing narration, the Combat opening
 * narration): after a language switch these keep the language they were
 * presented in and are visibly marked when it differs from the Interface
 * Language (docs/spec/ui.md, journal). Engine-generated entries (Test, state
 * changes, travel, Combat rounds and ends, the Enemy-defeated notice,
 * inventory actions) carry no flag even when they mention a name: the name
 * inside them only carries its `lang`.
 */
const SCENARIO_TEXT_ENTRY_TYPES: ReadonlySet<string> = new Set([
  'intro',
  'scene',
  'choice',
  'outcome',
  'ending',
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

/** The flag after an entry's type label: the entry's language and its accessible name. */
export type JournalEntryFlag = {
  lang: string;
  label: string;
};

/**
 * The flag after an entry's type label (docs/spec/ui.md, journal): the
 * entry's recorded `lang` (`en` for legacy rows) when the entry holds
 * Scenario text and that language differs from the catalogue's Interface
 * Language by primary language subtag, so `en-US` entries under `en` carry no
 * flag. Engine-generated entries never carry one. The accessible name is the
 * language's name in the Interface Language; whether it is the Scenario's
 * Base Language ("(original)") is unknowable here, since rendering an entry
 * needs only the entry and the catalogue, never the Scenario content.
 */
export function journalEntryFlag(
  entry: JournalEntryView,
  catalogue: Catalogue,
): JournalEntryFlag | undefined {
  if (!SCENARIO_TEXT_ENTRY_TYPES.has(entry.type)) return undefined;
  const lang = entryLang(entry.lang);
  if (primaryLanguageSubtag(lang) === primaryLanguageSubtag(catalogue.code)) {
    return undefined;
  }
  return { lang, label: catalogue.scenarioLanguage.flagName(lang, false) };
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
  /** The entry's language when its type label carries a flag, else null. */
  flag: string | null;
  /** The flag's accessible name in the Interface Language, else null. */
  flagLabel: string | null;
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
    return {
      seq: entry.seq,
      step: entry.step,
      label: rendered.label,
      html: rendered.html,
      flag: rendered.flag,
      flagLabel: rendered.flagLabel,
    };
  });
}

/**
 * Render one journal entry to HTML through the catalogue of the Interface
 * Language current when the Journal is read. Structured entries (intro, Scene
 * narration, Choice taken, Outcome narration, travel, Combat start, rounds
 * and end, the Enemy-defeated notice, Ending, Test, state changes, inventory
 * actions) render their event data with the catalogue and their Scenario
 * text as presented, each name carrying the entry's `lang`. Rows stored
 * before structured events hold English text and are shown verbatim, with
 * only their type label from the catalogue. Entries holding Scenario text in
 * another language also carry its flag for the type label line.
 */
export function renderJournalEntry(
  entry: JournalEntryView,
  catalogue: Catalogue,
  characterName: string,
): { label: string; html: string; flag: string | null; flagLabel: string | null } {
  const label = journalEntryLabel(entry.type, catalogue);
  const flag = journalEntryFlag(entry, catalogue);
  const flagged = {
    flag: flag?.lang ?? null,
    flagLabel: flag?.label ?? null,
  };
  const lang = entryLang(entry.lang);
  const record = (entry.payload ?? {}) as Record<string, unknown>;
  const text = String(record.text ?? '');
  if (NARRATION_ENTRY_TYPES.has(entry.type)) {
    return { label, html: `<div lang="${escapeHtml(lang)}">${renderStoredText(text, characterName)}</div>`, ...flagged };
  }
  if (entry.type === 'choice') {
    return { label, html: `<div lang="${escapeHtml(lang)}"><p>${escapeHtml(text)}</p></div>`, ...flagged };
  }
  if (entry.type === 'travel') {
    return { label, html: renderTravelEntry(record, catalogue, lang), ...flagged };
  }
  if (entry.type === 'combat-start') {
    return { label, html: renderCombatStartEntry(record, catalogue, lang, characterName), ...flagged };
  }
  if (entry.type === 'combat-round') {
    return { label, html: renderCombatRoundEntry(record, catalogue, lang, characterName), ...flagged };
  }
  if (entry.type === 'combat-end') {
    return { label, html: renderCombatEndEntry(record, catalogue, lang), ...flagged };
  }
  if (entry.type === 'enemy-defeated') {
    return { label, html: renderEnemyDefeatedEntry(record, catalogue, lang), ...flagged };
  }
  if (entry.type === 'ending') {
    const kind =
      record.kind === 'victory' ? catalogue.journal.victory : catalogue.journal.defeat;
    const title = String(record.title ?? '');
    return {
      label,
      html: `<p class="meta">${escapeHtml(kind)}</p><h3 lang="${escapeHtml(lang)}">${escapeHtml(title)}</h3><div lang="${escapeHtml(lang)}">${renderStoredText(text, characterName)}</div>`,
      ...flagged,
    };
  }
  if (entry.type === 'test') {
    return { label, html: renderTestEntry(record, catalogue, lang, text), ...flagged };
  }
  if (entry.type === 'state-change') {
    return { label, html: renderStateChangeEntry(record, catalogue, lang, text), ...flagged };
  }
  if (entry.type === 'inventory') {
    return { label, html: renderInventoryEntry(record, catalogue, lang, text), ...flagged };
  }
  return { label, html: `<p lang="${escapeHtml(lang)}">${escapeHtml(text)}</p>`, ...flagged };
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

/** A Combat entry's Enemy name as presented; absent on legacy rows. */
function combatEnemyName(record: Record<string, unknown>): string | undefined {
  const name = typeof record.enemyName === 'string' ? record.enemyName : undefined;
  return name === undefined || name === '' ? undefined : name;
}

/**
 * A tactical (v2) participant reference list, as stored on combat-start,
 * combat-end and enemy-defeated entries. The full per-lane report rendering
 * arrives with the application integration (I5); until then each participant
 * renders through the existing single-opponent line helpers.
 */
function tacticalParticipants(record: Record<string, unknown>): CombatParticipantRef[] | undefined {
  const participants = record.participants;
  if (!Array.isArray(participants)) return undefined;
  if (
    !participants.every(
      (entry) =>
        typeof (entry as CombatParticipantRef).participantId === 'string' &&
        typeof (entry as CombatParticipantRef).name === 'string',
    )
  ) {
    return undefined;
  }
  return participants as CombatParticipantRef[];
}

/**
 * One participant as presented in an interim tactical line: the Enemy name,
 * with the same-kind ordinal when the Encounter holds several of the kind.
 */
function tacticalParticipantName(ref: CombatParticipantRef): string {
  return ref.ordinal === undefined ? ref.name : `${ref.name} ${ref.ordinal}`;
}

/**
 * A Combat start entry: tactical (v2) rows carry every participant taking
 * part as presented and render the narration with one opponent line each;
 * v1 rows carry the opening narration plus the Enemy's name; legacy rows
 * carry the English narration only and are shown verbatim.
 */
function renderCombatStartEntry(
  record: Record<string, unknown>,
  catalogue: Catalogue,
  lang: string,
  characterName: string,
): string {
  const text = String(record.text ?? '');
  const narration = `<div lang="${escapeHtml(lang)}">${renderStoredText(text, characterName)}</div>`;
  const participants = tacticalParticipants(record);
  if (participants !== undefined) {
    const names = participants.map(tacticalParticipantName);
    const lines = participants
      .map(
        (ref) =>
          `<p>${wrapScenarioNames(combatStartLine(tacticalParticipantName(ref), catalogue), names, lang)}</p>`,
      )
      .join('');
    return `${narration}${lines}`;
  }
  const enemyName = combatEnemyName(record);
  if (enemyName === undefined) return narration;
  return `${narration}<p>${wrapScenarioNames(combatStartLine(enemyName, catalogue), [enemyName], lang)}</p>`;
}

/**
 * A Combat round entry: tactical (v2) rows carry every action of the Round as
 * events and render one line per executed action plus the roll chips (Prepare
 * and non-executed actions render nothing yet; the structured event retains
 * their data for the full report in I5); v1 rows carry the Round as events
 * (action, rolls, Damage, Range before and after, guard); legacy rows carry
 * English text and are shown verbatim.
 */
function renderCombatRoundEntry(
  record: Record<string, unknown>,
  catalogue: Catalogue,
  lang: string,
  characterName: string,
): string {
  if (Array.isArray(record.actions)) {
    return renderTacticalRoundEntry(
      record.actions as TacticalActionEvent[],
      catalogue,
      lang,
      characterName,
    );
  }
  const enemyName = combatEnemyName(record);
  if (enemyName === undefined) {
    return `<p lang="${escapeHtml(lang)}">${escapeHtml(String(record.text ?? ''))}</p>`;
  }
  const encounterId = typeof record.encounterId === 'string' ? record.encounterId : '';
  const [round] = combatRounds([{ type: 'combat-round', payload: record }], encounterId);
  if (round === undefined) return '';
  const names = [
    characterName,
    enemyName,
    ...(typeof record.weaponName === 'string' ? [record.weaponName] : []),
    ...(typeof record.itemName === 'string' ? [record.itemName] : []),
  ];
  const lines = combatRoundLines(round, catalogue)
    .map((line) => `<p>${wrapScenarioNames(line, names, lang)}</p>`)
    .join('');
  const chips = round.rolls
    .map(
      (roll) =>
        `<li>${wrapScenarioNames(combatRollLine(roll, catalogue, characterName, enemyName), names, lang)}</li>`,
    )
    .join('');
  return `${lines}${chips === '' ? '' : `<ul class="combat-rolls">${chips}</ul>`}`;
}

/**
 * One interim tactical Round: one line per executed action that fits an
 * existing line helper (Character attacks, Enemy Strikes and Heavy attacks,
 * Close in), plus one roll chip per roll. Prepare and non-executed actions
 * (cancelled, dropped, not reached) render nothing yet; the structured event
 * retains their data for the full report (I5).
 */
function renderTacticalRoundEntry(
  actions: TacticalActionEvent[],
  catalogue: Catalogue,
  lang: string,
  characterName: string,
): string {
  const names = [characterName];
  for (const action of actions) {
    const actorName =
      action.actor.kind === 'character' ? characterName : tacticalParticipantName(action.actor);
    if (!names.includes(actorName)) names.push(actorName);
    if (action.weaponName !== undefined && !names.includes(action.weaponName)) {
      names.push(action.weaponName);
    }
  }
  const lines: string[] = [];
  const chips: string[] = [];
  for (const action of actions) {
    const actorName =
      action.actor.kind === 'character' ? characterName : tacticalParticipantName(action.actor);
    if (action.roll !== undefined) {
      chips.push(
        `<li>${wrapScenarioNames(combatRollLine(action.roll, catalogue, characterName, actorName), names, lang)}</li>`,
      );
    }
    if (action.status !== 'executed' || action.roll === undefined) {
      if (
        action.status === 'executed' &&
        action.actor.kind === 'participant' &&
        action.kind === 'close-in'
      ) {
        const rangeAfter = catalogue.range[action.rangeAfter ?? 'near'];
        lines.push(
          `<p>${wrapScenarioNames(catalogue.combat.lineEnemyClosesIn(actorName, rangeAfter), names, lang)}</p>`,
        );
      }
      continue;
    }
    const roll = action.roll;
    const score = catalogue.combat.rollScore(
      roll.die1,
      roll.die2,
      roll.modifier,
      roll.total,
      roll.target,
    );
    if (action.actor.kind === 'character') {
      const weapon = action.weaponName ?? catalogue.combat.unarmed;
      lines.push(
        roll.hit
          ? `<p>${wrapScenarioNames(catalogue.combat.lineAttackHit(weapon, score, catalogue.combat.damage(roll.damage)), names, lang)}</p>`
          : `<p>${wrapScenarioNames(catalogue.combat.lineAttackMiss(weapon, score), names, lang)}</p>`,
      );
    } else if (action.kind === 'strike' || action.kind === 'heavy-attack') {
      lines.push(
        roll.hit
          ? `<p>${wrapScenarioNames(catalogue.combat.lineEnemyAttackHit(actorName, score, catalogue.combat.damage(roll.damage)), names, lang)}</p>`
          : `<p>${wrapScenarioNames(catalogue.combat.lineEnemyAttackMiss(actorName, score, false), names, lang)}</p>`,
      );
    }
  }
  return `${lines.join('')}${chips.length === 0 ? '' : `<ul class="combat-rolls">${chips.join('')}</ul>`}`;
}

/**
 * A Combat end entry: tactical (v2) rows carry every participant as presented
 * and render one closing line each; v1 rows carry how the Combat ended with
 * the Enemy's name; legacy rows carry the English sentence and are shown
 * verbatim.
 */
function renderCombatEndEntry(
  record: Record<string, unknown>,
  catalogue: Catalogue,
  lang: string,
): string {
  const participants = tacticalParticipants(record);
  if (participants !== undefined) {
    const names = participants.map(tacticalParticipantName);
    const howEnded = record.howEnded === 'escape' ? 'escape' : 'victory';
    return participants
      .map(
        (ref) =>
          `<p>${wrapScenarioNames(combatEndLine(howEnded, tacticalParticipantName(ref), catalogue), names, lang)}</p>`,
      )
      .join('');
  }
  const enemyName = combatEnemyName(record);
  if (enemyName === undefined) {
    return `<p lang="${escapeHtml(lang)}">${escapeHtml(String(record.text ?? ''))}</p>`;
  }
  const howEnded = record.howEnded === 'escape' ? 'escape' : 'victory';
  return `<p>${wrapScenarioNames(combatEndLine(howEnded, enemyName, catalogue), [enemyName], lang)}</p>`;
}

/**
 * The Enemy-defeated notice: tactical (v2) rows carry every participant as
 * presented and render one notice line each; v1 rows carry the Enemy's name;
 * legacy rows carry the English sentence and are shown verbatim.
 */
function renderEnemyDefeatedEntry(
  record: Record<string, unknown>,
  catalogue: Catalogue,
  lang: string,
): string {
  const participants = tacticalParticipants(record);
  if (participants !== undefined) {
    const names = participants.map(tacticalParticipantName);
    return participants
      .map(
        (ref) =>
          `<p>${wrapScenarioNames(enemyDefeatedLine(tacticalParticipantName(ref), catalogue), names, lang)}</p>`,
      )
      .join('');
  }
  const enemyName = combatEnemyName(record);
  if (enemyName === undefined) {
    return `<p lang="${escapeHtml(lang)}">${escapeHtml(String(record.text ?? ''))}</p>`;
  }
  return `<p>${wrapScenarioNames(enemyDefeatedLine(enemyName, catalogue), [enemyName], lang)}</p>`;
}

export type JournalEnding = {
  endingId: string;
  kind: 'victory' | 'defeat';
  title: string;
  text: string;
  /** The language the Ending was presented in; `en` for legacy rows. */
  lang: string;
};

/**
 * The Ending as recorded when the Playthrough ended: kind, title and closing
 * narration, stored as presented. Used when the Scenario is gone (or its
 * Ending with it) and only the Journal remains.
 */
export function latestJournalEnding(
  entries: ReadonlyArray<{ type: string; lang?: unknown; payload: unknown }>,
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
      lang: entryLang(entry.lang),
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
