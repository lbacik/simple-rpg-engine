import { expect, test } from '@playwright/test';

import {
  playRoundButton,
  reachCampBandit,
  roundInput,
  startArenaPreset,
  startWhisperingPlaythrough,
} from './combat-helpers';

// The no-JavaScript flow (Combat MVP 1.0, P4 U8) in both modes: stance, card
// and target choices are plain links whose parameters change no state, the
// server renders the same forecast through previewRound, and Confirm and
// Surrender are plain POSTs. JavaScript is disabled for this whole file.

test.use({ javaScriptEnabled: false });

test('no-js arena: links preview without advancing, Play round commits', async ({
  page,
}) => {
  await page.goto('/arena');
  await startArenaPreset(page, 'T1');

  // No selection yet: no forecast and no enabled Confirm.
  await expect(page.getByText('Choose a card to see the forecast.')).toBeVisible();
  await expect(playRoundButton(page)).toBeDisabled();

  // Each selection is a plain navigation that changes no state.
  await page.getByRole('link', { name: /Defensive/ }).click();
  await expect(page).toHaveURL(/stance=defensive/);
  await expect(roundInput(page)).toHaveValue('1');
  await page.getByRole('link', { name: /^Counter/ }).first().click();
  await expect(page).toHaveURL(/action=counter/);
  await expect(roundInput(page)).toHaveValue('1');
  await page.getByRole('link', { name: /^self/ }).click();
  await expect(page).toHaveURL(/target=h01/);
  await expect(roundInput(page)).toHaveValue('1');

  // The server renders the same forecast: blow order with arithmetic.
  await expect(page.getByRole('heading', { name: 'Blow order' })).toBeVisible();
  await expect(playRoundButton(page)).toBeEnabled();
  await playRoundButton(page).click();
  await expect(page).not.toHaveURL(/notice=/);
  await expect(roundInput(page)).toHaveValue('2');

  // Surrender is an in-page disclosure with a plain POST behind it.
  await page.locator('details.cp-confirm summary').click();
  await page.getByRole('button', { name: 'Yes, surrender' }).click();
  await expect(page.getByRole('heading', { name: 'Fight over' })).toBeVisible();
  await expect(page.getByText('Surrender', { exact: true })).toBeVisible();
});

test('no-js scenario: one Round plays through links and a POST', async ({ page }) => {
  await startWhisperingPlaythrough(page, 'Nojs');
  await reachCampBandit(page);

  await expect(page.getByText('Choose a card to see the forecast.')).toBeVisible();
  await page.getByRole('link', { name: /Aggressive/ }).click();
  await expect(page).toHaveURL(/stance=aggressive/);
  await expect(roundInput(page)).toHaveValue('1');
  await page.getByRole('link', { name: /^Brace/ }).first().click();
  await expect(page).toHaveURL(/action=brace/);
  await page.getByRole('link', { name: /^self/ }).click();
  await expect(page).toHaveURL(/target=h01/);

  await expect(page.getByRole('heading', { name: 'Blow order' })).toBeVisible();
  await playRoundButton(page).click();
  await expect(page).not.toHaveURL(/notice=/);
  await expect(roundInput(page)).toHaveValue('2');
  await expect(page.getByLabel('Round forecast')).toBeVisible();
});
