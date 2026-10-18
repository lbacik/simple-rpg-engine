import { expect, test } from '@playwright/test';

// The end-to-end smoke test (docs/spec/architecture.md, testing strategy):
// start a Playthrough of whispering-woods, acknowledge the intro modal with
// Continue, take two Choices (one with an empty Outcome, one with a result
// panel), and see the same state after a reload.
test('a playthrough survives choices, Continue and a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Scenarios' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Whispering Woods' })).toBeVisible();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'The Whispering Woods' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();

  await expect(page.getByRole('heading', { name: 'The Whispering Woods' })).toBeVisible();
  await page.locator('#name').fill('Smoke');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();

  await expect(page).toHaveURL(/\/play\/[^/]+$/);
  // The intro is a modal over the starting Location: Ashford renders beneath
  // with its Continue acknowledgement above it. The pending on-enter Scene
  // (The Bell of Ashford) waits for Continue, while the side panel (map,
  // status card, launchers) stays visible.
  await expect(page.getByRole('dialog', { name: 'Intro' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ashford' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Character, Health 12/12' })).toBeVisible();

  // Continue carries the current step and renders the position. It changes no
  // game state: the URL only gains `?seen=`. The reading column holds no
  // "View journal" link; the Journal launcher reaches the Journal instead.
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Journal, \d+ entr/ })).toBeVisible();
  await expect(page).toHaveURL(/seen=0/);

  // A mismatched step is ignored: the intro modal of the actual latest step
  // is shown again. (A fresh Playthrough has no newer step, so go back to the
  // unacknowledged URL instead.)
  await page.goto(page.url().replace(/seen=\d+/, 'seen=999'));
  await expect(page.getByRole('dialog', { name: 'Intro' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();

  // An empty Outcome shows the position directly, with no Continue.
  await page.getByRole('button', { name: 'Hear her out.' }).click();
  await expect(page.getByRole('heading', { name: "Brenna's Plea" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue' })).toHaveCount(0);

  // An Outcome with narration and state changes shows the result panel alone.
  await page.getByRole('button', { name: 'Promise to find Mira.' }).click();
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Brenna's Plea" })).toHaveCount(0);
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Ashford' })).toBeVisible();

  // Reloading the acknowledged position keeps it: `?seen=` still matches.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ashford' })).toBeVisible();

  // Reloading without the parameter may show the result panel again, which
  // stays harmless: Continue returns to the same position.
  await page.goto(page.url().replace(/\?.*$/, ''));
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ashford' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Ashford' })).toBeVisible();
});
