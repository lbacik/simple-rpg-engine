import { expect, test } from '@playwright/test';

// The Arena page (Combat MVP 1.0, S4): a stub. The tactical Arena was removed
// with the old Combat rules; the route renders its title and description
// only until the Arena returns on the shared Combat core (P6 adapter).

test('arena: the stub page renders its title and description', async ({ page }) => {
  // The Arena entry sits in the top navigation, reachable from the collection.
  await page.goto('/');
  await page.locator('header.topnav').getByRole('link', { name: 'Arena' }).click();
  await expect(page).toHaveURL(/\/arena$/);
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.locator('main p')).not.toHaveCount(0);
});

test('arena: direct navigation resolves the stub', async ({ page }) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
});
