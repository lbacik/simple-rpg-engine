import { expect, test } from '@playwright/test';

import {
  CAMP_BANDIT_WIN_LINE,
  T1_WIN_LINE,
  expectStaleLoser,
  journalEntryCount,
  logGroups,
  logRound,
  playRound,
  reachCampBandit,
  roundNumber,
  startWhisperingPlaythrough,
  submitSelection,
} from './combat-helpers';

// Stale-command evidence (Combat MVP 1.0, P7 V4): two tabs at the same step
// in each mode. The loser of the race sees the current state with a stale
// notice, and nothing applies twice. Both tabs share one browser context, so
// they share the Session — exactly like two real tabs.

test('arena stale: the loser sees the current state with a stale notice, once', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  try {
    await tabA.goto('/arena');
    await tabA.getByRole('button', { name: 'Start T1' }).click();
    await expect(tabA.getByLabel('Round forecast')).toBeVisible();
    await tabB.goto('/arena');
    await expect(tabB.getByLabel('Round forecast')).toBeVisible();
    expect(await roundNumber(tabB)).toBe(1);

    // The winner plays round 1 against the default opening.
    await playRound(tabA, T1_WIN_LINE[0]);
    const round1Winner = await logRound(tabA, 1).textContent();

    // The loser submits the same step from its stale form: the current
    // state plus the stale notice, and nothing applied twice.
    await submitSelection(tabB, T1_WIN_LINE[0]);
    await expectStaleLoser(tabB, 1, round1Winner);
    // Round 1 resolved plus the frozen Round 2 declarations, on both tabs.
    await expect(logGroups(tabA)).toHaveCount(2);
    await expect(logGroups(tabB)).toHaveCount(2);

    // The loser continues from the fresh state: round 2 applies exactly once.
    await tabB.goto('/arena');
    await playRound(tabB, T1_WIN_LINE[1]);
    await expect(logGroups(tabB)).toHaveCount(3);
  } finally {
    await context.close();
  }
});

test('scenario stale: the loser sees the current state with a stale notice, once', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const tabA = await context.newPage();
  try {
    await startWhisperingPlaythrough(tabA, 'Stale');
    await reachCampBandit(tabA);
    const combatUrl = tabA.url().split('?')[0];
    const tabB = await context.newPage();
    await tabB.goto(combatUrl);
    await expect(tabB.getByLabel('Round forecast')).toBeVisible();
    expect(await roundNumber(tabB)).toBe(1);

    // The winner plays round 1; the Journal grows by its combat-round entry.
    await playRound(tabA, CAMP_BANDIT_WIN_LINE[0]);
    const round1Winner = await logRound(tabA, 1).textContent();
    const journalAfterWinner = await journalEntryCount(tabA);

    // The loser submits the same step: the current state with the stale
    // notice twice (reading card and panel), and nothing appended twice.
    await submitSelection(tabB, CAMP_BANDIT_WIN_LINE[0]);
    await expectStaleLoser(tabB, 2, round1Winner);
    expect(await journalEntryCount(tabB)).toBe(journalAfterWinner);
    await expect(logGroups(tabB)).toHaveCount(2);

    // The loser continues from the fresh state: round 2 applies exactly once.
    await tabB.goto(combatUrl);
    await playRound(tabB, CAMP_BANDIT_WIN_LINE[1]);
    await expect(logGroups(tabB)).toHaveCount(3);
    await expect(journalEntryCount(tabB)).resolves.toBe(journalAfterWinner + 1);
  } finally {
    await context.close();
  }
});
