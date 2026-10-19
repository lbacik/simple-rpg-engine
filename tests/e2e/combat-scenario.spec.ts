import { expect, test } from '@playwright/test';

import {
  CAMP_BANDIT_LOSE_LINE,
  CAMP_BANDIT_WIN_LINE,
  logRounds,
  playRound,
  reachCampBandit,
  startWhisperingPlaythrough,
  submitSelection,
} from './combat-helpers';

// Scenario Combat (Combat MVP 1.0, P6): the same command panel inside a
// Playthrough. Each test walks a fresh whispering-woods hero to the
// Hunters' Camp bandit fight (camp-bandit, a lone Bandit Archer starting
// Far) and plays it to a different ending through the real UI.

test('scenario: camp-bandit played to victory routes through the victory outcome', async ({
  page,
}) => {
  await startWhisperingPlaythrough(page, 'Victor');
  await reachCampBandit(page);
  await expect(
    page.getByRole('link', { name: 'Export the current fight' }),
  ).toBeVisible();

  for (const selection of CAMP_BANDIT_WIN_LINE.slice(0, 4)) {
    await playRound(page, selection);
  }
  // The fifth Round ends the fight instead of opening a new one.
  await submitSelection(page, CAMP_BANDIT_WIN_LINE[4]);
  await expect(page).not.toHaveURL(/notice=/);

  // WIN clears the fight and applies the victory Outcome in a modal.
  const outcome = page.getByRole('dialog', { name: 'Latest events' });
  await expect(outcome).toBeVisible();
  await expect(outcome.getByText('The bandit slumps against the cold firepit.')).toBeVisible();
  await outcome.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: "Hunters' Camp" })).toBeVisible();
  await expect(page.getByLabel('Round forecast')).toHaveCount(0);
});

test('scenario: surrender keeps the encounter undefeated and moves away', async ({
  page,
}) => {
  await startWhisperingPlaythrough(page, 'Craven');
  await reachCampBandit(page);

  await page.locator('details.cp-confirm summary').click();
  await page.getByRole('button', { name: 'Yes, surrender' }).click();
  await expect(page).not.toHaveURL(/notice=/);

  const outcome = page.getByRole('dialog', { name: 'Latest events' });
  await expect(outcome).toBeVisible();
  await expect(outcome.getByText('You drop your weapon and raise empty hands.')).toBeVisible();
  await outcome.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Forest Edge' })).toBeVisible();
  await expect(page.getByLabel('Round forecast')).toHaveCount(0);
});

test('scenario: four unguarded rounds end in death', async ({ page }) => {
  await startWhisperingPlaythrough(page, 'Doomed');
  await reachCampBandit(page);

  for (const selection of CAMP_BANDIT_LOSE_LINE.slice(0, 3)) {
    await playRound(page, selection);
  }
  // The fourth Round ends the fight instead of opening a new one.
  await submitSelection(page, CAMP_BANDIT_LOSE_LINE[3]);
  await expect(page).not.toHaveURL(/notice=/);

  await expect(page.getByRole('heading', { name: 'Lost to the Woods' })).toBeVisible();
  await expect(page.getByText('Defeat', { exact: true })).toBeVisible();
  await expect(logRounds(page)).toHaveCount(0);
});
