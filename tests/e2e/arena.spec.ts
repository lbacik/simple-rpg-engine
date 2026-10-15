import { expect, test, type Page } from '@playwright/test';

// The Arena page (issue #166): pick a Bestiary Enemy, press Start, fight
// Rounds through the existing Combat presentation and actions, and land on
// the result screen with a way back to the setup. Reloading mid-fight resumes
// the same Combat.

async function expectRound(page: Page, expected: number): Promise<void> {
  await expect(page.locator('.combat-header .combat-kicker').first()).toContainText(
    `Round ${expected}`,
  );
}

/**
 * Submit one Combat form and wait until the Round advances or the fight ends.
 * Each submission navigates, and the stale pre-navigation arena stays visible
 * until the redirect lands — waiting for the kicker to change (or the arena
 * to disappear) keeps the next count()/click pair off the stale page.
 */
async function submitRound(page: Page, name: string | RegExp): Promise<void> {
  const kicker = page.locator('.combat-header .combat-kicker').first();
  const before = ((await kicker.textContent()) ?? '').trim();
  await page.getByRole('button', { name }).click();
  await page.waitForFunction(
    (prev: string) => {
      if (!document.querySelector('[aria-label="Combat arena"]')) return true;
      const kickerEl = document.querySelector('.combat-header .combat-kicker');
      return kickerEl !== null && (kickerEl.textContent ?? '').trim() !== prev;
    },
    before,
    { timeout: 15000 },
  );
}

test('arena: start against the wolf, fight Rounds, reload, reach the result', async ({
  page,
}) => {
  // The Arena entry sits in the top navigation, reachable from the collection.
  await page.goto('/');
  await page.locator('header.topnav').getByRole('link', { name: 'Arena' }).click();
  await expect(page).toHaveURL(/\/arena$/);
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.getByText('Grey Wolf')).toBeVisible();
  await expect(page.getByText('Cave Bear')).toBeVisible();

  // The first entry is pre-selected: Start begins the Combat directly.
  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 1);

  // The wolf starts Near: one Attack resolves a Round through the Combat panel.
  await page.getByRole('button', { name: /^Attack/ }).click();
  await expectRound(page, 2);

  // Reloading mid-fight resumes the same Combat.
  await page.reload();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 2);

  // Fight to the end: victory and death both land on the result screen, so
  // keep attacking whatever the dice say until the arena is gone.
  for (let round = 0; round < 40; round += 1) {
    if ((await page.getByLabel('Combat arena').count()) === 0) break;
    await submitRound(page, /^Attack/);
  }
  await expect(page.getByLabel('Combat arena')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Arena ·/ })).toBeVisible();

  // The result screen leads back to the setup, which lists the Bestiary again.
  await page.getByRole('button', { name: 'Back to setup' }).click();
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.getByText('Grey Wolf')).toBeVisible();
});

test('arena: escape attempts end on the result screen with a way back', async ({
  page,
}) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();

  // The archer starts Far, so Escape carries its +2 bonus through the Combat
  // panel like any other action.
  await page.getByRole('radio', { name: 'Bandit Archer' }).check();
  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 1);

  // Escape attempts are legal Rounds that may fail on the dice: keep trying
  // until the fight ends however it ends.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if ((await page.getByLabel('Combat arena').count()) === 0) break;
    await submitRound(page, 'Escape');
  }
  await expect(page.getByLabel('Combat arena')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Arena ·/ })).toBeVisible();

  await page.getByRole('button', { name: 'Back to setup' }).click();
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.getByText('Bandit Archer')).toBeVisible();
});
