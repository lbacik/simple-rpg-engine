// Journal rendering and cursor batches (docs/spec/playthrough-state.md,
// journal; docs/spec/ui.md, journal): every entry type renders in order with
// the step that produced it, narration entries reuse the game screen's
// Markdown subset on the stored text, and batches slice the append-only
// journal_entries table newest first by sequence cursor.

import { describe, expect, it } from 'vitest';
import {
  JOURNAL_BATCH_SIZE,
  journalEntryLabel,
  journalHref,
  latestJournalEnding,
  parseJournalCursor,
  renderJournalEntries,
  renderJournalEntry,
} from '../src/app/lib/journal';
import { migrateDatabase, openDatabase, PlaythroughStore } from '../src/persistence/index';
import { STATE_VERSION, type PlaythroughState } from '../src/engine/state';

function makeState(): PlaythroughState {
  return {
    stateVersion: STATE_VERSION,
    scenarioId: 'meadow',
    scenarioVersion: '1.0.0',
    contentHash: 'abc',
    status: 'active',
    step: 0,
    character: {
      templateId: 'hunter',
      name: 'Robin',
      baseAttributes: { might: 1, agility: 3, wits: 2, presence: 0 },
      health: 12,
    },
    inventory: {},
    equipment: {},
    currentLocationId: 'glade',
    activeSceneId: null,
    activeCombat: null,
    visited: ['glade'],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounterDamage: {},
  };
}

describe('renderJournalEntry', () => {
  const name = 'Robin';

  it('renders the intro with the Markdown subset on the stored text', () => {
    const rendered = renderJournalEntry(
      'intro',
      { text: 'You wake, **Robin**-less stranger.' },
      name,
    );
    expect(rendered.label).toBe('Intro');
    expect(rendered.html).toContain('<strong>');
    expect(rendered.html).toContain('<p>');
  });

  it('renders Scene narration with the Markdown subset', () => {
    const rendered = renderJournalEntry('scene', { text: 'The *mist* parts.' }, name);
    expect(rendered.label).toBe('Scene');
    expect(rendered.html).toContain('<em>mist</em>');
  });

  it('renders the Choice taken as plain text', () => {
    const rendered = renderJournalEntry('choice', { text: 'Push on <b>now</b>' }, name);
    expect(rendered.label).toBe('Choice taken');
    expect(rendered.html).toContain('Chose:');
    expect(rendered.html).toContain('&lt;b&gt;now&lt;/b&gt;');
    expect(rendered.html).not.toContain('<b>');
  });

  it('renders the Test with dice, modifier, total and result', () => {
    const rendered = renderJournalEntry(
      'test',
      {
        text: 'Might, Ordinary 9: rolled 3 and 4, modifier +2, total 9 — success.',
        attribute: 'might',
        difficulty: 'ordinary',
        die1: 3,
        die2: 4,
        modifier: 2,
        total: 9,
        success: true,
      },
      name,
    );
    expect(rendered.label).toBe('Test');
    expect(rendered.html).toContain('rolled 3 and 4');
    expect(rendered.html).toContain('total 9');
    expect(rendered.html).toContain('success');
  });

  it('renders Outcome narration with the Markdown subset', () => {
    const rendered = renderJournalEntry('outcome', { text: 'You **win** the day.' }, name);
    expect(rendered.label).toBe('Outcome');
    expect(rendered.html).toContain('<strong>win</strong>');
  });

  it('renders state changes as plain text', () => {
    const rendered = renderJournalEntry('state-change', { text: 'received: rope ×2' }, name);
    expect(rendered.label).toBe('State change');
    expect(rendered.html).toContain('received: rope ×2');
  });

  it('renders travel as plain text', () => {
    const rendered = renderJournalEntry(
      'travel',
      { text: 'Travelled to Dark Grove.', to: 'grove' },
      name,
    );
    expect(rendered.label).toBe('Travel');
    expect(rendered.html).toContain('Travelled to Dark Grove.');
  });

  it('renders Combat start narration with the Markdown subset', () => {
    const rendered = renderJournalEntry(
      'combat-start',
      { text: 'A **wolf** lunges from the *mist*!' },
      name,
    );
    expect(rendered.label).toBe('Combat start');
    expect(rendered.html).toContain('<strong>wolf</strong>');
    expect(rendered.html).toContain('<em>mist</em>');
  });

  it('renders a Combat round as plain text', () => {
    const rendered = renderJournalEntry(
      'combat-round',
      { text: 'Round 1: attacked for 3 damage, enemy missed. Range: near.' },
      name,
    );
    expect(rendered.label).toBe('Combat round');
    expect(rendered.html).toContain('Round 1');
  });

  it('renders Combat end as plain text', () => {
    const rendered = renderJournalEntry('combat-end', { text: 'Victory! The wolf falls.' }, name);
    expect(rendered.label).toBe('Combat end');
    expect(rendered.html).toContain('Victory! The wolf falls.');
  });

  it('renders the Enemy-defeated notice as plain text', () => {
    const rendered = renderJournalEntry(
      'enemy-defeated',
      { text: 'The wolf is defeated.' },
      name,
    );
    expect(rendered.label).toBe('Enemy defeated');
    expect(rendered.html).toContain('The wolf is defeated.');
  });

  it('renders inventory actions as plain text', () => {
    for (const text of [
      'Equipped Hunter’s Cloak.',
      'Unequipped Hunter’s Cloak.',
      'Used Herbs, restored 3 Health.',
    ]) {
      const rendered = renderJournalEntry('inventory', { text }, name);
      expect(rendered.label).toBe('Inventory');
      expect(rendered.html).toContain(text.split(',')[0] ?? text);
    }
  });

  it('renders the Ending with kind, title and Markdown narration', () => {
    const rendered = renderJournalEntry(
      'ending',
      { kind: 'victory', title: 'Dawn Breaks', text: 'The **sun** rises, Robin.' },
      name,
    );
    expect(rendered.label).toBe('Ending');
    expect(rendered.html).toContain('Victory');
    expect(rendered.html).toContain('Dawn Breaks');
    expect(rendered.html).toContain('<strong>sun</strong>');
  });

  it('keeps a markup-like character name literal in narration entries', () => {
    const rendered = renderJournalEntry('scene', { text: 'Hail, **boss**!' }, '**boss**');
    // The name stays literal: its asterisks never form emphasis.
    expect(rendered.html).toBe('<p>Hail, **boss**!</p>');
  });

  it('labels unknown types with the raw type', () => {
    expect(journalEntryLabel('mystery')).toBe('mystery');
  });
});

