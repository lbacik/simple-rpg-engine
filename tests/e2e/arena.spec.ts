import { expect, test } from '@playwright/test';

// The Arena page (Combat MVP 1.0, P5): a full Arena on the shared Combat
// core. Setup configures 1–5 opponents in explicit order with an optional
// Companion (or a T1–T7 preset); the fight runs Round by Round in the command
// panel and persists per Session, so a reload resumes the same fight.

test('arena: the setup form and presets render with no fight', async ({ page }) => {
  // The Arena entry sits in the top navigation, reachable from the collection.
  await page.goto('/');
  await page.locator('header.topnav').getByRole('link', { name: 'Arena' }).click();
  await expect(page).toHaveURL(/\/arena$/);
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New fight' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start the fight' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reference scenarios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start T1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start T7' })).toBeVisible();
  // No fight yet, so there is nothing to restart.
  await expect(page.getByRole('heading', { name: 'Restart' })).toHaveCount(0);
});

test('arena: a T1 preset fight starts and survives a reload', async ({ page }) => {
  await page.goto('/arena');
  await page.getByRole('button', { name: 'Start T1' }).click();
  // The command panel renders the Round 1 forecast, and a Setup-started
  // mid-fight offers Restart behind its in-page confirmation.
  await expect(page.getByLabel('Round forecast')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restart' })).toBeVisible();
  // A reload resumes the same fight, not the Setup form alone.
  await page.reload();
  await expect(page.getByLabel('Round forecast')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restart' })).toBeVisible();
});
