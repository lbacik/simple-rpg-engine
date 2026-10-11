import { expect, test } from '@playwright/test';

// The end-to-end smoke test (docs/spec/architecture.md, testing strategy):
// start a Playthrough of whispering-woods, take one Choice, reload, and see
// the same state.
test('a playthrough survives a choice and a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Scenarios' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Whispering Woods' })).toBeVisible();
  await page.getByRole('link', { name: 'New Playthrough' }).click();

  await expect(page.getByRole('heading', { name: 'The Whispering Woods' })).toBeVisible();
  await page.locator('#name').fill('Smoke');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();

  await expect(page).toHaveURL(/\/play\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();
  const playUrl = page.url();

  await page.getByRole('button', { name: 'Hear her out.' }).click();
  await expect(page.getByRole('heading', { name: "Brenna's Plea" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: "Brenna's Plea" })).toBeVisible();
  expect(page.url()).toBe(playUrl);
});