describe('journal cursor helpers', () => {
  it('parses sequence cursors with a safe default', () => {
    expect(parseJournalCursor(undefined)).toBeUndefined();
    expect(parseJournalCursor('6')).toBe(6);
    expect(parseJournalCursor('0')).toBeUndefined();
    expect(parseJournalCursor('-3')).toBeUndefined();
    expect(parseJournalCursor('nope')).toBeUndefined();
    expect(parseJournalCursor('')).toBeUndefined();
  });

  it('builds cursor links that degrade to plain links without JavaScript', () => {
    expect(journalHref('pt-1')).toBe('/play/pt-1/journal');
    expect(journalHref('pt-1', null)).toBe('/play/pt-1/journal');
    expect(journalHref('pt-1', 6)).toBe('/play/pt-1/journal?before=6');
  });

  it('uses a fixed batch size', () => {
    expect(JOURNAL_BATCH_SIZE).toBe(20);
  });

  it('renders a batch newest first with labels and steps', () => {
    const rendered = renderJournalEntries(
      [
        { seq: 2, step: 1, type: 'travel', payload: { text: 'Travelled on.' } },
        { seq: 1, step: 0, type: 'intro', payload: { text: 'You wake.' } },
      ],
      'Robin',
    );
    expect(rendered.map((entry) => entry.seq)).toEqual([2, 1]);
    expect(rendered[0]).toMatchObject({ label: 'Travel', step: 1 });
    expect(rendered[0]?.html).toContain('Travelled on.');
    expect(rendered[1]).toMatchObject({ label: 'Intro', step: 0 });
  });
});

