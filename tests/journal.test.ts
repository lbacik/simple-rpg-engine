// Journal rendering and pagination (docs/spec/playthrough-state.md, journal;
// docs/spec/ui.md, journal): every entry type renders in order with the step
// that produced it, narration entries reuse the game screen's Markdown subset
// on the stored text, and pages slice the append-only journal_entries table.

import { describe, expect, it } from 'vitest';
import {
  JOURNAL_PAGE_SIZE,
  journalEntryLabel,
  journalHref,
  parseJournalPage,
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

describe('journal pagination helpers', () => {
  it('parses page numbers with a safe default', () => {
    expect(parseJournalPage(undefined)).toBe(1);
    expect(parseJournalPage('2')).toBe(2);
    expect(parseJournalPage('0')).toBe(1);
    expect(parseJournalPage('-3')).toBe(1);
    expect(parseJournalPage('nope')).toBe(1);
    expect(parseJournalPage('')).toBe(1);
  });

  it('builds page links that degrade to plain links without JavaScript', () => {
    expect(journalHref('pt-1', 1)).toBe('/play/pt-1/journal');
    expect(journalHref('pt-1', 3)).toBe('/play/pt-1/journal?page=3');
  });

  it('uses a fixed page size', () => {
    expect(JOURNAL_PAGE_SIZE).toBe(20);
  });
});

describe('journal pagination in the store', () => {
  it('counts entries and returns ordered pages', async () => {
    const db = openDatabase(':memory:');
    try {
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
          step: JOURNAL_PAGE_SIZE + 5,
          state: makeState(),
        },
        [],
      );
      const entries = Array.from({ length: JOURNAL_PAGE_SIZE + 5 }, (_, index) => ({
        step: index,
        type: index % 2 === 0 ? 'scene' : 'travel',
        payload: { text: `entry ${index + 1}` },
      }));
      await store.appendJournal('pt-journal', entries);

      expect(await store.countJournal('pt-journal')).toBe(JOURNAL_PAGE_SIZE + 5);

      const first = await store.listJournalPage('pt-journal', {
        limit: JOURNAL_PAGE_SIZE,
        offset: 0,
      });
      expect(first).toHaveLength(JOURNAL_PAGE_SIZE);
      expect(first.map((entry) => entry.seq)).toEqual(
        Array.from({ length: JOURNAL_PAGE_SIZE }, (_, index) => index + 1),
      );
      expect(first[0]?.step).toBe(0);

      const second = await store.listJournalPage('pt-journal', {
        limit: JOURNAL_PAGE_SIZE,
        offset: JOURNAL_PAGE_SIZE,
      });
      expect(second).toHaveLength(5);
      expect(second.map((entry) => entry.seq)).toEqual([21, 22, 23, 24, 25]);

      // The full list stays in order for the game screen.
      const all = await store.listJournal('pt-journal');
      expect(all.map((entry) => entry.seq)).toEqual(
        Array.from({ length: JOURNAL_PAGE_SIZE + 5 }, (_, index) => index + 1),
      );
    } finally {
      await db.destroy();
    }
  });
});