describe('journal cursor batches in the store', () => {
  async function journalWith(count: number) {
    const db = openDatabase(':memory:');
    await migrateDatabase(db);
    const store = new PlaythroughStore(db);
    await store.create(
      {
        id: 'pt-journal',
        sessionId: 'hash-1',
        scenarioId: 'meadow',
        scenarioVersion: '1.0.0',
        contentHash: 'abc',
        status: 'active',
        step: count,
        state: makeState(),
      },
      [],
    );
    await store.appendJournal(
      'pt-journal',
      Array.from({ length: count }, (_, index) => ({
        step: index,
        type: index % 2 === 0 ? 'scene' : 'travel',
        payload: { text: `entry ${index + 1}` },
      })),
    );
    return { db, store };
  }

  it('reads the first batch newest first', async () => {
    const { db, store } = await journalWith(JOURNAL_BATCH_SIZE + 5);
    try {
      expect(await store.countJournal('pt-journal')).toBe(JOURNAL_BATCH_SIZE + 5);

      const first = await store.listJournalBatch('pt-journal', {
        limit: JOURNAL_BATCH_SIZE,
      });
      expect(first.entries).toHaveLength(JOURNAL_BATCH_SIZE);
      expect(first.entries.map((entry) => entry.seq)).toEqual(
        Array.from({ length: JOURNAL_BATCH_SIZE }, (_, index) => JOURNAL_BATCH_SIZE + 5 - index),
      );
      expect(first.nextCursor).toBe(6);

      // The full list stays oldest first for the game screen.
      const all = await store.listJournal('pt-journal');
      expect(all.map((entry) => entry.seq)).toEqual(
        Array.from({ length: JOURNAL_BATCH_SIZE + 5 }, (_, index) => index + 1),
      );
    } finally {
      await db.destroy();
    }
  });

  it('reads a middle batch older than the cursor', async () => {
    const { db, store } = await journalWith(JOURNAL_BATCH_SIZE + 5);
    try {
      const middle = await store.listJournalBatch('pt-journal', {
        limit: 10,
        beforeSeq: 16,
      });
      expect(middle.entries.map((entry) => entry.seq)).toEqual(
        [15, 14, 13, 12, 11, 10, 9, 8, 7, 6],
      );
      expect(middle.nextCursor).toBe(6);
    } finally {
      await db.destroy();
    }
  });

  it('ends the last partial batch at the first entry', async () => {
    const { db, store } = await journalWith(JOURNAL_BATCH_SIZE + 5);
    try {
      const last = await store.listJournalBatch('pt-journal', {
        limit: JOURNAL_BATCH_SIZE,
        beforeSeq: 6,
      });
      expect(last.entries.map((entry) => entry.seq)).toEqual([5, 4, 3, 2, 1]);
      expect(last.nextCursor).toBeUndefined();
    } finally {
      await db.destroy();
    }
  });

  it('reads an empty journal as an empty batch', async () => {
    const { db, store } = await journalWith(0);
    try {
      expect(await store.countJournal('pt-journal')).toBe(0);
      const batch = await store.listJournalBatch('pt-journal', {
        limit: JOURNAL_BATCH_SIZE,
      });
      expect(batch.entries).toEqual([]);
      expect(batch.nextCursor).toBeUndefined();
    } finally {
      await db.destroy();
    }
  });

  it('reads an invalid cursor as the newest batch', async () => {
    const { db, store } = await journalWith(3);
    try {
      for (const beforeSeq of [Number.NaN, -3, 0]) {
        const batch = await store.listJournalBatch('pt-journal', {
          limit: JOURNAL_BATCH_SIZE,
          beforeSeq,
        });
        expect(batch.entries.map((entry) => entry.seq)).toEqual([3, 2, 1]);
        expect(batch.nextCursor).toBeUndefined();
      }
    } finally {
      await db.destroy();
    }
  });

  it('never shifts a batch when entries are appended after opening', async () => {
    const { db, store } = await journalWith(8);
    try {
      const first = await store.listJournalBatch('pt-journal', { limit: 5 });
      expect(first.entries.map((entry) => entry.seq)).toEqual([8, 7, 6, 5, 4]);
      expect(first.nextCursor).toBe(4);

      await store.appendJournal('pt-journal', [
        { step: 8, type: 'travel', payload: { text: 'entry 9' } },
        { step: 9, type: 'travel', payload: { text: 'entry 10' } },
      ]);

      const older = await store.listJournalBatch('pt-journal', {
        limit: 5,
        beforeSeq: first.nextCursor,
      });
      expect(older.entries.map((entry) => entry.seq)).toEqual([3, 2, 1]);
      const seen = [...first.entries, ...older.entries].map((entry) => entry.seq);
      expect(new Set(seen).size).toBe(seen.length);
    } finally {
      await db.destroy();
    }
  });
});

describe('latestJournalEnding', () => {
  it('reads the last Ending from the Journal and handles none', () => {
    expect(latestJournalEnding([{ type: 'intro', payload: {} }])).toBeUndefined();
    expect(
      latestJournalEnding([
        { type: 'ending', payload: { endingId: 'a', kind: 'defeat', title: 'A', text: 'a.' } },
        { type: 'travel', payload: {} },
        { type: 'ending', payload: { endingId: 'b', kind: 'victory', title: 'B', text: 'b.' } },
      ]),
    ).toEqual({ endingId: 'b', kind: 'victory', title: 'B', text: 'b.' });
  });
});
